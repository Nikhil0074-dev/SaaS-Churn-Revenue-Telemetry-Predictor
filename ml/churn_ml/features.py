"""Customer feature engineering with strict cutoff enforcement.

Every input is filtered with ``timestamp < cutoff`` so nothing observed at or after the prediction
cutoff can reach a feature (target-leakage control, covered by tests/test_features.py).
"""
from __future__ import annotations

import pandas as pd

from .config import ALL_FEATURES, ELIGIBLE_STATUSES, MEANINGFUL_EVENTS
from .subscriptions import normalize_changes, states_at, to_utc

DAY = pd.Timedelta(days=1)
INACTIVITY_CAP_DAYS = 365


def prepare_events(events: pd.DataFrame | None) -> pd.DataFrame:
    cols = ["customer_id", "event_type", "event_timestamp", "feature"]
    if events is None or len(events) == 0:
        e = pd.DataFrame({c: [] for c in cols})
        e["event_timestamp"] = pd.to_datetime(e["event_timestamp"], utc=True)
        return e
    e = events.copy()
    if "feature" not in e.columns:
        e["feature"] = None
    e["event_timestamp"] = pd.to_datetime(e["event_timestamp"], utc=True)
    return e[cols]


def prepare_payments(payments: pd.DataFrame | None) -> pd.DataFrame:
    cols = ["customer_id", "status", "occurred_at"]
    if payments is None or len(payments) == 0:
        p = pd.DataFrame({c: [] for c in cols})
        p["occurred_at"] = pd.to_datetime(p["occurred_at"], utc=True)
        return p
    p = payments[cols].copy()
    p["occurred_at"] = pd.to_datetime(p["occurred_at"], utc=True)
    return p


def prepare_customers(customers: pd.DataFrame | None) -> pd.DataFrame:
    if customers is None or len(customers) == 0:
        c = pd.DataFrame({"customer_id": [], "signed_up_at": []})
        c["signed_up_at"] = pd.to_datetime(c["signed_up_at"], utc=True)
        return c
    c = customers[["customer_id", "signed_up_at"]].copy()
    c["signed_up_at"] = pd.to_datetime(c["signed_up_at"], utc=True)
    return c


def empty_features() -> pd.DataFrame:
    df = pd.DataFrame({c: [] for c in ALL_FEATURES})
    df.index.name = "customer_id"
    return df


def build_features(customers, changes, events, payments, cutoff) -> pd.DataFrame:
    """Return one row per customer that is paying at ``cutoff`` (index = customer_id)."""
    cutoff = to_utc(cutoff)
    changes = changes if "monthly" in getattr(changes, "columns", []) else normalize_changes(changes)
    events = prepare_events(events)
    payments = prepare_payments(payments)
    customers = prepare_customers(customers)

    st = states_at(changes, cutoff, inclusive=False)
    paying = st[st["status"].isin(ELIGIBLE_STATUSES)]
    if paying.empty:
        return empty_features()
    paying = paying.assign(_m=paying["monthly"].astype(float)).sort_values(["customer_id", "_m"], ascending=[True, False])
    primary = paying.groupby("customer_id").head(1).set_index("customer_id")
    idx = primary.index

    feat = pd.DataFrame(index=idx)
    feat.index.name = "customer_id"
    feat["plan_id"] = primary["plan_id"].astype(str)
    feat["billing_interval"] = primary["interval"].astype(str)
    grp = paying.groupby("customer_id")
    feat["past_due"] = grp["status"].apply(lambda s: int((s == "past_due").any())).reindex(idx).astype(int)
    feat["cancel_at_period_end"] = grp["cancel_at_period_end"].apply(lambda s: int(s.any())).reindex(idx).astype(int)

    # --- tenure: earliest of signup date / first subscription record, strictly before cutoff
    first_change = changes[changes["occurred_at"] < cutoff].groupby("customer_id")["occurred_at"].min()
    signup = customers.set_index("customer_id")["signed_up_at"] if len(customers) else pd.Series(dtype="datetime64[ns, UTC]")
    signup = signup[signup < cutoff].reindex(idx)
    start = pd.concat([signup, first_change.reindex(idx)], axis=1).min(axis=1)
    tenure = ((cutoff - start) / DAY).fillna(0).clip(lower=0)
    feat["subscription_tenure_days"] = tenure.astype(float).round(0)

    # --- engagement (events strictly before cutoff)
    ev = events[(events["event_timestamp"] < cutoff) & (events["customer_id"].isin(idx))]
    mean_ev = ev[ev["event_type"].isin(MEANINGFUL_EVENTS)]
    age = (cutoff - mean_ev["event_timestamp"]) / DAY
    mean_ev = mean_ev.assign(_age=age, _day=mean_ev["event_timestamp"].dt.floor("D"))

    def active_days(lo: float, hi: float) -> pd.Series:
        sel = mean_ev[(mean_ev["_age"] > lo) & (mean_ev["_age"] <= hi)]
        return sel.groupby("customer_id")["_day"].nunique().reindex(idx).fillna(0)

    feat["active_days_7"] = active_days(0, 7)
    feat["active_days_30"] = active_days(0, 30)
    feat["active_days_prev_30"] = active_days(30, 60)

    sess = ev[ev["event_type"] == "session_started"]
    sage = (cutoff - sess["event_timestamp"]) / DAY
    feat["sessions_30"] = sess[(sage > 0) & (sage <= 30)].groupby("customer_id").size().reindex(idx).fillna(0)
    feat["sessions_prev_30"] = sess[(sage > 30) & (sage <= 60)].groupby("customer_id").size().reindex(idx).fillna(0)
    feat["activity_change_ratio"] = (feat["sessions_30"] - feat["sessions_prev_30"]) / (feat["sessions_prev_30"] + 1.0)

    last = mean_ev.groupby("customer_id")["event_timestamp"].max().reindex(idx)
    dsl = ((cutoff - last) / DAY)
    feat["days_since_last_activity"] = dsl.fillna(feat["subscription_tenure_days"]).clip(upper=INACTIVITY_CAP_DAYS).astype(float)

    fu = ev[(ev["event_type"] == "feature_used") & ((cutoff - ev["event_timestamp"]) / DAY <= 60)]
    feat["feature_adoption_count"] = fu.dropna(subset=["feature"]).groupby("customer_id")["feature"].nunique().reindex(idx).fillna(0)

    onboarded = ev[ev["event_type"] == "onboarding_completed"]["customer_id"].unique()
    feat["onboarding_completed"] = feat.index.isin(onboarded).astype(int)

    # --- payments / plan changes
    pay = payments[(payments["occurred_at"] < cutoff) & (payments["status"] == "failed") & (payments["customer_id"].isin(idx))]
    page = (cutoff - pay["occurred_at"]) / DAY
    feat["payment_failures_30"] = pay[page <= 30].groupby("customer_id").size().reindex(idx).fillna(0)
    feat["payment_failures_90"] = pay[page <= 90].groupby("customer_id").size().reindex(idx).fillna(0)
    down = changes[(changes["change_type"] == "downgraded") & (changes["occurred_at"] < cutoff)
                   & ((cutoff - changes["occurred_at"]) / DAY <= 90)]
    feat["recent_downgrade_90d"] = feat.index.isin(down["customer_id"].unique()).astype(int)

    return feat[ALL_FEATURES].astype({c: float for c in ALL_FEATURES if c not in ("plan_id", "billing_interval")})
