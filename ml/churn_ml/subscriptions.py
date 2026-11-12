"""Subscription history helpers shared by revenue analytics, labels and features.

A *changes* DataFrame is the append-only history of subscription state. Each row is the full
state of one subscription effective at ``occurred_at``. State at time t = last row <= t.
"""
from __future__ import annotations

from decimal import Decimal

import pandas as pd

CHANGE_COLUMNS = [
    "id", "subscription_id", "customer_id", "change_type", "occurred_at", "status", "plan_id",
    "amount_cents", "interval", "interval_count", "currency", "cancel_at_period_end", "reason",
]


def to_monthly(amount_cents: int, interval: str, interval_count: int = 1) -> Decimal:
    """Normalize a recurring amount (minor units) to an exact monthly equivalent."""
    n = Decimal(max(int(interval_count or 1), 1))
    a = Decimal(int(amount_cents))
    if interval == "month":
        return a / n
    if interval == "year":
        return a / (Decimal(12) * n)
    if interval == "week":
        return a * Decimal(52) / Decimal(12) / n
    if interval == "day":
        return a * Decimal(365) / Decimal(12) / n
    raise ValueError(f"unsupported billing interval: {interval!r}")


def to_utc(value) -> pd.Timestamp:
    ts = pd.Timestamp(value)
    return ts.tz_localize("UTC") if ts.tzinfo is None else ts.tz_convert("UTC")


def empty_changes() -> pd.DataFrame:
    df = pd.DataFrame({c: [] for c in CHANGE_COLUMNS})
    df["occurred_at"] = pd.to_datetime(df["occurred_at"], utc=True)
    df["monthly"] = pd.Series([], dtype=object)
    return df


def normalize_changes(df: pd.DataFrame) -> pd.DataFrame:
    """Validate/normalize a changes frame and add the exact ``monthly`` Decimal column."""
    if df is None or len(df) == 0:
        return empty_changes()
    out = df.copy()
    missing = [c for c in CHANGE_COLUMNS if c not in out.columns and c not in ("id", "reason")]
    if missing:
        raise ValueError(f"changes frame missing columns: {missing}")
    if "id" not in out.columns:
        out["id"] = range(1, len(out) + 1)
    if "reason" not in out.columns:
        out["reason"] = None
    out["occurred_at"] = pd.to_datetime(out["occurred_at"], utc=True)
    out["cancel_at_period_end"] = out["cancel_at_period_end"].fillna(False).astype(bool)
    out["interval_count"] = out["interval_count"].fillna(1).astype(int)
    out["monthly"] = [
        to_monthly(a, i, c) for a, i, c in zip(out["amount_cents"], out["interval"], out["interval_count"], strict=True)
    ]
    return out.sort_values(["occurred_at", "id"], kind="stable").reset_index(drop=True)


def states_at(changes: pd.DataFrame, t, inclusive: bool = True) -> pd.DataFrame:
    """Latest state of every subscription at time ``t`` (``<= t`` if inclusive else ``< t``)."""
    if changes is None or len(changes) == 0:
        return empty_changes()
    t = to_utc(t)
    mask = changes["occurred_at"] <= t if inclusive else changes["occurred_at"] < t
    sub = changes[mask]
    if sub.empty:
        return sub
    return sub.sort_values(["occurred_at", "id"], kind="stable").groupby("subscription_id", sort=False).tail(1)
