# Known limitations and future work

## Data and model

1. **Synthetic demo data.** The simulator plants the churn drivers (disengagement, failed payments, scheduled cancellation). Demo metrics prove the pipeline works end to end; they say nothing about your product.
   Real data will need: enough history (≥ ~8 snapshot cutoffs, ≥ 20 churn examples), a verified churn definition, and a fresh look at thresholds.
2. **Scheduled cancellation dominates.** `cancel_at_period_end` is a legitimate, observable feature and is by far the strongest predictor in the demo (accounts that have *announced* cancellation score ~100%).
   If you want to find *unannounced* risk, remove it from `ml/churn_ml/config.py` (`FEATURE_GROUPS["subscription"]`) and retrain.
3. **Small effective sample.** Overlapping 14-day snapshots reuse customers; confidence intervals use a customer-clustered bootstrap, but test sets are small (≈100 positives in the demo). Metrics are noisy.
4. **Logistic Regression only.** Linear in log-odds; no interaction terms. Tree models are *not* implemented (spec lists them as future work); the ablation table is the only model comparison.
5. **Calibration** is measured, not corrected (no Platt/isotonic step). Check the calibration table after each training run.
6. **No drift monitoring or automatic outcome tracking** of production predictions yet (the schema stores everything needed: predictions with cutoff + horizon, labels regenerated at training).
7. **Retention effectiveness is not measured causally.** Outcomes are recorded results; the UI says they are not proof an action caused retention. Experiment tracking is future work.
8. **Cold start.** With little history the app runs in rules-only mode and labels it clearly; rule thresholds are defaults, not validated.

## Revenue metrics

9. MRR excludes discounts, taxes, refunds and usage-based billing; no currency conversion (other currencies excluded and flagged).
10. History before the first Stripe sync / CSV import is unknown; CSV subscriptions cannot express intermediate plan changes, which limits upgrade/downgrade analytics and the `recent_downgrade` feature for imported data.
11. Stripe: only the listed events are handled; multi-item subscriptions use the first item's interval; coupons/trial-end specifics are not modelled; one shared webhook secret.

## Product and operations

12. No email delivery (password reset returns a token outside production), no MFA/SSO, no per-customer erasure endpoint (see security.md).
13. In-process background tasks and in-memory rate limits (single-worker assumption); dashboard aggregates are recomputed per request.
14. The per-organization threshold/horizon settings change *how predictions are interpreted*; changing the horizon requires training a model for that horizon.
15. Multi-organization membership exists in the data model and login (`organization_id`), but there is no organization switcher in the UI.
16. Not executed in this environment: Docker, Windows script, real Stripe, cloud deployment (see deployment.md).

## Future enhancements (from the specification)

CRM and support-tool integrations; customer lifetime value; cohort retention forecasting; Random Forest / gradient-boosting comparison; anomaly detection on revenue; experiment tracking for campaigns; human-approved email drafting.
