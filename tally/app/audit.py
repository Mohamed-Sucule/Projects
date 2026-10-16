"""Checks every invoice line against contract terms. Deterministic on purpose: the model reads contracts and writes
emails, but whether a supplier overcharged is decided here, by code that can be tested against planted errors
(evals/run.py --suite audit) and cannot be talked out of a finding by text in an invoice."""

from __future__ import annotations

import re
import sqlite3
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path

from .terms import ContractTerms

TOL = 0.005  # half a penny: anything smaller is rounding


@dataclass
class Finding:
    supplier_id: str
    invoice_no: str
    rule: str
    amount: float
    details: list[str] = field(default_factory=list)
    evidence: list[str] = field(default_factory=list)

    @property
    def detail(self) -> str:
        return " ".join(dict.fromkeys(self.details))


@dataclass
class Line:
    invoice_no: str
    line_no: int
    item: str
    quantity: float
    unit: str
    unit_price: float
    discount_pct: float
    line_total: float
    vat_rate: float
    service_at: str
    delivery_id: str

    @property
    def factor(self) -> float:
        return 1 - (self.discount_pct or 0) / 100


@dataclass
class Invoice:
    invoice_no: str
    supplier_id: str
    invoice_date: date
    net: float
    vat: float
    gross: float
    lines: list[Line]

    def when(self, ln: Line) -> date:
        return _service_dt(ln).date() if ln.service_at else self.invoice_date


OOH = re.compile(r"\(?\bout[ -]of[ -]hours\b\)?", re.I)


def _singular(w: str) -> str:
    if len(w) <= 3 or w.endswith("ss"):
        return w
    if w.endswith("ies"):
        return w[:-3] + "y"
    if w.endswith("oes"):
        return w[:-2]
    return w[:-1] if w.endswith("s") else w


def norm(text: str) -> str:
    """'Call-out (out of hours)' -> 'call out'; 'Vine tomatoes' -> 'vine tomato'."""
    return " ".join(_singular(w) for w in re.sub(r"[^a-z0-9]+", " ", OOH.sub("", text).lower()).split())


PERIOD_WORD = {"weekly": "week", "monthly": "month", "quarterly": "quarter", "yearly": "year", "per_visit": "visit",
               "contract_year": "contract year", "quarter": "quarter", "month": "month"}


def _per(unit: str) -> str:
    return " each" if unit.lower() == "each" else f"/{unit}"


def _plural(n: float, unit: str) -> str:
    return f"{n:g} {unit}" if n == 1 or unit.endswith("s") or len(unit) <= 2 else f"{n:g} {unit}s"


def _service_dt(ln: Line) -> datetime:
    return datetime.fromisoformat(ln.service_at)


def _in_force(on: date, start: date | None, end: date | None) -> bool:
    return (start is None or on >= start) and (end is None or on <= end)


class Matcher:
    """Finds the contract entry an invoice line refers to: exact normalised name first, then a unique entry whose
    words contain (or are contained in) the line's words. Ambiguity means no match, never a guess."""

    def __init__(self, names: list[str]):
        self.names = names
        self.keys = [norm(n) for n in names]

    def match(self, item: str) -> str | None:
        k = norm(item)
        if not k:
            return None
        exact = {self.names[i] for i, key in enumerate(self.keys) if key == k}
        if len(exact) == 1:
            return exact.pop()
        words = set(k.split())
        loose = {self.names[i] for i, key in enumerate(self.keys) if key and (set(key.split()) <= words or words <= set(key.split()))}
        return loose.pop() if len(loose) == 1 else None


def load_invoices(books_db: Path) -> list[Invoice]:
    conn = sqlite3.connect(f"file:{books_db}?mode=ro", uri=True)
    try:
        lines: dict[str, list[Line]] = defaultdict(list)
        for r in conn.execute("""SELECT invoice_no, line_no, item, quantity, unit, unit_price, discount_pct, line_total, vat_rate,
                                        service_at, delivery_id FROM invoice_lines ORDER BY invoice_no, line_no"""):
            lines[r[0]].append(Line(r[0], r[1] or 0, r[2] or "", r[3] or 0.0, r[4] or "", r[5] or 0.0, r[6] or 0.0, r[7] or 0.0,
                                    r[8] or 0.0, r[9] or "", r[10] or ""))
        out = []
        for r in conn.execute("SELECT invoice_no, supplier_id, invoice_date, net, vat, gross FROM invoices ORDER BY invoice_date, invoice_no"):
            out.append(Invoice(r[0], r[1], date.fromisoformat(r[2]), r[3] or 0.0, r[4] or 0.0, r[5] or 0.0, lines.get(r[0], [])))
        return out
    finally:
        conn.close()


