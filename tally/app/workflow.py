"""The audit workflow: terms -> deterministic checks -> dispute drafts -> a person approves or rejects each draft.
Nothing leaves Tally without that approval; approved drafts go to an outbox table (the demo never sends email)."""

from __future__ import annotations

import json
import re
from collections import defaultdict
from dataclasses import dataclass
from typing import Callable

from .audit import audit
from .config import Settings
from .db import open_db
from .extract import cached_terms, extract_supplier, suppliers_with_contracts
from .llm import LLM, LLMError
from .terms import ContractTerms

RULE_NAMES = {
    "price": "price above contract", "fixed_fee": "fee above contract", "delivery_fee": "delivery charge not due",
    "volume_discount": "volume discount missing", "out_of_hours": "out-of-hours rate not due", "minimum_charge": "minimum charge not due",
    "allowance": "free allowance not applied", "frequency": "charged more often than agreed", "quantity": "billed more than delivered",
    "duplicate": "duplicate invoice", "arithmetic": "totals do not add up",
}


class WorkflowError(ValueError):
    pass


def reference_terms(settings: Settings) -> dict[str, ContractTerms]:
    truth = json.loads(settings.truth_path.read_text(encoding="utf-8"))
    return {k: ContractTerms.model_validate(v) for k, v in truth["terms"].items()}


def gather_terms(settings: Settings, source: str, llm: LLM | None, emit: Callable[[dict], None]) -> tuple[dict[str, ContractTerms], dict]:
    if source == "reference":
        return reference_terms(settings), {}
    if source != "extracted":
        raise WorkflowError("terms_source must be 'extracted' or 'reference'.")
    terms, unverified = {}, {}
    for sid in suppliers_with_contracts(settings):
        if llm is not None:
            emit({"type": "extract", "supplier_id": sid})
            ex = extract_supplier(settings, llm, sid)
            terms[sid], checks = ex.terms, ex.checks
        else:
            hit = cached_terms(settings, sid)
            if hit is None:
                continue
            terms[sid], checks = hit[0], hit[1]
        bad = [c["path"] for c in checks if not c["found"]]
        if bad:
            unverified[sid] = bad
    if not terms:
        raise WorkflowError("No extracted terms are available and the model is not configured. Run with terms_source='reference'.")
    return terms, unverified


def create_run(settings: Settings, terms_source: str) -> int:
    if terms_source not in ("extracted", "reference"):
        raise WorkflowError("terms_source must be 'extracted' or 'reference'.")
    with open_db(settings.app_db) as conn:
        return conn.execute("INSERT INTO audit_runs (status, terms_source) VALUES ('running', ?)", (terms_source,)).lastrowid


def execute_run(settings: Settings, run_id: int, *, llm: LLM | None = None, on_event: Callable[[dict], None] | None = None) -> dict:
    emit = on_event or (lambda e: None)
    with open_db(settings.app_db) as conn:
        terms_source = conn.execute("SELECT terms_source FROM audit_runs WHERE id = ?", (run_id,)).fetchone()[0]
    try:
        terms, unverified = gather_terms(settings, terms_source, llm, emit)
        emit({"type": "checking", "suppliers": len(terms)})
        findings, skipped = audit(terms, settings.books_db)
    except Exception as e:
        with open_db(settings.app_db) as conn:
            conn.execute("UPDATE audit_runs SET status='failed', finished_at=datetime('now'), error=? WHERE id=?", (str(e)[:500], run_id))
        raise
    by_supplier: dict[str, float] = defaultdict(float)
    with open_db(settings.app_db) as conn:
        for f in findings:
            conn.execute("INSERT INTO findings (run_id, supplier_id, invoice_no, rule, amount, detail, evidence) VALUES (?,?,?,?,?,?,?)",
                         (run_id, f.supplier_id, f.invoice_no, f.rule, f.amount, f.detail, json.dumps(list(dict.fromkeys(f.evidence)))))
            by_supplier[f.supplier_id] += f.amount
        summary = {"findings": len(findings), "total": round(sum(f.amount for f in findings), 2),
                   "by_supplier": {k: round(v, 2) for k, v in sorted(by_supplier.items())},
                   "suppliers_checked": sorted(terms), "suppliers_without_terms": skipped, "unverified_evidence": unverified}
        conn.execute("UPDATE audit_runs SET status='done', finished_at=datetime('now'), summary=? WHERE id=?", (json.dumps(summary), run_id))
    emit({"type": "done", "run_id": run_id, "summary": summary})
    return summary


