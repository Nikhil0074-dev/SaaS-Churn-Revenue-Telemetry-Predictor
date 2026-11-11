# Competitive analysis — status

**Not performed.** The specification requires market research before finalizing differentiators and forbids claiming the product is "first" or "only" without it.
No market research was carried out for this build, so this repository makes **no comparative claims** about other products.

## Framework to complete before positioning the product

Categories to survey: subscription billing analytics, customer-success platforms, product analytics, revenue-operations dashboards, churn-prediction tools, general BI.

| Criterion | What to record per product |
|---|---|
| Billing integration | Which billing systems, sync vs. webhook, history depth |
| Product-event ingestion | SDK/API, schema flexibility, identity resolution |
| Predictive churn | Method disclosed? Probabilities or opaque health score? Evaluation shown to the customer? |
| Explainability | Per-account drivers, caveats about causality |
| Revenue reporting | MRR/NRR/cohorts, metric definitions published? |
| Retention workflow | Tasks, outcomes, assignments, human approval |
| Deployment complexity & data requirements | Self-host vs. SaaS, minimum data volume |
| Pricing | Public list prices at the time of research, with date and source |

A *hypothesis* (not a finding) about differentiation, to test during that research: a small, self-hostable workflow that keeps billing, telemetry, an auditable and documented model, and
retention tracking in one place with the metric definitions and evaluation visible to the user.
