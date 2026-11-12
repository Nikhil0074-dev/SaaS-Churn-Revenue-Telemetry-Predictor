import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api, describeError } from '../api/client'
import type { ChurnResp, ChurnSummary, HighRiskRow, Page } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import RiskLedger from '../components/RiskLedger'
import { Banner, CHART_COLORS, ChartCard, ErrorState, KpiCard, PageHeader, Pagination, Spinner } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { money, monthLabel, num, pct } from '../lib/format'

type Tier = 'high' | 'medium'

export default function ChurnPage() {
  const { can } = useAuth()
  const [tier, setTier] = useState<Tier>('high')
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [running, setRunning] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'info' | 'warn'; text: string } | null>(null)
  const summary = useApi(() => api.get<ChurnSummary>('/churn/summary'), [])
  const list = useApi(() => api.get<Page<HighRiskRow>>('/churn/high-risk', { risk: tier, page, page_size: 15, q }), [tier, page, q])
  const analytics = useApi(() => api.get<ChurnResp>('/dashboard/churn'), [])
  const cur = analytics.data?.currency ?? 'usd'
  const s = summary.data

  async function run() {
    setRunning(true); setMsg(null)
    try {
      const r = await api.post<{ mode: string; scored: number; reason: string | null; recommendations?: { created: number } }>('/churn/predictions/run')
      setMsg({ tone: r.mode === 'model' ? 'info' : 'warn', text: r.mode === 'model' ? `Scored ${r.scored} customers. ${r.recommendations?.created ?? 0} new suggestions created.` : (r.reason ?? 'Rules-based mode.') })
      summary.reload(); list.reload(); analytics.reload()
    } catch (e) { setMsg({ tone: 'warn', text: describeError(e) }) } finally { setRunning(false) }
  }

  return (
    <>
      <PageHeader title="Churn risk" subtitle={s ? (s.mode === 'model' ? `Model ${s.model?.model_version} · ${s.model?.horizon_days}-day horizon · thresholds from ${s.thresholds.source === 'model' ? 'validation data' : 'fixed settings'}` : 'No active model: rules-based signals only') : undefined}
        actions={can('predict:run') ? <button className="btn-primary" onClick={run} disabled={running}>{running ? 'Running…' : 'Refresh predictions'}</button> : undefined} />
      <div className="mb-4 space-y-2">
        <Banner>{s?.disclaimer ?? 'Churn probabilities are statistical estimates from historical patterns, not certainties.'}</Banner>
        {s?.mode === 'rules_only' && <Banner tone="warn">A model needs enough labeled history before it can be trained. Until then, accounts are flagged by transparent rules (inactivity, payment failures, onboarding, downgrades). Those flags are not probabilities.</Banner>}
        {msg && <Banner tone={msg.tone}>{msg.text}</Banner>}
      </div>

      {s && (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="High risk" value={num(s.counts.high)} tone="risk" sub={`probability ≥ ${pct(s.thresholds.high)}`} />
          <KpiCard label="Medium risk" value={num(s.counts.medium)} sub={`≥ ${pct(s.thresholds.medium)} and below high`} />
          <KpiCard label="Low risk" value={num(s.counts.low)} />
          <KpiCard label="Not scored" value={num(s.counts.unscored)} sub="Not paying at the last cutoff" />
        </div>
      )}

      <section className="card" aria-label="At-risk accounts">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div role="tablist" aria-label="Risk tier" className="flex gap-1">
            {(['high', 'medium'] as Tier[]).map((t) => (
              <button key={t} role="tab" aria-selected={tier === t} onClick={() => { setTier(t); setPage(1) }}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${tier === t ? 'bg-ink text-white' : 'text-muted hover:bg-paper'}`}>{t === 'high' ? 'High risk' : 'Medium risk'}</button>
            ))}
          </div>
          <div className="flex items-center gap-2"><label className="label" htmlFor="q">Search</label>
            <input id="q" className="input w-56" placeholder="Email or customer id" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} /></div>
        </header>
        {list.loading ? <Spinner /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : <>
          <RiskLedger rows={list.data?.items ?? []} thresholds={s?.thresholds} />
          <Pagination page={page} pageSize={15} total={list.data?.total ?? 0} onPage={setPage} />
        </>}
      </section>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Risk distribution" description="Customers and MRR by risk group." loading={analytics.loading} error={analytics.error} empty={!analytics.data?.distribution.length}
          table={analytics.data && { columns: ['Risk', 'Customers', 'MRR'], rows: analytics.data.distribution.map((d) => [d.risk, d.customers, money(d.mrr_cents, cur)]) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analytics.data?.distribution.map((d) => ({ risk: d.risk, Customers: d.customers }))} margin={{ right: 12, top: 8 }}>
              <CartesianGrid stroke="#E2DED1" vertical={false} /><XAxis dataKey="risk" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 11 }} width={36} allowDecimals={false} /><Tooltip />
              <Bar dataKey="Customers" fill={CHART_COLORS.pine} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Predicted probability distribution" description="How scored customers spread across churn probabilities." loading={analytics.loading} error={analytics.error} empty={!analytics.data?.histogram.length}
          table={analytics.data && { columns: ['From', 'To', 'Customers'], rows: analytics.data.histogram.map((h) => [pct(h.from, 0), pct(h.to, 0), h.customers]) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analytics.data?.histogram.map((h) => ({ bin: `${Math.round(h.from * 100)}–${Math.round(h.to * 100)}%`, Customers: h.customers }))} margin={{ right: 12, top: 8 }}>
              <CartesianGrid stroke="#E2DED1" vertical={false} /><XAxis dataKey="bin" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={50} /><YAxis tick={{ fontSize: 11 }} width={36} allowDecimals={false} /><Tooltip />
              <Bar dataKey="Customers" fill={CHART_COLORS.blue} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Risk by subscription plan" description="Scored customers per plan and risk group." loading={analytics.loading} error={analytics.error} empty={!analytics.data?.by_plan.length}
          table={analytics.data && { columns: ['Plan', 'Low', 'Medium', 'High'], rows: analytics.data.by_plan.map((p) => [p.plan, p.low, p.medium, p.high]) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analytics.data?.by_plan} margin={{ right: 12, top: 8 }}>
              <CartesianGrid stroke="#E2DED1" vertical={false} /><XAxis dataKey="plan" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 11 }} width={36} allowDecimals={false} /><Tooltip /><Legend />
              <Bar dataKey="low" name="Low" stackId="a" fill={CHART_COLORS.green} /><Bar dataKey="medium" name="Medium" stackId="a" fill={CHART_COLORS.amber} /><Bar dataKey="high" name="High" stackId="a" fill={CHART_COLORS.red} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Customer churn rate over time" description="Monthly customer churn rate (customers paying at month start that were not at month end)." loading={analytics.loading} error={analytics.error} empty={!analytics.data?.churn_rate_series.length}
          table={analytics.data && { columns: ['Month', 'Churned', 'Rate'], rows: analytics.data.churn_rate_series.map((r) => [monthLabel(r.month), r.churned_customers, pct(r.customer_churn_rate)]) }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={analytics.data?.churn_rate_series.map((r) => ({ month: monthLabel(r.month), rate: r.customer_churn_rate === null ? null : r.customer_churn_rate * 100 }))} margin={{ right: 12, top: 8 }}>
              <CartesianGrid stroke="#E2DED1" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} width={40} unit="%" /><Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
              <Line type="monotone" dataKey="rate" name="Churn rate" stroke={CHART_COLORS.red} strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <section className="card" aria-label="Risk by tenure">
          <header className="border-b border-line px-4 py-3"><h2 className="text-sm font-semibold">Risk by customer tenure</h2></header>
          {analytics.data?.by_tenure.length ? <table><thead><tr><th scope="col" className="th">Tenure</th><th scope="col" className="th text-right">Customers</th><th scope="col" className="th text-right">Avg probability</th><th scope="col" className="th text-right">High risk</th></tr></thead>
            <tbody>{analytics.data.by_tenure.map((r) => <tr key={r.bucket}><td className="td">{r.bucket}</td><td className="td text-right tabular-nums">{r.customers}</td><td className="td text-right tabular-nums">{pct(r.avg_probability)}</td><td className="td text-right tabular-nums">{r.high_risk}</td></tr>)}</tbody></table> : <p className="p-4 text-sm text-muted">No scored customers yet.</p>}
        </section>
        <section className="card" aria-label="Engagement by risk group">
          <header className="border-b border-line px-4 py-3"><h2 className="text-sm font-semibold">Engagement by risk group</h2><p className="mt-0.5 text-xs text-muted">Averages over the last 30 days. Descriptive, not causal.</p></header>
          {analytics.data?.engagement.length ? <table><thead><tr><th scope="col" className="th">Group</th><th scope="col" className="th text-right">Customers</th><th scope="col" className="th text-right">Sessions</th><th scope="col" className="th text-right">Active days</th><th scope="col" className="th text-right">Days idle</th></tr></thead>
            <tbody>{analytics.data.engagement.map((r) => <tr key={r.group}><td className="td">{r.group}</td><td className="td text-right tabular-nums">{r.customers}</td><td className="td text-right tabular-nums">{r.avg_sessions_30d.toFixed(1)}</td><td className="td text-right tabular-nums">{r.avg_active_days_30d.toFixed(1)}</td><td className="td text-right tabular-nums">{r.avg_days_since_activity.toFixed(0)}</td></tr>)}</tbody></table> : <p className="p-4 text-sm text-muted">No scored customers yet.</p>}
        </section>
      </div>
    </>
  )
}
