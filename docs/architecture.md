# Architecture

```mermaid
flowchart LR
  subgraph Sources
    S[Stripe webhooks + API sync]
    P[Product backend telemetry]
    C[CSV imports]
  end
  S -->|"POST /webhooks/stripe/{org}\n(signature verified)"| W[Webhook receiver]
  P -->|"POST /events\nX-Ingest-Key"| T[Telemetry API]
  C -->|"POST /imports/{kind}"| I[CSV importer]
  W -->|store event, return 200| WE[(webhook_events)]
  WE -->|background task| N[Normalizer / state machine]
  T --> PE[(product_events)]
  I --> N
  N --> SUB[(subscriptions + subscription_changes + payments)]
  SUB & PE --> A[Revenue analytics]
  SUB & PE --> F[Feature engineering\n(cutoff-enforced)]
  F --> M[Logistic Regression\ntrain / evaluate / predict]
  M --> PR[(churn_predictions\nmodel_versions)]
  F --> R[Rules engine]
  PR & R --> RA[(retention_actions + notes)]
  A & PR & RA --> API[FastAPI REST /api/v1]
  API --> UI[React dashboard]
```

## Principles as implemented

* **Raw before derived.** Webhook payloads and product events are persisted first; subscription state is *derived* from an
  append-only `subscription_changes` history (state at time *t* = last row ≤ *t*). All revenue metrics, labels and features are
  computed from that history, so any date can be reconstructed and reprocessing cannot double count.
* **Idempotency everywhere.** Unique constraints: `(org, provider, event_id)` for webhooks, `(org, event_id)` for product events,
  `(org, external_ref)` for payments, `(org, external_*_id)` for customers/subscriptions. Imports and syncs are re-runnable.
* **Ordering.** Provider event time (not arrival time) orders history. A stale event adds a history row at its own timestamp but
  never overwrites the newer current state.
* **Training ≠ serving.** Training runs as a background job (`POST /churn/models/train` → 202). Dashboard requests never train.
  Predictions load a checksum-verified artifact; if it is missing or tampered with, the system falls back to rules-only mode.
* **ML independent of the web layer.** `ml/churn_ml` takes pandas frames and returns pandas/sklearn objects. It has no database or
  FastAPI imports; `backend/app/services/churn` is the only glue.
* **Tenant isolation.** Every table carries `organization_id`; every query filters by the authenticated organization; foreign
  resources return *404* (not 403) so existence is not revealed. Tested in `tests/api/test_tenant_isolation_and_roles.py`.
* **Human in the loop.** Recommendations are `suggested` actions. No outbound customer communication or billing mutation exists.

## Modules ↔ code

| Spec module | Code |
|---|---|
| Authentication & organizations | `app/api/v1/auth.py`, `orgs.py`, `app/api/deps.py` (role matrix) |
| Stripe connector | `app/services/stripe/webhooks.py`, `app/api/v1/stripe_routes.py` |
| Telemetry ingestion | `app/services/telemetry/ingest.py`, `app/api/v1/events.py` |
| Data normalization | `webhooks.parse_subscription`, `services/imports.py`, `churn_ml/subscriptions.py` |
| Revenue analytics | `app/services/revenue/metrics.py`, `app/api/v1/dashboard.py` |
| Feature engineering | `ml/churn_ml/features.py`, `dataset.py`, `labels.py` |
| Churn prediction | `ml/churn_ml/train.py`, `evaluate.py`, `predict.py`; `app/services/churn/service.py` |
| Retention intelligence | `app/services/retention/rules.py`, `service.py`, `app/api/v1/retention.py` |
| Dashboard | `frontend/src/pages/*` |
| Reporting | `app/api/v1/reports.py` |
| Monitoring & audit | `audit_logs`, `webhook_events` status, `/health`, `/health/ready`, request IDs |

## Deviations from the specification (deliberate)

| Spec | Implementation | Why |
|---|---|---|
| `POST /webhooks/stripe` | `POST /webhooks/stripe/{org_id}` | Multi-tenant routing without parsing the payload before verification |
| `POST /events` with user auth | Per-organization **ingest key** header (`X-Ingest-Key`, stored hashed) | Product backends are machines, not users; keys rotate independently |
| Celery + Redis "if required" | FastAPI `BackgroundTasks` | Not needed for this workload; documented path to a queue in deployment.md |
| `MODEL_ARTIFACT_PATH` | `MODEL_ARTIFACT_DIR` | Artifacts are versioned files per organization |
| `ml/src/*.py` | `ml/churn_ml/*.py` importable package | Same module split; importable without path hacks |
| PostgreSQL JSONB | JSON, upgraded to JSONB on PostgreSQL via type variant | Same code runs on SQLite for zero-setup demos |
| Roles incl. *Platform Administrator* | `users.is_platform_admin` flag (acts as owner in any organization) | Platform admin is not an organization-level role |
| Money as fixed-precision decimal | Integer minor units (cents); exact `Decimal` arithmetic for normalization | No floats in financial totals |
