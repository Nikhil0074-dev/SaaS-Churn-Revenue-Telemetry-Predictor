import { Link } from 'react-router-dom'
import type { HighRiskRow } from '../api/types'
import { money, relativeDays } from '../lib/format'
import { EmptyState, ProbabilityBar, RiskBadge } from './ui'

/** Ranked accounts: probability (with thresholds), revenue exposure and the signals that drive the estimate. */
export default function RiskLedger({ rows, thresholds, compact = false }: { rows: HighRiskRow[]; thresholds?: { medium: number; high: number }; compact?: boolean }) {
  if (!rows.length) return <EmptyState title="No accounts in this risk group" hint="Run predictions from the Churn risk page after a model is active, or adjust the filters." />
  return (
    <div className="overflow-x-auto">
      <table>
        <thead>
          <tr>
            <th scope="col" className="th">Account</th><th scope="col" className="th">Plan</th><th scope="col" className="th text-right">MRR</th>
            <th scope="col" className="th">Last activity</th><th scope="col" className="th">Churn probability</th><th scope="col" className="th">Risk</th>
            <th scope="col" className="th">Main risk indicators</th>
            {!compact && <><th scope="col" className="th text-right">Expected at risk</th><th scope="col" className="th">Owner</th><th scope="col" className="th">Next action</th></>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-[#FAF9F5]">
              <td className="td">
                <Link className="font-medium text-pine underline-offset-2 hover:underline" to={`/customers/${r.id}`}>{r.email ?? r.external_customer_id}</Link>
                <div className="text-xs text-faint">{r.external_customer_id}</div>
              </td>
              <td className="td capitalize">{r.plan_id ?? '—'}</td>
              <td className="td text-right tabular-nums">{money(r.mrr_cents, r.currency ?? 'usd')}</td>
              <td className="td whitespace-nowrap text-muted">{relativeDays(r.last_activity_at)}</td>
              <td className="td"><ProbabilityBar p={r.churn_probability} thresholds={thresholds} /></td>
              <td className="td"><RiskBadge risk={r.risk_category} /></td>
              <td className="td max-w-[320px] text-xs text-muted">{r.indicators.length ? r.indicators.join(' · ') : 'Rule-based signals only'}</td>
              {!compact && <>
                <td className="td text-right tabular-nums">{money(r.expected_revenue_at_risk_cents, r.currency ?? 'usd')}</td>
                <td className="td text-muted">{r.assigned_to ?? 'Unassigned'}</td>
                <td className="td max-w-[220px] text-xs text-muted">{r.next_action ?? '—'}</td>
              </>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
