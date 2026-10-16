"""Tally's evals. Every check is graded against facts computed from the data (data/truth.json, data/evalset.jsonl),
never by asking another model whether an answer looks right.

    python -m evals.run                       # offline suites; no API key needed
    python -m evals.run --suite qa --limit 10 # the model suites need ANTHROPIC_API_KEY
    python -m evals.run --all                 # everything

Offline: audit_reference, retrieval, sql_guard, ingestion.
Model:   qa, extraction, audit_extracted, drafts.
Each suite writes reports/<suite>.json, which the web UI's Evals tab renders, and reports/summary.json."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
import time
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path

from app import agent, workflow
from app.audit import audit
from app.config import ROOT, Settings, get_settings
from app.db import open_db
from app.extract import extract_supplier, suppliers_with_contracts
from app.ingest import injection
from app.ingest.parsers import ParseError, parse
from app.llm import LLMError, make_llm
from app.retrieval import search
from app.seed import ensure_ready
from app.sqlguard import SqlRejected, run_readonly
from app.terms import ContractTerms

from .sql_cases import ALLOWED, ATTACKS

OFFLINE = ["audit_reference", "retrieval", "sql_guard", "ingestion"]
MODEL = ["qa", "extraction", "audit_extracted", "drafts"]


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def report(suite: str, title: str, description: str, cases: list[dict], metrics: dict, headline: str, model: str | None = None, **extra) -> dict:
    return {"suite": suite, "title": title, "description": description, "ran_at": now(), "model": model,
            "passed": sum(1 for c in cases if c["pass"]), "total": len(cases), "metrics": metrics, "headline": headline,
            "cases": cases, **extra}


def load_truth(s: Settings) -> dict:
    return json.loads(s.truth_path.read_text(encoding="utf-8"))


def load_evalset() -> list[dict]:
    return [json.loads(line) for line in (ROOT / "data" / "evalset.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]


# ── findings vs planted errors (shared by audit_reference and audit_extracted) ──

def grade_findings(found, planted: list[dict]) -> tuple[list[dict], dict]:
    """A planted error counts as caught when a finding on the same invoice has the same amount to the penny.
    Whether the rule label also agrees is reported separately: 'price' versus 'fixed_fee' is a labelling choice."""
    by_inv: dict[str, list] = {}
    for f in found:
        by_inv.setdefault(f.invoice_no, []).append(f)
    cases, used = [], set()
    exact_rule = 0
    for p in planted:
        cands = [f for f in by_inv.get(p["invoice_no"], []) if abs(f.amount - p["amount"]) <= 0.01 and id(f) not in used]
        hit = next((f for f in cands if f.rule == p["rule"]), cands[0] if cands else None)
        if hit:
            used.add(id(hit))
            exact_rule += hit.rule == p["rule"]
        got = ", ".join(f"{f.rule} £{f.amount:.2f}" for f in by_inv.get(p["invoice_no"], [])) or "nothing"
        cases.append({"id": f"{p['invoice_no']} {p['rule']}", "pass": hit is not None,
                      "detail": f"planted £{p['amount']:.2f}; found {got}"})
    extras = [f for f in found if id(f) not in used]
    for f in extras:
        cases.append({"id": f"{f.invoice_no} {f.rule}", "pass": False, "detail": f"false positive £{f.amount:.2f}: {f.detail}"})
    caught = sum(1 for c in cases[:len(planted)] if c["pass"])
    precision = caught / (caught + len(extras)) if caught + len(extras) else 1.0
    metrics = {"recall": round(caught / len(planted), 4), "precision": round(precision, 4),
               "rule_agreement": round(exact_rule / caught, 4) if caught else 0.0, "false_positives": len(extras),
               "disputed_total": round(sum(f.amount for f in found), 2), "planted_total": round(sum(p["amount"] for p in planted), 2)}
    return cases, metrics


def suite_audit_reference(s: Settings, **_) -> dict:
    truth = load_truth(s)
    terms = {k: ContractTerms.model_validate(v) for k, v in truth["terms"].items()}
    found, _ = audit(terms, s.books_db)
    cases, metrics = grade_findings(found, truth["findings"])
    return report("audit_reference", "Audit engine vs planted errors",
                  "The deterministic checks, given the reference contract terms, must find each of the errors planted in the demo "
                  "books to the penny and flag nothing else.", cases, metrics, f"{metrics['recall']:.0%} recall, {metrics['precision']:.0%} precision")


def suite_retrieval(s: Settings, **_) -> dict:
    qs = [q for q in load_evalset() if q["gold"]["cite_docs"]]
    cases, rr, phrase_hits = [], [], 0
    with open_db(s.app_db) as conn:
        for q in qs:
            hits = search(conn, q["question"], limit=6)
            docs = [h.doc_id for h in hits]
            rank = next((i + 1 for i, d in enumerate(docs) if d in q["gold"]["cite_docs"]), None)
            phrase = q["gold"]["cite_phrase"]
            has_phrase = bool(phrase) and any(phrase.lower() in h.text.lower() for h in hits)
            phrase_hits += has_phrase
            rr.append(1 / rank if rank else 0.0)
            cases.append({"id": q["id"], "pass": rank is not None,
                          "detail": f"{q['question']} | wanted {', '.join(q['gold']['cite_docs'])}; rank {rank or '-'}; "
                                    f"phrase {'found' if has_phrase else 'missing' if phrase else 'n/a'}"})
    n = len(qs)
    metrics = {"recall_at_6": round(sum(c["pass"] for c in cases) / n, 4), "mrr": round(sum(rr) / n, 4),
               "phrase_recall_at_6": round(phrase_hits / sum(1 for q in qs if q["gold"]["cite_phrase"]), 4)}
    return report("retrieval", "Retrieval (BM25 over FTS5)",
                  "For every question whose answer is in a document, does one search with the raw question put that document in "
                  "the six passages the model sees? The agent can search again; this measures the first try.",
                  cases, metrics, f"recall@6 {metrics['recall_at_6']:.0%}")


def suite_sql_guard(s: Settings, **_) -> dict:
    cases = []
    for name, sql in ATTACKS:
        try:
            run_readonly(s.books_db, sql)
            cases.append({"id": name, "pass": False, "detail": "was allowed"})
        except SqlRejected as e:
            cases.append({"id": name, "pass": True, "detail": f"refused: {e}"[:160]})
    for name, sql, ok in ALLOWED:
        try:
            res = run_readonly(s.books_db, sql)
            good = ok(res.rows)
            cases.append({"id": name, "pass": good, "detail": "answered" if good else f"unexpected result {res.rows[:3]}"})
        except SqlRejected as e:
            cases.append({"id": name, "pass": False, "detail": f"wrongly refused: {e}"})
    blocked = sum(c["pass"] for c in cases[:len(ATTACKS)])
    allowed = sum(c["pass"] for c in cases[len(ATTACKS):])
    metrics = {"attacks_blocked": f"{blocked}/{len(ATTACKS)}", "legitimate_answered": f"{allowed}/{len(ALLOWED)}"}
    return report("sql_guard", "SQL sandbox", "Writes, schema probes, other databases, file access, extensions and runaway queries "
                  "must be refused; ordinary analytical queries must still work.", cases, metrics,
                  f"{blocked}/{len(ATTACKS)} attacks blocked")


def suite_ingestion(s: Settings, **_) -> dict:
    truth = load_truth(s)
    cases = []
    expect_flagged = {"pestaway-terms"}
    for d in truth["documents"]:
        data = (s.corpus_dir / d["file"]).read_bytes()
        try:
            p = parse(data, d["file"])
            flags = sorted({f for b in p.blocks for f in injection.scan(b.text)} | ({"hidden_text"} if any("[hidden on the web page]" in b.text for b in p.blocks) else set()))
            want = d["doc_id"] in expect_flagged
            ok = p.chars > 100 and bool(flags) == want
            cases.append({"id": d["doc_id"], "pass": ok, "detail": f"{p.format}, {len(p.blocks)} blocks, {p.chars} chars, flags {flags or 'none'}"})
        except ParseError as e:
            cases.append({"id": d["doc_id"], "pass": False, "detail": f"failed to parse: {e}"})
    hostile = _hostile_files()
    for name, data, filename in hostile:
        try:
            parse(data, filename)
            cases.append({"id": name, "pass": False, "detail": "was accepted"})
        except ParseError as e:
            cases.append({"id": name, "pass": True, "detail": f"refused: {e}"})
    with open_db(s.books_db) as conn:
        notes = [r[0] for r in conn.execute("SELECT notes FROM invoices WHERE notes != ''")]
    flagged_notes = [n for n in notes if injection.scan(n)]
    cases.append({"id": "invoice notes injection", "pass": len(flagged_notes) == 1,
                  "detail": f"{len(flagged_notes)} of {len(notes)} invoice notes flagged"})
    docs_ok = sum(c["pass"] for c in cases[:len(truth["documents"])])
    metrics = {"documents_parsed_and_classified": f"{docs_ok}/{len(truth['documents'])}",
               "hostile_files_refused": f"{sum(c['pass'] for c in cases[len(truth['documents']):-1])}/{len(hostile)}"}
    return report("ingestion", "Ingestion and injection flags", "Every demo document parses with the right flags (only the "
                  "Pestaway page hides instructions to AI); malformed and hostile files are refused with a clear reason.",
                  cases, metrics, f"{sum(c['pass'] for c in cases)}/{len(cases)}")


def _hostile_files() -> list[tuple[str, bytes, str]]:
    import io
    import zipfile

    bomb = io.BytesIO()
    with zipfile.ZipFile(bomb, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", "<Types/>")
        z.writestr("word/document.xml", "<w:document>" + "A" * 80_000_000 + "</w:document>")
    return [
        ("executable named .pdf", b"MZ\x90\x00\x03" + b"\x00" * 200, "contract.pdf"),
        ("binary with null bytes", b"hello\x00world" * 50, "notes.txt"),
        ("csv as a document", b"invoice_no,net\nGL-1,10\n" * 10, "export.csv"),
        ("docx zip bomb", bomb.getvalue(), "contract.docx"),
        ("truncated pdf", b"%PDF-1.7\n1 0 obj\n<<", "broken.pdf"),
        ("not utf-8 text", "café contract".encode("utf-16") * 20, "contract.md"),
        ("empty file", b"", "empty.pdf"),
    ]


# ── model suites ───────────────────────────────────────────────────────────

NUM = re.compile(r"-?\d[\d,]*(?:\.\d+)?")


def numbers_in(text: str) -> list[float]:
    return [float(m.group(0).replace(",", "")) for m in NUM.finditer(text.replace("£", ""))]


def grade_answer(q: dict, r: dict) -> tuple[bool, list[str]]:
    """r is agent.Result.to_dict(). Returns pass/fail and the reasons for any failure."""
    g, why = q["gold"], []
    if r["status"] != g["status"]:
        why.append(f"status {r['status']} (wanted {g['status']})")
    if g["verdict"] and r["verdict"] != g["verdict"]:
        why.append(f"verdict {r['verdict']} (wanted {g['verdict']})")
    values = [f["value"] for f in r["figures"]] + numbers_in(r["answer"])
    for f in g["figures"]:
        if not any(abs(v - f["value"]) <= f["tolerance"] for v in values):
            why.append(f"missing figure {f['value']}")
    dates = {d["date"] for d in r["dates"]}
    for d in g["dates"]:
        human = datetime.fromisoformat(d)
        if d not in dates and f"{human.day} {human:%B %Y}" not in r["answer"]:
            why.append(f"missing date {d}")
    text = r["answer"].lower()
    for m in g["mentions"]:
        if m.lower() not in text:
            why.append(f"does not mention {m}")
    if g["status"] == "answered" and g["cite_docs"]:
        cited = {c["doc_id"] for c in r["citations"]}
        if not cited & set(g["cite_docs"]):
            why.append(f"no verified citation to {' or '.join(g['cite_docs'])}")
    return not why, why


def suite_qa(s: Settings, *, limit: int | None = None, **_) -> dict:
    llm = make_llm(s)
    qs = load_evalset()[:limit] if limit else load_evalset()
    cases, results = [], []
    for q in qs:
        try:
            r = agent.ask(q["question"], llm=llm, settings=s).to_dict()
            ok, why = grade_answer(q, r)
        except LLMError as e:
            r, ok, why = None, False, [f"error: {e}"]
        results.append((q, r, ok))
        detail = ("; ".join(why) if why else "correct") + (f" | {r['answer'][:220]}" if r else "")
        cases.append({"id": f"{q['id']} {q['category']}", "pass": ok, "detail": detail})
        print(f"  {q['id']} {'pass' if ok else 'FAIL'} {'; '.join(why)}", flush=True)
    done = [r for _, r, _ in results if r]
    by_cat: dict[str, list[bool]] = {}
    for q, _, ok in results:
        by_cat.setdefault(q["category"], []).append(ok)
    unans = [r for q, r, _ in results if r and q["category"] == "unanswerable"]
    cites = sum(len(r["citations"]) for r in done)
    dropped = sum(r["dropped_citations"] for r in done)
    metrics = {"accuracy": round(sum(ok for *_, ok in results) / len(results), 4),
               **{f"{k}_accuracy": round(sum(v) / len(v), 4) for k, v in sorted(by_cat.items())},
               "answered_when_unanswerable": sum(r["status"] == "answered" for r in unans),
               "citations_verified": round(cites / (cites + dropped), 4) if cites + dropped else 1.0,
               "avg_tool_calls": round(sum(len(r["steps"]) for r in done) / max(1, len(done)), 2),
               "avg_latency_s": round(sum(r["latency_ms"] for r in done) / max(1, len(done)) / 1000, 1),
               "avg_cost_usd": round(sum(r["cost_usd"] for r in done) / max(1, len(done)), 4),
               "total_cost_usd": round(sum(r["cost_usd"] for r in done), 4)}
    return report("qa", "Question answering", "Fifty questions with answers computed from the data: contract terms, accounts "
                  "queries, invoice-vs-contract checks, questions the data cannot answer, and questions aimed at the planted "
                  "prompt injections. Graded on status, verdict, every key figure, dates, and a verified citation to the right document.",
                  cases, metrics, f"{metrics['accuracy']:.0%} correct", model=s.model)


def _field_score(gold: ContractTerms, got: ContractTerms) -> list[dict]:
    """Compare extracted terms with the reference, one case per fact."""
    from app.audit import norm

    out = []

    def same(a, b):
        if isinstance(a, float) or isinstance(b, float):
            return a is not None and b is not None and abs(float(a) - float(b)) < 0.005
        return a == b

    for f in ("contract_start", "contract_end", "auto_renews", "notice_days", "payment_days"):
        a, b = getattr(gold, f), getattr(got, f)
        out.append({"id": f, "pass": same(a, b), "detail": f"wanted {a}, got {b}"})
    for p in gold.prices:
        m = [x for x in got.prices if norm(x.item) == norm(p.item) and same(x.price, p.price)
             and x.effective_from == p.effective_from and x.effective_to == p.effective_to]
        out.append({"id": f"price {p.item} {p.price}", "pass": bool(m), "detail": f"from {p.effective_from} to {p.effective_to}"})
    for f in gold.fixed_fees:
        m = [x for x in got.fixed_fees if same(x.amount, f.amount) and x.period == f.period and x.effective_from == f.effective_from]
        out.append({"id": f"fee {f.name} {f.amount}", "pass": bool(m), "detail": f"{f.period}, from {f.effective_from}"})
    for name in ("delivery_fee", "volume_discount", "out_of_hours", "minimum_charge"):
        a, b = getattr(gold, name), getattr(got, name)
        if a is None and b is None:
            continue
        ok = a is not None and b is not None and all(same(getattr(a, k), getattr(b, k)) for k in type(a).model_fields if k != "evidence")
        out.append({"id": name, "pass": ok, "detail": f"wanted {a.model_dump(exclude={'evidence'}) if a else None}, got {b.model_dump(exclude={'evidence'}) if b else None}"})
    for a in gold.allowances:
        m = [x for x in got.allowances if x.free_quantity == a.free_quantity and same(x.price_after, a.price_after) and x.period == a.period]
        out.append({"id": f"allowance {a.item}", "pass": bool(m), "detail": f"{a.free_quantity} free per {a.period}, then {a.price_after}"})
    extra = len(got.prices) - len(gold.prices)
    if extra > 0:
        out.append({"id": "extra prices", "pass": False, "detail": f"{extra} more price entries than the reference"})
    return out


def suite_extraction(s: Settings, **_) -> dict:
    llm = make_llm(s)
    truth = load_truth(s)
    cases, evid_ok, evid_n = [], 0, 0
    for sid in suppliers_with_contracts(s):
        try:
            ex = extract_supplier(s, llm, sid, force=True)
        except LLMError as e:
            cases.append({"id": sid, "pass": False, "detail": f"error: {e}"})
            continue
        evid_ok += sum(c["found"] for c in ex.checks)
        evid_n += len(ex.checks)
        for c in _field_score(ContractTerms.model_validate(truth["terms"][sid]), ex.terms):
            cases.append({**c, "id": f"{sid}: {c['id']}"})
        print(f"  {sid}: {sum(c['pass'] for c in cases if c['id'].startswith(sid))} facts right", flush=True)
    metrics = {"fact_accuracy": round(sum(c["pass"] for c in cases) / max(1, len(cases)), 4),
               "evidence_quotes_found": round(evid_ok / evid_n, 4) if evid_n else 0.0}
    return report("extraction", "Contract term extraction", "Claude reads each supplier's contract and amendments into typed "
                  "terms. Each fact is compared with the reference terms; every evidence quote must appear in the source.",
                  cases, metrics, f"{metrics['fact_accuracy']:.0%} of facts", model=s.model)


def suite_audit_extracted(s: Settings, **_) -> dict:
    llm = make_llm(s)
    terms = {}
    for sid in suppliers_with_contracts(s):
        terms[sid] = extract_supplier(s, llm, sid).terms  # cached if the extraction suite just ran
    found, _ = audit(terms, s.books_db)
    cases, metrics = grade_findings(found, load_truth(s)["findings"])
    return report("audit_extracted", "End to end: extracted terms → audit", "The whole pipeline with no reference data: terms "
                  "extracted by Claude drive the checks, which must find the planted errors and nothing else.",
                  cases, metrics, f"{metrics['recall']:.0%} recall, {metrics['precision']:.0%} precision", model=s.model)


def suite_drafts(s: Settings, **_) -> dict:
    llm = make_llm(s)
    run_id = workflow.run_audit(s, terms_source="reference")
    workflow.draft_disputes(s, run_id, llm)
    with open_db(s.app_db) as conn:
        drafts = [dict(r) for r in conn.execute("SELECT supplier_id, subject, body, reason FROM drafts WHERE run_id = ?", (run_id,))]
    groups = {g.supplier_id: g for g in workflow._findings_by_supplier(s, run_id)}
    cases = []
    for d in drafts:
        problems = workflow.check_draft(d["body"], d["subject"], groups[d["supplier_id"]])
        first = d["reason"] == "written by model"
        cases.append({"id": d["supplier_id"], "pass": not problems and d["reason"].startswith("written by model"),
                      "detail": f"{d['reason']}; " + ("; ".join(problems) if problems else "all invoices and amounts check out") + f" | {d['subject']}"})
        d["first_try"] = first
    metrics = {"model_drafts_passing_guardrails": round(sum(c["pass"] for c in cases) / max(1, len(cases)), 4),
               "passed_first_try": round(sum(d["first_try"] for d in drafts) / max(1, len(drafts)), 4)}
    return report("drafts", "Dispute email drafts", "Claude writes one email per supplier; the guardrail requires every disputed "
                  "invoice to be named and every £ amount to be one the audit produced. Failures get one retry, then a template.",
                  cases, metrics, f"{metrics['model_drafts_passing_guardrails']:.0%} pass", model=s.model)


SUITES = {"audit_reference": suite_audit_reference, "retrieval": suite_retrieval, "sql_guard": suite_sql_guard,
          "ingestion": suite_ingestion, "qa": suite_qa, "extraction": suite_extraction, "audit_extracted": suite_audit_extracted,
          "drafts": suite_drafts}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--suite", action="append", choices=list(SUITES), help="run only these suites (repeatable)")
    ap.add_argument("--all", action="store_true", help="run offline and model suites")
    ap.add_argument("--limit", type=int, help="qa: only the first N questions")
    ap.add_argument("--out", type=Path, default=ROOT / "reports", help="where to write the JSON reports")
    ap.add_argument("--min-pass", type=float, default=None, help="exit non-zero if any suite scores below this fraction")
    args = ap.parse_args(argv)

    with tempfile.TemporaryDirectory(prefix="tally-eval-") as tmp:
        # Evals run on a fresh copy of the demo data, never on a live deployment's database.
        s = replace(get_settings(), data_dir=Path(tmp), seed_demo=True,
                    daily_budget_usd=float(os.environ.get("TALLY_EVAL_BUDGET_USD", "25")))
        ensure_ready(s)
        names = args.suite or (OFFLINE + MODEL if args.all else OFFLINE)
        if any(n in MODEL for n in names) and not s.llm_enabled:
            print("Model suites need ANTHROPIC_API_KEY; skipping:", ", ".join(n for n in names if n in MODEL))
            names = [n for n in names if n not in MODEL]
        args.out.mkdir(parents=True, exist_ok=True)
        summary_path = args.out / "summary.json"
        summary = json.loads(summary_path.read_text()) if summary_path.exists() else {"suites": []}
        worst = 1.0
        for name in names:
            started = time.monotonic()
            print(f"{name} …", flush=True)
            rep = SUITES[name](s, limit=args.limit)
            rep["seconds"] = round(time.monotonic() - started, 1)
            if name == "qa" and args.limit:
                rep["description"] += f" (this run: first {args.limit} questions)"
            (args.out / f"{name}.json").write_text(json.dumps(rep, indent=1, default=str) + "\n", encoding="utf-8")
            frac = rep["passed"] / rep["total"] if rep["total"] else 1.0
            worst = min(worst, frac)
            print(f"  {rep['title']}: {rep['passed']}/{rep['total']} · {rep['headline']} · {rep['metrics']}")
            summary["suites"] = [x for x in summary["suites"] if x["suite"] != name] + [
                {"suite": name, "title": rep["title"], "headline": rep["headline"], "passed": rep["passed"], "total": rep["total"],
                 "model": rep["model"], "ran_at": rep["ran_at"]}]
        order = {n: i for i, n in enumerate(OFFLINE + MODEL)}
        summary["suites"].sort(key=lambda x: order.get(x["suite"], 99))
        ran_model = [x for x in summary["suites"] if x["suite"] in MODEL]
        summary["note"] = ("Offline suites run in CI on every push. " + (
            "Model suites last ran on " + max(x["ran_at"] for x in ran_model)[:10] + "." if ran_model else
            "Model suites (qa, extraction, audit_extracted, drafts) have not been run for this build: they need an ANTHROPIC_API_KEY."))
        summary_path.write_text(json.dumps(summary, indent=1) + "\n", encoding="utf-8")
    if args.min_pass is not None and worst < args.min_pass:
        print(f"FAIL: a suite scored {worst:.0%}, below {args.min_pass:.0%}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
