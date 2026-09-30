# Query Planner

A database deciding how to answer a question, with its reasoning still
attached.

**→ [Open it](https://mohamed-sucule.github.io/Projects/projects/query-planner/)**

Write a query on the left, get the plan on the right: a tree of the steps the
database would actually perform, read bottom to top. Every step carries the
number of rows it expects and what it expects that to cost — and the
arithmetic that produced both.

---

## Why this exists

This is the most common reason a website is slow, and the least visible. The
same question, answered two different ways, can differ by a factor of a
thousand. Nothing in the question itself tells you which way you got.

The database is guessing, from statistics it keeps about your data: rows per
table, distinct values per column. Good guesses give good plans. Stale ones
give catastrophic plans — and the query that ran in 20ms yesterday takes 40
seconds today with nothing in the code having changed.

Drag a table's row count. At a few hundred rows it will look things up one at a
time; push it past a threshold and the plan flips to building a hash table
once, because that finally beats doing a million small lookups. Watching that
threshold arrive is the point of the whole thing.

## How it works

**Join ordering** is the expensive decision. For *n* tables there are far too
many orderings to try exhaustively, so it builds up from pairs, keeping the
cheapest way of producing each subset — the dynamic-programming approach IBM
published for System R in 1979, which essentially every optimiser has used
since. The plan counter on screen shows how many candidates were costed.

**The cost model** has the same shape as PostgreSQL's: one sequential page read
is the unit, a random page read costs four, CPU per row is a hundredth. Those
constants are shown in the interface rather than hidden, because a cost number
means nothing without the model that produced it.

**Selectivity** — what fraction of rows a filter keeps — comes from distinct
value counts. `status = 1` on a column with six distinct values is estimated at
one sixth. That estimate is displayed with its derivation next to it.

## The bug that justifies showing the workings

An early version keyed its table scans by table name while keying its estimates
by alias. `FROM orders o WHERE o.status = 1` looked up `o` in a catalogue filed
under `orders`, missed, and silently fell back to a default selectivity of
0.05.

Every filter in every query was being ignored. The plans still looked entirely
plausible — sensible shapes, sensible-looking numbers — and there was no error
anywhere. It was caught by a test asserting that a specific estimate equalled
`rows / distinct values`, not by anything anyone noticed on screen.

That is the argument for the whole design. A number on its own is
unfalsifiable. A number with its derivation attached is not.

## What it does not do

**A small dialect.** `SELECT`, `FROM`, `JOIN` (explicit and implicit), `WHERE`
with `AND`/`OR`, `GROUP BY`, `ORDER BY`, `LIMIT`, and the five aggregate
functions. No subqueries, no `UNION`, no window functions, no CTEs.

**No correlation between columns.** Like most real optimisers, it assumes
filters are independent, so `WHERE city = 'Birmingham' AND country = 'UK'`
underestimates badly. This is a genuine open problem in real databases, not a
simplification made here.

**It never executes anything.** There are no rows — only statistics about
imaginary ones. This plans queries; it does not run them.

## Tests

`node tests/run.mjs planner` — including that estimates follow from the
statistics rather than from vibes, that costs are monotonic (a child never
costs more than its parent), that self-cost decomposes the total exactly, that
removing an index makes the chosen plan more than fifty times more expensive,
and that growing a table flips the join algorithm.
