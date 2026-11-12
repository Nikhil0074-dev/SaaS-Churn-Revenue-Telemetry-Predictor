import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api, describeError } from '../api/client'
import type { CustomerDetail } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import ActionCard from '../components/ActionCard'
import { Banner, CHART_COLORS, ChartCard, ErrorState, PriorityTag, ProbabilityBar, RiskBadge, Spinner } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { dateShort, humanize, money, num, pct, relativeDays } from '../lib/format'

interface Subs { subscriptions: { id: number; plan_id: string; status: string; billing_interval: string; recurring_amount_cents: number; currency: string; cancel_at_period_end: boolean }[]
  history: { change_type: string; occurred_at: string; status: string; plan_id: string; amount_cents: number; interval: string; currency: string; reason: string | null }[]
  payments: { status: string; amount_cents: number; currency: string; occurred_at: string }[] }

export default function CustomerDetailPage() {
  const { id } = useParams()
  const { can, me } = useAuth()
  const detail = useApi(() => api.get<CustomerDetail>(`/customers/${id}`), [id])
  const subs = useApi(() => api.get<Subs>(`/customers/${id}/subscriptions`), [id])
  const events = useApi(() => api.get<{ total: number; items: { id: number; event_type: string; event_timestamp: string; properties: Record<string, unknown> | null }[] }>(`/customers/${id}/events`, { page_size: 12 }), [id])
  const preds = useApi(() => api.get<{ probability: number; cutoff: string }[]>(`/customers/${id}/predictions`, { limit: 24 }), [id])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  if (detail.loading) return <Spinner label="Loading customer" />
  if (detail.error || !detail.data) return <ErrorState message={detail.error ?? 'Customer not found'} onRetry={detail.reload} />
  const d = detail.data
  const c = d.customer
  const cur = c.currency ?? 'usd'
  const pred = d.prediction
  const thr = pred?.explanation.thresholds

  async function createFrom(r: CustomerDetail['rule_recommendations'][number]) {
    setBusy(r.action_type); setErr(null)
    try { await api.post('/retention/actions', { customer_id: c.id, action_type: r.action_type, priority: r.priority, reason: r.reason, suggested_step: r.suggested_step }); detail.reload() }
    catch (e) { setErr(describeError(e)) } finally { setBusy(null) }
  }

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-sm"><Link to="/customers" className="text-pine underline-offset-2 hover:underline">← Customers</Link></nav>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold">{c.email ?? c.external_customer_id}</h1>
          <p className="mt-0.5 text-sm text-muted">{c.external_customer_id} · signed up {dateShort(c.signed_up_at)} · last activity {relativeDays(c.last_activity_at)}</p>
        </div>
        <div className="flex items-center gap-3"><RiskBadge risk={c.risk_category} />
          <div className="text-right"><div className="font-serif text-2xl font-semibold">{money(c.mrr_cents, cur)}</div><div className="text-xs text-muted">MRR · {c.plan_id ?? 'no plan'} · {humanize(c.subscription_status)}</div></div></div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <section className="card p-4" aria-label="Churn estimate">
          <h2 className="text-sm font-semibold">Churn estimate</h2>
          {pred ? <>
            <div className="mt-3 flex items-center gap-4"><div className="font-serif text-4xl font-semibold">{pct(pred.probability)}</div>
              <div><ProbabilityBar p={pred.probability} thresholds={thr} /><p className="mt-1 text-xs text-muted">Estimated chance of cancelling within {pred.horizon_days} days. Tick marks show the medium and high thresholds ({pct(thr?.medium ?? 0)} / {pct(thr?.high ?? 0)}).</p></div></div>
            <p className="mt-2 text-xs text-faint">Model {pred.explanation.model_version} · cutoff {dateShort(pred.cutoff)} · generated {dateShort(pred.generated_at)}</p>
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted">Signals associated with higher risk</h3>
            {pred.explanation.indicators.length ? <ul className="mt-2 space-y-1.5">{pred.explanation.indicators.map((i) => <li key={i.feature} className="flex items-center justify-between gap-3 text-sm"><span>{i.label}</span><span className="text-xs tabular-nums text-risk-high">+{i.contribution.toFixed(2)} log-odds</span></li>)}</ul> : <p className="mt-2 text-sm text-muted">No signal stands out above the average customer.</p>}
            {pred.explanation.protective.length > 0 && <><h3 className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted">Signals associated with lower risk</h3>
              <ul className="mt-2 space-y-1.5">{pred.explanation.protective.map((i) => <li key={i.feature} className="flex items-center justify-between gap-3 text-sm"><span>{i.label}</span><span className="text-xs tabular-nums text-risk-low">{i.contribution.toFixed(2)}</span></li>)}</ul></>}
            <p className="mt-4 text-xs text-muted">{pred.explanation.disclaimer} Contributions are relative to the average customer in the training data.</p>
          </> : <p className="mt-2 text-sm text-muted">This customer has no model prediction (not paying at the last cutoff, or no active model). Rule-based signals are shown below.</p>}
        </section>

        <ChartCard title="Churn probability history" description="One point per prediction cutoff." loading={preds.loading} error={preds.error} empty={!preds.data || preds.data.length < 2} emptyTitle="Only one prediction so far" emptyHint="A trend needs at least two prediction cutoffs. Refresh predictions on later days to build the history." height={200}
          table={preds.data ? { columns: ['Cutoff', 'Probability'], rows: preds.data.map((p) => [dateShort(p.cutoff), pct(p.probability)]) } : undefined}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={[...(preds.data ?? [])].reverse().map((p) => ({ d: dateShort(p.cutoff), p: p.probability * 100 }))}>
              <CartesianGrid stroke="#E2DED1" vertical={false} /><XAxis dataKey="d" tick={{ fontSize: 10 }} /><YAxis unit="%" tick={{ fontSize: 11 }} width={40} /><Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
              <Line dataKey="p" stroke={CHART_COLORS.red} strokeWidth={2} dot={{ r: 2 }} name="Probability" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <section className="mt-4 card p-4" aria-label="Suggested next steps">
        <h2 className="text-sm font-semibold">Suggested next steps</h2>
        <p className="mt-0.5 text-xs text-muted">Rule-based suggestions for a person to review. Nothing is sent to the customer and no subscription is changed automatically.</p>
        {err && <div role="alert" className="mt-2 text-sm text-risk-high">{err}</div>}
        {d.rule_recommendations.length === 0 ? <p className="mt-3 text-sm text-muted">No rule is triggered for this customer right now.</p> : (
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {d.rule_recommendations.map((r) => (
              <li key={r.action_type} className="rounded-md border border-line p-3">
                <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{humanize(r.action_type)}</span><PriorityTag priority={r.priority} /></div>
                <p className="mt-1 text-sm">{r.suggested_step}</p><p className="mt-1 text-xs text-muted">Because: {r.reason}</p>
                {can('retention:write') && <button className="btn mt-2" disabled={busy === r.action_type || d.actions.some((a) => a.action_type === r.action_type && !['done', 'dismissed'].includes(a.status))} onClick={() => createFrom(r)}>
                  {d.actions.some((a) => a.action_type === r.action_type && !['done', 'dismissed'].includes(a.status)) ? 'Task already exists' : 'Create follow-up task'}</button>}
              </li>))}
          </ul>)}
      </section>

      {d.actions.length > 0 && <section className="mt-4" aria-label="Follow-ups"><h2 className="mb-2 text-sm font-semibold">Follow-up tasks and notes</h2>
        <div className="space-y-3">{d.actions.map((a) => <ActionCard key={a.id} action={a} showCustomer={false} canWrite={can('retention:write')} meId={me?.user.id ?? 0} onChanged={detail.reload} />)}</div></section>}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card" aria-label="Subscription history">
          <header className="border-b border-line px-4 py-3"><h2 className="text-sm font-semibold">Subscription timeline</h2></header>
          {subs.loading ? <Spinner /> : subs.error ? <ErrorState message={subs.error} /> : <ol className="max-h-80 divide-y divide-line/70 overflow-auto">
            {subs.data?.history.map((h, i) => <li key={i} className="flex items-center justify-between gap-3 px-4 py-2 text-sm"><span><span className="font-medium">{humanize(h.change_type)}</span> <span className="text-muted">→ {humanize(h.status)} · {h.plan_id}</span></span>
              <span className="whitespace-nowrap text-xs text-muted">{money(h.amount_cents, h.currency)}/{h.interval} · {dateShort(h.occurred_at)}</span></li>)}</ol>}
        </section>
        <section className="card" aria-label="Billing history">
          <header className="border-b border-line px-4 py-3"><h2 className="text-sm font-semibold">Billing events</h2></header>
          {subs.loading ? <Spinner /> : !subs.data?.payments.length ? <p className="p-4 text-sm text-muted">No payment events recorded.</p> : <ol className="max-h-80 divide-y divide-line/70 overflow-auto">
            {subs.data.payments.map((p, i) => <li key={i} className="flex items-center justify-between px-4 py-2 text-sm"><span className={p.status === 'failed' ? 'font-medium text-risk-high' : ''}>{p.status === 'failed' ? 'Payment failed' : 'Payment succeeded'}</span>
              <span className="text-xs text-muted">{money(p.amount_cents, p.currency)} · {dateShort(p.occurred_at)}</span></li>)}</ol>}
        </section>
        <section className="card" aria-label="Recent activity">
          <header className="border-b border-line px-4 py-3"><h2 className="text-sm font-semibold">Recent product activity</h2><p className="text-xs text-muted">{events.data ? `${num(events.data.total)} events total` : ''}</p></header>
          {events.loading ? <Spinner /> : !events.data?.items.length ? <p className="p-4 text-sm text-muted">No activity recorded.</p> : <ol className="divide-y divide-line/70">
            {events.data.items.map((e) => <li key={e.id} className="flex items-center justify-between px-4 py-2 text-sm"><span>{humanize(e.event_type)}{e.properties && 'feature' in e.properties ? <span className="text-muted"> · {String(e.properties.feature)}</span> : null}</span><span className="text-xs text-muted">{dateShort(e.event_timestamp)}</span></li>)}</ol>}
        </section>
        <section className="card p-4" aria-label="Current signals">
          <h2 className="text-sm font-semibold">Current signals</h2>
          {d.signals ? <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            {([['Sessions (30d)', 'sessions_30'], ['Sessions (prior 30d)', 'sessions_prev_30'], ['Active days (30d)', 'active_days_30'], ['Days since activity', 'days_since_last_activity'], ['Features used (60d)', 'feature_adoption_count'], ['Failed payments (30d)', 'payment_failures_30'], ['Account age (days)', 'subscription_tenure_days']] as const).map(([l, k]) =>
              <div key={k} className="flex justify-between border-b border-line/60 py-1"><dt className="text-muted">{l}</dt><dd className="tabular-nums">{Number(d.signals?.[k]).toFixed(0)}</dd></div>)}
            <div className="flex justify-between border-b border-line/60 py-1"><dt className="text-muted">Onboarding</dt><dd>{Number(d.signals.onboarding_completed) ? 'Completed' : 'Not completed'}</dd></div>
          </dl> : <p className="mt-2 text-sm text-muted">No signal snapshot yet. Run predictions from the Churn risk page.</p>}
          {d.signals && <Banner>Signals as of {dateShort(String(d.signals.as_of))}. They describe the past; they do not prove future behavior.</Banner>}
        </section>
      </div>
    </>
  )
}
