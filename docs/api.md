# API reference

Authoritative, machine-readable schema: [`openapi.json`](openapi.json) (regenerate with `python scripts/export_openapi.py`). Interactive docs at `/docs` when the API runs outside production.

Base path `/api/v1`. JSON in/out. Authentication: `Authorization: Bearer <token>` (from login/register). Telemetry uses `X-Ingest-Key`.

## Conventions

* **Errors** always look like `{"error": {"code": "...", "message": "...", "details": [...] | null}}`. Codes: `validation_error` (422, `details` = `[{field, message}]`),
  `unauthenticated`/`invalid_token` (401), `forbidden` (403), `not_found` (404 — also for other organizations' resources), `rate_limited` (429), `internal_error` (500, no stack trace).
* **Pagination:** `page` (1-based) and `page_size` (max 200) → `{total, page, page_size, items}`.
* **Dates:** `start`/`end` are inclusive ISO dates (`YYYY-MM-DD`). Timestamps are ISO-8601 UTC. Money is integer cents with a `currency` field.
* **Roles:** `viewer` read · `csm` + retention write, exports · `analyst` + predictions, imports, exports · `owner` + training, settings, integrations, audit, deletes.

## Endpoints

| Method & path | Role | Notes |
|---|---|---|
| `POST /auth/register` | public | Creates user + organization (owner) |
| `POST /auth/login` · `POST /auth/logout` · `GET /auth/me` | public / any | Login limited to 10 attempts/min per IP+email; logout revokes the token server-side |
| `POST /auth/password-reset/request` · `/confirm` | public | Always 202; dev environments return the token (no email service is bundled) |
| `GET/PATCH /orgs/current` | read / owner | Name, currency, horizon (7–180), threshold mode/fixed thresholds |
| `POST /orgs/current/ingest-key` | owner | Returns the key **once**; rotating invalidates the old key |
| `GET/POST /orgs/current/members` · `PATCH/DELETE /orgs/current/members/{user_id}` | read / owner | Last owner cannot be demoted/removed |
| `GET /audit-logs` | owner | |
| `POST /imports/{customers\|subscriptions\|events\|payments}` | analyst | multipart `file`, ≤ 25 MB, idempotent |
| `GET /dashboard/summary` | read | `start`,`end`; KPIs, previous period, movement, risk, definitions, warnings |
| `GET /dashboard/revenue` · `/cohorts` · `/churn` | read | Monthly series, plan revenue, cohorts, risk analytics |
| `GET /customers` | read | `q, risk, plan, status, sort, order, page, page_size` |
| `GET /customers/{id}` · `/events` · `/predictions` · `/subscriptions` · `GET /customers/filters` | read | Detail includes prediction + explanation + rule recommendations + actions |
| `POST /events` | ingest key | One event or `{"events": [...]}` (≤ 500), returns accepted/duplicate per event; 600 requests/min/key by default |
| `GET /events` | read | Filter by `customer_id`, `event_type`, `since` |
| `POST /webhooks/stripe/{org_id}` | Stripe signature | 400 on invalid signature; `{"status": "received"\|"duplicate"\|"retrying"}`; processing continues in the background |
| `GET /integrations/stripe/status` · `POST /integrations/stripe/sync` | read / owner | Status shows event counts and recent failures |
| `GET /churn/summary` · `/high-risk` · `/predictions` | read | `mode` is `model` or `rules_only` |
| `POST /churn/predictions/run` | analyst | Scores eligible customers at today's cutoff; `?recommend=false` skips suggestion generation |
| `GET /churn/models` · `/models/{id}/evaluation` | read | Full metrics JSON incl. baselines, calibration, ablation |
| `POST /churn/models/train` · `POST /churn/models/{id}/activate` | owner | Training is a background job (202); 409 if one is already running |
| `GET /retention/actions` · `/summary` · `/actions/{id}` | read | Filters: `status` (comma list), `assigned_user_id`, `mine`, `customer_id`, `priority`, `overdue` |
| `POST /retention/recommendations/generate` | csm | Rules-based, deduplicated, never contacts customers |
| `POST /retention/actions` · `PATCH /retention/actions/{id}` · `POST /retention/actions/{id}/notes` | csm | Completing requires an outcome; invalid transitions → 409 |
| `DELETE /retention/actions/{id}` | owner | Audit-logged |
| `GET /reports/{revenue\|churn\|retention\|customers\|predictions}` | csm | `format=json\|csv`, `start`, `end` |
| `POST /reports/export` | csm | `{report, start?, end?}` → CSV |
| `GET /health` · `GET /health/ready` | public | Liveness / database + artifact-directory readiness |

## Examples

```bash
TOKEN=$(curl -s localhost:8000/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"owner@example.com","password":"DemoPass2026!"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
curl -s localhost:8000/api/v1/churn/high-risk?page_size=3 -H "Authorization: Bearer $TOKEN"

# telemetry (key from Settings or POST /orgs/current/ingest-key)
curl -s localhost:8000/api/v1/events -H "X-Ingest-Key: $KEY" -H 'content-type: application/json' \
  -d '{"event_id":"e1","customer_id":"cus_1","event_type":"login","timestamp":"2026-10-30T10:00:00Z"}'
```
