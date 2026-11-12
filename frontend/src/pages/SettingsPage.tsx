import { FormEvent, useState } from 'react'
import { api, describeError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Banner, ErrorState, PageHeader, Spinner } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { dateShort, humanize } from '../lib/format'

interface StripeStatus { api_key_configured: boolean; webhook_secret_configured: boolean; mode: string; webhook_url_path: string; events: Record<string, number>; last_event_at: string | null; recent_failures: { event_id: string; type: string; error: string }[] }
interface Member { user_id: number; email: string; full_name: string | null; role: string }
interface Org { id: number; name: string; default_currency: string; settings: Record<string, unknown>; ingest_key_prefix: string | null }
const KINDS = ['customers', 'subscriptions', 'events', 'payments']

export default function SettingsPage() {
  const { can } = useAuth()
  const org = useApi(() => api.get<Org>('/orgs/current'), [])
  const stripe = useApi(() => api.get<StripeStatus>('/integrations/stripe/status'), [])
  const members = useApi(() => api.get<Member[]>('/orgs/current/members'), [])
  const audit = useApi(() => (can('audit:read') ? api.get<{ items: { id: number; action: string; created_at: string; resource_type: string | null }[] }>('/audit-logs', { page_size: 12 }) : Promise.resolve(null)), [])
  const [key, setKey] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tone: 'info' | 'warn'; text: string } | null>(null)
  const [kind, setKind] = useState('customers')
  const [file, setFile] = useState<File | null>(null)
  const [importResult, setImportResult] = useState<string | null>(null)
  const [horizon, setHorizon] = useState<number | ''>('')
  const [mode, setMode] = useState('')
  const [nm, setNm] = useState({ email: '', role: 'csm', password: '' })
  const notify = (tone: 'info' | 'warn', text: string) => setMsg({ tone, text })

  async function rotate() { try { setKey((await api.post<{ ingest_key: string }>('/orgs/current/ingest-key')).ingest_key); org.reload() } catch (e) { notify('warn', describeError(e)) } }
  async function sync() { try { const r = await api.post<{ customers: number; subscriptions: number }>('/integrations/stripe/sync'); notify('info', `Synced ${r.customers} customers and ${r.subscriptions} subscriptions.`); stripe.reload() } catch (e) { notify('warn', describeError(e)) } }
  async function importCsv(e: FormEvent) {
    e.preventDefault(); if (!file) return
    try { const r = await api.upload<{ imported: number; skipped: number; error_count: number; errors: { row: number; message: string }[] }>(`/imports/${kind}`, file)
      setImportResult(`${r.imported} imported, ${r.skipped} skipped, ${r.error_count} row errors.${r.errors.length ? ' First error: row ' + r.errors[0].row + ' — ' + r.errors[0].message : ''}`) } catch (er) { setImportResult(describeError(er)) }
  }
  async function saveSettings(e: FormEvent) {
    e.preventDefault()
    try { await api.patch('/orgs/current', { ...(horizon ? { prediction_horizon_days: Number(horizon) } : {}), ...(mode ? { threshold_mode: mode } : {}) }); notify('info', 'Settings saved.'); org.reload() } catch (er) { notify('warn', describeError(er)) }
  }
  async function addMember(e: FormEvent) {
    e.preventDefault()
    try { await api.post('/orgs/current/members', { email: nm.email, role: nm.role, initial_password: nm.password }); setNm({ email: '', role: 'csm', password: '' }); members.reload(); notify('info', 'Member added.') } catch (er) { notify('warn', describeError(er)) }
  }

  return (
    <>
      <PageHeader title="Settings and integrations" subtitle="Organization configuration, data sources, team and audit trail." />
      {msg && <div className="mb-4"><Banner tone={msg.tone === 'info' ? 'demo' : 'warn'}>{msg.text}</Banner></div>}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4" aria-label="Prediction settings"><h2 className="text-sm font-semibold">Prediction settings</h2>
          {org.loading ? <Spinner /> : org.error ? <ErrorState message={org.error} /> : <form className="mt-3 space-y-3" onSubmit={saveSettings}>
            <p className="text-sm text-muted">{org.data?.name} · reporting currency {org.data?.default_currency.toUpperCase()} · horizon {String(org.data?.settings.prediction_horizon_days ?? 30)} days · thresholds {String(org.data?.settings.threshold_mode ?? 'model')}</p>
            <div className="flex flex-col gap-1"><label className="label" htmlFor="h">Prediction horizon (days)</label><input id="h" type="number" min={7} max={180} className="input w-32" value={horizon} onChange={(e) => setHorizon(e.target.value ? Number(e.target.value) : '')} disabled={!can('org:manage')} /></div>
            <div className="flex flex-col gap-1"><label className="label" htmlFor="m">Risk thresholds</label><select id="m" className="input w-60" value={mode} onChange={(e) => setMode(e.target.value)} disabled={!can('org:manage')}><option value="">Keep current</option><option value="model">From model validation (recommended)</option><option value="fixed">Fixed 30% / 60%</option></select></div>
            <button className="btn-primary" disabled={!can('org:manage')}>Save</button>{!can('org:manage') && <p className="text-xs text-muted">Only owners can change settings.</p>}
          </form>}
        </section>

        <section className="card p-4" aria-label="Stripe integration"><h2 className="text-sm font-semibold">Stripe (test mode recommended)</h2>
          {stripe.loading ? <Spinner /> : stripe.error ? <ErrorState message={stripe.error} /> : stripe.data && <div className="mt-3 space-y-2 text-sm">
            <dl className="grid grid-cols-2 gap-y-1"><dt className="text-muted">API key</dt><dd>{stripe.data.api_key_configured ? `Configured (${stripe.data.mode} mode)` : 'Not configured'}</dd>
              <dt className="text-muted">Webhook secret</dt><dd>{stripe.data.webhook_secret_configured ? 'Configured' : 'Not configured'}</dd>
              <dt className="text-muted">Webhook path</dt><dd className="break-all font-mono text-xs">{stripe.data.webhook_url_path}</dd>
              <dt className="text-muted">Events</dt><dd>{Object.keys(stripe.data.events).length ? Object.entries(stripe.data.events).map(([k, v]) => `${humanize(k)}: ${v}`).join(' · ') : 'None received'}</dd>
              <dt className="text-muted">Last event</dt><dd>{dateShort(stripe.data.last_event_at)}</dd></dl>
            {stripe.data.recent_failures.length > 0 && <div role="alert" className="rounded bg-risk-highsoft p-2 text-xs text-risk-high">Recent failures: {stripe.data.recent_failures.map((f) => `${f.type} (${f.error})`).join('; ')}</div>}
            <button className="btn" onClick={sync} disabled={!can('integration:manage') || !stripe.data.api_key_configured}>Sync from Stripe</button>
            <p className="text-xs text-muted">Secrets live in server environment variables only. Without Stripe credentials, use CSV import or the demo data.</p></div>}
        </section>

        <section className="card p-4" aria-label="Telemetry ingestion"><h2 className="text-sm font-semibold">Product telemetry ingestion</h2>
          <p className="mt-2 text-sm text-muted">Send events to <code className="font-mono text-xs">POST /api/v1/events</code> with an <code className="font-mono text-xs">X-Ingest-Key</code> header. Current key prefix: <code className="font-mono text-xs">{org.data?.ingest_key_prefix ?? 'none'}</code></p>
          <button className="btn mt-3" onClick={rotate} disabled={!can('integration:manage')}>{org.data?.ingest_key_prefix ? 'Rotate ingest key' : 'Create ingest key'}</button>
          {key && <div role="status" className="mt-3 rounded border border-risk-med/40 bg-risk-medsoft p-2 text-xs"><div className="font-semibold">Copy this key now. It will not be shown again.</div><code className="break-all font-mono">{key}</code></div>}
        </section>

        <section className="card p-4" aria-label="CSV import"><h2 className="text-sm font-semibold">CSV import</h2>
          <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={importCsv}>
            <div className="flex flex-col gap-1"><label className="label" htmlFor="kind">Data type</label><select id="kind" className="input" value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></div>
            <div className="flex flex-col gap-1"><label className="label" htmlFor="file">CSV file</label><input id="file" type="file" accept=".csv,text/csv" className="text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
            <button className="btn-primary" disabled={!file || !can('data:import')}>Import</button></form>
          {importResult && <p role="status" className="mt-2 text-sm">{importResult}</p>}
          <p className="mt-2 text-xs text-muted">Imports are idempotent: re-uploading the same file adds nothing. Sample files ship in <code className="font-mono">ml/data/sample</code> (synthetic).</p>
        </section>

        <section className="card" aria-label="Team"><header className="border-b border-line px-4 py-3"><h2 className="text-sm font-semibold">Team</h2></header>
          {members.loading ? <Spinner /> : <table><thead><tr><th scope="col" className="th">Member</th><th scope="col" className="th">Role</th></tr></thead><tbody>{members.data?.map((m) => <tr key={m.user_id}><td className="td">{m.full_name ?? m.email}<div className="text-xs text-faint">{m.email}</div></td><td className="td capitalize">{m.role}</td></tr>)}</tbody></table>}
          {can('org:manage') && <form className="flex flex-wrap items-end gap-2 border-t border-line p-3" onSubmit={addMember}>
            <div className="flex flex-col gap-1"><label className="label" htmlFor="nmail">Email</label><input id="nmail" type="email" required className="input" value={nm.email} onChange={(e) => setNm({ ...nm, email: e.target.value })} /></div>
            <div className="flex flex-col gap-1"><label className="label" htmlFor="nrole">Role</label><select id="nrole" className="input" value={nm.role} onChange={(e) => setNm({ ...nm, role: e.target.value })}>{['owner', 'analyst', 'csm', 'viewer'].map((r) => <option key={r}>{r}</option>)}</select></div>
            <div className="flex flex-col gap-1"><label className="label" htmlFor="npw">Initial password</label><input id="npw" type="password" required className="input" value={nm.password} onChange={(e) => setNm({ ...nm, password: e.target.value })} /></div>
            <button className="btn">Add member</button></form>}
        </section>

        {can('audit:read') && <section className="card" aria-label="Audit log"><header className="border-b border-line px-4 py-3"><h2 className="text-sm font-semibold">Recent audit events</h2></header>
          {audit.loading ? <Spinner /> : <ul className="divide-y divide-line/70">{audit.data?.items.map((a) => <li key={a.id} className="flex justify-between px-4 py-2 text-sm"><span>{a.action}</span><span className="text-xs text-muted">{dateShort(a.created_at)}</span></li>)}</ul>}</section>}
      </div>
    </>
  )
}
