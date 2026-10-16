"""Contract terms in the one shape the extractor produces, the auditor reads and the evals grade."""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Price(_Strict):
    item: str
    unit: str
    price: float
    effective_from: date | None
    effective_to: date | None
    evidence: str


class FixedFee(_Strict):
    name: str
    amount: float
    period: Literal["weekly", "monthly", "quarterly", "yearly", "per_visit"]
    max_per_period: int | None
    effective_from: date | None
    effective_to: date | None
    evidence: str


class DeliveryFee(_Strict):
    amount: float
    free_over_net: float | None
    evidence: str


class VolumeDiscount(_Strict):
    percent: float
    min_quantity: float
    unit: str
    applies_per: Literal["line", "invoice"]
    evidence: str


class OutOfHours(_Strict):
    multiplier: float
    weekday_start: str
    weekday_end: str
    weekends_out_of_hours: bool
    evidence: str


class MinimumCharge(_Strict):
    amount: float
    period: Literal["weekly", "monthly"]
    evidence: str


class Allowance(_Strict):
    item: str
    free_quantity: int
    period: Literal["contract_year", "quarter", "month"]
    price_after: float
    evidence: str


class ContractTerms(_Strict):
    supplier: str
    contract_start: date | None
    contract_end: date | None
    auto_renews: bool | None
    notice_days: int | None
    payment_days: int | None
    prices: list[Price]
    fixed_fees: list[FixedFee]
    delivery_fee: DeliveryFee | None
    volume_discount: VolumeDiscount | None
    out_of_hours: OutOfHours | None
    minimum_charge: MinimumCharge | None
    allowances: list[Allowance]
