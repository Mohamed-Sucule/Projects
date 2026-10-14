"""HTTP API and web UI. Run with: uvicorn app.main:app"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import threading
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import agent, workflow
from .config import ROOT, Settings, get_settings
from .db import BOOKS_TABLES, open_db
from .extract import cached_terms, extract_supplier, suppliers_with_contracts
from .ingest.parsers import ParseError
from .ingest.pipeline import ImportError_, delete_document, import_csv, ingest_document
from .llm import LLMError, make_llm, spent_today
from .security import RateLimiter, SecurityHeaders, client_ip, require_admin
from .seed import ensure_ready

log = logging.getLogger("tally")
WEB = ROOT / "web"
SAMPLE_QUESTIONS = ["q04", "q15", "q22", "q31", "q36", "q37", "q42", "q49"]
SUPPLIER_ID = re.compile(r"^[a-z0-9][a-z0-9_-]{0,39}$")

settings: Settings = get_settings()
limiter = RateLimiter()
ask_slots = threading.BoundedSemaphore(4)
run_events: dict[int, list[dict]] = {}


@asynccontextmanager
async def lifespan(_: FastAPI):
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    ensure_ready(settings)
    with open_db(settings.app_db) as conn:
        have_run = conn.execute("SELECT count(*) FROM audit_runs WHERE status = 'done'").fetchone()[0]
    if settings.seed_demo and not have_run:
        workflow.run_audit(settings, terms_source="reference")
    log.info("tally ready: model=%s llm=%s public_demo=%s", settings.model, settings.llm_enabled, settings.public_demo)
    yield


app = FastAPI(title="Tally", version="1.0", lifespan=lifespan, docs_url=None, redoc_url=None)
app.add_middleware(SecurityHeaders, settings=settings)


# ── errors: one envelope for everything ────────────────────────────────────

def _error(status: int, code: str, message: str, headers: dict | None = None) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status, headers=headers)


@app.exception_handler(StarletteHTTPException)
async def http_error(_: Request, e: StarletteHTTPException):
    codes = {400: "bad_request", 401: "unauthorized", 403: "forbidden", 404: "not_found", 405: "method_not_allowed",
             409: "conflict", 413: "too_large", 415: "unsupported_type", 429: "rate_limited", 503: "unavailable"}
    return _error(e.status_code, codes.get(e.status_code, "error"), str(e.detail), getattr(e, "headers", None))


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, e: RequestValidationError):
    first = e.errors()[0] if e.errors() else {}
    where = ".".join(str(p) for p in first.get("loc", []) if p != "body")
    return _error(422, "invalid_request", f"{where}: {first.get('msg', 'invalid value')}" if where else "Invalid request.")


@app.exception_handler(LLMError)
async def llm_error(_: Request, e: LLMError):
    return _error(e.status, e.code, str(e))


@app.exception_handler(workflow.WorkflowError)
async def workflow_error(_: Request, e: workflow.WorkflowError):
    return _error(409, "conflict", str(e))


@app.exception_handler(Exception)
async def unexpected(_: Request, e: Exception):
    ref = uuid.uuid4().hex[:8]
    log.exception("unhandled error ref=%s", ref)
    return _error(500, "internal", f"Something went wrong on our side (ref {ref}).")


# ── dependencies ───────────────────────────────────────────────────────────

def get_cfg() -> Settings:
    return settings


def admin(request: Request, s: Settings = Depends(get_cfg)) -> None:
    require_admin(request, s)


def demo_or_admin(request: Request, s: Settings = Depends(get_cfg)) -> None:
    """Actions any visitor may take on a public demo (they change only demo state), admin-only otherwise."""
    if not s.public_demo:
        require_admin(request, s)
    limiter.check("write:" + client_ip(request, s), [(20, 60), (300, 86400)])


def need_llm(s: Settings):
    llm = make_llm(s)
    if llm is None:
        raise HTTPException(503, "The model is not configured on this deployment (no ANTHROPIC_API_KEY). "
                                 "Search, the accounts, the audit and the evals still work.")
    return llm


# ── pages ──────────────────────────────────────────────────────────────────

@app.get("/", include_in_schema=False)
def index():
    return FileResponse(WEB / "index.html", headers={"Cache-Control": "no-cache"})


app.mount("/static", StaticFiles(directory=WEB / "static"), name="static")


@app.get("/healthz")
def healthz():
    with open_db(settings.app_db) as conn:
        docs = conn.execute("SELECT count(*) FROM documents").fetchone()[0]
    return {"ok": True, "documents": docs}


@app.get("/api/meta")
def meta(s: Settings = Depends(get_cfg)):
    with open_db(s.app_db) as conn:
        docs = conn.execute("SELECT count(*) FROM documents").fetchone()[0]
        chunks = conn.execute("SELECT count(*) FROM chunks").fetchone()[0]
    with open_db(s.books_db) as conn:
        counts = {t: conn.execute(f"SELECT count(*) FROM {t}").fetchone()[0] for t in ("suppliers", "invoices", "invoice_lines", "payments")}
        suppliers = [dict(r) for r in conn.execute("SELECT supplier_id, name, category FROM suppliers ORDER BY name")]
    samples = []
    evalset = ROOT / "data" / "evalset.jsonl"
    if evalset.exists():
        by_id = {q["id"]: q for q in map(json.loads, evalset.read_text(encoding="utf-8").splitlines())}
        samples = [{"id": i, "question": by_id[i]["question"], "category": by_id[i]["category"]} for i in SAMPLE_QUESTIONS if i in by_id]
    return {"org": s.org_name, "as_of": s.as_of.isoformat(), "model": s.model, "llm_enabled": s.llm_enabled,
            "public_demo": s.public_demo, "admin_enabled": bool(s.admin_token), "documents": docs, "chunks": chunks,
            "books": counts, "suppliers": suppliers, "samples": samples,
            "limits": {"ask_per_minute": s.ask_per_minute, "ask_per_day": s.ask_per_day, "max_upload_mb": s.max_upload_bytes // (1024 * 1024)}}


# ── ask ────────────────────────────────────────────────────────────────────

class AskIn(BaseModel):
    question: str = Field(min_length=3, max_length=500)


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


@app.post("/api/ask")
async def ask(body: AskIn, request: Request, s: Settings = Depends(get_cfg)):
    llm = need_llm(s)
    ip = client_ip(request, s)
    limiter.check("ask:" + ip, [(s.ask_per_minute, 60), (s.ask_per_day, 86400)])
    if not ask_slots.acquire(blocking=False):
        raise HTTPException(503, "Tally is answering several questions already. Try again in a moment.")
    question = " ".join(body.question.split())
    queue: asyncio.Queue = asyncio.Queue()
    loop = asyncio.get_running_loop()

    def emit(ev: dict):
        loop.call_soon_threadsafe(queue.put_nowait, ("progress", ev))

    def work():
        started = time.monotonic()
        status, answer = "error", None
        try:
            result = agent.ask(question, llm=llm, settings=s, on_event=emit)
            status, answer = result.status, result.answer
            loop.call_soon_threadsafe(queue.put_nowait, ("answer", result.to_dict()))
        except LLMError as e:
            loop.call_soon_threadsafe(queue.put_nowait, ("error", {"code": e.code, "message": str(e)}))
        except Exception:
            ref = uuid.uuid4().hex[:8]
            log.exception("ask failed ref=%s", ref)
            loop.call_soon_threadsafe(queue.put_nowait, ("error", {"code": "internal", "message": f"Something went wrong (ref {ref})."}))
        finally:
            ask_slots.release()
            loop.call_soon_threadsafe(queue.put_nowait, ("end", {}))
            try:
                with open_db(s.app_db) as conn:
                    conn.execute("INSERT INTO asks (client, question, status, answer, latency_ms) VALUES (?,?,?,?,?)",
                                 (ip, question, status, answer, int((time.monotonic() - started) * 1000)))
            except Exception:
                log.exception("could not record ask")

    threading.Thread(target=work, daemon=True).start()

    async def stream():
        yield _sse("start", {"question": question})
        while True:
            try:
                kind, data = await asyncio.wait_for(queue.get(), timeout=15)
            except asyncio.TimeoutError:
                yield ": keep-alive\n\n"
                continue
            if kind == "end":
                return
            yield _sse(kind, data)

    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})


# ── documents ──────────────────────────────────────────────────────────────

@app.get("/api/documents")
def list_documents(s: Settings = Depends(get_cfg)):
    with open_db(s.app_db) as conn:
        rows = conn.execute("""SELECT d.id, d.title, d.filename, d.kind, d.format, d.supplier_id, d.pages, d.chars, d.flags, d.created_at,
                                      (SELECT count(*) FROM chunks c WHERE c.doc_id = d.id) AS chunks
                               FROM documents d ORDER BY d.supplier_id IS NULL, d.supplier_id, d.kind, d.id""").fetchall()
    return [dict(r) | {"flags": json.loads(r["flags"])} for r in rows]


@app.get("/api/documents/{doc_id}")
def get_document(doc_id: str, s: Settings = Depends(get_cfg)):
    with open_db(s.app_db) as conn:
        d = conn.execute("SELECT id, title, filename, kind, format, supplier_id, pages, flags FROM documents WHERE id = ?", (doc_id,)).fetchone()
        if d is None:
            raise HTTPException(404, "No such document.")
        chunks = [dict(r) | {"flags": json.loads(r["flags"])} for r in
                  conn.execute("SELECT id, ordinal, section, page, text, flags FROM chunks WHERE doc_id = ? ORDER BY ordinal", (doc_id,))]
    return dict(d) | {"flags": json.loads(d["flags"]), "chunks": chunks}


@app.get("/api/chunks/{chunk_id}")
def get_chunk(chunk_id: int, s: Settings = Depends(get_cfg)):
    with open_db(s.app_db) as conn:
        r = conn.execute("""SELECT c.id, c.doc_id, d.title, c.section, c.page, c.text, c.flags FROM chunks c JOIN documents d ON d.id = c.doc_id
                            WHERE c.id = ?""", (chunk_id,)).fetchone()
    if r is None:
        raise HTTPException(404, "No such passage.")
    return dict(r) | {"flags": json.loads(r["flags"])}


async def _read_upload(f: UploadFile, limit: int) -> bytes:
    data = await f.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(413, f"The file is larger than {limit // (1024 * 1024)} MB.")
    if not data:
        raise HTTPException(400, "The file is empty.")
    return data


@app.post("/api/documents", dependencies=[Depends(admin)], status_code=201)
async def upload_document(file: UploadFile = File(...), kind: Literal["contract", "amendment", "policy", "other"] = Form("contract"),
                          supplier_id: str | None = Form(None), s: Settings = Depends(get_cfg)):
    if supplier_id and not SUPPLIER_ID.match(supplier_id):
        raise HTTPException(400, "supplier_id may use lower-case letters, digits, '-' and '_' only.")
    data = await _read_upload(file, s.max_upload_bytes)
    name = Path(file.filename or "upload").name[:200]
    try:
        r = await asyncio.to_thread(ingest_document, s.app_db, data, name, kind=kind, supplier_id=supplier_id or None, max_pages=s.max_pages)
    except ParseError as e:
        raise HTTPException(415, str(e)) from e
    return {"id": r.doc_id, "title": r.title, "chunks": r.chunks, "pages": r.pages, "flags": r.flags, "duplicate": r.duplicate}


@app.delete("/api/documents/{doc_id}", dependencies=[Depends(admin)])
def remove_document(doc_id: str, s: Settings = Depends(get_cfg)):
    if not delete_document(s.app_db, doc_id):
        raise HTTPException(404, "No such document.")
    return {"deleted": doc_id}


@app.post("/api/books/{table}", dependencies=[Depends(admin)])
async def upload_books(table: str, file: UploadFile = File(...), s: Settings = Depends(get_cfg)):
    if table not in BOOKS_TABLES:
        raise HTTPException(404, f"Unknown table. Tables: {', '.join(BOOKS_TABLES)}.")
    data = await _read_upload(file, s.max_upload_bytes)
    try:
        n = await asyncio.to_thread(import_csv, s.books_db, table, data)
    except ImportError_ as e:
        raise HTTPException(400, str(e)) from e
    return {"table": table, "rows": n}


# ── contract terms ─────────────────────────────────────────────────────────

@app.get("/api/terms")
def list_terms(s: Settings = Depends(get_cfg)):
    out = []
    for sid in suppliers_with_contracts(s):
        hit = cached_terms(s, sid)
        out.append({"supplier_id": sid, "extracted": hit[0].model_dump(mode="json") if hit else None, "checks": hit[1] if hit else []})
    return {"suppliers": out, "reference": {k: v.model_dump(mode="json") for k, v in workflow.reference_terms(s).items()} if s.seed_demo else {}}


@app.post("/api/terms/{supplier_id}/extract", dependencies=[Depends(admin)])
async def extract(supplier_id: str, force: bool = False, s: Settings = Depends(get_cfg)):
    llm = need_llm(s)
    ex = await asyncio.to_thread(extract_supplier, s, llm, supplier_id, force=force)
    return {"supplier_id": supplier_id, "cached": ex.cached, "doc_ids": ex.doc_ids, "terms": ex.terms.model_dump(mode="json"), "checks": ex.checks}


# ── audit runs, drafts, outbox ─────────────────────────────────────────────

class AuditIn(BaseModel):
    terms_source: Literal["reference", "extracted"] = "reference"


def _run_detail(s: Settings, run_id: int) -> dict:
    with open_db(s.app_db) as conn:
        run = conn.execute("SELECT * FROM audit_runs WHERE id = ?", (run_id,)).fetchone()
        if run is None:
            raise HTTPException(404, "No such audit run.")
        findings = [dict(r) | {"evidence": json.loads(r["evidence"])} for r in
                    conn.execute("SELECT * FROM findings WHERE run_id = ? ORDER BY supplier_id, invoice_no", (run_id,))]
        drafts = [dict(r) | {"finding_ids": json.loads(r["finding_ids"])} for r in conn.execute("SELECT * FROM drafts WHERE run_id = ? ORDER BY id", (run_id,))]
    return dict(run) | {"summary": json.loads(run["summary"]) if run["summary"] else None, "findings": findings, "drafts": drafts,
                        "events": run_events.get(run_id, [])[-50:]}


@app.get("/api/audit/runs")
def list_runs(s: Settings = Depends(get_cfg)):
    with open_db(s.app_db) as conn:
        rows = conn.execute("SELECT * FROM audit_runs ORDER BY id DESC LIMIT 20").fetchall()
    return [dict(r) | {"summary": json.loads(r["summary"]) if r["summary"] else None} for r in rows]


@app.get("/api/audit/runs/{run_id}")
def get_run(run_id: int, s: Settings = Depends(get_cfg)):
    return _run_detail(s, run_id)


@app.post("/api/audit/runs", status_code=202)
async def start_run(body: AuditIn, request: Request, s: Settings = Depends(get_cfg)):
    if body.terms_source == "extracted":
        require_admin(request, s)  # extraction spends model budget
        llm = need_llm(s)
    else:
        demo_or_admin(request, s)
        llm = None
    with open_db(s.app_db) as conn:
        if conn.execute("SELECT count(*) FROM audit_runs WHERE status = 'running' AND started_at > datetime('now', '-15 minutes')").fetchone()[0]:
            raise HTTPException(409, "An audit is already running.")
    run_id = workflow.create_run(s, body.terms_source)
    events = run_events.setdefault(run_id, [])

    def work():
        try:
            workflow.execute_run(s, run_id, llm=llm, on_event=events.append)
        except Exception as e:
            events.append({"type": "error", "message": str(e) if isinstance(e, (LLMError, workflow.WorkflowError)) else "The audit failed."})
            log.warning("audit run %s failed: %s", run_id, e)

    if llm is None:
        await asyncio.to_thread(work)  # the deterministic audit takes well under a second
    else:
        threading.Thread(target=work, daemon=True).start()
    return _run_detail(s, run_id)


@app.post("/api/audit/runs/{run_id}/drafts", status_code=201)
def make_drafts(run_id: int, request: Request, s: Settings = Depends(get_cfg)):
    demo_or_admin(request, s)
    llm = make_llm(s)
    if llm is not None:
        limiter.check("ask:" + client_ip(request, s), [(s.ask_per_minute, 60), (s.ask_per_day, 86400)])
    workflow.draft_disputes(s, run_id, llm)
    return _run_detail(s, run_id)


class DecisionIn(BaseModel):
    decision: Literal["approve", "reject"]
    body: str | None = Field(default=None, max_length=10_000)
    reason: str | None = Field(default=None, max_length=500)


@app.post("/api/drafts/{draft_id}/decision")
def decide(draft_id: int, body: DecisionIn, request: Request, s: Settings = Depends(get_cfg)):
    demo_or_admin(request, s)
    return workflow.decide_draft(s, draft_id, body.decision, body=body.body, reason=body.reason)


@app.get("/api/outbox")
def outbox(s: Settings = Depends(get_cfg)):
    with open_db(s.app_db) as conn:
        return [dict(r) for r in conn.execute("SELECT * FROM outbox ORDER BY id DESC LIMIT 50")]


# ── evals and usage ────────────────────────────────────────────────────────

@app.get("/api/evals")
def evals(s: Settings = Depends(get_cfg)):
    out = {}
    for p in sorted(s.reports_dir.glob("*.json")):
        try:
            out[p.stem] = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
    return out


@app.get("/api/usage")
def usage(s: Settings = Depends(get_cfg)):
    with open_db(s.app_db) as conn:
        calls = conn.execute("""SELECT purpose, count(*) AS calls, coalesce(sum(input_tokens),0) AS input_tokens,
                                       coalesce(sum(output_tokens),0) AS output_tokens, coalesce(sum(cache_read),0) AS cache_read,
                                       round(coalesce(sum(cost_usd),0), 4) AS cost_usd
                                FROM llm_calls WHERE at >= date('now') GROUP BY purpose""").fetchall()
        asks = conn.execute("SELECT count(*) FROM asks WHERE at >= date('now')").fetchone()[0]
    return {"spent_today_usd": round(spent_today(s.app_db), 4), "budget_usd": s.daily_budget_usd, "asks_today": asks,
            "by_purpose": [dict(r) for r in calls]}
