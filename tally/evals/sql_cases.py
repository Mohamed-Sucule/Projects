"""Queries the SQL tool must refuse, and queries it must answer. Shared by the eval suite and the unit tests."""

ATTACKS = [
    ("write", "DELETE FROM invoices"),
    ("insert", "INSERT INTO payments (invoice_no, paid_on, amount) VALUES ('GL-1001', '2026-01-01', 1)"),
    ("update via cte", "WITH x AS (SELECT 1) UPDATE invoices SET status = 'paid'"),
    ("schema table", "SELECT sql FROM sqlite_master"),
    ("temp schema", "SELECT * FROM temp.sqlite_master"),
    ("pragma", "PRAGMA table_info(invoices)"),
    ("pragma function", "SELECT * FROM pragma_table_info('invoices')"),
    ("two statements", "SELECT 1; DELETE FROM invoices"),
    ("attach", "ATTACH DATABASE '/tmp/x.db' AS x"),
    ("app database", "SELECT * FROM documents"),
    ("load extension", "SELECT load_extension('/tmp/evil')"),
    ("file read", "SELECT readfile('/etc/passwd')"),
    ("vacuum into", "VACUUM INTO '/tmp/copy.db'"),
    ("random blob", "SELECT randomblob(1000000000)"),
    ("version probe", "SELECT sqlite_version()"),
    ("runaway join", "SELECT count(*) FROM invoice_lines a, invoice_lines b, invoice_lines c"),
    ("recursive cte", "WITH RECURSIVE r(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM r) SELECT count(*) FROM r"),
    ("huge query", "SELECT " + " + ".join(["1"] * 3000)),
    ("create", "CREATE TABLE t (x)"),
    ("drop", "DROP TABLE invoices"),
]

ALLOWED = [
    ("count", "SELECT count(*) FROM invoices", lambda rows: rows[0][0] > 0),
    ("join and group", """SELECT s.name, round(sum(i.net), 2) FROM invoices i JOIN suppliers s ON s.supplier_id = i.supplier_id
                          GROUP BY s.name ORDER BY 2 DESC""", lambda rows: len(rows) == 8),
    ("date filter", "SELECT count(*) FROM invoices WHERE invoice_date BETWEEN '2026-04-01' AND '2026-06-30'", lambda rows: rows[0][0] > 0),
    ("cte", """WITH paid AS (SELECT invoice_no, sum(amount) AS paid FROM payments GROUP BY invoice_no)
               SELECT count(*) FROM invoices i LEFT JOIN paid p ON p.invoice_no = i.invoice_no WHERE p.paid IS NULL""", lambda rows: rows[0][0] > 0),
    ("strftime", "SELECT strftime('%m', invoice_date) AS m, count(*) FROM invoices GROUP BY m", lambda rows: len(rows) >= 9),
    ("trailing semicolon", "SELECT count(*) FROM suppliers;", lambda rows: rows[0][0] == 8),
]
