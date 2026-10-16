"""The one door to Claude. Every model call goes through `ClaudeLLM.create`, so retries, refusal fallbacks, prompt
caching, cost accounting, the daily budget and the mapping from SDK errors to messages a user can act on live in
one place. Tests swap in an object with the same `create` signature (tests/fakes.py)."""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol

from .db import open_db

log = logging.getLogger("tally.llm")

# $ per million tokens: input, output, cache read. Cache writes (5-minute TTL) cost 1.25x input.
PRICES = {
    "claude-opus-5-5": (4.0, 20.0, 0.20),
    "claude-sonnet-5-5": (2.0, 10.0, 0.20),
    "claude-haiku-5-5": (0.10, 0.50, 0.01),
}
UNKNOWN_PRICE = (5.0, 25.0, 0.50)  # a refusal fallback may answer from another model; price it conservatively
FALLBACK_BETA = "server-side-fallback-2026-07-01"
EFFORTS = ("low", "medium", "high", "xhigh", "max")


class LLMError(Exception):
    """Something went wrong talking to the model. `str(e)` is safe to show to a user."""

    status = 502
    code = "llm_error"


class LLMUnavailable(LLMError):
    status = 503
    code = "llm_unavailable"


class LLMBusy(LLMError):
    status = 503
    code = "llm_busy"


class BudgetExceeded(LLMError):
    status = 429
    code = "budget_exceeded"


class LLMRefused(LLMError):
    status = 422
    code = "refused"


class LLMTruncated(LLMError):
    code = "truncated"


@dataclass
class Reply:
    content: list[Any]
    stop_reason: str | None
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read: int = 0
    cache_write: int = 0
    cost_usd: float = 0.0
    request_id: str | None = None
    fell_back: bool = False

    def text(self) -> str:
        return "".join(b.text for b in self.content if getattr(b, "type", None) == "text")

    def tool_uses(self) -> list[Any]:
        return [b for b in self.content if getattr(b, "type", None) == "tool_use"]


class LLM(Protocol):
    model: str

    def create(self, purpose: str, *, system: str, messages: list[dict], tools: list[dict] | None = None,
               schema: dict | None = None, effort: str = "medium", max_tokens: int = 16000) -> Reply: ...


def cost_of(model: str, input_tokens: int, output_tokens: int, cache_read: int, cache_write: int) -> float:
    pin, pout, pread = PRICES.get(model, UNKNOWN_PRICE)
    return (input_tokens * pin + output_tokens * pout + cache_read * pread + cache_write * pin * 1.25) / 1_000_000


def spent_today(app_db: Path) -> float:
    with open_db(app_db) as conn:
        return float(conn.execute("SELECT coalesce(sum(cost_usd), 0) FROM llm_calls WHERE at >= date('now')").fetchone()[0])


def record_call(app_db: Path, purpose: str, model: str, status: str, reply: Reply | None = None, error: str | None = None) -> None:
    with open_db(app_db) as conn:
        conn.execute("""INSERT INTO llm_calls (purpose, model, input_tokens, output_tokens, cache_read, cache_write, cost_usd,
                        request_id, status, error) VALUES (?,?,?,?,?,?,?,?,?,?)""",
                     (purpose, reply.model if reply else model, reply.input_tokens if reply else 0, reply.output_tokens if reply else 0,
                      reply.cache_read if reply else 0, reply.cache_write if reply else 0, reply.cost_usd if reply else 0.0,
                      reply.request_id if reply else None, status, (error or "")[:500] or None))


