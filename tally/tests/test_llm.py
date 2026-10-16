from contextlib import contextmanager
from types import SimpleNamespace

import anthropic
import httpx2
import pytest

from app.db import init_app_db, open_db
from app.llm import (FALLBACK_BETA, BudgetExceeded, ClaudeLLM, LLMBusy, LLMError, LLMRefused, LLMTruncated, LLMUnavailable,
                     cost_of, spent_today)

REQ = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")


def resp(status):
    return httpx2.Response(status, request=REQ)


def message(stop="end_turn", model="claude-opus-5-5"):
    usage = SimpleNamespace(input_tokens=1000, output_tokens=200, cache_read_input_tokens=5000, cache_creation_input_tokens=0, iterations=None)
    return SimpleNamespace(content=[SimpleNamespace(type="text", text="{}")], stop_reason=stop, model=model, usage=usage)


class StubClient:
    def __init__(self, outcome):
        self.outcome, self.kwargs = outcome, None
        self.beta = SimpleNamespace(messages=SimpleNamespace(stream=self.stream))

    @contextmanager
    def stream(self, **kw):
        self.kwargs = kw
        if isinstance(self.outcome, Exception):
            raise self.outcome
        yield SimpleNamespace(get_final_message=lambda: self.outcome, request_id="req_1")


def make(tmp_path, outcome, budget=5.0):
    init_app_db(tmp_path / "app.db")
    llm = ClaudeLLM(api_key="test", model="claude-opus-5-5", app_db=tmp_path / "app.db", daily_budget_usd=budget, fallbacks="default")
    llm._client = StubClient(outcome)
    return llm


def call(llm):
    return llm.create("test", system="sys", messages=[{"role": "user", "content": "hi"}], schema={"type": "object"}, effort="high")


def test_request_shape_and_accounting(tmp_path):
    llm = make(tmp_path, message())
    reply = call(llm)
    kw = llm._client.kwargs
    assert kw["betas"] == [FALLBACK_BETA] and kw["fallbacks"] == "default"
    assert kw["thinking"] == {"type": "adaptive"}
    assert kw["output_config"] == {"effort": "high", "format": {"type": "json_schema", "schema": {"type": "object"}}}
    assert kw["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert reply.cost_usd == pytest.approx(cost_of("claude-opus-5-5", 1000, 200, 5000, 0))
    assert reply.cost_usd == pytest.approx((1000 * 4 + 200 * 20 + 5000 * 0.2) / 1e6)
    assert spent_today(tmp_path / "app.db") == pytest.approx(reply.cost_usd)


@pytest.mark.parametrize("exc,expected", [
    (anthropic.APITimeoutError(request=REQ), LLMBusy),
    (anthropic.APIConnectionError(message="down", request=REQ), LLMBusy),
    (anthropic.RateLimitError("slow down", response=resp(429), body=None), LLMBusy),
    (anthropic.InternalServerError("boom", response=resp(500), body=None), LLMBusy),
    (anthropic.APIStatusError("overloaded", response=resp(529), body=None), LLMBusy),
    (anthropic.AuthenticationError("bad key", response=resp(401), body=None), LLMUnavailable),
    (anthropic.PermissionDeniedError("no", response=resp(403), body=None), LLMUnavailable),
    (anthropic.NotFoundError("no model", response=resp(404), body=None), LLMUnavailable),
    (anthropic.BadRequestError("bad", response=resp(400), body=None), LLMError),
])
def test_sdk_errors_become_user_safe_errors(tmp_path, exc, expected):
    llm = make(tmp_path, exc)
    with pytest.raises(expected) as info:
        call(llm)
    assert "bad key" not in str(info.value)  # raw SDK text is logged, not shown
    with open_db(tmp_path / "app.db") as conn:
        assert conn.execute("SELECT status FROM llm_calls").fetchone()[0] == "error"


@pytest.mark.parametrize("stop,expected", [("refusal", LLMRefused), ("max_tokens", LLMTruncated)])
def test_stop_reasons(tmp_path, stop, expected):
    with pytest.raises(expected):
        call(make(tmp_path, message(stop=stop)))


def test_budget_stops_calls_before_they_are_made(tmp_path):
    llm = make(tmp_path, message(), budget=0.0)
    with pytest.raises(BudgetExceeded):
        call(llm)
    assert llm._client.kwargs is None


def test_unknown_fallback_model_is_priced_conservatively():
    assert cost_of("claude-some-future-model", 1_000_000, 0, 0, 0) > cost_of("claude-opus-5-5", 1_000_000, 0, 0, 0)
