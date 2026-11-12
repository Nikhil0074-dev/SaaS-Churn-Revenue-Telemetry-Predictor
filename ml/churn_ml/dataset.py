"""Snapshot dataset construction and chronological splitting."""
from __future__ import annotations

import hashlib

import pandas as pd

from .features import (
    build_features,
    prepare_customers,
    prepare_events,
    prepare_payments,
)
from .labels import generate_labels
from .subscriptions import normalize_changes, to_utc


def snapshot_cutoffs(first, last, step_days: int = 14) -> list[pd.Timestamp]:
    first, last = to_utc(first), to_utc(last)
    out, t = [], first
    while t <= last:
        out.append(t)
        t += pd.Timedelta(days=step_days)
    return out


def build_dataset(customers, changes, events, payments, cutoffs, horizon_days: int) -> pd.DataFrame:
    """Stack one snapshot per cutoff: features (as of cutoff) + label (outcome in the following horizon)."""
    changes = normalize_changes(changes)
    events, payments, customers = prepare_events(events), prepare_payments(payments), prepare_customers(customers)
    frames = []
    for c in cutoffs:
        feats = build_features(customers, changes, events, payments, c)
        if feats.empty:
            continue
        labels = generate_labels(changes, feats.index, c, horizon_days).set_index("customer_id")
        snap = feats.join(labels)
        snap.insert(0, "cutoff", to_utc(c))
        frames.append(snap.reset_index())
    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True)


def chronological_split(df: pd.DataFrame, horizon_days: int, n_test: int | None = None, n_val: int = 2) -> dict:
    """Split snapshots by time with an embargo of ``horizon_days`` so no training label window overlaps
    the following evaluation period.

        train_core | embargo | validation | embargo | test
    """
    cutoffs = sorted(df["cutoff"].unique())
    if len(cutoffs) < 8:
        raise ValueError(f"need at least 8 snapshot cutoffs for a chronological split, got {len(cutoffs)}")
    n_test = n_test or max(2, round(0.25 * len(cutoffs)))
    h = pd.Timedelta(days=horizon_days)
    test_cuts = cutoffs[-n_test:]
    test_start = test_cuts[0]
    pool = [c for c in cutoffs if c + h <= test_start]
    val_cuts = pool[-n_val:] if len(pool) > n_val else []
    val_start = val_cuts[0] if val_cuts else None
    core = [c for c in pool if val_start is None or c + h <= val_start]
    if not core or not val_cuts:
        raise ValueError("not enough history for train/validation/test split with the label embargo")
    pick = lambda cs: df[df["cutoff"].isin(cs)].reset_index(drop=True)
    return {
        "train_core": pick(core), "validation": pick(val_cuts), "train_pool": pick(pool), "test": pick(test_cuts),
        "info": {
            "embargo_days": int(horizon_days),
            "train": _span(pool), "train_core": _span(core), "validation": _span(val_cuts), "test": _span(test_cuts),
        },
    }


def _span(cs) -> dict:
    return {"first": pd.Timestamp(cs[0]).isoformat(), "last": pd.Timestamp(cs[-1]).isoformat(), "snapshots": len(cs)}


def dataset_version(df: pd.DataFrame) -> str:
    cols = [c for c in df.columns if c != "churn_type"]
    h = pd.util.hash_pandas_object(df[cols].astype(str), index=False).values
    return hashlib.sha256(h.tobytes()).hexdigest()[:12]
