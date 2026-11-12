"""Logistic Regression explanations: per-feature log-odds contributions relative to the average training customer.

These describe statistical association with predicted risk. They are NOT causal claims.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .config import ALL_FEATURES, CATEGORICAL_FEATURES

# Direction in which each feature is adverse. An indicator is shown only when the customer's value is on the adverse
# side of the training average AND the model's contribution is positive. This keeps explanations sensible when correlated
# features give a coefficient an unintuitive sign (e.g. a rising-sessions ratio must never be listed as a risk).
ADVERSE_DIRECTION = {
    "days_since_last_activity": +1, "activity_change_ratio": -1, "sessions_30": -1, "sessions_prev_30": -1,
    "active_days_30": -1, "active_days_7": -1, "active_days_prev_30": -1, "feature_adoption_count": -1,
    "onboarding_completed": -1, "payment_failures_30": +1, "payment_failures_90": +1, "past_due": +1,
    "cancel_at_period_end": +1, "recent_downgrade_90d": +1,
}

DISCLAIMER = "Indicators describe patterns associated with higher predicted risk; they do not establish why a customer will leave."


def _label(feature: str, value, cat_value=None) -> str:
    v = value
    if feature == "days_since_last_activity":
        return f"No meaningful activity for {v:.0f} days"
    if feature == "activity_change_ratio":
        return f"Sessions changed {v * 100:+.0f}% versus the previous 30 days"
    if feature == "sessions_30":
        return f"Only {v:.0f} sessions in the last 30 days"
    if feature == "sessions_prev_30":
        return f"{v:.0f} sessions in the 30 days before that"
    if feature == "active_days_30":
        return f"Active on {v:.0f} of the last 30 days"
    if feature == "active_days_7":
        return f"Active on {v:.0f} of the last 7 days"
    if feature == "active_days_prev_30":
        return f"Active on {v:.0f} days in the prior 30-day window"
    if feature == "feature_adoption_count":
        return f"Used {v:.0f} distinct feature(s) in the last 60 days"
    if feature == "onboarding_completed":
        return "Onboarding completed" if v >= 1 else "Onboarding not completed"
    if feature == "payment_failures_30":
        return f"{v:.0f} failed payment(s) in the last 30 days"
    if feature == "payment_failures_90":
        return f"{v:.0f} failed payment(s) in the last 90 days"
    if feature == "past_due":
        return "Subscription is past due" if v >= 1 else "Subscription is not past due"
    if feature == "cancel_at_period_end":
        return "Cancellation is scheduled for period end" if v >= 1 else "No cancellation scheduled"
    if feature == "recent_downgrade_90d":
        return "Plan downgraded in the last 90 days" if v >= 1 else "No recent plan downgrade"
    if feature == "subscription_tenure_days":
        return f"Account age: {v:.0f} days"
    if feature in CATEGORICAL_FEATURES:
        return f"{feature.replace('_', ' ').capitalize()}: {cat_value}"
    return feature


def _origin(transformed_name: str):
    """Map a ColumnTransformer output name back to (feature, category_value)."""
    name = transformed_name.split("__", 1)[1]
    for cat in CATEGORICAL_FEATURES:
        if name.startswith(cat + "_"):
            return cat, name[len(cat) + 1:]
    return name, None


def explain_frame(pipeline, features: pd.DataFrame, top_k: int = 4) -> dict:
    """Return {customer_id: explanation dict} for each row of ``features`` (indexed by customer_id)."""
    prep, clf = pipeline.named_steps["prep"], pipeline.named_steps["clf"]
    used = [c for c in ALL_FEATURES if c in prep.feature_names_in_]
    X = prep.transform(features[used] if len(used) == len(prep.feature_names_in_) else features[list(prep.feature_names_in_)])
    X = X.toarray() if hasattr(X, "toarray") else np.asarray(X)
    names = list(prep.get_feature_names_out())
    contrib = X * clf.coef_[0]
    out = {}
    for i, cid in enumerate(features.index):
        items = []
        for j, n in enumerate(names):
            feat, cat = _origin(n)
            raw = features.iloc[i][feat] if feat in features.columns else None
            if feat in CATEGORICAL_FEATURES:
                continue  # plan / billing interval are static attributes, not actionable risk indicators
            direction = ADVERSE_DIRECTION.get(feat)
            adverse = direction is None or (X[i, j] * direction > 1e-9)
            items.append({"feature": feat, "adverse": bool(adverse), "contribution": float(contrib[i, j]),
                          "value": None if raw is None or isinstance(raw, str) else float(raw),
                          "label": _label(feat, raw if not isinstance(raw, str) else 0, cat)})
        items.sort(key=lambda d: d["contribution"], reverse=True)
        risk = [d for d in items if d["contribution"] > 0.05 and d["adverse"]][:top_k]
        protect = [d for d in sorted(items, key=lambda d: d["contribution"]) if d["contribution"] < -0.05 and not d["adverse"]][:2]
        out[cid] = {"indicators": risk, "protective": protect, "disclaimer": DISCLAIMER}
    return out
