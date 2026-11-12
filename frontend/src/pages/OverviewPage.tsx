import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api/client'
import type { CohortRow, HighRiskRow, Page, RevenueResp, Summary } from '../api/types'
import RiskLedger from '../components/RiskLedger'
import { Banner, CHART_COLORS, ChartCard, ErrorState, KpiCard, PageHeader, Spinner } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { money, monthLabel, num, pct } from '../lib/format'

const PERIODS = [{ label: 'Last 30 days', days: 30 }, { label: 'Last 90 days', days: 90 }, { label: 'Last 12 months', days: 365 }]

function isoDate(d: Date) { return d.toISOString().slice(0, 10) }

export default function OverviewPage() {
  const [days, setDays] = useState(30)
  const range = useMemo(() => { const end = new Date(); const start = new Date(end.getTime() - (days - 1) * 86_400_000); return { start: isoDate(start), end: isoDate(end) } }, [days])
  const summary = useApi(() => api.get<Summary>('/dashboard/summary', range), [range.start, range.end])
  const revenue = useApi(() => api.get<RevenueResp>('/dashboard/revenue', { months: 12 }), [])
  const cohorts = useApi(() => api.get<{ cohorts: CohortRow[] }>('/dashboard/cohorts'), [])
  const risky = useApi(() => api.get<Page<HighRiskRow>>('/churn/high-risk', { page_size: 8 }), [])
  const s = summary.data
  const cur = s?.currency ?? 'usd'
  const m = s?.metrics

  return (
    <>
      <PageHeader title="Revenue overview" subtitle={s ? `Period ${s.period.start.slice(0, 10)} to ${s.period.end.slice(0, 10)} (end exclusive) · reporting currency ${cur.toUpperCase()}` : 'Recurring revenue, churn and risk at a glance'}
        actions={<><label className="label" htmlFor="period">Period</label>
          <select id="period" className="input" value={days} onChange={(e) => setDays(Number(e.target.value))}>{PERIODS.map((p) => <option key={p.days} value={p.days}>{p.label}</option>)}</select></>} />

      <div className="mb-4 space-y-2">{s?.warnings.map((w) => <Banner key={w.code} tone={w.code === 'demo_data' ? 'demo' : 'warn'}>{w.message}</Banner>)}</div>

      {summary.error ? <ErrorState message={summary.error} onRetry={summary.reload} /> : !s || !m ? <Spinner label="Loading metrics" /> : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="MRR" value={money(m.mrr_end_cents, cur)} definition={s.definitions.mrr}
            sub={<>{m.mrr_end_cents >= s.previous_period.mrr_end_cents ? '▲' : '▼'} {money(Math.abs(m.mrr_end_cents - s.previous_period.mrr_end_cents), cur)} vs previous period</>} />
          <KpiCard label="ARR" value={money(m.arr_end_cents, cur, true)} definition={s.definitions.arr} sub="MRR × 12" />
          <KpiCard label="Active customers" value={num(m.customers_end)} definition={s.definitions.active_customers} sub={`${m.new_customers} new · ${m.churned_customers} churned`} />
          <KpiCard label="Customer churn" value={pct(m.customer_churn_rate)} definition={s.definitions.customer_churn_rate} sub={m.customers_start ? `${m.churned_customers} of ${m.customers_start} at period start` : 'No baseline customers'} />
          <KpiCard label="Revenue churn" value={pct(m.gross_revenue_churn_rate)} definition={s.definitions.revenue_churn} sub={`${money(m.churned_mrr_cents, cur)} cancelled · ${money(m.contraction_mrr_cents, cur)} downgraded`} />
          <KpiCard label="Net revenue retention" value={pct(m.net_revenue_retention)} definition={s.definitions.nrr} sub={`${money(m.expansion_mrr_cents, cur)} expansion`} />
          <KpiCard label="Failed payments" value={num(m.payment_failures)} definition={s.definitions.payment_failure_rate} sub={`${pct(m.payment_failure_rate)} of ${num(m.payment_attempts)} attempts`} />
          <KpiCard label="High-risk accounts" value={num(s.risk.high_risk_customers)} tone="risk" definition={s.definitions.high_risk}
            sub={<>≈ {money(s.risk.revenue_at_risk_cents, cur)} expected MRR at risk <span className="text-faint">(estimate)</span></>} />
        </div>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <ChartCard title="MRR trend" description="Month-end MRR for the last 12 months. The latest point may be a partial month." loading={revenue.loading} error={revenue.error} empty={!revenue.data?.series.some((p) => p.mrr_cents > 0)}
          table={revenue.data && { columns: ['Month', 'MRR', 'Customers'], rows: revenue.data.series.map((p) => [monthLabel(p.month), money(p.mrr_cents, cur), p.customers]) }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={revenue.data?.series.map((p) => ({ month: monthLabel(p.month), mrr: p.mrr_cents / 100 }))} margin={{ left: 4, right: 12, top: 8 }}>
              <CartesianGrid stroke="#E2DED1" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#8B958F" />
              <YAxis tick={{ fontSize: 11 }} stroke="#8B958F" tickFormatter={(v) => money(v * 100, cur, true)} width={64} />
              <Tooltip formatter={(v: number) => money(v * 100, cur)} />
              <Area type="monotone" dataKey="mrr" name="MRR" stroke={CHART_COLORS.pine} fill="#DCEBE8" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="New versus churned customers" description="Customers gained and lost per month." loading={revenue.loading} error={revenue.error} empty={!revenue.data?.series.length}
          table={revenue.data && { columns: ['Month', 'New', 'Churned', 'Churn rate'], rows: revenue.data.series.map((p) => [monthLabel(p.month), p.new_customers, p.churned_customers, pct(p.customer_churn_rate)]) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={revenue.data?.series.map((p) => ({ month: monthLabel(p.month), New: p.new_customers, Churned: p.churned_customers }))} margin={{ left: 0, right: 12, top: 8 }}>
              <CartesianGrid stroke="#E2DED1" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#8B958F" /><YAxis tick={{ fontSize: 11 }} stroke="#8B958F" width={36} allowDecimals={false} />
              <Tooltip /><Legend />
              <Bar dataKey="New" fill={CHART_COLORS.pine} radius={[2, 2, 0, 0]} /><Bar dataKey="Churned" fill={CHART_COLORS.red} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Revenue by plan" description="Current MRR by plan." loading={revenue.loading} error={revenue.error} empty={!revenue.data?.by_plan.length}
          table={revenue.data && { columns: ['Plan', 'Customers', 'MRR'], rows: revenue.data.by_plan.map((p) => [p.plan_id, p.customers, money(p.mrr_cents, cur)]) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart layout="vertical" data={revenue.data?.by_plan.map((p) => ({ plan: p.plan_id, mrr: p.mrr_cents / 100 }))} margin={{ left: 12, right: 24 }}>
              <CartesianGrid stroke="#E2DED1" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} stroke="#8B958F" tickFormatter={(v) => money(v * 100, cur, true)} />
              <YAxis type="category" dataKey="plan" tick={{ fontSize: 12 }} stroke="#8B958F" width={70} />
              <Tooltip formatter={(v: number) => money(v * 100, cur)} />
              <Bar dataKey="mrr" name="MRR" fill={CHART_COLORS.pine} radius={[0, 2, 2, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <section className="card" aria-label="Cohort retention">
          <header className="border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold">Cohort retention</h2>
            <p className="mt-0.5 text-xs text-muted">Share of each signup-month cohort still paying at the end of month 0, 1, 2… (last value may be to-date).</p>
          </header>
          <div className="overflow-x-auto p-3">
            {cohorts.loading ? <Spinner /> : cohorts.error ? <ErrorState message={cohorts.error} /> : !cohorts.data?.cohorts.length ? <p className="p-4 text-sm text-muted">No cohorts yet.</p> : (
              <table className="text-xs">
                <thead><tr><th scope="col" className="th">Cohort</th><th scope="col" className="th text-right">Size</th>{Array.from({ length: 7 }, (_, i) => <th key={i} scope="col" className="th text-right">M{i}</th>)}</tr></thead>
                <tbody>
                  {cohorts.data.cohorts.slice(-8).map((c) => (
                    <tr key={c.cohort}>
                      <td className="td font-medium">{monthLabel(c.cohort)}</td><td className="td text-right tabular-nums">{c.size}</td>
                      {Array.from({ length: 7 }, (_, i) => {
                        const v = c.retention[i]
                        return <td key={i} className="td text-right tabular-nums" style={v === undefined ? undefined : { backgroundColor: `rgba(14,92,84,${0.08 + v * 0.45})` }}>{v === undefined ? '' : `${Math.round(v * 100)}%`}</td>
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>

      <section className="card mt-5" aria-label="Highest-risk accounts">
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <div><h2 className="text-sm font-semibold">Highest-risk accounts</h2>
            <p className="mt-0.5 text-xs text-muted">Ranked by estimated churn probability over the next {30} days. Estimates, not certainties.</p></div>
          <Link to="/churn" className="text-sm font-medium text-pine underline-offset-2 hover:underline">All at-risk accounts →</Link>
        </header>
        {risky.loading ? <Spinner /> : risky.error ? <ErrorState message={risky.error} onRetry={risky.reload} /> : <RiskLedger compact rows={risky.data?.items ?? []} thresholds={s?.risk.thresholds} />}
      </section>
    </>
  )
}
