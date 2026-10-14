from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


def _float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    corpus_dir: Path
    export_dir: Path
    truth_path: Path
    anthropic_api_key: str | None
    model: str
    effort_answer: str
    effort_extract: str
    admin_token: str | None
    max_upload_bytes: int
    max_pages: int
    ask_per_minute: int
    ask_per_day: int
    daily_budget_usd: float
    as_of: date
    trust_proxy: bool
    seed_demo: bool
    org_name: str
    public_demo: bool
    reports_dir: Path

    @property
    def app_db(self) -> Path:
        return self.data_dir / "app.db"

    @property
    def books_db(self) -> Path:
        return self.data_dir / "books.db"

    @property
    def llm_enabled(self) -> bool:
        return bool(self.anthropic_api_key)


def get_settings() -> Settings:
    data = Path(os.environ.get("TALLY_DATA_DIR", ROOT / "var"))
    return Settings(
        data_dir=data,
        corpus_dir=Path(os.environ.get("TALLY_CORPUS_DIR", ROOT / "data" / "corpus")),
        export_dir=Path(os.environ.get("TALLY_EXPORT_DIR", ROOT / "data" / "export")),
        truth_path=ROOT / "data" / "truth.json",
        anthropic_api_key=os.environ.get("ANTHROPIC_API_KEY") or None,
        model=os.environ.get("TALLY_MODEL", "claude-opus-5-5"),
        effort_answer=os.environ.get("TALLY_EFFORT_ANSWER", "medium"),
        effort_extract=os.environ.get("TALLY_EFFORT_EXTRACT", "high"),
        admin_token=os.environ.get("TALLY_ADMIN_TOKEN") or None,
        max_upload_bytes=_int("TALLY_MAX_UPLOAD_MB", 10) * 1024 * 1024,
        max_pages=_int("TALLY_MAX_PAGES", 200),
        ask_per_minute=_int("TALLY_ASK_PER_MINUTE", 6),
        ask_per_day=_int("TALLY_ASK_PER_DAY", 60),
        daily_budget_usd=_float("TALLY_DAILY_BUDGET_USD", 5.0),
        as_of=date.fromisoformat(os.environ.get("TALLY_AS_OF", "2026-10-01")),
        trust_proxy=os.environ.get("TALLY_TRUST_PROXY", "0") == "1",
        seed_demo=os.environ.get("TALLY_SEED_DEMO", "1") == "1",
        org_name=os.environ.get("TALLY_ORG_NAME", "Halden Kitchens Ltd"),
        public_demo=os.environ.get("TALLY_PUBLIC_DEMO", "1") == "1",
        reports_dir=Path(os.environ.get("TALLY_REPORTS_DIR", ROOT / "reports")),
    )
