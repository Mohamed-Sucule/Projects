"""BM25 over SQLite FTS5. No vector store: on contract questions the vocabulary is exact ("notice", "per kg",
"delivery charge") and evals/run.py --suite retrieval measures whether that is enough."""

from __future__ import annotations

import json
import re
import sqlite3
from dataclasses import dataclass

STOP = set("""a an and are as at be by can do does for from has have how i if in is it its me much my now of on or our per
shall should so than that the their them then there these they this to under up us was we were what when where which who
why will with would you your any all did get got right correct""".split())


@dataclass
class Hit:
    chunk_id: int
    doc_id: str
    doc_title: str
    doc_kind: str
    supplier_id: str | None
    section: str
    page: int | None
    text: str
    score: float
    flags: list[str]


def fts_query(text: str) -> str:
    words = [w for w in re.findall(r"[A-Za-z0-9£][A-Za-z0-9.,%£-]*", text.lower()) if w not in STOP]
    words = [w.strip(".,") for w in words if len(w.strip(".,")) > 1]
    return " OR ".join(f'"{w}"' for w in dict.fromkeys(words))


def search(conn: sqlite3.Connection, query: str, *, supplier_id: str | None = None, kind: str | None = None, limit: int = 6) -> list[Hit]:
    q = fts_query(query)
    if not q:
        return []
    sql = """SELECT c.id, c.doc_id, d.title, d.kind, d.supplier_id, c.section, c.page, c.text, c.flags,
                    bm25(chunks_fts, 1.0, 0.6, 0.4) AS score
             FROM chunks_fts JOIN chunks c ON c.id = chunks_fts.rowid JOIN documents d ON d.id = c.doc_id
             WHERE chunks_fts MATCH ?"""
    args: list = [q]
    if supplier_id:
        sql += " AND d.supplier_id = ?"
        args.append(supplier_id)
    if kind:
        sql += " AND d.kind = ?"
        args.append(kind)
    sql += " ORDER BY score LIMIT ?"
    args.append(max(1, min(limit, 20)))
    return [Hit(r[0], r[1], r[2], r[3], r[4], r[5] or "", r[6], r[7], -float(r[9]), json.loads(r[8])) for r in conn.execute(sql, args)]


def get_chunk(conn: sqlite3.Connection, chunk_id: int) -> Hit | None:
    r = conn.execute("""SELECT c.id, c.doc_id, d.title, d.kind, d.supplier_id, c.section, c.page, c.text, c.flags
                        FROM chunks c JOIN documents d ON d.id = c.doc_id WHERE c.id = ?""", (chunk_id,)).fetchone()
    return Hit(r[0], r[1], r[2], r[3], r[4], r[5] or "", r[6], r[7], 0.0, json.loads(r[8])) if r else None
