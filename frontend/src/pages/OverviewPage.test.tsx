import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, vi } from 'vitest'
import { renderAt } from '../test/utils'
import OverviewPage from './OverviewPage'

const get = vi.fn()
vi.mock('../api/client', async (orig) => ({ ...(await orig<typeof import('../api/client')>()), api: { get: (...a: unknown[]) => get(...a) } }))

const metrics = { currency: 'usd', mrr_start_cents: 8000000, mrr_end_cents: 8500000, arr_end_cents: 102000000, customers_start: 100, customers_end: 104, churned_customers: 6, new_customers: 10,
  customer_churn_rate: 0.06, churned_mrr_cents: 400000, contraction_mrr_cents: 100000, expansion_mrr_cents: 200000, new_mrr_cents: 300000, gross_revenue_churn_rate: 0.0625, net_revenue_retention: 0.9625,
  payment_failures: 3, payment_attempts: 60, payment_failure_rate: 0.05, customer_growth: 4, excluded_currencies: {} }
const summary = { period: { start: '2026-10-01T00:00:00+00:00', end: '2026-10-31T00:00:00+00:00' }, currency: 'usd', metrics,
  previous_period: { mrr_end_cents: 8400000, customers_end: 100, customer_churn_rate: 0.05 }, movement: { new_subscriptions: 10, cancellations: 6, upgrades: 1, downgrades: 2, scheduled_cancellations: 3 },
  risk: { high_risk_customers: 12, scored_customers: 100, revenue_at_risk_cents: 250000, thresholds: { medium: 0.05, high: 0.1, source: 'model' }, model_version: 'lr-1' },
  definitions: { mrr: 'MRR def', arr: 'ARR def', active_customers: 'AC', customer_churn_rate: 'CCR', revenue_churn: 'RC', nrr: 'NRR', payment_failure_rate: 'PFR', high_risk: 'HR' },
  warnings: [{ code: 'demo_data', message: 'This workspace contains synthetic demonstration data.' }] }

function route(overrides: Record<string, unknown> = {}) {
  get.mockImplementation((path: string) => {
    if (path in overrides) { const v = overrides[path]; return v instanceof Error ? Promise.reject(v) : Promise.resolve(v) }
    if (path === '/dashboard/summary') return Promise.resolve(summary)
    if (path === '/dashboard/revenue') return Promise.resolve({ currency: 'usd', series: [{ month: '2026-09', mrr_cents: 8400000, new_customers: 9, churned_customers: 5, customers: 100, customer_churn_rate: 0.05, partial: false }], by_plan: [{ plan_id: 'growth', customers: 40, mrr_cents: 4000000 }] })
    if (path === '/dashboard/cohorts') return Promise.resolve({ cohorts: [{ cohort: '2026-08', size: 20, retention: [1, 0.9], mrr_cents: [1, 1], last_point_partial: false }] })
    if (path === '/churn/high-risk') return Promise.resolve({ total: 1, page: 1, page_size: 8, items: [{ id: 1, external_customer_id: 'cus_1', email: 'risky@x.example.com', plan_id: 'growth', mrr_cents: 9900, currency: 'usd', last_activity_at: null, churn_probability: 0.42, risk_category: 'high', indicators: ['No meaningful activity for 40 days'], expected_revenue_at_risk_cents: 4158, assigned_to: null, next_action: null, next_action_status: null }] })
    return Promise.reject(new Error('unexpected ' + String(path)))
  })
}

beforeEach(() => { get.mockReset() })

describe('OverviewPage', () => {
  it('renders KPI cards from API data with documented definitions', async () => {
    route()
    renderAt(<OverviewPage />)
    expect(await screen.findByText('$85,000')).toBeInTheDocument()
    expect(screen.getByText('6.0%')).toBeInTheDocument()
    expect(screen.getByText('96.3%')).toBeInTheDocument()
    expect(screen.getAllByTestId('kpi')).toHaveLength(8)
    expect(screen.getByRole('button', { name: /definition of mrr/i })).toBeInTheDocument()
    expect(screen.getByText(/synthetic demonstration data/i)).toBeInTheDocument()
    expect(screen.getByText('risky@x.example.com')).toBeInTheDocument()
    expect(screen.getByText(/\(estimate\)/)).toBeInTheDocument()
  })

  it('requests the selected period', async () => {
    route()
    renderAt(<OverviewPage />)
    await screen.findByText('$85,000')
    await userEvent.selectOptions(screen.getByLabelText('Period'), '90')
    const calls = get.mock.calls.filter((c) => c[0] === '/dashboard/summary')
    const first = calls[0][1], last = calls[calls.length - 1][1]
    expect(new Date(last.end).getTime() - new Date(last.start).getTime()).toBe(89 * 86_400_000)
    expect(new Date(first.end).getTime() - new Date(first.start).getTime()).toBe(29 * 86_400_000)
  })

  it('shows data-gap warnings and never fabricates numbers when there is no data', async () => {
    route({ '/dashboard/summary': { ...summary, warnings: [{ code: 'no_data', message: 'No subscription data yet.' }],
      metrics: { ...metrics, mrr_end_cents: 0, arr_end_cents: 0, customers_end: 0, customer_churn_rate: null, gross_revenue_churn_rate: null, net_revenue_retention: null, payment_failure_rate: null, payment_failures: 0, payment_attempts: 0 } },
      '/dashboard/revenue': { currency: 'usd', series: [], by_plan: [] }, '/dashboard/cohorts': { cohorts: [] }, '/churn/high-risk': { total: 0, page: 1, page_size: 8, items: [] } })
    renderAt(<OverviewPage />)
    expect(await screen.findByText('No subscription data yet.')).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3)
    expect(screen.getAllByText(/no data for this view yet/i).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(/no accounts in this risk group/i)).toBeInTheDocument()
  })

  it('shows an error with retry when the summary fails', async () => {
    route({ '/dashboard/summary': new Error('network') })
    renderAt(<OverviewPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach the server/i)
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
