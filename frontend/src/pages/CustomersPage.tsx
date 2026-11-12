import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { Customer, Page } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { EmptyState, ErrorState, PageHeader, Pagination, ProbabilityBar, RiskBadge, Spinner } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { dateShort, humanize, money, relativeDays } from '../lib/format'

const SORTS = [['churn_probability', 'Churn probability'], ['mrr', 'MRR'], ['last_activity', 'Last activity'], ['signed_up', 'Signup date'], ['name', 'Customer id']]

export default function CustomersPage() {
  const { can } = useAuth()
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [risk, setRisk] = useState('')
  const [plan, setPlan] = useState('')
  const [status, setStatus] = useState('')
  const [sort, setSort] = useState('churn_probability')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  useEffect(() => { const t = setTimeout(() => { setDebounced(q); setPage(1) }, 300); return () => clearTimeout(t) }, [q])
  const filters = useApi(() => api.get<{ plans: string[]; statuses: string[] }>('/customers/filters'), [])
  const list = useApi(() => api.get<Page<Customer>>('/customers', { q: debounced, risk, plan, status, sort, order, page, page_size: 20 }), [debounced, risk, plan, status, sort, order, page])

  async function exportCsv() {
    const text = await api.text('/reports/customers', { format: 'csv' })
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = 'customers.csv'; a.click(); URL.revokeObjectURL(url)
  }
  const reset = (fn: (v: string) => void) => (e: React.ChangeEvent<HTMLSelectElement>) => { fn(e.target.value); setPage(1) }

  return (
    <>
      <PageHeader title="Customers" subtitle="Search, filter and sort every account. Risk columns show estimated churn probability."
        actions={can('report:export') ? <button className="btn" onClick={exportCsv}>Export CSV</button> : undefined} />
      <section className="card" aria-label="Customer list">
        <div className="flex flex-wrap items-end gap-3 border-b border-line p-3">
          <div className="flex flex-col gap-1"><label className="label" htmlFor="search">Search</label><input id="search" className="input w-60" placeholder="Email or customer id" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="flex flex-col gap-1"><label className="label" htmlFor="risk">Risk</label>
            <select id="risk" className="input" value={risk} onChange={reset(setRisk)}><option value="">All</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option><option value="unscored">Not scored</option></select></div>
          <div className="flex flex-col gap-1"><label className="label" htmlFor="plan">Plan</label>
            <select id="plan" className="input" value={plan} onChange={reset(setPlan)}><option value="">All</option>{filters.data?.plans.map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
          <div className="flex flex-col gap-1"><label className="label" htmlFor="status">Status</label>
            <select id="status" className="input" value={status} onChange={reset(setStatus)}><option value="">All</option>{filters.data?.statuses.map((p) => <option key={p} value={p}>{humanize(p)}</option>)}</select></div>
          <div className="flex flex-col gap-1"><label className="label" htmlFor="sort">Sort by</label>
            <select id="sort" className="input" value={sort} onChange={reset(setSort)}>{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <button className="btn" onClick={() => setOrder(order === 'desc' ? 'asc' : 'desc')} aria-label={`Sort order: ${order === 'desc' ? 'descending' : 'ascending'}`}>{order === 'desc' ? '↓ Descending' : '↑ Ascending'}</button>
        </div>
        {list.loading ? <Spinner /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : !list.data?.items.length ? <EmptyState title="No customers match these filters" hint="Clear a filter or import customers from Settings." /> : (
          <div className="overflow-x-auto">
            <table>
              <thead><tr><th scope="col" className="th">Customer</th><th scope="col" className="th">Status</th><th scope="col" className="th">Plan</th><th scope="col" className="th text-right">MRR</th><th scope="col" className="th">Signed up</th><th scope="col" className="th">Last activity</th><th scope="col" className="th">Churn probability</th><th scope="col" className="th">Risk</th><th scope="col" className="th">Billing</th></tr></thead>
              <tbody>
                {list.data.items.map((c) => (
                  <tr key={c.id} className="hover:bg-[#FAF9F5]">
                    <td className="td"><Link className="font-medium text-pine underline-offset-2 hover:underline" to={`/customers/${c.id}`}>{c.email ?? c.external_customer_id}</Link><div className="text-xs text-faint">{c.external_customer_id}</div></td>
                    <td className="td">{humanize(c.subscription_status)}</td><td className="td capitalize">{c.plan_id ?? '—'}</td>
                    <td className="td text-right tabular-nums">{money(c.mrr_cents, c.currency ?? 'usd')}</td><td className="td text-muted">{dateShort(c.signed_up_at)}</td>
                    <td className="td text-muted">{relativeDays(c.last_activity_at)}</td><td className="td"><ProbabilityBar p={c.churn_probability} /></td>
                    <td className="td"><RiskBadge risk={c.risk_category} /></td>
                    <td className="td">{c.payment_issue ? <span className="text-xs font-medium text-risk-high">Payment issue</span> : <span className="text-xs text-faint">OK</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pageSize={20} total={list.data?.total ?? 0} onPage={setPage} />
      </section>
    </>
  )
}
