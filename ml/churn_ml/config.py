"""Shared constants. Single source of truth for event types, statuses and feature definitions."""
from __future__ import annotations

EVENT_TYPES = (
    "user_registered", "login", "session_started", "feature_used", "project_created",
    "report_generated", "integration_connected", "onboarding_completed",
    "subscription_upgraded", "subscription_downgraded",
)
# Events that count as "meaningful activity" for engagement features.
MEANINGFUL_EVENTS = frozenset({
    "login", "session_started", "feature_used", "project_created",
    "report_generated", "integration_connected",
})

# Subscription statuses (internal vocabulary; Stripe statuses are mapped onto these).
SUBSCRIPTION_STATUSES = ("incomplete", "trialing", "active", "past_due", "unpaid", "paused", "canceled")
# Statuses whose recurring amount counts toward MRR and whose customer is "paying".
MRR_STATUSES = ("active", "past_due")
# A customer is eligible for churn prediction when it is paying at the cutoff.
ELIGIBLE_STATUSES = MRR_STATUSES
# A customer is "retained" at the end of the horizon if any subscription is in one of these.
RETAINED_STATUSES = ("active", "past_due", "trialing", "paused")

BILLING_INTERVALS = ("day", "week", "month", "year")

NUMERIC_FEATURES = [
    "active_days_7", "active_days_30", "active_days_prev_30",
    "sessions_30", "sessions_prev_30", "activity_change_ratio",
    "days_since_last_activity", "feature_adoption_count", "onboarding_completed",
    "payment_failures_30", "payment_failures_90", "past_due",
    "subscription_tenure_days", "cancel_at_period_end", "recent_downgrade_90d",
]
CATEGORICAL_FEATURES = ["plan_id", "billing_interval"]
ALL_FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES

FEATURE_GROUPS = {
    "engagement": [
        "active_days_7", "active_days_30", "active_days_prev_30", "sessions_30",
        "sessions_prev_30", "activity_change_ratio", "days_since_last_activity",
        "feature_adoption_count", "onboarding_completed",
    ],
    "subscription": [
        "subscription_tenure_days", "cancel_at_period_end", "recent_downgrade_90d",
        "plan_id", "billing_interval",
    ],
    "payment": ["payment_failures_30", "payment_failures_90", "past_due"],
}

# Pre-registered success criterion for the H1 hypothesis (documented in docs/model-methodology.md).
# Logistic Regression must beat the best baseline's PR-AUC by at least this absolute margin,
# and the lower bound of the 95% customer-clustered bootstrap CI of the difference must be > 0.
MEANINGFUL_IMPROVEMENT_PR_AUC = 0.05

DEFAULT_RISK_THRESHOLDS = {"medium": 0.30, "high": 0.60}
