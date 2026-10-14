import json

from app.audit import Matcher, audit, norm
from app.terms import ContractTerms
from evals.run import grade_findings


def gold(settings):
    truth = json.loads(settings.truth_path.read_text())
    return {k: ContractTerms.model_validate(v) for k, v in truth["terms"].items()}, truth["findings"]


def test_reference_terms_find_exactly_the_planted_errors(settings):
    terms, planted = gold(settings)
    found, skipped = audit(terms, settings.books_db)
    assert skipped == []
    assert {(f.invoice_no, f.rule): f.amount for f in found} == {(p["invoice_no"], p["rule"]): p["amount"] for p in planted}
    _, metrics = grade_findings(found, planted)
    assert metrics["recall"] == metrics["precision"] == 1.0


def test_injected_invoice_note_does_not_suppress_the_finding(settings):
    terms, _ = gold(settings)
    found, _ = audit(terms, settings.books_db)
    assert any(f.invoice_no == "GL-1030" and f.rule == "quantity" for f in found)


def test_missing_terms_mean_no_contract_findings(settings):
    terms, _ = gold(settings)
    del terms["sparkle"]
    found, skipped = audit(terms, settings.books_db)
    assert skipped == ["sparkle"]
    assert not [f for f in found if f.supplier_id == "sparkle"]


def test_wrong_terms_produce_findings(settings):
    terms, _ = gold(settings)
    t = terms["greenleaf"]
    terms["greenleaf"] = t.model_copy(update={"delivery_fee": t.delivery_fee.model_copy(update={"free_over_net": 100.0})})
    found, _ = audit(terms, settings.books_db)
    assert len([f for f in found if f.rule == "delivery_fee"]) > 2


def test_recurring_fees_are_not_duplicates(settings):
    terms, _ = gold(settings)
    found, _ = audit(terms, settings.books_db)
    assert [f.invoice_no for f in found if f.rule == "duplicate"] == ["NF-2079"]


def test_name_matching():
    assert norm("Call-out (out of hours)") == "call out"
    assert norm("King prawns") == "king prawn"
    m = Matcher(["Vine tomatoes", "Baby spinach", "Monthly cleaning fee"])
    assert m.match("vine tomato") == "Vine tomatoes"
    assert m.match("Monthly cleaning") == "Monthly cleaning fee"
    assert m.match("Delivery charge") is None
    assert Matcher(["Call-out", "Call-out charge"]).match("call") is None  # ambiguous: no guess
