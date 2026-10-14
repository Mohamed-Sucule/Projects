from __future__ import annotations

from dataclasses import dataclass

from .parsers import Parsed

TARGET = 700
HARD = 1400


@dataclass
class Chunk:
    ordinal: int
    section: str
    page: int
    text: str


def chunk(doc: Parsed) -> list[Chunk]:
    """Split by headings first, then by size, so a chunk never straddles two clauses of a contract."""
    out: list[Chunk] = []
    section = doc.title
    buf: list[str] = []
    page = 1

    def emit():
        if buf:
            body = "\n".join(buf).strip()
            if body:
                out.append(Chunk(len(out), section, page, f"{section}\n{body}" if section else body))
            buf.clear()

    for b in doc.blocks:
        if b.kind == "heading":
            emit()
            section = b.text
            page = b.page
            continue
        if not buf:
            page = b.page
        if b.kind == "table":
            emit()
            page = b.page
            for piece in _split(b.text, HARD, "\n"):
                buf.append(piece)
                emit()
            continue
        if sum(len(x) for x in buf) + len(b.text) > TARGET and buf:
            emit()
            page = b.page
        for piece in _split(b.text, HARD, ". "):
            if sum(len(x) for x in buf) + len(piece) > HARD and buf:
                emit()
            buf.append(piece)
    emit()
    return out


def _split(text: str, limit: int, sep: str) -> list[str]:
    if len(text) <= limit:
        return [text]
    parts, cur = [], ""
    for piece in text.split(sep):
        cand = f"{cur}{sep}{piece}" if cur else piece
        if len(cand) > limit and cur:
            parts.append(cur)
            cur = piece
        else:
            cur = cand
    if cur:
        parts.append(cur)
    return [p[i:i + limit] for p in parts for i in range(0, len(p), limit)]