def load_deliveries(books_db: Path) -> dict[tuple[str, str], float]:
    conn = sqlite3.connect(f"file:{books_db}?mode=ro", uri=True)
    try:
        got: dict[tuple[str, str], float] = defaultdict(float)
        for did, item, q in conn.execute("SELECT delivery_id, item, quantity FROM delivery_items"):
            got[(did, norm(item))] += q or 0.0
        return got
    finally:
        conn.close()


class Auditor:
    def __init__(self, terms: dict[str, ContractTerms], invoices: list[Invoice], delivered: dict[tuple[str, str], float]):
        self.terms = terms
        self.invoices = invoices
        self.delivered = delivered
        self.found: dict[tuple[str, str], Finding] = {}
        self.skipped: list[str] = []

    def flag(self, inv: Invoice, rule: str, amount: float, detail: str, evidence: str = ""):
        if amount <= TOL:
            return
        f = self.found.setdefault((inv.invoice_no, rule), Finding(inv.supplier_id, inv.invoice_no, rule, 0.0))
        f.amount += amount
        f.details.append(detail)
        if evidence:
            f.evidence.append(evidence)

    def run(self) -> list[Finding]:
        dupes = self.check_duplicates()
        by_supplier: dict[str, list[Invoice]] = defaultdict(list)
        for inv in self.invoices:
            if inv.invoice_no not in dupes:
                by_supplier[inv.supplier_id].append(inv)
        self.check_quantities([inv for invs in by_supplier.values() for inv in invs])
        for sid, invs in by_supplier.items():
            for inv in invs:
                self.check_arithmetic(inv)
            t = self.terms.get(sid)
            if t is None:
                self.skipped.append(sid)
                continue
            for inv in invs:
                self.check_prices(t, inv)
                self.check_delivery_fee(t, inv)
                self.check_minimum_charge(t, inv)
                self.check_volume_discount(t, inv)
            self.check_fixed_fees(t, invs)
            self.check_allowances(t, invs)
        out = sorted(self.found.values(), key=lambda f: (f.supplier_id, f.invoice_no, f.rule))
        for f in out:
            f.amount = round(f.amount + 1e-9, 2)
        return out

    # ── rules ──────────────────────────────────────────────────────────────

    def check_duplicates(self) -> set[str]:
        """A later invoice from the same supplier with the same lines is a duplicate when the lines point at the same
        deliveries or service times, or, for lines with neither, when it is dated within two weeks of the first.
        Recurring fees (the same monthly line every month) are therefore not duplicates."""
        seen: dict[tuple, Invoice] = {}
        dupes: set[str] = set()
        for inv in self.invoices:
            if not inv.lines:
                continue
            sig = (inv.supplier_id, tuple(sorted((norm(ln.item), round(ln.quantity, 3), round(ln.unit_price, 2), ln.delivery_id, ln.service_at)
                                                for ln in inv.lines)))
            first = seen.get(sig)
            if first is None:
                seen[sig] = inv
                continue
            referenced = any(ln.delivery_id or ln.service_at for ln in inv.lines)
            if referenced or abs((inv.invoice_date - first.invoice_date).days) <= 14:
                dupes.add(inv.invoice_no)
                self.flag(inv, "duplicate", inv.net, f"Duplicate of {first.invoice_no} ({first.invoice_date:%d %b %Y}): same lines"
                          + (" for the same delivery." if referenced else "."))
        return dupes

    def check_quantities(self, invoices: list[Invoice]):
        billed: dict[tuple[str, str], float] = defaultdict(float)
        for inv in invoices:
            for ln in inv.lines:
                if not ln.delivery_id:
                    continue
                key = (ln.delivery_id, norm(ln.item))
                have = self.delivered.get(key, 0.0)
                before = billed[key]
                billed[key] += ln.quantity
                over = min(ln.quantity, billed[key] - max(have, before))
                if over > 1e-6:
                    self.flag(inv, "quantity", over * ln.unit_price * ln.factor,
                              f"Billed for {ln.quantity:g} {ln.unit} of {ln.item} but delivery {ln.delivery_id} shows {have:g}.",
                              f"Delivery record {ln.delivery_id}")

    def check_arithmetic(self, inv: Invoice):
        for ln in inv.lines:
            expect = round(ln.quantity * ln.unit_price * ln.factor + 1e-9, 2)
            if ln.line_total - expect > 0.01:
                self.flag(inv, "arithmetic", ln.line_total - expect,
                          f"Line {ln.line_no} ({ln.item}) totals £{ln.line_total:,.2f}; {ln.quantity:g} × £{ln.unit_price:,.2f} is £{expect:,.2f}.")
        lines_net = round(sum(ln.line_total for ln in inv.lines) + 1e-9, 2)
        if inv.net - lines_net > 0.01:
            self.flag(inv, "arithmetic", inv.net - lines_net, f"The invoice net total is £{inv.net:,.2f} but its lines add up to £{lines_net:,.2f}.")
        if inv.gross - (inv.net + inv.vat) > 0.01:
            self.flag(inv, "arithmetic", inv.gross - inv.net - inv.vat,
                      f"Gross £{inv.gross:,.2f} is more than net £{inv.net:,.2f} plus VAT £{inv.vat:,.2f}.")

    def check_prices(self, t: ContractTerms, inv: Invoice):
        m = Matcher([p.item for p in t.prices])
        for ln in inv.lines:
            name = m.match(ln.item)
            if name is None:
                continue
            on = inv.when(ln)
            prices = [p for p in t.prices if p.item == name and _in_force(on, p.effective_from, p.effective_to)]
            if not prices:
                continue
            p = prices[-1]
            expected, rule, why = p.price, "price", f"the contract price is £{p.price:,.2f}"
            if OOH.search(ln.item) and t.out_of_hours:
                o = t.out_of_hours
                if ln.service_at and not self._out_of_hours(o, _service_dt(ln)):
                    at = _service_dt(ln)
                    self.flag(inv, "out_of_hours", ln.quantity * (ln.unit_price - p.price) * ln.factor,
                              f"Out-of-hours rates charged for work at {at:%H:%M} on a {at:%A}, which is within normal hours.", o.evidence)
                    continue
                expected, why = round(p.price * o.multiplier + 1e-9, 2), f"the out-of-hours rate is £{p.price * o.multiplier:,.2f}"
            if ln.unit_price - expected > TOL:
                self.flag(inv, rule, ln.quantity * (ln.unit_price - expected) * ln.factor,
                          f"{ln.item} billed at £{ln.unit_price:,.2f}{_per(ln.unit)} on {on:%d %b %Y}; {why}.", p.evidence)

    @staticmethod
    def _out_of_hours(o, at: datetime) -> bool:
        if at.weekday() >= 5:
            return o.weekends_out_of_hours
        hm = at.strftime("%H:%M")
        return not (o.weekday_start <= hm < o.weekday_end)

    def check_delivery_fee(self, t: ContractTerms, inv: Invoice):
        d = t.delivery_fee
        if d is None:
            return
        charges = [ln for ln in inv.lines if "delivery" in norm(ln.item).split()]
        if not charges:
            return
        goods = sum(ln.line_total for ln in inv.lines if ln not in charges)
        for ln in charges:
            if d.free_over_net is not None and goods > d.free_over_net + TOL:
                self.flag(inv, "delivery_fee", ln.line_total,
                          f"£{ln.line_total:,.2f} delivery charge on a delivery worth £{goods:,.2f}; deliveries over £{d.free_over_net:,.2f} are free.",
                          d.evidence)
            elif ln.unit_price - d.amount > TOL:
                self.flag(inv, "delivery_fee", ln.quantity * (ln.unit_price - d.amount),
                          f"Delivery charged at £{ln.unit_price:,.2f}; the contract charge is £{d.amount:,.2f}.", d.evidence)

    def check_minimum_charge(self, t: ContractTerms, inv: Invoice):
        mc = t.minimum_charge
        if mc is None:
            return
        tops = [ln for ln in inv.lines if "minimum" in norm(ln.item).split()]
        if not tops:
            return
        goods = sum(ln.line_total for ln in inv.lines if ln not in tops)
        allowed = max(0.0, mc.amount - goods)
        charged = sum(ln.line_total for ln in tops)
        if charged - allowed > TOL:
            self.flag(inv, "minimum_charge", charged - allowed,
                      f"Minimum-charge top-up of £{charged:,.2f} on an invoice whose items come to £{goods:,.2f}; "
                      f"the top-up should be £{allowed:,.2f} (minimum £{mc.amount:,.2f}).", mc.evidence)

    def check_volume_discount(self, t: ContractTerms, inv: Invoice):
        v = t.volume_discount
        if v is None:
            return
        unit = norm(v.unit)
        eligible = [ln for ln in inv.lines if norm(ln.unit) == unit]
        if v.applies_per == "invoice":
            if sum(ln.quantity for ln in eligible) + 1e-9 < v.min_quantity:
                return
            qualifying = inv.lines
            why = f"orders of {_plural(v.min_quantity, v.unit)} or more get {v.percent:g}% off every line"
        else:
            qualifying = [ln for ln in eligible if ln.quantity + 1e-9 >= v.min_quantity]
            why = f"lines of {_plural(v.min_quantity, v.unit)} or more get {v.percent:g}% off"
        for ln in qualifying:
            missing = v.percent - (ln.discount_pct or 0)
            if missing > 1e-6:
                self.flag(inv, "volume_discount", ln.quantity * ln.unit_price * missing / 100,
                          f"{ln.item}: {ln.discount_pct or 0:g}% discount given; {why}.", v.evidence)

    def _period_key(self, period: str, on: date, anchor: date | None) -> tuple:
        if period in ("monthly", "month"):
            return (on.year, on.month)
        if period in ("quarterly", "quarter"):
            return (on.year, (on.month - 1) // 3)
        if period == "weekly":
            return tuple(on.isocalendar()[:2])
        if period == "contract_year" and anchor:
            started = (on.month, on.day) >= (anchor.month, anchor.day)
            return (on.year if started else on.year - 1,)
        return (on.year,)

    def check_fixed_fees(self, t: ContractTerms, invoices: list[Invoice]):
        m = Matcher(list(dict.fromkeys(f.name for f in t.fixed_fees)))
        counts: dict[tuple, int] = defaultdict(int)
        rows = sorted(((inv.when(ln), inv, ln) for inv in invoices for ln in inv.lines), key=lambda r: (r[0], r[1].invoice_no, r[2].line_no))
        for on, inv, ln in rows:
            name = m.match(ln.item)
            if name is None:
                continue
            fees = [f for f in t.fixed_fees if f.name == name and _in_force(on, f.effective_from, f.effective_to)]
            if not fees:
                continue
            f = fees[-1]
            if ln.unit_price - f.amount > TOL:
                since = f" from {f.effective_from.day} {f.effective_from:%B %Y}" if f.effective_from else ""
                self.flag(inv, "fixed_fee", ln.quantity * (ln.unit_price - f.amount) * ln.factor,
                          f"{ln.item} billed at £{ln.unit_price:,.2f}; the agreed charge{since} is £{f.amount:,.2f}.", f.evidence)
            if f.max_per_period and f.period != "per_visit":
                key = (name, self._period_key(f.period, on, t.contract_start))
                counts[key] += 1
                if counts[key] > f.max_per_period:
                    self.flag(inv, "frequency", ln.line_total,
                              f"{ln.item} charged {counts[key]} times in the same {PERIOD_WORD.get(f.period, f.period)}; the contract "
                              f"allows {f.max_per_period}.", f.evidence)

    def check_allowances(self, t: ContractTerms, invoices: list[Invoice]):
        if not t.allowances:
            return
        m = Matcher([a.item for a in t.allowances])
        used: dict[tuple, int] = defaultdict(int)
        rows = sorted(((inv.when(ln), inv, ln) for inv in invoices for ln in inv.lines), key=lambda r: (r[0], r[1].invoice_no, r[2].line_no))
        for on, inv, ln in rows:
            name = m.match(ln.item)
            if name is None:
                continue
            a = next(a for a in t.allowances if a.item == name)
            key = (name, self._period_key(a.period, on, t.contract_start))
            for _ in range(max(1, round(ln.quantity))):
                used[key] += 1
                expected = 0.0 if used[key] <= a.free_quantity else a.price_after
                if ln.unit_price - expected > TOL:
                    self.flag(inv, "allowance", (ln.unit_price - expected) * ln.factor,
                              f"{ln.item} on {on:%d %b %Y} charged £{ln.unit_price:,.2f}; it was number {used[key]} in the "
                              f"{PERIOD_WORD.get(a.period, a.period)}, and {a.free_quantity} are included free.", a.evidence)


def audit(terms: dict[str, ContractTerms], books_db: Path) -> tuple[list[Finding], list[str]]:
    a = Auditor(terms, load_invoices(books_db), load_deliveries(books_db))
    return a.run(), a.skipped