def run_audit(settings: Settings, *, terms_source: str = "extracted", llm: LLM | None = None,
              on_event: Callable[[dict], None] | None = None) -> int:
    run_id = create_run(settings, terms_source)
    execute_run(settings, run_id, llm=llm, on_event=on_event)
    return run_id


# ── dispute drafts ─────────────────────────────────────────────────────────

DRAFT_SYSTEM = """You write short, firm, polite emails from {org}'s accounts team to a supplier, disputing specific invoice
charges. Use only the findings you are given: do not add charges, amounts, dates or claims of your own, and do not
change any amount. Mention every invoice number. State the total being disputed. Ask for a credit note. Keep it under
250 words, plain text, no markdown, signed "Accounts team, {org}". The findings come from an automated check of the
invoices against the contract; the contract wording quoted with each finding may be used."""

DRAFT_SCHEMA = {"type": "object", "properties": {"subject": {"type": "string"}, "body": {"type": "string"}},
                "required": ["subject", "body"], "additionalProperties": False}

MONEY = re.compile(r"£\s?([0-9][0-9,]*(?:\.[0-9]{1,2})?)")


@dataclass
class SupplierFindings:
    supplier_id: str
    name: str
    email: str | None
    rows: list[dict]

    @property
    def total(self) -> float:
        return round(sum(r["amount"] for r in self.rows), 2)


def check_draft(body: str, subject: str, sf: SupplierFindings) -> list[str]:
    """Guardrails on generated text: every invoice is mentioned, and every £ amount in the email is one we computed."""
    problems = []
    text = subject + "\n" + body
    for r in sf.rows:
        if r["invoice_no"] not in text:
            problems.append(f"invoice {r['invoice_no']} is not mentioned")
    allowed = {round(r["amount"], 2) for r in sf.rows} | {sf.total}
    for inv in {r["invoice_no"] for r in sf.rows}:
        allowed.add(round(sum(r["amount"] for r in sf.rows if r["invoice_no"] == inv), 2))
    facts = " ".join(r["detail"] + " " + r["evidence"] for r in sf.rows)  # amounts quoted in the findings may be repeated
    allowed |= {round(float(m.group(1).replace(",", "")), 2) for m in MONEY.finditer(facts)}
    for m in MONEY.finditer(text):
        v = round(float(m.group(1).replace(",", "")), 2)
        if v not in allowed:
            problems.append(f"amount £{v:,.2f} is not one of the findings")
    if f"{sf.total:,.2f}" not in text and f"{sf.total:.2f}" not in text:
        problems.append(f"the total £{sf.total:,.2f} is not stated")
    return problems


def template_draft(sf: SupplierFindings, org: str) -> tuple[str, str]:
    lines = [f"Dear {sf.name},", "",
             "We have checked recent invoices against our agreement and found the following charges that we believe are incorrect:", ""]
    for r in sf.rows:
        lines.append(f"- {r['invoice_no']}: {RULE_NAMES.get(r['rule'], r['rule'])}, £{r['amount']:,.2f}. {r['detail']}")
    lines += ["", f"The total in dispute is £{sf.total:,.2f}. Please issue a credit note for this amount, or explain the charges "
              "if you believe they are correct.", "", f"Accounts team, {org}"]
    return f"Invoice queries: £{sf.total:,.2f} in disputed charges", "\n".join(lines)


def _findings_by_supplier(settings: Settings, run_id: int) -> list[SupplierFindings]:
    with open_db(settings.app_db) as conn:
        rows = [dict(r) for r in conn.execute("SELECT id, supplier_id, invoice_no, rule, amount, detail, evidence FROM findings WHERE run_id = ? "
                                               "ORDER BY supplier_id, invoice_no", (run_id,))]
    with open_db(settings.books_db) as conn:
        names = {r[0]: (r[1], r[2]) for r in conn.execute("SELECT supplier_id, name, email FROM suppliers")}
    grouped: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        grouped[r["supplier_id"]].append(r)
    return [SupplierFindings(sid, names.get(sid, (sid, None))[0], names.get(sid, (sid, None))[1], rs) for sid, rs in grouped.items()]


