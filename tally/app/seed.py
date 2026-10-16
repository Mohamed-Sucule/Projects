from __future__ import annotations

import json
import logging

from .config import Settings
from .db import BOOKS_TABLES, init_app_db, init_books_db, open_db
from .ingest.pipeline import import_csv, ingest_document

log = logging.getLogger("tally.seed")


def ensure_ready(s: Settings) -> None:
    init_app_db(s.app_db)
    init_books_db(s.books_db)
    if not s.seed_demo:
        return
    truth = json.loads(s.truth_path.read_text(encoding="utf-8"))
    with open_db(s.app_db) as conn:
        have = {r[0] for r in conn.execute("SELECT id FROM documents")}
    for d in truth["documents"]:
        if d["doc_id"] in have:
            continue
        r = ingest_document(s.app_db, (s.corpus_dir / d["file"]).read_bytes(), d["file"], kind=d["kind"],
                            supplier_id=d["supplier_id"], doc_id=d["doc_id"], max_pages=s.max_pages)
        log.info("ingested %s: %d chunks%s", r.doc_id, r.chunks, f" flags={r.flags}" if r.flags else "")
    with open_db(s.books_db) as conn:
        empty = conn.execute("SELECT count(*) FROM invoices").fetchone()[0] == 0
    if empty:
        for table in BOOKS_TABLES:
            n = import_csv(s.books_db, table, (s.export_dir / f"{table}.csv").read_bytes())
            log.info("imported %s: %d rows", table, n)
