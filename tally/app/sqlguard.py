"""The model writes SQL; this decides what that SQL may touch. Defence in depth, each layer sufficient alone for
the attacks in tests/test_sqlguard.py: a separate database file, a read-only connection, PRAGMA query_only,
an authorizer that allows reading named tables and calling named functions and nothing else, a step budget
that stops runaway queries, and a cap on the rows that come back."""

from __future__ import annotations

import re
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path

from .db import BOOKS_TABLES

ALLOWED_TABLES = frozenset(BOOKS_TABLES)
ALLOWED_FUNCTIONS = frozenset("""abs avg count max min round sum total coalesce ifnull nullif iif lower upper length substr
substring trim ltrim rtrim replace instr date datetime time strftime julianday printf format group_concat like glob
cast typeof""".split())
MAX_ROWS = 200
MAX_STEPS = 2_000_000
MAX_SECONDS = 2.0
MAX_SQL_CHARS = 4000


class SqlRejected(ValueError):
    pass


@dataclass
class QueryResult:
    columns: list[str]
    rows: list[list]
    truncated: bool


def _authorizer(action, arg1, arg2, dbname, source):
    if action == sqlite3.SQLITE_SELECT:
        return sqlite3.SQLITE_OK
    if action == sqlite3.SQLITE_READ:
        return sqlite3.SQLITE_OK if (arg1 or "").lower() in ALLOWED_TABLES and dbname in ("main", None) else sqlite3.SQLITE_DENY
    if action == sqlite3.SQLITE_FUNCTION:
        return sqlite3.SQLITE_OK if (arg2 or "").lower() in ALLOWED_FUNCTIONS else sqlite3.SQLITE_DENY
    if action == getattr(sqlite3, "SQLITE_RECURSIVE", -1):
        return sqlite3.SQLITE_OK
    return sqlite3.SQLITE_DENY


def run_readonly(db_path: Path, sql: str, *, max_rows: int = MAX_ROWS) -> QueryResult:
    sql = sql.strip().rstrip(";").strip()
    if not sql:
        raise SqlRejected("Empty query.")
    if len(sql) > MAX_SQL_CHARS:
        raise SqlRejected(f"Query is longer than {MAX_SQL_CHARS} characters.")
    if not re.match(r"^(select|with)\b", sql, re.I):
        raise SqlRejected("Only SELECT queries are allowed.")
    if not db_path.exists():
        raise SqlRejected("The accounts database is not loaded yet.")
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, timeout=2)
    try:
        conn.execute("PRAGMA query_only = ON")
        conn.set_authorizer(_authorizer)
        started, steps = time.monotonic(), [0]

        def progress():
            steps[0] += 1
            return 1 if steps[0] * 1000 > MAX_STEPS or time.monotonic() - started > MAX_SECONDS else 0

        conn.set_progress_handler(progress, 1000)
        try:
            cur = conn.execute(sql)
            rows = cur.fetchmany(max_rows + 1)
        except sqlite3.DatabaseError as e:
            msg = str(e)
            if "interrupted" in msg:
                raise SqlRejected("Query took too long and was stopped. Add filters or aggregate.") from e
            if "not authorized" in msg or "prohibited" in msg:
                raise SqlRejected("Query uses a table, function or statement that is not allowed. "
                                  f"Readable tables: {', '.join(sorted(ALLOWED_TABLES))}.") from e
            if "one statement" in msg:
                raise SqlRejected("Send one statement at a time.") from e
            raise SqlRejected(f"SQL error: {msg}") from e
        cols = [d[0] for d in cur.description or []]
        return QueryResult(cols, [list(r) for r in rows[:max_rows]], len(rows) > max_rows)
    finally:
        conn.close()


def schema_description() -> str:
    return "\n".join(f"{t}({', '.join(c for c, _ in cols)})" for t, cols in BOOKS_TABLES.items())