@dataclass
class ClaudeLLM:
    api_key: str
    model: str
    app_db: Path
    daily_budget_usd: float
    timeout_s: float = 300.0
    fallbacks: str | None = field(default_factory=lambda: os.environ.get("TALLY_FALLBACKS", "default") or None)

    def __post_init__(self):
        import anthropic

        self._sdk = anthropic
        self._client = anthropic.Anthropic(api_key=self.api_key, max_retries=3, timeout=self.timeout_s)

    def create(self, purpose: str, *, system: str, messages: list[dict], tools: list[dict] | None = None,
               schema: dict | None = None, effort: str = "medium", max_tokens: int = 16000) -> Reply:
        spent = spent_today(self.app_db)
        if spent >= self.daily_budget_usd:
            raise BudgetExceeded(f"Today's model budget (${self.daily_budget_usd:.2f}) is used up. It resets at midnight UTC.")
        output_config: dict[str, Any] = {"effort": effort if effort in EFFORTS else "medium"}
        if schema:
            output_config["format"] = {"type": "json_schema", "schema": schema}
        kw: dict[str, Any] = {
            "model": self.model,
            "max_tokens": max_tokens,
            # The system prompt is identical on every call for a purpose, so it is cached; tool results are not.
            "system": [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            "messages": messages,
            "thinking": {"type": "adaptive"},
            "output_config": output_config,
        }
        if tools:
            kw["tools"] = tools
        if self.fallbacks:
            # If a safety classifier declines the request, the API re-runs it on Anthropic's recommended fallback model
            # inside the same call instead of returning a refusal.
            kw["betas"] = [FALLBACK_BETA]
            kw["fallbacks"] = self.fallbacks
        started = time.monotonic()
        try:
            with self._client.beta.messages.stream(**kw) as stream:
                msg = stream.get_final_message()
                request_id = stream.request_id
        except LLMError:
            raise
        except Exception as e:  # mapped to a typed, user-safe error below
            mapped = self._map_error(e)
            record_call(self.app_db, purpose, self.model, "error", error=f"{type(e).__name__}: {e}")
            log.warning("llm %s failed after %.1fs: %s", purpose, time.monotonic() - started, type(e).__name__)
            raise mapped from e
        reply = self._reply(msg, request_id)
        status = reply.stop_reason or "unknown"
        record_call(self.app_db, purpose, self.model, status, reply)
        log.info("llm %s %s in=%d out=%d cache_read=%d $%.4f %.1fs", purpose, status, reply.input_tokens, reply.output_tokens,
                 reply.cache_read, reply.cost_usd, time.monotonic() - started)
        if reply.stop_reason == "refusal":
            raise LLMRefused("The model declined to answer this request.")
        if reply.stop_reason == "max_tokens":
            raise LLMTruncated("The model ran out of room before finishing. Try a narrower question.")
        return reply

    def _reply(self, msg: Any, request_id: str | None) -> Reply:
        u = msg.usage
        ins, outs = u.input_tokens or 0, u.output_tokens or 0
        cr, cw = u.cache_read_input_tokens or 0, u.cache_creation_input_tokens or 0
        fell_back = any(getattr(it, "type", "") == "fallback_message" for it in (getattr(u, "iterations", None) or []))
        return Reply(content=list(msg.content), stop_reason=msg.stop_reason, model=msg.model, input_tokens=ins, output_tokens=outs,
                     cache_read=cr, cache_write=cw, cost_usd=cost_of(msg.model, ins, outs, cr, cw), request_id=request_id, fell_back=fell_back)

    def _map_error(self, e: Exception) -> LLMError:
        a = self._sdk
        # Most specific first: APITimeoutError is an APIConnectionError, and every status error is an APIStatusError.
        if isinstance(e, a.APITimeoutError):
            return LLMBusy("The model took too long to respond. Please try again.")
        if isinstance(e, a.APIConnectionError):
            return LLMBusy("Could not reach the model service. Please try again shortly.")
        if isinstance(e, a.RateLimitError):
            return LLMBusy("The model service is rate limiting this app. Please wait a minute and try again.")
        if isinstance(e, (a.AuthenticationError, a.PermissionDeniedError)):
            return LLMUnavailable("The model service rejected this app's API key. An administrator needs to check it.")
        if isinstance(e, a.NotFoundError):
            return LLMUnavailable(f"The configured model ({self.model}) is not available to this API key.")
        if isinstance(e, a.RequestTooLargeError):
            return LLMError("The request was too large for the model. Try a narrower question.")
        if isinstance(e, a.BadRequestError):
            return LLMError("The model service rejected the request. This is a bug in Tally; it has been logged.")
        if isinstance(e, a.APIStatusError):
            if e.status_code >= 500:
                return LLMBusy("The model service is overloaded or having problems. Please try again shortly.")
            return LLMError(f"The model service returned an error ({e.status_code}).")
        return LLMError("Unexpected error while talking to the model.")


def make_llm(settings) -> LLM | None:
    if not settings.llm_enabled:
        return None
    return ClaudeLLM(api_key=settings.anthropic_api_key, model=settings.model, app_db=settings.app_db,
                     daily_budget_usd=settings.daily_budget_usd)
