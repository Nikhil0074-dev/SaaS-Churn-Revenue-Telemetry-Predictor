# Model evaluation report: lr-20261031-1

> **SYNTHETIC DEMONSTRATION DATA.** The simulator plants the relationships the model learns, so these results demonstrate the pipeline and are **not evidence of real-world predictive power**.

## 1. Setup

- Model: logistic_regression (C=1.0, class_weight=None, seed=42)
- Prediction horizon: 30 days
- Dataset version `8d3090e759c8`: 4,544 customer-snapshots, 414 customers, base churn rate 5.5%
- Snapshot cutoffs 2025-11-25 to 2026-09-29 (every 14 days; labels complete)
- Churn types in positives: {'voluntary': 216, 'involuntary': 35}

### Chronological split

| Part | First cutoff | Last cutoff | Snapshots |
|---|---|---|---|
| train | 2025-11-25 | 2026-06-09 | 15 |
| train_core | 2025-11-25 | 2026-04-14 | 11 |
| validation | 2026-05-26 | 2026-06-09 | 2 |
| test | 2026-07-21 | 2026-09-29 | 6 |

A 30-day embargo separates train, validation and test so that no label window overlaps the next period.

## 2. Held-out test results

1,747 rows, 100 churn examples (prevalence 5.7%).

| Metric | Value |
|---|---|
| ROC-AUC | 0.713 |
| PR-AUC | 0.313 |
| Brier score | 0.0441 |
| Calibration error (ECE) | 0.0253 |
| Precision at high threshold (7.6%) | 21.9% |
| Recall at high threshold | 34.0% |
| F1 at high threshold | 0.267 |
| False-positive rate | 7.3% |
| False-negative rate | 66.0% |

### Confusion matrix at the high-risk threshold

| | Predicted high | Predicted not high |
|---|---|---|
| Churned | 34 | 66 |
| Stayed | 121 | 1526 |

## 3. Baselines and pre-registered criterion

| Approach | ROC-AUC | PR-AUC |
|---|---|---|
| Logistic Regression | 0.713 | 0.313 |
| Days since last activity (ranking only) | 0.589 | 0.106 |
| Base rate only | 0.500 | 0.057 |

**H1 criterion met on this held-out period: PR-AUC 0.313 vs best baseline (days_since_last_activity) 0.106, difference +0.207 (95% CI 0.095 to 0.317; required >= +0.05).**

Bootstrap (customer-clustered, 300 resamples): mean difference 0.209, 95% CI [0.095, 0.317].

## 4. Ablation (feature groups)

| Feature set | ROC-AUC | PR-AUC | Brier |
|---|---|---|---|
| engagement only | 0.636 | 0.104 | 0.0533 |
| subscription only | 0.612 | 0.245 | 0.0451 |
| payment only | 0.531 | 0.092 | 0.0531 |
| engagement + subscription | 0.680 | 0.270 | 0.0452 |
| all feature groups | 0.713 | 0.313 | 0.0441 |

## 5. Calibration (deciles of the test set)

| Bin | Rows | Mean predicted | Observed rate |
|---|---|---|---|
| 1 | 175 | 0.1% | 1.7% |
| 2 | 175 | 0.4% | 0.6% |
| 3 | 174 | 1.1% | 4.0% |
| 4 | 175 | 1.7% | 4.6% |
| 5 | 175 | 2.2% | 4.0% |
| 6 | 174 | 2.7% | 5.7% |
| 7 | 175 | 3.3% | 2.3% |
| 8 | 174 | 3.9% | 6.3% |
| 9 | 175 | 5.7% | 8.6% |
| 10 | 175 | 26.0% | 19.4% |

## 6. Outreach capacity (threshold table)

| Flag top | Threshold | Precision | Recall |
|---|---|---|---|
| 2% | 30.1% | 74.3% | 26.0% |
| 5% | 9.3% | 35.2% | 31.0% |
| 10% | 7.2% | 19.4% | 34.0% |
| 20% | 4.4% | 14.0% | 49.0% |
| 30% | 3.6% | 11.5% | 60.0% |

Active risk thresholds: medium 5.0%, high 7.6% (validation-set quantiles for team capacity (high=8%, medium+=20%)).

## 7. Performance by plan (test period)

| Plan | Rows | Churn examples | ROC-AUC | Precision | Recall |
|---|---|---|---|---|---|
| growth | 597 | 34 | 0.681 | 15.9% | 20.6% |
| scale | 307 | 12 | 0.770 | 35.7% | 41.7% |
| starter | 843 | 54 | 0.717 | 22.7% | 40.7% |

## 8. Performance over time (test cutoffs)

| Cutoff | Rows | Churn examples | ROC-AUC | PR-AUC |
|---|---|---|---|---|
| 2026-07-21 | 274 | 9 | 0.771 | 0.402 |
| 2026-08-04 | 282 | 12 | 0.749 | 0.205 |
| 2026-08-18 | 283 | 14 | 0.619 | 0.133 |
| 2026-09-01 | 295 | 20 | 0.760 | 0.415 |
| 2026-09-15 | 304 | 22 | 0.791 | 0.539 |
| 2026-09-29 | 309 | 23 | 0.626 | 0.284 |

## 9. Largest coefficients (standardized log-odds)

| Feature | Coefficient |
|---|---|
| cat__billing_interval_year | -1.427 |
| cat__billing_interval_month | +1.396 |
| num__cancel_at_period_end | +1.046 |
| num__onboarding_completed | -0.403 |
| num__subscription_tenure_days | -0.279 |
| num__payment_failures_30 | +0.271 |
| num__sessions_prev_30 | +0.265 |
| num__recent_downgrade_90d | +0.213 |
| num__days_since_last_activity | +0.182 |
| num__active_days_prev_30 | -0.134 |

## 10. Warnings and limitations

- Snapshots 14 days apart share customers and overlapping label windows; effective sample size is smaller than the row count.
- Coefficients are associations in this dataset, not causal effects.
- A scheduled cancellation is a legitimate, observable feature but is very strongly associated with churn; models that include it rank already-announced cancellations highest. Remove `cancel_at_period_end` if you want to predict *unannounced* churn.
- One-hot coefficients for billing interval are strongly anti-correlated by construction.
- Results describe a historical held-out period, not outcomes for current customers.
