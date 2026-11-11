# Data dictionary

Timestamps are stored as naive UTC and returned as timezone-aware UTC (`UTCDateTime` type). Money is integer minor units.
`organization_id` is present on every tenant-owned table and used in every query.

## Tables

| Table | Purpose | Key constraints / indexes |
|---|---|---|
| `organizations` | Workspace; `default_currency`, `settings_json` (`prediction_horizon_days`, `threshold_mode`, `fixed_thresholds`, `is_demo`), hashed ingest key | |
| `users`, `organization_memberships` | Accounts and roles (`owner`, `analyst`, `csm`, `viewer`) | unique `(organization_id, user_id)` |
| `revoked_tokens` | Server-side logout / single-use reset tokens | pk `jti` |
| `customers` | One per external customer; denormalized read model (`current_*`, `risk_*`, `last_activity_at`) | unique `(organization_id, external_customer_id)` |
| `subscriptions` | Current state of each subscription | unique `(organization_id, external_subscription_id)` |
| `subscription_changes` | **Append-only history**: full subscription state effective at `occurred_at` (`created`, `upgraded`, `downgraded`, `cancel_scheduled`, `cancel_unscheduled`, `status_changed`, `plan_changed`, `canceled`) | `(organization_id, occurred_at)`, `(subscription_id, occurred_at)` |
| `payments` | Invoice payment attempts (`succeeded`/`failed`) | unique `(organization_id, external_ref)` |
| `product_events` | Raw telemetry; `properties_json` (JSONB on PostgreSQL) | unique `(organization_id, external_event_id)`; `(org, customer, time)`, `(org, type, time)` |
| `webhook_events` | Stripe deliveries with `processing_status` (`received`/`processed`/`failed`/`ignored`), attempts, error summary, payload (purgeable) | unique `(organization_id, provider, external_event_id)` |
| `customer_features` | Feature snapshot used for explanations/rules (spec columns + `features_json`) | unique `(org, customer, feature_window_end)` |
| `churn_labels` | Labels generated for training cutoffs (`churned_within_horizon`, `churn_type`) | unique `(org, customer, cutoff, horizon)` |
| `model_versions` | Version, horizon, dataset version, metrics JSON, thresholds, artifact path + SHA-256, status (`training`/`active`/`archived`/`failed`), `is_synthetic` | |
| `churn_predictions` | Probability, category, cutoff, horizon, model version, explanation JSON | unique `(org, customer, model_version, cutoff)` |
| `retention_actions`, `retention_notes` | Suggested/manual tasks, status, owner, outcome, signals; notes and contact attempts | `(organization_id, status)` |
| `audit_logs` | Administrative actions (who/what/when, metadata) | |

## Product event schema (`POST /api/v1/events`)

Header `X-Ingest-Key: ing_…`. Body: one event or `{"events": [ … ]}` (1–500).

```json
{ "event_id": "evt_123", "customer_id": "cus_abc", "event_type": "feature_used",
  "timestamp": "2026-10-30T14:03:11Z", "properties": {"feature": "reports"}, "source": "web-app" }
```

| Field | Rules |
|---|---|
| `event_id` | 1–128 chars `[A-Za-z0-9_.:-]`; unique per organization (duplicates reported, not re-stored) |
| `customer_id` | Your identifier for the account (same space as Stripe/CSV `external_customer_id`); unknown ids create a stub customer |
| `event_type` | `user_registered`, `login`, `session_started`, `feature_used`, `project_created`, `report_generated`, `integration_connected`, `onboarding_completed`, `subscription_upgraded`, `subscription_downgraded` |
| `timestamp` | ISO-8601; naive = UTC; not > 5 min in the future; not > 5 years old; late/out-of-order allowed |
| `properties` | ≤ 4096 bytes serialized; `feature` is used for the adoption feature |
| unknown fields | rejected (422) |

Privacy: send identifiers, not personal data. Billing truth comes from Stripe/CSV; `subscription_*` product events are stored but do not change subscription state.

## CSV formats (UTF-8, header row required)

| File | Required columns | Optional columns |
|---|---|---|
| `customers.csv` | `external_customer_id` | `email`, `signed_up_at` |
| `subscriptions.csv` | `external_subscription_id, external_customer_id, status, recurring_amount, started_at` | `plan_id, billing_interval (day/week/month/year), interval_count, currency, canceled_at, cancel_at_period_end, cancellation_reason` |
| `events.csv` | `event_id, customer_id, event_type, timestamp` | `properties` (JSON), `source` |
| `payments.csv` | `customer_id, status (succeeded/failed), amount, occurred_at` | `currency, external_ref` |

`recurring_amount`/`amount` are decimal strings (`"99.00"`) parsed without floating point. Dates are ISO-8601 (`Z` or naive = UTC).
Import order: customers → subscriptions → events → payments. Bad rows are reported (first 50) and skipped; the rest are imported.
A subscription row creates `created` (and `canceled` if it has `canceled_at`) history entries — CSV cannot express intermediate plan changes.

## Stripe mapping

`customer.subscription.*` → `subscriptions` + `subscription_changes`; `invoice.payment_failed|payment_succeeded|paid` → `payments`;
`customer.created|updated` → `customers`. Stripe `unpaid` stays `unpaid`; `incomplete_expired` → `canceled`. Amount = Σ(unit_amount × quantity)
of all items; interval from the first item. Stripe API ≥ 2025 moved period timestamps onto items — both locations are read.
