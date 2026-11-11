# Metric definitions and policies

All revenue figures come from `subscription_changes` (state at a point in time), in **integer cents** with exact `Decimal`
normalization. Implementation: `backend/app/services/revenue/metrics.py`; verified against hand-computed fixtures in
`tests/unit/test_revenue_metrics.py`.

## Policy decisions

| Question | Policy |
|---|---|
| Which subscriptions count toward MRR? | Status `active` or `past_due` (still being billed). **Excluded:** `trialing`, `paused`, `unpaid`, `incomplete`, `canceled`. |
| Scheduled cancellation (`cancel_at_period_end`) | Still counts until it actually cancels. It is a *signal*, not churn. |
| Interval normalization | monthly = amount ÷ interval_count; yearly = amount ÷ 12; weekly = amount × 52/12; daily = amount × 365/12. |
| Discounts, taxes, refunds, usage charges | **Not included.** MRR is list recurring amount (unit price × quantity). Apply your own adjustments if needed. |
| Multiple currencies | Only the organization's reporting currency is summed. Other currencies are **excluded and reported** (`excluded_currencies`, dashboard warning). No FX conversion. |
| Rounding | Exact decimal sums, rounded half-up to cents once at the end. ARR = displayed MRR × 12 so the two always reconcile. |
| Period | `[start, end)` in UTC; the API takes inclusive calendar dates and extends `end` to the next midnight. A change exactly at `start` belongs to the period. |

## Metrics

| Metric | Definition |
|---|---|
| **MRR** | Sum of normalized monthly amounts of paying subscriptions at the period end. |
| **ARR** | MRR × 12. |
| **Active customers** | Customers with ≥ 1 paying subscription at the period end. |
| **Customer churn rate** | Customers paying at period start and *not* paying at period end ÷ customers paying at period start. A customer who cancels and resubscribes within the period is **not** churned. A pause counts as not paying. `null` if nobody was paying at the start. |
| **Churned MRR** | Start-of-period MRR of customers counted as churned. |
| **Contraction / Expansion MRR** | For customers paying at both ends: negative / positive change in their MRR. |
| **New MRR / Reactivation MRR** | End MRR of customers not paying at start whose first-ever subscription began in the period / who had earlier subscriptions. |
| **Gross revenue churn rate** | (churned MRR + contraction MRR) ÷ start MRR. Expansion excluded. |
| **Net revenue churn rate** | (churned + contraction − expansion) ÷ start MRR. |
| **Net revenue retention** | (start MRR − churned − contraction + expansion) ÷ start MRR, **only for customers paying at start**. |
| **MRR bridge identity** | start − churned − contraction + expansion + new + reactivation = end (tested, ≤ 2 cents rounding). |
| **Payment failure rate** | failed ÷ (failed + succeeded) payment attempts in the period. Each retry is an attempt. |
| **Cohort retention** | Signup-month cohorts (customers that ever had a paid-status subscription): share still paying at the end of month 0, 1, 2…. The last point of an in-progress month is "to date". |
| **Expected revenue at risk** | Σ (predicted churn probability × customer MRR) over scored customers. **An estimate for prioritization, not a forecast**; ignores contract terms and intervention effects. |

## Churn label (for the model) vs. revenue churn

The label is about the customer *relationship* (see [model-methodology.md](model-methodology.md)): a customer is retained at the end of
the horizon if any subscription is `active`, `past_due`, `trialing` **or `paused`**. The revenue metric treats `paused` as lost MRR
because no money is billed. The two are intentionally different questions.
