import { useState } from 'react'
import { api, describeError } from '../api/client'
import { Banner, EmptyState, ErrorState, PageHeader, Spinner } from '../components/ui'
import { humanize } from '../lib/format'

const REPORTS = [['revenue', 'Monthly revenue and churn'], ['churn', 'Current churn predictions'], ['retention', 'Retention actions and outcomes'], ['customers', 'Customer list'], ['predictions', 'Prediction history']]
interface Report { columns: string[]; rows: Record<string, unknown>[]; row_count: number }

export default function ReportsPage() {
  const year = new Date().getUTCFullYear()
  const [name, setName] = useState('revenue')
  const [start, setStart] = useState(`${year - 1}-01-01`)
  const [end, setEnd] = useState(new Date().toISOString().slice(0, 10))
  const [data, setData] = useState<Report | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const query = { start, end }

  async function preview() {
    setLoading(true); setError(null)
    try { setData(await api.get<Report>(`/reports/${name}`, query)) } catch (e) { setError(describeError(e)); setData(null) } finally { setLoading(false) }
  }
  async function download() {
    try {
      const text = await api.text(`/reports/${name}`, { ...query, format: 'csv' })
      const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
      const a = document.createElement('a'); a.href = url; a.download = `${name}-report.csv`; a.click(); URL.revokeObjectURL(url)
    } catch (e) { setError(describeError(e)) }
  }

  return (
    <>
      <PageHeader title="Reports" subtitle="Preview and export filtered reports as CSV." />
      <Banner>Exports contain customer-level data. Spreadsheet formulas in exported text are neutralized, and every export is recorded in the audit log.</Banner>
      <section className="card mt-4" aria-label="Report builder">
        <div className="flex flex-wrap items-end gap-3 border-b border-line p-3">
          <div className="flex flex-col gap-1"><label className="label" htmlFor="report">Report</label><select id="report" className="input" value={name} onChange={(e) => { setName(e.target.value); setData(null) }}>{REPORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div className="flex flex-col gap-1"><label className="label" htmlFor="from">From</label><input id="from" type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div className="flex flex-col gap-1"><label className="label" htmlFor="to">To</label><input id="to" type="date" className="input" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          <button className="btn-primary" onClick={preview}>Preview</button><button className="btn" onClick={download}>Download CSV</button>
        </div>
        {loading ? <Spinner /> : error ? <ErrorState message={error} /> : !data ? <EmptyState title="Choose a report and press Preview" /> : data.row_count === 0 ? <EmptyState title="No rows for this period" /> : (
          <div className="max-h-[520px] overflow-auto"><p className="px-3 py-2 text-xs text-muted">{data.row_count} rows{data.row_count > 200 ? ' (showing first 200)' : ''}</p>
            <table><thead><tr>{data.columns.map((c) => <th key={c} scope="col" className="th">{humanize(c)}</th>)}</tr></thead>
              <tbody>{data.rows.slice(0, 200).map((r, i) => <tr key={i}>{data.columns.map((c) => <td key={c} className="td whitespace-nowrap tabular-nums">{String(r[c] ?? '')}</td>)}</tr>)}</tbody></table></div>)}
      </section>
    </>
  )
}
