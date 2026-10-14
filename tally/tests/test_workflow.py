import json

import pytest

from app import workflow
from app.db import open_db
from tests.fakes import FakeLLM, text


def run_with_drafts(settings, llm=None):
    run_id = workflow.run_audit(settings, terms_source="reference")
    workflow.draft_disputes(settings, run_id, llm)
    return run_id


def group(settings, run_id, sid):
    return next(g for g in workflow._findings_by_supplier(settings, run_id) if g.supplier_id == sid)


def test_template_drafts_pass_their_own_guardrails(settings):
    run_id = run_with_drafts(settings)
    with open_db(settings.app_db) as conn:
        drafts = conn.execute("SELECT supplier_id, subject, body FROM drafts WHERE run_id = ?", (run_id,)).fetchall()
    assert len(drafts) == 8
    for d in drafts:
        assert workflow.check_draft(d["body"], d["subject"], group(settings, run_id, d["supplier_id"])) == []


def test_guardrail_catches_invented_amounts_and_missing_invoices(settings):
    run_id = workflow.run_audit(settings, terms_source="reference")
    g = group(settings, run_id, "greenleaf")
    problems = workflow.check_draft("We dispute £999.99 on GL-1030.", "Invoices", g)
    assert any("£999.99" in p for p in problems)
    assert any("GL-1044" in p for p in problems)
    assert any("total" in p for p in problems)


def test_model_draft_gets_one_retry_then_template(settings):
    run_id = workflow.run_audit(settings, terms_source="reference")
    bad = text({"subject": "Hello", "body": "Please refund £5,000.00."})
    ok = text({"subject": "Invoice PW-8005", "body": "We dispute £25.00 on PW-8005; the agreed charge is £240.00. Total £25.00."})
    assert workflow._model_draft(settings, FakeLLM([bad, ok]), group(settings, run_id, "pestaway"))[2] == "model (second attempt)"
    assert workflow._model_draft(settings, FakeLLM([bad, bad]), group(settings, run_id, "pestaway")) is None


def test_drafts_use_model_when_available_and_fall_back(settings):
    good = lambda m: text({"subject": "Invoice queries", "body": _body_from(m)})  # noqa: E731
    run_id = run_with_drafts(settings, FakeLLM([good] * 8))
    with open_db(settings.app_db) as conn:
        reasons = {r[0] for r in conn.execute("SELECT reason FROM drafts WHERE run_id = ?", (run_id,))}
    assert reasons == {"written by model"}


def _body_from(messages):
    facts = messages[0]["content"]
    invoices = sorted(set(__import__("re").findall(r"- ([A-Z]{2}-\d{4})", facts)))
    total = __import__("re").search(r"Total in dispute: (£[\d,.]+)", facts).group(1)
    return f"We dispute {', '.join(invoices)}. Total in dispute {total}."


def test_approval_flow(settings):
    run_id = run_with_drafts(settings)
    with open_db(settings.app_db) as conn:
        ids = [r[0] for r in conn.execute("SELECT id FROM drafts WHERE run_id = ? ORDER BY id", (run_id,))]
    assert workflow.decide_draft(settings, ids[0], "approve", body="Edited text") == {"id": ids[0], "status": "approved"}
    assert workflow.decide_draft(settings, ids[1], "reject", reason="not now")["status"] == "rejected"
    with pytest.raises(workflow.WorkflowError):
        workflow.decide_draft(settings, ids[0], "reject")
    with pytest.raises(workflow.WorkflowError):
        workflow.decide_draft(settings, ids[2], "approve", body="   ")
    with open_db(settings.app_db) as conn:
        out = conn.execute("SELECT draft_id, body FROM outbox").fetchall()
    assert [(r[0], r[1]) for r in out] == [(ids[0], "Edited text")]
    with pytest.raises(workflow.WorkflowError, match="already exist"):
        workflow.draft_disputes(settings, run_id, None)


def test_extracted_audit_without_model_or_cache_is_refused(settings):
    with pytest.raises(workflow.WorkflowError):
        workflow.run_audit(settings, terms_source="extracted")
    with open_db(settings.app_db) as conn:
        assert conn.execute("SELECT status FROM audit_runs ORDER BY id DESC").fetchone()[0] == "failed"


def test_summary(settings):
    run_id = workflow.run_audit(settings, terms_source="reference")
    with open_db(settings.app_db) as conn:
        summary = json.loads(conn.execute("SELECT summary FROM audit_runs WHERE id = ?", (run_id,)).fetchone()[0])
    assert summary["findings"] == 23 and summary["total"] == 1908.76
