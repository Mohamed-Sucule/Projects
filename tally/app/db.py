"""Two databases. app.db holds Tally's own state; books.db holds the client's accounts and is the only thing
the model's SQL tool can ever open, read-only."""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path

APP_SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, filename TEXT NOT NULL, kind TEXT NOT NULL, format TEXT NOT NULL,
  supplier_id TEXT, sha256 TEXT UNIQUE NOT NULL, pages INTEGER, chars INTEGER, flags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS chunks (
  id INTEGER PRIMARY KEY, doc_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE, ordinal INTEGER NOT NULL,
  section TEXT, page INTEGER, text TEXT NOT NULL, flags TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS chunks_doc ON chunks(doc_id, ordinal);
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(text, section, title, tokenize = 'porter unicode61');
CREATE TABLE IF NOT EXISTS terms (
  supplier_id TEXT PRIMARY KEY, doc_ids TEXT NOT NULL, terms_json TEXT NOT NULL, checks TEXT NOT NULL,
  model TEXT, source_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS audit_runs (
  id INTEGER PRIMARY KEY, started_at TEXT NOT NULL DEFAULT (datetime('now')), finished_at TEXT,
  status TEXT NOT NULL, terms_source TEXT NOT NULL, error TEXT, summary TEXT
);
CREATE TABLE IF NOT EXISTS findings (
  id INTEGER PRIMARY KEY, run_id INTEGER NOT NULL REFERENCES audit_runs(id), supplier_id TEXT NOT NULL,
  invoice_no TEXT NOT NULL, rule TEXT NOT NULL, amount REAL NOT NULL, detail TEXT NOT NULL, evidence TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS drafts (
  id INTEGER PRIMARY KEY, run_id INTEGER NOT NULL REFERENCES audit_runs(id), supplier_id TEXT NOT NULL,
  to_addr TEXT, subject TEXT NOT NULL, body TEXT NOT NULL, finding_ids TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', decided_at TEXT, reason TEXT
);
CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY, draft_id INTEGER NOT NULL REFERENCES drafts(id), to_addr TEXT, subject TEXT NOT NULL,
  body TEXT NOT NULL, queued_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS llm_calls (
  id INTEGER PRIMARY KEY, at TEXT NOT NULL DEFAULT (datetime('now')), purpose TEXT NOT NULL, model TEXT NOT NULL,
  input_tokens INTEGER, output_tokens INTEGER, cache_read INTEGER, cache_write INTEGER, cost_usd REAL,
  request_id TEXT, status TEXT NOT NULL, error TEXT
);
CREATE TABLE IF NOT EXISTS asks (
  id INTEGER PRIMARY KEY, at TEXT NOT NULL DEFAULT (datetime('now')), client TEXT, question TEXT NOT NULL,
  status TEXT NOT NULL, answer TEXT, latency_ms INTEGER
);
"""

BOOKS_TABLES: dict[str, list[tuple[str, str]]] = {
    "suppliers": [("supplier_id", "TEXT PRIMARY KEY"), ("name", "TEXT"), ("category", "TEXT"), ("email", "TEXT")],
    "invoices": [("invoice_no", "TEXT PRIMARY KEY"), ("supplier_id", "TEXT"), ("site", "TEXT"), ("invoice_date", "TEXT"),
                 ("due_date", "TEXT"), ("net", "REAL"), ("vat", "REAL"), ("gross", "REAL"), ("status", "TEXT"), ("notes", "TEXT")],
    "invoice_lines": [("id", "INTEGER PRIMARY KEY"), ("invoice_no", "TEXT"), ("line_no", "INTEGER"), ("description", "TEXT"),
                      ("item", "TEXT"), ("quantity", "REAL"), ("unit", "TEXT"), ("unit_price", "REAL"), ("discount_pct", "REAL"),
                      ("line_total", "REAL"), ("vat_rate", "REAL"), ("service_at", "TEXT"), ("delivery_id", "TEXT")],
    "deliveries": [("delivery_id", "TEXT PRIMARY KEY"), ("supplier_id", "TEXT"), ("site", "TEXT"), ("delivered_on", "TEXT")],
    "delivery_items": [("delivery_id", "TEXT"), ("item", "TEXT"), ("quantity", "REAL"), ("unit", "TEXT")],
    "payments": [("id", "INTEGER PRIMARY KEY"), ("invoice_no", "TEXT"), ("paid_on", "TEXT"), ("amount", "REAL")],
}


def connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=10, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def open_db(path: Path):
    conn = connect(path)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_app_db(path: Path) -> None:
    with open_db(path) as conn:
        conn.executescript(APP_SCHEMA)


def init_books_db(path: Path) -> None:
    with open_db(path) as conn:
        for table, cols in BOOKS_TABLES.items():
            conn.execute(f"CREATE TABLE IF NOT EXISTS {table} ({', '.join(f'{c} {t}' for c, t in cols)})")
