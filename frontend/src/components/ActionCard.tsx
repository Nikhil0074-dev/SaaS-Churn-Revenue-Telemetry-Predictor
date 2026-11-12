import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, describeError } from '../api/client'
import type { Action } from '../api/types'
import { dateShort, humanize, money } from '../lib/format'
import { PriorityTag, RiskBadge, StatusPill } from './ui'

export const OUTCOMES = [
  ['customer_reengaged', 'Customer re-engaged'], ['billing_issue_resolved', 'Billing issue resolved'], ['customer_retained', 'Customer retained'],
  ['customer_cancelled', 'Customer cancelled'], ['no_response', 'No response'], ['further_investigation', 'Further investigation required'],
] as const

export default function ActionCard({ action: a, canWrite, meId, onChanged, showCustomer = true }: { action: Action; canWrite: boolean; meId: number; onChanged: () => void; showCustomer?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [completing, setCompleting] = useState(false)
  const [outcome, setOutcome] = useState('')
  const [note, setNote] = useState('')
  const [noteKind, setNoteKind] = useState<'note' | 'contact_attempt'>('note')

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null)
    try { await fn(); onChanged() } catch (e) { setError(describeError(e)) } finally { setBusy(false) }
  }
  const patch = (body: Record<string, unknown>) => run(() => api.patch(`/retention/actions/${a.id}`, body))
  const active = a.status !== 'done' && a.status !== 'dismissed'

  return (
    <article className={`card p-4 ${a.overdue ? 'border-risk-high/50' : ''}`} aria-label={`${humanize(a.action_type)} action`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{humanize(a.action_type)}</h3><StatusPill status={a.status} /><PriorityTag priority={a.priority} />
            {a.overdue && <span className="rounded bg-risk-highsoft px-1.5 py-0.5 text-xs font-semibold text-risk-high">Overdue</span>}
          </div>
          {showCustomer && a.customer && (
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <Link className="font-medium text-pine underline-offset-2 hover:underline" to={`/customers/${a.customer.id}`}>{a.customer.email ?? a.customer.external_customer_id}</Link>
              <RiskBadge risk={a.customer.risk_category} /><span className="text-muted">{money(a.customer.mrr_cents, a.customer.currency ?? 'usd')}/mo</span>
            </div>
          )}
        </div>
        <div className="text-right text-xs text-muted">
          <div>{a.assigned_to ? `Owner: ${a.assigned_to}` : 'Unassigned'}</div>
          {a.due_at && <div>Due {dateShort(a.due_at)}</div>}{a.outcome && <div className="font-medium text-ink">Outcome: {humanize(a.outcome)}</div>}
        </div>
      </div>
      {a.suggested_step && <p className="mt-2 text-sm">{a.suggested_step}</p>}
      {a.signals.length > 0 && <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Triggering signals">{a.signals.map((s) => <li key={s.code} className="rounded bg-paper px-2 py-0.5 text-xs text-muted">{s.label}</li>)}</ul>}
      {a.notes.length > 0 && <ul className="mt-3 space-y-1.5 border-l-2 border-line pl-3" aria-label="Notes">{a.notes.map((n) => <li key={n.id} className="text-xs text-muted"><span className="font-medium text-ink">{n.kind === 'contact_attempt' ? 'Contact attempt' : 'Note'}</span> · {dateShort(n.created_at)} — {n.body}</li>)}</ul>}

      {canWrite && (
        <div className="mt-3 space-y-2 border-t border-line pt-3">
          <div className="flex flex-wrap gap-2">
            {a.status === 'suggested' && <><button className="btn-primary" disabled={busy} onClick={() => patch({ assigned_user_id: meId })}>Accept and assign to me</button>
              <button className="btn" disabled={busy} onClick={() => patch({ status: 'dismissed' })}>Dismiss</button></>}
            {(a.status === 'open') && <button className="btn" disabled={busy} onClick={() => patch({ status: 'in_progress' })}>Start work</button>}
            {active && a.assigned_user_id !== meId && a.status !== 'suggested' && <button className="btn" disabled={busy} onClick={() => patch({ assigned_user_id: meId })}>Assign to me</button>}
            {active && a.status !== 'suggested' && !completing && <button className="btn" disabled={busy} onClick={() => setCompleting(true)}>Complete…</button>}
            {!active && <button className="btn" disabled={busy} onClick={() => patch({ status: 'open' })}>Reopen</button>}
          </div>
          {completing && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1"><label className="label" htmlFor={`outcome-${a.id}`}>Outcome</label>
                <select id={`outcome-${a.id}`} className="input" value={outcome} onChange={(e) => setOutcome(e.target.value)}><option value="">Select outcome…</option>{OUTCOMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
              <button className="btn-primary" disabled={!outcome || busy} onClick={() => patch({ status: 'done', outcome })}>Mark done</button>
              <button className="btn" onClick={() => setCompleting(false)}>Cancel</button>
            </div>
          )}
          {active && (
            <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (note.trim()) void run(async () => { await api.post(`/retention/actions/${a.id}/notes`, { kind: noteKind, body: note.trim() }); setNote('') }) }}>
              <div className="flex min-w-[220px] flex-1 flex-col gap-1"><label className="label" htmlFor={`note-${a.id}`}>Add a note</label>
                <input id={`note-${a.id}`} className="input" value={note} maxLength={4000} onChange={(e) => setNote(e.target.value)} placeholder="What happened or what is next?" /></div>
              <select aria-label="Note type" className="input" value={noteKind} onChange={(e) => setNoteKind(e.target.value as 'note' | 'contact_attempt')}><option value="note">Note</option><option value="contact_attempt">Contact attempt</option></select>
              <button className="btn" disabled={busy || !note.trim()}>Add</button>
            </form>
          )}
          {error && <div role="alert" className="text-sm text-risk-high">{error}</div>}
        </div>
      )}
    </article>
  )
}
