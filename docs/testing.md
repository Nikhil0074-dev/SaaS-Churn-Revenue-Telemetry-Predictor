# Testing

| Layer | Tool | Count | Location |
|---|---|---|---|
| ML unit/integration | pytest | 26 | `ml/tests/` (labels, leakage, split/embargo, training, calibration, artifacts, explanations) |
| Backend unit | pytest | 48 | `backend/tests/unit/` (revenue math, schemas, security helpers, rules) |
| Backend integration | pytest | 36 | `backend/tests/integration/` (Stripe webhooks & sync, CSV import, Alembic migrations) |
| Backend API | pytest | 61 | `backend/tests/api/` (auth, roles, tenant isolation, telemetry, customers, dashboard, churn lifecycle, retention, reports, errors) |
| Backend end-to-end | pytest | 1 | `backend/tests/test_e2e_workflow.py` (the 11-step workflow of spec §22.7 through the public HTTP API) |
| Frontend | Vitest + Testing Library | 47 | `frontend/src/**/*.test.ts(x)` (formatting, API client, UI states, login, customers, action workflow, overview) |
| Browser E2E | Playwright (Chromium) | 1 script, 12 scenarios | `e2e/ui_e2e.py` (also regenerates `docs/screenshots/`) |

**Recorded results (this build):** 172 Python tests passed (97% line coverage of `backend/app` + `ml/churn_ml`); the same backend suite (146 tests) also passed against
**PostgreSQL 16**; 47 frontend tests passed; `tsc --noEmit` clean; `ruff` clean; browser E2E passed with no console errors.

## Run

```bash
cd backend
python3 -m pytest -q                                          # 172 tests (includes ../ml/tests)
python3 -m pytest -q --cov=app --cov=../ml/churn_ml           # with coverage
python3 -m pytest -q -m "not slow"                            # skip the full e2e workflow
# on PostgreSQL (databases must exist and are DROPPED/recreated by the tests):
TEST_DATABASE_URL=postgresql+psycopg://u:p@localhost/churn_test TEST_DEMO_DATABASE_URL=postgresql+psycopg://u:p@localhost/churn_demo python3 -m pytest -q tests

cd frontend && npm run typecheck && npm test

# browser E2E: seeded API + built UI
python3 scripts/seed_demo_data.py                             # uses DATABASE_URL
(cd backend && python3 -m uvicorn app.main:app_factory --factory --port 8000) &
(cd frontend && npm run build && npx vite preview --port 4173) &
python3 e2e/ui_e2e.py
```

Test design: deterministic fixtures (seeded simulator, signed Stripe payload helper, fake Stripe client), isolated databases per test, no network, no real billing.
The seeded `demo_env` workspace (320 customers, trained model) is shared read-mostly by API tests and built once per session (~15 s).

## What the tests would catch (examples of real defects found by them during development)

* An ARR/MRR rounding mismatch (ARR is now derived from the displayed MRR).
* A month-boundary bug in the monthly series on the last day of a month (exclusive period end landed on the 1st) — found when the date rolled over; regression-tested.
* An empty retention list for the in-progress signup-month cohort.
* An explanation listing *rising* activity as a risk signal (now filtered, regression-tested).
* Prediction-time event window shorter than the training window (made "days since activity" wrong for long-idle customers).

## Not covered / not claimed

* Passing tests do **not** mean the software is bug-free.
* No load/performance testing beyond the ~450-customer, ~80k-event demo (dashboard requests recompute from history on each call).
* No live Stripe traffic: signature handling is tested with locally signed payloads; `Sync` is tested with a fake client. Real API payload shapes were mapped from Stripe's documented objects, not captured from an account.
* Docker images, `docker-compose.yml`, the PowerShell script and cloud deployment were not executed.
* Frontend tests mock the API; the browser E2E exercises the real API but only on Chromium at two viewport sizes. No automated accessibility audit (axe) was run — only semantic roles/labels, table alternatives for charts, and text risk labels were checked.
* Concurrency (e.g. two simultaneous deliveries of the same webhook) relies on database unique constraints; the race path is implemented (`IntegrityError` handling) but exercised sequentially in tests.
