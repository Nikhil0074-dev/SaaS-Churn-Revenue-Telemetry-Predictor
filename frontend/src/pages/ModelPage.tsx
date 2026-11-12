import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api, describeError } from '../api/client'
import type { ChurnSummary, Evaluation, ModelRow } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { Banner, CHART_COLORS, ChartCard, ErrorState, KpiCard, PageHeader, Spinner } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { dateShort, humanize, num, pct } from '../lib/format'

const f3 = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toFixed(3))

export default function ModelPage() {
  const { can } = useAuth()
  const summary = useApi(() => api.get<ChurnSummary>('/churn/summary'), [])
  const models = useApi(() => api.get<ModelRow[]>('/churn/models'), [])
  const activeId = summary.data?.model?.id
  const evalr = useApi(() => (activeId ? api.get<Evaluation>(`/churn/models/${activeId}/evaluation`) : Promise.resolve(null)), [activeId])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function train() {
    setBusy(true); setMsg(null)
    try { await api.post('/churn/models/train', { horizon_days: 30, activate: true }); summary.reload(); models.reload(); setMsg('Training finished. See the model list below.') }
    catch (e) { setMsg(describeError(e)) } finally { setBusy(false) }
  }
  const e = evalr.data?.evaluation
  const m = summary.data?.model

  return (
    <>
      <PageHeader title="Model performance" subtitle="Evaluation on a held-out historical period. This is not a measurement of outcomes for current customers."
        actions={can('model:train') ? <button className="btn-primary" disabled={busy} onClick={train}>{busy ? 'Training…' : 'Train new model'}</button> : undefined} />
      <div className="mb-4 space-y-2">
        {msg && <Banner tone="demo">{msg}</Banner>}
        {evalr.data && <Banner tone={evalr.data.is_synthetic ? 'warn' : 'info'}>{evalr.data.note}</Banner>}
        {summary.data?.mode === 'rules_only' && <Banner tone="warn">No active model. The platform is running in rules-based mode until a model can be trained on enough labeled history.</Banner>}
      </div>

      {summary.loading ? <Spinner /> : summary.error ? <ErrorState message={summary.error} onRetry={summary.reload} /> : m && (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Active model" value={<span className="text-xl">{m.model_version}</span>} sub={`Logistic Regression · trained ${dateShort(m.training_completed_at)}`} />
          <KpiCard label="Prediction horizon" value={`${m.horizon_days} days`} sub="Churn within this window after the cutoff" />
          <KpiCard label="Dataset" value={<span className="text-xl">{m.dataset_version}</span>} sub={e ? `${num(e.dataset.rows)} snapshots · ${num(e.dataset.customers)} customers` : undefined} />
          <KpiCard label="Base churn rate" value={e ? pct(e.dataset.positive_rate) : '—'} sub="Share of snapshots that churned in the horizon" />
        </div>)}

      {e && <>
        <section className="card mb-5 p-4" aria-label="Headline metrics">
          <h2 className="text-sm font-semibold">Held-out test results</h2>
          <p className="mt-0.5 text-xs text-muted">Test period {dateShort(e.split.test.first)} to {dateShort(e.split.test.last)} · {e.split.test.snapshots} snapshots · {e.test.positives} churn examples of {e.test.n} rows · {e.split.embargo_days}-day embargo between train and test.</p>
          <dl className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
            {([['ROC-AUC', e.test.roc_auc], ['PR-AUC', e.test.pr_auc], ['Precision @ high', e.test.precision], ['Recall @ high', e.test.recall], ['F1 @ high', e.test.f1], ['Brier score', e.test.brier], ['Calibration error', e.calibration.ece]] as [string, number][]).map(([k, v]) => (
              <div key={k} className="rounded-md bg-paper p-3"><dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">{k}</dt><dd className="font-serif text-xl font-semibold tabular-nums">{f3(v)}</dd></div>))}
          </dl>
          <p className="mt-3 text-xs text-muted">High-risk threshold {pct(e.thresholds.high)} flags {pct(e.test.flagged_fraction)} of test rows. Accuracy is deliberately not shown: with rare churn it is misleading.</p>
        </section>

        <div className="mb-5 grid gap-4 lg:grid-cols-2">
          <section className="card p-4" aria-label="Baseline comparison">
            <h2 className="text-sm font-semibold">Comparison with baselines</h2>
            <table className="mt-2"><thead><tr><th scope="col" className="th">Approach</th><th scope="col" className="th text-right">ROC-AUC</th><th scope="col" className="th text-right">PR-AUC</th></tr></thead><tbody>
              <tr><td className="td font-medium">Logistic Regression</td><td className="td text-right tabular-nums">{f3(e.test.roc_auc)}</td><td className="td text-right tabular-nums">{f3(e.test.pr_auc)}</td></tr>
              <tr><td className="td">Baseline: days since last activity</td><td className="td text-right tabular-nums">{f3(e.baselines.days_since_last_activity.roc_auc)}</td><td className="td text-right tabular-nums">{f3(e.baselines.days_since_last_activity.pr_auc)}</td></tr>
              <tr><td className="td">Baseline: base rate only</td><td className="td text-right tabular-nums">{f3(e.baselines.prior.roc_auc)}</td><td className="td text-right tabular-nums">{f3(e.baselines.prior.pr_auc)}</td></tr></tbody></table>
            <p className="mt-3 text-sm">{e.comparison.statement}</p>
            <p className="mt-1 text-xs text-muted">Criterion fixed in advance: PR-AUC at least {e.comparison.required_margin} higher than the best baseline, and the 95% customer-clustered bootstrap interval of the difference must exclude zero.</p>
          </section>
          <section className="card p-4" aria-label="Confusion matrix">
            <h2 className="text-sm font-semibold">Confusion matrix at the high-risk threshold</h2>
            <div className="mt-3 grid max-w-sm grid-cols-[auto_1fr_1fr] gap-1 text-center text-sm">
              <span /><span className="text-xs text-muted">Predicted high</span><span className="text-xs text-muted">Predicted not high</span>
              <span className="self-center text-right text-xs text-muted">Churned</span><div className="rounded bg-risk-lowsoft p-3"><div className="font-serif text-xl font-semibold">{e.test.tp}</div><div className="text-xs text-muted">caught</div></div><div className="rounded bg-risk-highsoft p-3"><div className="font-serif text-xl font-semibold">{e.test.fn}</div><div className="text-xs text-muted">missed</div></div>
              <span className="self-center text-right text-xs text-muted">Stayed</span><div className="rounded bg-risk-medsoft p-3"><div className="font-serif text-xl font-semibold">{e.test.fp}</div><div className="text-xs text-muted">unneeded outreach</div></div><div className="rounded bg-paper p-3"><div className="font-serif text-xl font-semibold">{e.test.tn}</div><div className="text-xs text-muted">correctly quiet</div></div>
            </div>
            <p className="mt-3 text-xs text-muted">False-positive rate {pct(e.test.false_positive_rate)} · false-negative rate {pct(e.test.false_negative_rate)}</p>
          </section>
        </div>

        <div className="mb-5 grid gap-4 lg:grid-cols-2">
          <ChartCard title="Calibration" description="Mean predicted probability versus observed churn rate per decile of the test set. Closer to the diagonal is better." table={{ columns: ['Bin', 'Rows', 'Predicted', 'Observed'], rows: e.calibration.bins.map((b: any) => [b.bin + 1, b.n, pct(b.mean_predicted), pct(b.observed_rate)]) }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={e.calibration.bins.map((b: any) => ({ p: b.mean_predicted * 100, o: b.observed_rate * 100, ideal: b.mean_predicted * 100 }))} margin={{ right: 12, top: 8 }}>
                <CartesianGrid stroke="#E2DED1" /><XAxis dataKey="p" type="number" unit="%" tick={{ fontSize: 11 }} name="Predicted" domain={[0, 'auto']} /><YAxis unit="%" tick={{ fontSize: 11 }} width={44} /><Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} /><Legend />
                <Line dataKey="ideal" name="Perfect calibration" stroke="#B5B0A0" strokeDasharray="4 4" dot={false} /><Line dataKey="o" name="Observed rate" stroke={CHART_COLORS.pine} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Which feature groups carry signal (ablation)" description="PR-AUC on the held-out period when training with only some feature groups." table={{ columns: ['Feature set', 'ROC-AUC', 'PR-AUC'], rows: e.ablation.map((a: any) => [a.feature_set, f3(a.roc_auc), f3(a.pr_auc)]) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={e.ablation.map((a: any) => ({ set: a.feature_set, pr: a.pr_auc }))} margin={{ left: 20, right: 20 }}>
                <CartesianGrid stroke="#E2DED1" horizontal={false} /><XAxis type="number" tick={{ fontSize: 11 }} domain={[0, 'auto']} /><YAxis type="category" dataKey="set" width={150} tick={{ fontSize: 11 }} /><Tooltip formatter={(v: number) => v.toFixed(3)} />
                <Bar dataKey="pr" name="PR-AUC" fill={CHART_COLORS.blue} radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <div className="mb-5 grid gap-4 lg:grid-cols-2">
          <section className="card" aria-label="Threshold analysis"><header className="border-b border-line px-4 py-3"><h2 className="text-sm font-semibold">Threshold analysis</h2><p className="text-xs text-muted">What each outreach capacity would have achieved on the test period.</p></header>
            <table><thead><tr><th scope="col" className="th text-right">Flag top</th><th scope="col" className="th text-right">Threshold</th><th scope="col" className="th text-right">Precision</th><th scope="col" className="th text-right">Recall</th></tr></thead><tbody>
              {e.threshold_table.map((r: any) => <tr key={r.target_flagged_fraction}><td className="td text-right tabular-nums">{pct(r.target_flagged_fraction, 0)}</td><td className="td text-right tabular-nums">{pct(r.threshold)}</td><td className="td text-right tabular-nums">{pct(r.precision)}</td><td className="td text-right tabular-nums">{pct(r.recall)}</td></tr>)}</tbody></table>
            <p className="px-4 py-3 text-xs text-muted">Active thresholds: medium {pct(e.thresholds.medium)}, high {pct(e.thresholds.high)}. Basis: {e.thresholds.basis}.</p></section>
          <section className="card" aria-label="Largest coefficients"><header className="border-b border-line px-4 py-3"><h2 className="text-sm font-semibold">Largest coefficients</h2><p className="text-xs text-muted">Standardized log-odds weights. Associations, not causes.</p></header>
            <table><thead><tr><th scope="col" className="th">Feature</th><th scope="col" className="th text-right">Coefficient</th></tr></thead><tbody>
              {e.coefficients.slice(0, 8).map((c: any) => <tr key={c.feature}><td className="td">{humanize(c.feature.split('__')[1])}</td><td className={`td text-right tabular-nums ${c.coefficient > 0 ? 'text-risk-high' : 'text-risk-low'}`}>{c.coefficient > 0 ? '+' : ''}{c.coefficient.toFixed(2)}</td></tr>)}</tbody></table></section>
        </div>

        <section className="card mb-5 p-4" aria-label="Data quality warnings"><h2 className="text-sm font-semibold">Data-quality and method warnings</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">{e.warnings.map((w: string) => <li key={w}>{w}</li>)}</ul></section>
      </>}

      <section className="card" aria-label="Model versions"><header className="border-b border-line px-4 py-3"><h2 className="text-sm font-semibold">Model versions</h2></header>
        {models.loading ? <Spinner /> : models.error ? <ErrorState message={models.error} /> : <table><thead><tr><th scope="col" className="th">Version</th><th scope="col" className="th">Status</th><th scope="col" className="th">Trained</th><th scope="col" className="th text-right">PR-AUC</th><th scope="col" className="th text-right">ROC-AUC</th><th scope="col" className="th">Notes</th></tr></thead><tbody>
          {models.data?.map((r) => <tr key={r.id}><td className="td font-medium">{r.model_version}</td><td className="td">{humanize(r.status)}</td><td className="td text-muted">{dateShort(r.training_completed_at)}</td><td className="td text-right tabular-nums">{f3(r.summary?.pr_auc)}</td><td className="td text-right tabular-nums">{f3(r.summary?.roc_auc)}</td>
            <td className="td text-xs text-muted">{r.error ?? (r.is_synthetic ? 'Synthetic data' : '')}</td></tr>)}</tbody></table>}</section>
    </>
  )
}
