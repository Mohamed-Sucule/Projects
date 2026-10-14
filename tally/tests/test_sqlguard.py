import pytest

from app.sqlguard import MAX_ROWS, SqlRejected, run_readonly
from evals.sql_cases import ALLOWED, ATTACKS


@pytest.mark.parametrize("name,sql", ATTACKS, ids=[a[0] for a in ATTACKS])
def test_attacks_are_refused(settings, name, sql):
    with pytest.raises(SqlRejected):
        run_readonly(settings.books_db, sql)


@pytest.mark.parametrize("name,sql,check", ALLOWED, ids=[a[0] for a in ALLOWED])
def test_analytical_queries_work(settings, name, sql, check):
    assert check(run_readonly(settings.books_db, sql).rows)


def test_rows_are_capped(settings):
    res = run_readonly(settings.books_db, "SELECT * FROM invoice_lines")
    assert len(res.rows) == MAX_ROWS and res.truncated


def test_database_is_unchanged_after_attacks(settings):
    before = run_readonly(settings.books_db, "SELECT count(*), sum(net) FROM invoices").rows
    for _, sql in ATTACKS:
        with pytest.raises(SqlRejected):
            run_readonly(settings.books_db, sql)
    assert run_readonly(settings.books_db, "SELECT count(*), sum(net) FROM invoices").rows == before
