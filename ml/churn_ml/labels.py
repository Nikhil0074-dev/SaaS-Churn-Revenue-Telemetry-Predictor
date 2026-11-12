"""Churn label generation.

Definition (documented in docs/model-methodology.md):
  * Eligible at cutoff  = customer has >=1 subscription in ELIGIBLE_STATUSES at the cutoff (state < cutoff).
  * Churned in horizon  = at cutoff+horizon (state < cutoff+horizon) the customer has NO subscription in
    RETAINED_STATUSES (active, past_due, trialing, paused). A re-subscription inside the window cancels the churn.
  * Plan downgrades, scheduled cancellations that have not yet taken effect, pauses and past-due states are
    NOT churn.
  * churn_type: 'involuntary' if the last cancellation in the window was caused by failed payment,
    otherwise 'voluntary'.
"""
from __future__ import annotations

import pandas as pd

from .config import RETAINED_STATUSES
from .subscriptions import states_at, to_utc

INVOLUNTARY_REASONS = {"payment_failed", "unpaid"}


def generate_labels(changes: pd.DataFrame, customer_ids, cutoff, horizon_days: int) -> pd.DataFrame:
    cutoff = to_utc(cutoff)
    end = cutoff + pd.Timedelta(days=int(horizon_days))
    ids = list(customer_ids)
    out = pd.DataFrame({"customer_id": ids})
    if not ids:
        out["churned_within_horizon"] = pd.Series([], dtype=int)
        out["churn_type"] = pd.Series([], dtype=object)
        return out
    st_end = states_at(changes, end, inclusive=False)
    retained = set(st_end.loc[st_end["status"].isin(RETAINED_STATUSES), "customer_id"])
    window = changes[(changes["occurred_at"] >= cutoff) & (changes["occurred_at"] < end)]
    cancels = window[window["status"].isin(["canceled", "unpaid"])].sort_values(["occurred_at", "id"])
    last_reason = cancels.groupby("customer_id").tail(1).set_index("customer_id")["reason"].to_dict()
    churned, ctype = [], []
    for cid in ids:
        is_churn = cid not in retained
        churned.append(int(is_churn))
        if not is_churn:
            ctype.append(None)
        else:
            ctype.append("involuntary" if last_reason.get(cid) in INVOLUNTARY_REASONS else "voluntary")
    out["churned_within_horizon"] = churned
    out["churn_type"] = ctype
    return out
