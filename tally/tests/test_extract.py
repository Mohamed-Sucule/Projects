import json

import pytest

from app import extract, workflow
from app.llm import LLMError
from app.terms import ContractTerms
from tests.fakes import FakeLLM, text


def walk(node):
    if isinstance(node, dict):
        yield node
        for v in node.values():
            yield from walk(v)
    elif isinstance(node, list):
        for v in node:
            yield from walk(v)


def test_schema_is_structured_output_friendly():
    nodes = list(walk(extract.TERMS_SCHEMA))
    assert not any("$ref" in n or "$defs" in n for n in nodes)
    for n in nodes:
        if n.get("type") == "object":
            assert n["additionalProperties"] is False
            assert set(n["required"]) == set(n["properties"])


def gold(settings, sid):
    return json.loads(settings.truth_path.read_text())["terms"][sid]


def test_extraction_checks_evidence_and_caches(settings):
    llm = FakeLLM([text(gold(settings, "greenleaf"))])
    ex = extract.extract_supplier(settings, llm, "greenleaf")
    assert not ex.cached and ex.doc_ids == ["greenleaf-contract", "greenleaf-amendment-1"]
    assert all(c["found"] for c in ex.checks)
    assert "untrusted" in llm.calls[0]["messages"][0]["content"] and llm.calls[0]["effort"] == settings.effort_extract
    again = extract.extract_supplier(settings, FakeLLM([]), "greenleaf")  # no scripted turns: must not call the model
    assert again.cached and again.terms == ContractTerms.model_validate(gold(settings, "greenleaf"))


def test_invented_evidence_is_reported(settings):
    t = gold(settings, "northsea")
    t["volume_discount"]["evidence"] = "A discount of 50% applies to everything."
    ex = extract.extract_supplier(settings, FakeLLM([text(t)]), "northsea")
    assert [c["path"] for c in ex.checks if not c["found"]] == ["volume_discount"]
    run_id = workflow.run_audit(settings, terms_source="extracted")  # uses the cached terms, no model needed
    from app.db import open_db
    with open_db(settings.app_db) as conn:
        summary = json.loads(conn.execute("SELECT summary FROM audit_runs WHERE id = ?", (run_id,)).fetchone()[0])
    assert summary["unverified_evidence"] == {"northsea": ["volume_discount"]}


def test_schema_violations_are_errors(settings):
    with pytest.raises(LLMError):
        extract.extract_supplier(settings, FakeLLM([text({"supplier": "x"})]), "oakbarrel")


def test_unknown_supplier(settings):
    with pytest.raises(LLMError):
        extract.extract_supplier(settings, FakeLLM([]), "nobody")
