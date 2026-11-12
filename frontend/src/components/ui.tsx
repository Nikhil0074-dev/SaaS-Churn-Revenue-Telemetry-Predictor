import { ReactNode, useState } from 'react'
import type { Risk } from '../api/types'
import { humanize } from '../lib/format'

export const RISK_LABEL: Record<Risk, string> = { low: 'Low risk', medium: 'Medium risk', high: 'High risk', unscored: 'Not scored' }
const RISK_STYLE: Record<Risk, string> = {
  low: 'bg-risk-lowsoft text-risk-low', medium: 'bg-risk-medsoft text-risk-med',
  high: 'bg-risk-highsoft text-risk-high', unscored: 'bg-risk-nonesoft text-risk-none',
}
const RISK_DOT: Record<Risk, string> = { low: 'bg-risk-low', medium: 'bg-risk-med', high: 'bg-risk-high', unscored: 'bg-risk-none' }

/** Risk is conveyed by text + dot + color, never color alone. */
export function RiskBadge({ risk }: { risk: Risk | string | null | undefined }) {
  const r = (risk && risk in RISK_LABEL ? risk : 'unscored') as Risk
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${RISK_STYLE[r]}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${RISK_DOT[r]}`} />
      {RISK_LABEL[r]}
    </span>
  )
}

const PRIORITY_STYLE: Record<string, string> = { high: 'text-risk-high', medium: 'text-risk-med', low: 'text-muted' }
export function PriorityTag({ priority }: { priority: string }) {
  return <span className={`text-xs font-semibold uppercase tracking-wide ${PRIORITY_STYLE[priority] ?? 'text-muted'}`}>{priority} priority</span>
}

export function StatusPill({ status }: { status: string }) {
  const style = status === 'done' ? 'bg-risk-lowsoft text-risk-low' : status === 'in_progress' ? 'bg-pine-soft text-pine' : status === 'dismissed' ? 'bg-risk-nonesoft text-risk-none' : status === 'suggested' ? 'bg-risk-medsoft text-risk-med' : 'bg-[#E7ECF3] text-[#2B4A73]'
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${style}`}>{humanize(status)}</span>
}

export function InfoTip({ label, text }: { label: string; text: string }) {
  return (
    <span className="group relative inline-flex">
      <button type="button" aria-label={`Definition of ${label}`} className="flex h-4 w-4 items-center justify-center rounded-full border border-faint text-[10px] font-semibold text-muted hover:bg-paper focus-visible:bg-paper">i</button>
      <span role="tooltip" className="pointer-events-none absolute left-0 top-6 z-30 hidden w-72 rounded-md border border-line bg-white p-3 text-xs font-normal normal-case leading-relaxed tracking-normal text-ink shadow-lg group-focus-within:block group-hover:block">{text}</span>
    </span>
  )
}

export function KpiCard({ label, value, sub, tone, definition }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'risk' | 'good'; definition?: string }) {
  return (
    <div className="card flex flex-col gap-1 p-4" data-testid="kpi">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
        {label}
        {definition && <InfoTip label={label} text={definition} />}
      </div>
      <div className={`font-serif text-[28px] font-semibold leading-tight ${tone === 'risk' ? 'text-risk-high' : 'text-ink'}`}>{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2 py-8 text-sm text-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-pine" aria-hidden />
      {label}…
    </div>
  )
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 px-6 py-10 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {hint && <p className="max-w-md text-sm text-muted">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="m-3 flex items-center justify-between gap-3 rounded-md border border-risk-high/30 bg-risk-highsoft px-3 py-2 text-sm text-risk-high">
      <span>{message}</span>
      {onRetry && <button className="btn" onClick={onRetry}>Retry</button>}
    </div>
  )
}

export function Banner({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'demo'; children: ReactNode }) {
  const style = tone === 'warn' ? 'border-risk-med/40 bg-risk-medsoft text-[#6B4100]' : tone === 'demo' ? 'border-pine/30 bg-pine-soft text-pine-dark' : 'border-line bg-white text-muted'
  return <div role="note" className={`rounded-md border px-3 py-2 text-sm ${style}`}>{children}</div>
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

export interface TableData { columns: string[]; rows: (string | number)[][] }

/** Chart container with loading / empty / error states and an accessible table alternative. */
export function ChartCard({ title, description, loading, error, empty, emptyTitle, emptyHint, table, children, height = 260, className = '' }: {
  title: string; description?: string; emptyTitle?: string; emptyHint?: string; loading?: boolean; error?: string | null; empty?: boolean; table?: TableData | null
  children?: ReactNode; height?: number; className?: string
}) {
  const [asTable, setAsTable] = useState(false)
  return (
    <section className={`card flex flex-col ${className}`} aria-label={title}>
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
        </div>
        {table && !loading && !empty && !error && (
          <button className="btn !px-2 !py-1 text-xs" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>{asTable ? 'Show chart' : 'View as table'}</button>
        )}
      </header>
      <div className="p-4">
        {loading ? <Spinner /> : error ? <ErrorState message={error} /> : empty ? <EmptyState title={emptyTitle ?? "No data for this view yet"} hint={emptyHint ?? "Data appears here once subscriptions and activity have been loaded."} /> :
          asTable && table ? (
            <div className="max-h-[320px] overflow-auto">
              <table>
                <thead><tr>{table.columns.map((c) => <th key={c} scope="col" className="th">{c}</th>)}</tr></thead>
                <tbody>{table.rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className="td tabular-nums">{v}</td>)}</tr>)}</tbody>
              </table>
            </div>
          ) : <div style={{ height }} role="img" aria-label={`${title}. ${description ?? ''} Use "View as table" for exact values.`}>{children}</div>}
      </div>
    </section>
  )
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t border-line px-3 py-2 text-sm text-muted">
      <span>{from}–{to} of {total.toLocaleString('en-US')}</span>
      <div className="flex items-center gap-2">
        <button className="btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <span aria-current="page">Page {page} of {pages}</span>
        <button className="btn" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </nav>
  )
}

/** Probability with the medium/high thresholds marked, so the number is read in context. */
export function ProbabilityBar({ p, thresholds, max = 1 }: { p: number | null; thresholds?: { medium: number; high: number }; max?: number }) {
  if (p === null || p === undefined) return <span className="text-faint">—</span>
  const scale = Math.max(max, thresholds ? thresholds.high * 1.5 : 0.3, 0.001)
  const w = Math.min(100, (p / scale) * 100)
  const color = thresholds ? (p >= thresholds.high ? 'bg-risk-high' : p >= thresholds.medium ? 'bg-risk-med' : 'bg-risk-low') : 'bg-pine'
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-1.5 w-20 rounded-full bg-[#ECE9DE]" aria-hidden>
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${w}%` }} />
        {thresholds && <>
          <span className="absolute -top-0.5 h-2.5 w-px bg-ink/40" style={{ left: `${Math.min(100, (thresholds.medium / scale) * 100)}%` }} />
          <span className="absolute -top-0.5 h-2.5 w-px bg-ink/70" style={{ left: `${Math.min(100, (thresholds.high / scale) * 100)}%` }} />
        </>}
      </div>
      <span className="w-12 text-right text-sm tabular-nums">{(p * 100).toFixed(1)}%</span>
    </div>
  )
}

export const CHART_COLORS = { pine: '#0E5C54', amber: '#B96F00', red: '#B4321F', green: '#2F7D4F', slate: '#6B7570', sand: '#CFC8B4', blue: '#2B4A73' }
