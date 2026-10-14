from __future__ import annotations

import csv
import hashlib
import io
import json
import re
import sqlite3
from dataclasses import dataclass
from pathlib import Path

from ..db import BOOKS_TABLES, open_db
from . import injection
from .chunking import chunk
from .parsers import ParseError, parse

MAX_CSV_ROWS = 200_000
MAX_CSV_COLS = 60


@dataclass
class IngestResult:
    doc_id: str
    title: str
    chunks: int
    pages: int
    flags: list[str]
    duplicate: bool


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:60] or "document"


def ingest_document(app_db: Path, data: bytes, filename: str, *, kind: str = "other", supplier_id: str | None = None,
                    doc_id: str | None = None, max_pages: int = 200) -> IngestResult:
    sha = hashlib.sha256(data).hexdigest()
    with open_db(app_db) as conn:
        row = conn.execute("SELECT id, title, pages, flags FROM documents WHERE sha256=?", (sha,)).fetchone()
        if row:
            n = conn.execute("SELECT count(*) FROM chunks WHERE doc_id=?", (row["id"],)).fetchone()[0]
            return IngestResult(row["id"], row["title"], n, row["pages"], json.loads(row["flags"]), duplicate=True)
    parsed = parse(data, filename, max_pages=max_pages)
    if parsed.chars < 40:
        raise ParseError("No readable text was found in this file.")
    pieces = chunk(parsed)
    title = (parsed.title or Path(filename).stem)[:200]
    did = doc_id or f"{_slug(Path(filename).stem)}-{sha[:8]}"
    doc_flags: set[str] = set()
    with open_db(app_db) as conn:
        conn.execute("INSERT INTO documents (id, title, filename, kind, format, supplier_id, sha256, pages, chars) VALUES (?,?,?,?,?,?,?,?,?)",
                     (did, title, Path(filename).name[:200], kind, parsed.format, supplier_id, sha, parsed.pages, parsed.chars))
        for c in pieces:
            flags = injection.scan(c.text)
            if "[hidden on the web page]" in c.text:
                flags.append("hidden_text")
            doc_flags.update(flags)
            cur = conn.execute("INSERT INTO chunks (doc_id, ordinal, section, page, text, flags) VALUES (?,?,?,?,?,?)",
                               (did, c.ordinal, c.section, c.page, c.text, json.dumps(flags)))
            conn.execute("INSERT INTO chunks_fts (rowid, text, section, title) VALUES (?,?,?,?)", (cur.lastrowid, c.text, c.section, title))
        conn.execute("UPDATE documents SET flags=? WHERE id=?", (json.dumps(sorted(doc_flags)), did))
    return IngestResult(did, title, len(pieces), parsed.pages, sorted(doc_flags), duplicate=False)


def delete_document(app_db: Path, doc_id: str) -> bool:
    with open_db(app_db) as conn:
        ids = [r[0] for r in conn.execute("SELECT id FROM chunks WHERE doc_id=?", (doc_id,))]
        conn.executemany("DELETE FROM chunks_fts WHERE rowid=?", [(i,) for i in ids])
        conn.execute("DELETE FROM chunks WHERE doc_id=?", (doc_id,))
        return conn.execute("DELETE FROM documents WHERE id=?", (doc_id,)).rowcount > 0


class ImportError_(ValueError):
    pass


def _coerce(value: str, sqltype: str):
    if value == "":
        return None
    if sqltype.startswith("INTEGER"):
        return int(float(value))
    if sqltype.startswith("REAL"):
        return float(value)
    return value


def import_csv(books_db: Path, table: str, data: bytes) -> int:
    """Replace one known accounts table with the rows of a CSV export. Unknown tables and columns are refused,
    so an upload can never create something the SQL tool would then be allowed to read."""
    if table not in BOOKS_TABLES:
        raise ImportError_(f"Unknown table '{table}'. Known tables: {', '.join(BOOKS_TABLES)}.")
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError as e:
        raise ImportError_("CSV files must be UTF-8.") from e
    reader = csv.DictReader(io.StringIO(text))
    cols = BOOKS_TABLES[table]
    want = [c for c, _ in cols]
    have = reader.fieldnames or []
    if len(have) > MAX_CSV_COLS:
        raise ImportError_("Too many columns.")
    missing = [c for c in want if c not in have]
    if missing:
        raise ImportError_(f"The CSV for '{table}' is missing columns: {', '.join(missing)}.")
    rows = []
    for n, rec in enumerate(reader, start=2):
        if len(rows) >= MAX_CSV_ROWS:
            raise ImportError_(f"More than {MAX_CSV_ROWS} rows.")
        try:
            rows.append([_coerce((rec.get(c) or "").strip(), t) for c, t in cols])
        except ValueError as e:
            raise ImportError_(f"Row {n}: {e}") from e
    with open_db(books_db) as conn:
        conn.execute(f"DELETE FROM {table}")
        try:
            conn.executemany(f"INSERT INTO {table} ({', '.join(want)}) VALUES ({', '.join('?' * len(want))})", rows)
        except sqlite3.IntegrityError as e:
            raise ImportError_(f"Duplicate key in '{table}': {e}") from e
    return len(rows)
