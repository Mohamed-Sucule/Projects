import re

import pytest

from app import agent
from app.llm import LLMBusy, LLMRefused
from tests.fakes import FakeLLM, answer, last_tool_result, text, tool


def cite_first(quote_words=8):
    def turn(messages):
        res = last_tool_result(messages)
        cid = int(re.search(r"chunk_id (\d+)", res).group(1))
        body = re.search(r"<untrusted[^>]*>\n(.*?)\n</untrusted>", res, re.S).group(1)
        return answer(answer="ok", citations=[{"chunk_id": cid, "quote": " ".join(body.split()[:quote_words])}])
    return turn


def test_tool_loop_and_verified_citation(settings):
    llm = FakeLLM([tool("search_documents", {"query": "notice renewal", "supplier_id": "sparkle"}), cite_first()])
    events = []
    r = agent.ask("How much notice for Sparkle?", llm=llm, settings=settings, on_event=events.append)
    assert r.status == "answered" and len(r.citations) == 1 and r.dropped_citations == 0
    assert r.citations[0]["doc_id"].startswith("sparkle")
    assert [e["type"] for e in events] == ["tool", "tool_done"]
    # the second request replays the first assistant turn unchanged and adds the tool result after it
    second = llm.calls[1]["messages"]
    assert second[1]["role"] == "assistant" and second[2]["content"][0]["type"] == "tool_result"
    assert llm.calls[0]["schema"] == agent.ANSWER_SCHEMA and llm.calls[0]["effort"] == settings.effort_answer


def test_invented_and_unseen_citations_are_removed(settings):
    llm = FakeLLM([tool("search_documents", {"query": "delivery charge", "supplier_id": None}),
                   lambda m: answer(answer="x", citations=[{"chunk_id": 1, "quote": "a sentence that is not there"},
                                                           {"chunk_id": 999999, "quote": "anything"}])])
    r = agent.ask("Delivery?", llm=llm, settings=settings)
    assert r.citations == [] and r.dropped_citations == 2
    assert any("could not be matched" in w for w in r.warnings)


def test_answer_without_evidence_gets_a_warning(settings):
    r = agent.ask("What is 2+2?", llm=FakeLLM([answer(answer="4")]), settings=settings)
    assert any("not backed" in w for w in r.warnings)


def test_injected_database_text_is_wrapped_and_warned(settings):
    sql = "SELECT invoice_no, notes FROM invoices WHERE invoice_no = 'GL-1030'"
    llm = FakeLLM([tool("query_database", {"sql": sql}), answer(verdict="no", answer="No.")])
    r = agent.ask("Has GL-1030 been verified?", llm=llm, settings=settings)
    shown = last_tool_result(llm.calls[1]["messages"])
    assert shown.startswith('<untrusted source="accounts database" warning=')
    assert any("tries to instruct an AI" in w for w in r.warnings)
    assert r.queries[0]["sql"] == sql


def test_tool_errors_go_back_to_the_model(settings):
    llm = FakeLLM([tool("query_database", {"sql": "DELETE FROM invoices"}), tool("calculate", {"expression": "1/0"}, "t2"),
                   answer(status="not_found", answer="Could not.")])
    r = agent.ask("Delete everything", llm=llm, settings=settings)
    assert [s.is_error for s in r.steps] == [True, True]
    assert llm.calls[1]["messages"][-1]["content"][0]["is_error"] is True


def test_step_limit(settings):
    llm = FakeLLM([tool("calculate", {"expression": "1+1"}, f"t{i}") for i in range(agent.MAX_STEPS + 1)])
    with pytest.raises(agent.AgentError):
        agent.ask("loop forever", llm=llm, settings=settings)
    last_user = llm.calls[agent.MAX_STEPS]["messages"][-1]["content"]
    assert last_user[-1]["type"] == "text" and "last lookup" in last_user[-1]["text"]


def test_malformed_answer(settings):
    with pytest.raises(agent.AgentError):
        agent.ask("x?", llm=FakeLLM([text("not json")]), settings=settings)


@pytest.mark.parametrize("exc", [LLMRefused("declined"), LLMBusy("busy")])
def test_model_errors_propagate(settings, exc):
    with pytest.raises(type(exc)):
        agent.ask("x?", llm=FakeLLM([exc]), settings=settings)
