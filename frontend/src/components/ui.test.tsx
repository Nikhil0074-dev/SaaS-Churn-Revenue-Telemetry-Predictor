import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { ChartCard, EmptyState, ErrorState, KpiCard, Pagination, ProbabilityBar, RISK_LABEL, RiskBadge } from './ui'

describe('RiskBadge', () => {
  it.each(Object.entries(RISK_LABEL))('shows a text label for %s (never color alone)', (risk, label) => {
    render(<RiskBadge risk={risk} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })
  it('falls back to "Not scored" for unknown or missing values', () => {
    render(<><RiskBadge risk={null} /><RiskBadge risk="weird" /></>)
    expect(screen.getAllByText('Not scored')).toHaveLength(2)
  })
})

describe('KpiCard', () => {
  it('renders label, value and subtext, and exposes the metric definition accessibly', async () => {
    render(<KpiCard label="MRR" value="$85,000" sub="vs last period" definition="Monthly recurring revenue." />)
    expect(screen.getByText('$85,000')).toBeInTheDocument()
    const btn = screen.getByRole('button', { name: /definition of mrr/i })
    expect(screen.getByRole('tooltip', { hidden: true })).toHaveTextContent('Monthly recurring revenue.')
    expect(btn).toBeInTheDocument()
  })
})

describe('ChartCard states', () => {
  it('shows a loading indicator', () => {
    render(<ChartCard title="T" loading><div>chart</div></ChartCard>)
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i)
    expect(screen.queryByText('chart')).not.toBeInTheDocument()
  })
  it('shows an error alert instead of the chart', () => {
    render(<ChartCard title="T" error="boom"><div>chart</div></ChartCard>)
    expect(screen.getByRole('alert')).toHaveTextContent('boom')
  })
  it('shows an empty state without inventing data', () => {
    render(<ChartCard title="T" empty><div>chart</div></ChartCard>)
    expect(screen.getByText(/no data for this view yet/i)).toBeInTheDocument()
  })
  it('offers an accessible table alternative with the exact values', async () => {
    render(<ChartCard title="MRR" description="Monthly" table={{ columns: ['Month', 'MRR'], rows: [['Jan', '$100'], ['Feb', '$120']] }}><div>chart</div></ChartCard>)
    expect(screen.getByRole('img', { name: /MRR/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /view as table/i }))
    expect(screen.getByRole('columnheader', { name: 'MRR' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '$120' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /show chart/i }))
    expect(screen.getByText('chart')).toBeInTheDocument()
  })
})

describe('ErrorState / EmptyState', () => {
  it('retry button calls back', async () => {
    const retry = vi.fn()
    render(<ErrorState message="Failed" onRetry={retry} />)
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(retry).toHaveBeenCalled()
  })
  it('renders title and hint', () => {
    render(<EmptyState title="Nothing" hint="Add data" />)
    expect(screen.getByText('Nothing')).toBeInTheDocument(); expect(screen.getByText('Add data')).toBeInTheDocument()
  })
})

describe('Pagination', () => {
  it('disables edges and reports the visible range', async () => {
    const onPage = vi.fn()
    const { rerender } = render(<Pagination page={1} pageSize={20} total={45} onPage={onPage} />)
    expect(screen.getByText('1–20 of 45')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onPage).toHaveBeenCalledWith(2)
    rerender(<Pagination page={3} pageSize={20} total={45} onPage={onPage} />)
    expect(screen.getByText('41–45 of 45')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })
  it('handles zero results', () => {
    render(<Pagination page={1} pageSize={20} total={0} onPage={() => undefined} />)
    expect(screen.getByText('0–0 of 0')).toBeInTheDocument()
  })
})

describe('ProbabilityBar', () => {
  it('shows the numeric probability and a dash when missing', () => {
    const { rerender } = render(<ProbabilityBar p={0.1234} thresholds={{ medium: 0.05, high: 0.1 }} />)
    expect(screen.getByText('12.3%')).toBeInTheDocument()
    rerender(<ProbabilityBar p={null} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
