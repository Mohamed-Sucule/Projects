import os
import shutil
import tempfile
from dataclasses import replace
from pathlib import Path

import pytest

# app.main reads its settings at import time, so point it at a scratch directory before anything imports it.
_DATA = Path(tempfile.mkdtemp(prefix="tally-test-"))
os.environ["TALLY_DATA_DIR"] = str(_DATA / "main")
os.environ.pop("ANTHROPIC_API_KEY", None)
os.environ["TALLY_ADMIN_TOKEN"] = "test-admin-token"

from app.config import get_settings  # noqa: E402
from app.seed import ensure_ready  # noqa: E402


@pytest.fixture(scope="session")
def seeded() -> Path:
    s = replace(get_settings(), data_dir=_DATA / "seed")
    ensure_ready(s)
    yield s.data_dir
    shutil.rmtree(_DATA, ignore_errors=True)


@pytest.fixture
def settings(seeded, tmp_path):
    """A fresh copy of the seeded demo databases for each test."""
    for name in ("app.db", "books.db"):
        shutil.copy(seeded / name, tmp_path / name)
    return replace(get_settings(), data_dir=tmp_path, anthropic_api_key=None)
