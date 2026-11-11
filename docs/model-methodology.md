# Machine-learning methodology

Implementation: `ml/churn_ml/`. Measured results for the demo model: [evaluation-report.md](evaluation-report.md) (synthetic data).

## Problem formulation

Binary classification per **customer-snapshot**: *given everything known strictly before a cutoff date, will the customer churn
within the next H days?* H = **30 days** by default (configurable 7–180, per organization).

## Churn definition (`labels.py`)

* **Eligible at cutoff:** ≥ 1 subscription `active` or `past_due` (state strictly before the cutoff).
* **Churned:** at cutoff + H the customer has **no** subscription in `active`, `past_due`, `trialing`, `paused`.
  A resubscription inside the window cancels the churn.
* **Not churn:** plan downgrade, past-due, pause, a scheduled cancellation that has not taken effect, trial expiry (trialing customers are
  never eligible).
* **Type:** `involuntary` if the last cancellation in the window had reason `payment_failed`/`unpaid`, else `voluntary`.

## Features (`features.py`) — all strictly `< cutoff`

| Group | Features |
|---|---|
| Engagement | `active_days_7/30/prev_30`, `sessions_30/prev_30`, `activity_change_ratio = (s30 − sprev) / (sprev + 1)`, `days_since_last_activity` (capped 365; never-active → tenure), `feature_adoption_count` (distinct `properties.feature` in 60 d), `onboarding_completed` |
| Subscription | `subscription_tenure_days`, `cancel_at_period_end`, `recent_downgrade_90d`, `plan_id`, `billing_interval` |
| Payment | `payment_failures_30`, `payment_failures_90`, `past_due` |

Excluded on purpose: monetary amount, email, any personal attribute. **Leakage control** is tested: appending events, payments or
subscription changes at or after the cutoff leaves every feature unchanged; an event exactly at the cutoff is excluded.

## Dataset and split (`dataset.py`)

Snapshots every 14 days from (first subscription record + 60 days) until (as-of − H), so every label is complete.
Chronological split with an **embargo of H days** between parts so no label window overlaps the next period:

```
train_core | embargo | validation (2 snapshots) | embargo | test (≈25% latest snapshots)
```

Preprocessing is inside a scikit-learn `Pipeline`/`ColumnTransformer` fit only on training rows: median imputation + standard
scaling (numeric); most-frequent imputation + one-hot with `handle_unknown="ignore"` (categorical).
Snapshots 14 days apart share customers and overlapping label windows, so the *effective* sample size is smaller than the row count
(reported as a warning in every evaluation).

## Model and class imbalance

`LogisticRegression(C=1.0, lbfgs, max_iter=2000)`, seed 42. `class_weight=None` by default: unweighted logistic regression tends to
produce usable probabilities, whereas `"balanced"` raises recall but inflates probabilities (available via the train API; recheck calibration).
Training **refuses** (HTTP 202 → model status `failed` with a plain reason) when there are < 200 training rows, < 20 training churn
examples, < 5 held-out churn examples, or < 8 snapshots.

## Evaluation (`evaluate.py`, `train.py`)

Reported on the held-out test period only: ROC-AUC, PR-AUC, Brier score, precision/recall/F1/FPR/FNR and the confusion matrix at the high-risk
threshold, calibration deciles + expected calibration error, threshold table (precision/recall at 2–30% outreach capacity), per-plan
metrics, per-cutoff metrics, and an **ablation** (engagement only, subscription only, payment only, engagement+subscription, all).
Accuracy is deliberately not reported (misleading for rare churn).

**Baselines** on the same period: (1) base rate only; (2) rank by `days_since_last_activity` (no model).

**Pre-registered criterion for H1** (constants in `churn_ml/config.py`, fixed before looking at results): Logistic Regression's PR-AUC must exceed the
*best* baseline's PR-AUC by ≥ **0.05**, **and** the lower bound of the 95% customer-clustered bootstrap CI (300 resamples) of that difference must be > 0.
The report states "met" or "NOT met" programmatically — it is computed, not written by hand.

## Risk thresholds

Not hand-picked. A model fit on `train_core` scores the **validation** snapshots; *medium* = score quantile that flags 20% of
customers, *high* = quantile that flags 8% (team-capacity assumptions, configurable in `TrainConfig`). The test period is never used to choose them.
Organizations can switch to fixed 30%/60% (the specification's illustrative values) in Settings. With a ~5% base rate those fixed values flag almost nobody,
which is why model-derived thresholds are the default. Re-evaluate thresholds with real intervention capacity and costs.

## Explainability (`explain.py`)

Contribution = coefficient × standardized value (log-odds relative to the average training customer). An indicator is shown as a *risk* signal only if
(a) its contribution is positive **and** (b) the customer's value is on the adverse side of the average (e.g. activity *falling*, onboarding *incomplete*).
Condition (b) prevents confusing outputs where correlated features give a coefficient an unintuitive sign (an earlier build listed "sessions +1900%" as a risk;
this is now a regression test). Plan and billing interval are never shown as indicators. Every explanation carries a disclaimer: associations, not causes.

## Serving and monitoring

Artifacts: `joblib` file + SHA-256 in `model_versions`. Loading verifies the checksum and feature schema (pickle is only safe for files this application wrote);
mismatch → rules-only mode with a visible reason. Predictions store model version, horizon, cutoff and timestamp; reruns for the same cutoff replace rather than duplicate.
Retraining is an explicit, audited action (no automatic retraining). **Not yet built:** drift monitoring dashboards and automatic outcome back-fill
(labels for past predictions can be regenerated by retraining; see known limitations).

## Rules-based recommendations (`services/retention/rules.py`)

Inactivity ≥ 14 d (high ≥ 30 d), incomplete onboarding after 7 d, usage down ≥ 40% or ≤ 1 feature after 30 d, ≥ 2 failed payments in 30 d or past-due,
downgrade in 90 d, scheduled cancellation; fallback "review engagement history" for high-risk accounts with no rule. These thresholds are
defaults, not validated business truths. Rules work with no model at all.
