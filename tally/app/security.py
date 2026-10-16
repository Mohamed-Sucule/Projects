"""Request-level protections: who the client is, admin authentication, rate limits, body size limits and the
headers every response carries."""

from __future__ import annotations

import hmac
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from .config import Settings

CSP = ("default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; "
       "object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'")


def client_ip(request: Request, settings: Settings) -> str:
    if settings.trust_proxy:
        # Behind one trusted proxy (Render, Fly, a load balancer) the last X-Forwarded-For entry is the one that proxy
        # added; earlier entries come from the client and can be forged.
        fwd = request.headers.get("x-forwarded-for", "")
        if fwd:
            return fwd.split(",")[-1].strip()[:64]
    return request.client.host if request.client else "unknown"


def require_admin(request: Request, settings: Settings) -> None:
    if not settings.admin_token:
        raise HTTPException(403, "Admin actions are switched off on this deployment (no TALLY_ADMIN_TOKEN is set).")
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not hmac.compare_digest(token.strip().encode(), settings.admin_token.encode()):
        raise HTTPException(401, "This action needs the admin token.", headers={"WWW-Authenticate": "Bearer"})


class RateLimiter:
    """Sliding-window limits per client, in memory. Fine for one instance; several instances would need a shared store."""

    def __init__(self):
        self._hits: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str, limits: list[tuple[int, float]]) -> None:
        now = time.time()
        longest = max(window for _, window in limits)
        with self._lock:
            q = self._hits[key]
            while q and now - q[0] > longest:
                q.popleft()
            for count, window in limits:
                recent = sum(1 for t in q if now - t <= window)
                if recent >= count:
                    oldest = next(t for t in q if now - t <= window)
                    retry = int(window - (now - oldest)) + 1
                    span = "minute" if window <= 60 else "day" if window >= 86400 else f"{int(window)}s"
                    raise HTTPException(429, f"Too many requests: the limit is {count} per {span}. Try again in {retry} seconds.",
                                        headers={"Retry-After": str(retry)})
            q.append(now)
            if len(self._hits) > 50_000:  # forget idle clients so memory stays bounded
                for k in [k for k, v in self._hits.items() if not v or now - v[-1] > longest][:10_000]:
                    del self._hits[k]


class SecurityHeaders(BaseHTTPMiddleware):
    def __init__(self, app, settings: Settings):
        super().__init__(app)
        self.settings = settings

    async def dispatch(self, request: Request, call_next):
        limit = self.settings.max_upload_bytes + 64 * 1024 if request.url.path.startswith(("/api/documents", "/api/books")) else 64 * 1024
        length = request.headers.get("content-length")
        if length is not None:
            try:
                too_big = int(length) > limit
            except ValueError:
                return JSONResponse({"error": {"code": "bad_request", "message": "Invalid Content-Length."}}, status_code=400)
            if too_big:
                return JSONResponse({"error": {"code": "too_large", "message": f"Request body is larger than {limit // 1024} KB."}},
                                    status_code=413)
        response = await call_next(request)
        h = response.headers
        h.setdefault("Content-Security-Policy", CSP)
        h.setdefault("X-Content-Type-Options", "nosniff")
        h.setdefault("Referrer-Policy", "no-referrer")
        h.setdefault("X-Frame-Options", "DENY")
        h.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        h.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()")
        proto = request.headers.get("x-forwarded-proto", "") if self.settings.trust_proxy else request.url.scheme
        if proto == "https":
            h.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        if request.url.path.startswith("/api/"):
            h.setdefault("Cache-Control", "no-store")
        return response
