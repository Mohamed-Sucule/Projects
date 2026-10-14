import json
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

import app.main as main
from tests.fakes import FakeLLM, answer, tool

ADMIN = {"Authorization": "Bearer test-admin-token"}


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:
        yield c


@pytest.fixture
def cfg(monkeypatch):
    """Swap the app's settings for a test; returns a function that applies overrides."""
    def apply(**kw):
        s = replace(main.settings, **kw)
        main.app.dependency_overrides[main.get_cfg] = lambda: s
        return s
    yield apply
    main.app.dependency_overrides.clear()
    main.limiter._hits.clear()


def events(body: str) -> list[tuple[str, dict]]:
    out = []
    for block in body.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.splitlines() if ": " in line and not line.startswith(":"))
        if "event" in lines:
            out.append((lines["event"], json.loads(lines["data"])))
    return out


def test_pages_and_security_headers(client):
    r = client.get("/")
    assert r.status_code == 200 and "Tally" in r.text
    assert "default-src 'self'" in r.headers["content-security-policy"]
    assert r.headers["x-content-type-options"] == "nosniff" and r.headers["x-frame-options"] == "DENY"
    assert client.get("/healthz").json()["ok"] is True
    assert client.get("/api/meta").json()["books"]["invoices"] == 285
    assert client.get("/api/documents").status_code == 200
    assert client.get("/docs").status_code == 404


def test_errors_share_one_envelope(client):
    assert client.get("/api/nope").json() == {"error": {"code": "not_found", "message": "Not Found"}}
    r = client.post("/api/ask", json={"question": "x"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_request"
    r = client.post("/api/ask", content="{}", headers={"content-type": "application/json", "content-length": "999999"})
    assert r.status_code == 413


def test_ask_without_a_key_explains_itself(client, cfg):
    cfg(anthropic_api_key=None)
    r = client.post("/api/ask", json={"question": "How much notice for Sparkle?"})
    assert r.status_code == 503 and "ANTHROPIC_API_KEY" in r.json()["error"]["message"]


def test_ask_streams_progress_then_answer(client, cfg, monkeypatch):
    cfg(anthropic_api_key="test")
    llm = FakeLLM([tool("calculate", {"expression": "2 + 2"}), answer(answer="Four.", figures=[{"label": "sum", "value": 4, "unit": ""}])])
    monkeypatch.setattr(main, "make_llm", lambda s: llm)
    r = client.post("/api/ask", json={"question": "What is two plus two?"})
    assert r.headers["content-type"].startswith("text/event-stream")
    evs = events(r.text)
    assert [e for e, _ in evs] == ["start", "progress", "progress", "answer"]
    assert evs[-1][1]["answer"] == "Four." and evs[-1][1]["steps"][0]["tool"] == "calculate"


def test_ask_rate_limit(client, cfg, monkeypatch):
    cfg(anthropic_api_key="test", ask_per_minute=2)
    monkeypatch.setattr(main, "make_llm", lambda s: FakeLLM([answer(answer="ok")]))
    codes = [client.post("/api/ask", json={"question": "Anything at all?"}).status_code for _ in range(3)]
    assert codes == [200, 200, 429]


def test_model_errors_arrive_as_error_events(client, cfg, monkeypatch):
    from app.llm import LLMBusy
    cfg(anthropic_api_key="test")
    monkeypatch.setattr(main, "make_llm", lambda s: FakeLLM([LLMBusy("The model service is overloaded.")]))
    evs = events(client.post("/api/ask", json={"question": "Anything at all?"}).text)
    assert evs[-1] == ("error", {"code": "llm_busy", "message": "The model service is overloaded."})


def test_admin_endpoints_need_the_token(client):
    files = {"file": ("w.md", b"# Terms\n\nWindows are cleaned monthly for \xc2\xa340 per visit, payable in 30 days.")}
    assert client.post("/api/documents", files=files).status_code == 401
    assert client.post("/api/documents", files=files, headers={"Authorization": "Bearer nope"}).status_code == 401
    r = client.post("/api/documents", files=files, data={"kind": "contract", "supplier_id": "clearview"}, headers=ADMIN)
    assert r.status_code == 201, r.text
    assert client.delete(f"/api/documents/{r.json()['id']}", headers=ADMIN).json() == {"deleted": r.json()["id"]}
    bad = client.post("/api/documents", files={"file": ("x.pdf", b"MZ\x90\x00" * 100)}, headers=ADMIN)
    assert bad.status_code == 415
    assert client.post("/api/documents", files=files, data={"supplier_id": "../etc"}, headers=ADMIN).status_code == 400
    assert client.post("/api/books/sqlite_master", files={"file": ("x.csv", b"a\n1")}, headers=ADMIN).status_code == 404


def test_admin_switched_off_without_token(client, cfg):
    cfg(admin_token=None)
    r = client.post("/api/documents", files={"file": ("w.md", b"# T\n\nsome text here that is long enough to index")})
    assert r.status_code == 403


def test_audit_drafts_and_approval_over_http(client):
    run = client.post("/api/audit/runs", json={"terms_source": "reference"}).json()
    assert run["status"] == "done" and len(run["findings"]) == 23
    assert client.post("/api/audit/runs", json={"terms_source": "extracted"}).status_code == 401
    run = client.post(f"/api/audit/runs/{run['id']}/drafts").json()
    first = run["drafts"][0]["id"]
    assert client.post(f"/api/drafts/{first}/decision", json={"decision": "approve"}).json()["status"] == "approved"
    again = client.post(f"/api/drafts/{first}/decision", json={"decision": "approve"})
    assert again.status_code == 409 and again.json()["error"]["code"] == "conflict"
    assert client.get("/api/outbox").json()[0]["draft_id"] == first


def test_private_demo_requires_admin_for_writes(client, cfg):
    cfg(public_demo=False)
    assert client.post("/api/audit/runs", json={"terms_source": "reference"}).status_code == 401
    assert client.post("/api/audit/runs", json={"terms_source": "reference"}, headers=ADMIN).status_code == 202
