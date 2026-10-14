from evals.run import grade_answer, numbers_in

Q = {"id": "q", "category": "combined", "question": "?", "gold": {"status": "answered", "verdict": "no",
     "figures": [{"value": 1.05, "tolerance": 0.01}], "dates": ["2026-06-01"], "cite_docs": ["greenleaf-amendment-1"],
     "cite_phrase": "", "mentions": ["GL-1054"]}}


def result(**kw):
    r = {"status": "answered", "verdict": "no", "answer": "GL-1054 was overcharged by £1.05 before 1 June 2026.",
         "figures": [], "dates": [], "citations": [{"doc_id": "greenleaf-amendment-1"}]}
    r.update(kw)
    return r


def test_correct_answer_passes():
    ok, why = grade_answer(Q, result())
    assert ok, why


def test_each_check_can_fail():
    assert not grade_answer(Q, result(status="not_found"))[0]
    assert not grade_answer(Q, result(verdict="yes"))[0]
    assert not grade_answer(Q, result(answer="GL-1054 was overcharged by £1.50 before 1 June 2026."))[0]
    assert not grade_answer(Q, result(answer="GL-1054 was overcharged by £1.05."))[0]
    assert not grade_answer(Q, result(answer="It was overcharged by £1.05 before 1 June 2026."))[0]
    assert not grade_answer(Q, result(citations=[{"doc_id": "greenleaf-contract"}]))[0]


def test_figures_can_come_from_the_structured_list():
    ok, _ = grade_answer(Q, result(answer="GL-1054 was overcharged before 1 June 2026.", figures=[{"label": "x", "value": 1.05, "unit": "GBP"}]))
    assert ok


def test_number_parsing():
    assert numbers_in("£13,555.63 and 60 days, -2.5") == [13555.63, 60.0, -2.5]