def draft_disputes(settings: Settings, run_id: int, llm: LLM | None, on_event: Callable[[dict], None] | None = None) -> list[int]:
    emit = on_event or (lambda e: None)
    with open_db(settings.app_db) as conn:
        run = conn.execute("SELECT status FROM audit_runs WHERE id = ?", (run_id,)).fetchone()
        if run is None or run["status"] != "done":
            raise WorkflowError("That audit run does not exist or has not finished.")
        if conn.execute("SELECT count(*) FROM drafts WHERE run_id = ?", (run_id,)).fetchone()[0]:
            raise WorkflowError("Drafts for this run already exist.")
    ids = []
    for sf in _findings_by_supplier(settings, run_id):
        emit({"type": "drafting", "supplier_id": sf.supplier_id})
        subject, body, how = *template_draft(sf, settings.org_name), "template"
        if llm is not None:
            subject, body, how = _model_draft(settings, llm, sf) or (subject, body, "template (model draft failed checks)")
        with open_db(settings.app_db) as conn:
            ids.append(conn.execute("INSERT INTO drafts (run_id, supplier_id, to_addr, subject, body, finding_ids, reason) VALUES (?,?,?,?,?,?,?)",
                                    (run_id, sf.supplier_id, sf.email, subject, body, json.dumps([r["id"] for r in sf.rows]),
                                     f"written by {how}")).lastrowid)
    return ids


def _model_draft(settings: Settings, llm: LLM, sf: SupplierFindings) -> tuple[str, str, str] | None:
    facts = "\n".join(f"- {r['invoice_no']} | {RULE_NAMES.get(r['rule'], r['rule'])} | £{r['amount']:,.2f} | {r['detail']}"
                      + (f" | contract: {'; '.join(json.loads(r['evidence']))}" if json.loads(r["evidence"]) else "") for r in sf.rows)
    messages = [{"role": "user", "content": f"Supplier: {sf.name}\nTotal in dispute: £{sf.total:,.2f}\nFindings:\n{facts}"}]
    system = DRAFT_SYSTEM.format(org=settings.org_name)
    for attempt in range(2):
        try:
            reply = llm.create("draft", system=system, messages=messages, schema=DRAFT_SCHEMA, effort="low", max_tokens=4000)
            data = json.loads(reply.text())
            subject, body = str(data["subject"])[:200], str(data["body"])[:5000]
        except (LLMError, json.JSONDecodeError, KeyError, TypeError):
            return None
        problems = check_draft(body, subject, sf)
        if not problems:
            return subject, body, "model" if attempt == 0 else "model (second attempt)"
        messages += [{"role": "assistant", "content": reply.content},
                     {"role": "user", "content": "Please fix these problems and return the whole email again: " + "; ".join(problems)}]
    return None


def decide_draft(settings: Settings, draft_id: int, decision: str, *, body: str | None = None, reason: str | None = None) -> dict:
    if decision not in ("approve", "reject"):
        raise WorkflowError("decision must be 'approve' or 'reject'.")
    with open_db(settings.app_db) as conn:
        d = conn.execute("SELECT * FROM drafts WHERE id = ?", (draft_id,)).fetchone()
        if d is None:
            raise WorkflowError("No such draft.")
        if d["status"] != "pending":
            raise WorkflowError(f"This draft was already {d['status']}.")
        if decision == "reject":
            conn.execute("UPDATE drafts SET status='rejected', decided_at=datetime('now'), reason=? WHERE id=?", ((reason or "")[:500], draft_id))
            return {"id": draft_id, "status": "rejected"}
        final = (body if body is not None else d["body"]).strip()
        if not final:
            raise WorkflowError("The email body is empty.")
        conn.execute("UPDATE drafts SET status='approved', decided_at=datetime('now'), body=? WHERE id=?", (final[:10_000], draft_id))
        conn.execute("INSERT INTO outbox (draft_id, to_addr, subject, body) VALUES (?,?,?,?)", (draft_id, d["to_addr"], d["subject"], final[:10_000]))
        return {"id": draft_id, "status": "approved"}
