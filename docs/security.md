# Security and privacy

## Controls implemented (and where they are tested)

| Concern | Control | Test |
|---|---|---|
| Authentication | bcrypt password hashes; password policy (≥10 chars, mixed case, digit); JWT with `jti`; **server-side revocation** on logout; reset tokens single-use and purpose-bound (an access token cannot reset a password); generic login errors (no account enumeration); login rate limit | `tests/api/test_auth.py` |
| Authorization | Role→permission matrix enforced per endpoint; roles re-read from the database on every request (demotion/removal is immediate) | `test_tenant_isolation_and_roles.py` |
| Tenant isolation | Every query filtered by `organization_id`; other organizations' resources → 404; assignees must belong to the organization; model/action/customer endpoints probed across organizations | same file |
| Stripe webhooks | Official `stripe` signature verification on the raw body, 5-minute tolerance, invalid → 400 and nothing stored; unique event ids; no raw payload in logs; stored payloads purgeable | `test_stripe_webhook.py` |
| Secrets | Environment only; never sent to the browser; production refuses weak `JWT_SECRET`; upstream Stripe errors are not echoed to clients | `test_security*`, `test_sync_surfaces_upstream_failure_safely` |
| Ingestion | Ingest keys stored as SHA-256, shown once, rotatable; strict schema (`extra=forbid`), size/time limits, rate limit | `test_events_customers.py` |
| Injection | SQLAlchemy parameterization (SQL-injection payloads tested inert); React escaping; **CSV formula injection** neutralized on export | `test_sql_injection_attempts_are_inert`, `test_csv_export_neutralizes_formula_injection` |
| Model artifacts | joblib is pickle: files are loaded only after SHA-256 match with the database record; tampering → rules-only mode | `test_corrupted_artifact_falls_back…` |
| Errors | Uniform format; 500s hide stack traces (logged server-side only) | `test_consistent_error_format_and_no_stack_leak` |
| Transport/headers | CORS allow-list; `nosniff`, `no-store`; nginx adds CSP, frame denial, referrer policy; HTTPS is the proxy's responsibility | `test_cors…`, `test_health_and_security_headers` |
| Audit | Imports, exports, role changes, key rotation, training, predictions, deletions | `test_auth.py`, retention tests |
| Payment data | No card data is ever received or stored (only amounts, status and ids) | by design |

## Privacy

* **Data minimization:** telemetry is identifiers + event type + optional small `properties`. Customer email is optional. Predictions use behavioral/billing features only;
  no demographic or other sensitive attributes, and monetary value is not a model feature.
* **Access:** customer-level risk is visible to authenticated members of that organization; exports require `csm`+ and are audit-logged.
* **Retention/deletion:** `purge_payloads` removes stored Stripe payloads after N days. Per-customer erasure is **not** exposed in the UI/API yet (deleting a `customers` row cascades to its
  subscriptions, events, payments, features, predictions and actions at the database level — wire this to an authenticated endpoint before processing data subject to erasure requests).
* **Demo vs. real data:** demo workspaces are flagged (`is_demo`), every demo screen carries a banner, models trained on them are marked `is_synthetic`, and demo emails use the reserved `.invalid` TLD.
* **Governance:** predictions must not be the sole basis for punitive treatment; the UI states they are estimates and shows model version and cutoff.

## Known gaps (see also known-limitations.md)

No MFA/SSO; no email delivery; the JWT lives in `sessionStorage` (XSS would expose it — the CSP in the nginx config mitigates, an httpOnly-cookie session would be stronger);
in-memory rate limiting is per process; no automated dependency scanning is configured; no penetration test has been performed.
