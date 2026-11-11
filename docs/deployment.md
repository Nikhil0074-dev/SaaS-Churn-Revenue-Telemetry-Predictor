# Deployment, configuration and Stripe

> **What was executed vs. documented.** Verified in development: the full test suite on SQLite **and on PostgreSQL 16**, Alembic
> `upgrade → downgrade → upgrade → check` on both, the production frontend build served by `vite preview` against a live API, and the browser E2E.
> **Not executed here:** the Docker images / `docker-compose.yml` (no Docker daemon was available), the Windows PowerShell script, a real Stripe
> account (tests use signed fixtures and a fake Stripe client), and any cloud host. Treat those as reviewed templates and run them once before relying on them.

## Environment variables

See [`.env.example`](../.env.example) (every variable, with placeholders). Secrets belong in environment variables or a secret manager — never in the frontend or the repo.

| Variable | Required | Meaning |
|---|---|---|
| `APP_ENV` | no | `production` enforces `JWT_SECRET` ≥ 32 chars, hides `/docs`, never returns reset tokens |
| `DATABASE_URL` | no | SQLite default; PostgreSQL: `postgresql+psycopg://user:pw@host:5432/db` |
| `JWT_SECRET` | prod | Signs sessions |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | for Stripe | Prefer a *restricted* key with read access to customers, subscriptions, invoices |
| `MODEL_ARTIFACT_DIR` | no | Where model files are written (persist this volume!) |
| `CORS_ORIGINS` | no | Comma-separated browser origins |
| `*_RATE_LIMIT_PER_MINUTE` | no | Ingest / login / heavy-endpoint limits |

## Local development

* **SQLite, no Docker:** see the README quick start. **Windows:** [windows-setup.md](windows-setup.md).
* **Docker Compose (PostgreSQL):** `docker compose up --build`; UI http://localhost:8080, API http://localhost:8000. Demo data: `docker compose run --rm seed`.
* Migrations: `cd backend && alembic upgrade head` (the container runs this at start). New change: `alembic revision --autogenerate -m "..."`, review the file, commit it.
  `tests/integration/test_migrations.py` fails if models and migrations drift.

## Stripe

1. Use **test mode**. Create a restricted key (read: Customers, Subscriptions, Invoices) → `STRIPE_SECRET_KEY`.
2. Webhook endpoint (Dashboard → Developers → Webhooks): `https://<your-host>/api/v1/webhooks/stripe/<ORG_ID>` (the exact path is shown in **Settings → Stripe**).
   Select only: `customer.created`, `customer.updated`, `customer.subscription.created|updated|deleted`, `invoice.payment_failed`, `invoice.payment_succeeded`, `invoice.paid`.
   Copy the signing secret → `STRIPE_WEBHOOK_SECRET`.
3. Local testing with the Stripe CLI: `stripe listen --forward-to localhost:8000/api/v1/webhooks/stripe/1` (it prints a `whsec_…` for local use), then `stripe trigger customer.subscription.created`.
4. Backfill existing data once: **Settings → Sync from Stripe** (history before the first sync is unknown: subscriptions are recorded from their Stripe start date with their current state).
5. Verify: Settings shows event counts; failed events list their error. Stripe retries failed deliveries; a failed event id is reprocessed when redelivered.

One shared webhook secret/API key serves all organizations in this MVP. For true multi-tenant SaaS use per-organization secrets in a secret manager.

## Production checklist

- [ ] `APP_ENV=production`, random `JWT_SECRET`, HTTPS terminated at the proxy (nginx config sets security headers and a CSP).
- [ ] PostgreSQL with backups and a **tested restore**; restricted network access; separate migration user if desired.
- [ ] Persist `MODEL_ARTIFACT_DIR`; protect it like the database (artifacts are derived from customer data).
- [ ] Run **one** API worker, or replace the in-memory rate limiter (`app/core/ratelimit.py`) with Redis before scaling out.
- [ ] Add an email provider for password reset (currently none bundled).
- [ ] Configure log shipping/alerts for: repeated webhook failures (`/integrations/stripe/status`), `/health/ready` failing, stale predictions.
- [ ] Schedule predictions (e.g. daily `POST /churn/predictions/run` with an analyst token or a cron calling the service) and periodic payload purge (`purge_payloads(db, 30)`).
- [ ] Rotate Stripe/JWT secrets if exposure is suspected; rotate ingest keys from Settings.
- [ ] Review [security.md](security.md) and [known-limitations.md](known-limitations.md).
- [ ] Rollback: redeploy the previous image; `alembic downgrade -1` only if the migration is reversible and no new data depends on it.

Hosting costs depend entirely on the provider, data volume and availability needs; no provider's free tier is assumed to suffice for production.

## Scaling notes

Background work uses FastAPI `BackgroundTasks` (in-process). If webhook volume or training time outgrows that, move `webhooks.process_row` and `churn.service.run_training` behind a
queue (Celery/RQ + Redis); both are plain functions taking ids and a session factory, so the change is mechanical. Dashboard endpoints currently recompute from history on each
request (fast at the tested scale: ~450 customers/80k events); add cached aggregates with explicit invalidation when an organization grows beyond tens of thousands of customers.
