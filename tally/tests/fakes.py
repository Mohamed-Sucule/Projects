"""A stand-in for ClaudeLLM that replays scripted turns, so the agent loop, tool plumbing, citation checks and the
draft guardrails can be tested without an API key or network."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Callable

from app.llm import LLMRefused, Reply


@dataclass
class Block:
    type: str
    text: str = ""
    id: str = ""
    name: str = ""
    input: dict = field(default_factory=dict)


def text(data: Any) -> Reply:
    return Reply(content=[Block("text", text=data if isinstance(data, str) else json.dumps(data))], stop_reason="end_turn", model="fake")


def tool(name: str, args: dict, call_id: str = "t1") -> Reply:
    return Reply(content=[Block("tool_use", id=call_id, name=name, input=args)], stop_reason="tool_use", model="fake")


def answer(status="answered", verdict="not_applicable", answer="", figures=(), dates=(), citations=(), warnings=()) -> Reply:
    return text({"status": status, "verdict": verdict, "answer": answer, "figures": list(figures), "dates": list(dates),
                 "citations": list(citations), "warnings": list(warnings)})


@dataclass
class FakeLLM:
    """Each call pops the next scripted turn. A turn is a Reply, an exception to raise, or a function of the
    messages so far (to build an answer from what the tools returned)."""

    script: list[Reply | Exception | Callable[[list[dict]], Reply]]
    model: str = "fake"
    calls: list[dict] = field(default_factory=list)

    def create(self, purpose, *, system, messages, tools=None, schema=None, effort="medium", max_tokens=16000) -> Reply:
        self.calls.append({"purpose": purpose, "system": system, "messages": list(messages), "tools": tools, "schema": schema, "effort": effort})
        if not self.script:
            raise AssertionError("FakeLLM ran out of scripted turns")
        turn = self.script.pop(0)
        if isinstance(turn, Exception):
            raise turn
        return turn(messages) if callable(turn) else turn


def last_tool_result(messages: list[dict]) -> str:
    for m in reversed(messages):
        if m["role"] == "user" and isinstance(m["content"], list):
            return "\n".join(b["content"] for b in m["content"] if b.get("type") == "tool_result")
    return ""


__all__ = ["Block", "FakeLLM", "LLMRefused", "answer", "last_tool_result", "text", "tool"]
