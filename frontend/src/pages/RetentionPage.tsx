import { useState } from 'react'
import { api, describeError } from '../api/client'
import type { Action, Page } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import ActionCard from '../components/ActionCard'
import { Banner, EmptyState, ErrorState, KpiCard, PageHeader, Pagination, Spinner } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { humanize, num, pct } from '../lib/format'

interface Summary { by_status: Record<string, number>; overdue: number; outcomes: Record<string, number>; completion_rate: number | null; note: string }
const TABS: [string, string, string][] = [['suggested', 'Suggested', 'suggested'], ['active', 'In progress', 'open,in_progress'], ['done', 'Completed', 'done'], ['dismissed', 'Dismissed', 'dismissed']]

export default function RetentionPage() {
  const { can, me } = useAuth()
  const [tab, setTab] = useState('suggested')
  const [mine, setMine] = useState(false)
  const [overdue, setOverdue] = useState(false)
  const [page, setPage] = useState(1)
  const [gen, setGen] = useState<string | null>(null)
  const status = TABS.find((t) => t[0] === tab)![2]
  const summary = useApi(() => api.get<Summary>('/retention/summary'), [])
  const list = useApi(() => api.get<Page<Action>>('/retention/actions', { status, mine, overdue, page, page_size: 10 }), [status, mine, overdue, page])
  const changed = () => { list.reload(); summary.reload() }

  async function generate() {
    setGen(null)
    try { const r = await api.post<{ created: number; skipped_existing: number; mode: string; message?: string }>('/retention/recommendations/generate'); setGen(r.message ?? `${r.created} new suggestions created (${r.skipped_existing} already existed).`); changed() }
    catch (e) { setGen(describeError(e)) }
  }

  return (
    <>
      <PageHeader title="Retention workspace" subtitle="Review suggestions, take ownership, record contact attempts and outcomes."
        actions={can('retention:write') ? <button className="btn-primary" onClick={generate}>Generate suggestions</button> : undefined} />
      <div className="mb-4 space-y-2"><Banner>Suggestions are recommendations for people to act on. Nothing is sent to customers and no discounts or subscription changes are applied automatically.</Banner>{gen && <Banner tone="demo">{gen}</Banner>}</div>
      {summary.data && <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Suggested" value={num(summary.data.by_status.suggested ?? 0)} sub="Awaiting review" />
        <KpiCard label="In progress" value={num((summary.data.by_status.open ?? 0) + (summary.data.by_status.in_progress ?? 0))} />
        <KpiCard label="Overdue" value={num(summary.data.overdue)} tone={summary.data.overdue ? 'risk' : undefined} sub="Past due date and not finished" />
        <KpiCard label="Completion rate" value={pct(summary.data.completion_rate, 0)} sub="Done ÷ actioned" />
      </div>}
      {summary.data && Object.keys(summary.data.outcomes).length > 0 && <section className="card mb-5 p-4" aria-label="Recorded outcomes"><h2 className="text-sm font-semibold">Recorded outcomes</h2>
        <ul className="mt-2 flex flex-wrap gap-2">{Object.entries(summary.data.outcomes).map(([k, v]) => <li key={k} className="rounded-full bg-paper px-3 py-1 text-xs"><span className="font-medium">{humanize(k)}</span> · {v}</li>)}</ul>
        <p className="mt-2 text-xs text-muted">{summary.data.note}</p></section>}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Action status" className="flex gap-1">{TABS.map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setPage(1) }} className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === k ? 'bg-ink text-white' : 'text-muted hover:bg-white'}`}>{label}</button>)}</div>
        <div className="flex items-center gap-4 text-sm"><label className="flex items-center gap-1.5"><input type="checkbox" checked={mine} onChange={(e) => { setMine(e.target.checked); setPage(1) }} /> Assigned to me</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={overdue} onChange={(e) => { setOverdue(e.target.checked); setPage(1) }} /> Overdue only</label></div>
      </div>
      {list.loading ? <Spinner /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : !list.data?.items.length ? <div className="card"><EmptyState title="Nothing here" hint={tab === 'suggested' ? 'Generate suggestions after predictions have run.' : 'No actions match this view.'} /></div> : (
        <div className="space-y-3">{list.data.items.map((a) => <ActionCard key={a.id} action={a} canWrite={can('retention:write')} meId={me?.user.id ?? 0} onChanged={changed} />)}
          <div className="card"><Pagination page={page} pageSize={10} total={list.data.total} onPage={setPage} /></div></div>)}
    </>
  )
}
