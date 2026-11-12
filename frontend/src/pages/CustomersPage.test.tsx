import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, vi } from 'vitest'
import { renderAt } from '../test/utils'
import CustomersPage from './CustomersPage'

const get = vi.fn()
vi.mock('../api/client', async (orig) => ({ ...(await orig<typeof import('../api/client')>()), api: { get: (...a: unknown[]) => get(...a), text: vi.fn() } }))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ can: () => true }) }))

const row = (id: number, risk: string, p: number | null) => ({ id, external_customer_id: `cus_${id}`, email: `user${id}@x.example.com`, signed_up_at: '2026-01-01T00:00:00Z',
  subscription_status: 'active', plan_id: 'growth', mrr_cents: 9900, currency: 'usd', last_activity_at: '2026-10-01T00:00:00Z', payment_issue: id === 2,
  churn_probability: p, risk_category: risk, last_prediction_at: null })

beforeEach(() => {
  get.mockReset()
  get.mockImplementation((path: string) => path === '/customers/filters' ? Promise.resolve({ plans: ['starter', 'growth'], statuses: ['active'] })
    : Promise.resolve({ total: 2, page: 1, page_size: 20, items: [row(1, 'high', 0.4), row(2, 'unscored', null)] }))
})

describe('CustomersPage', () => {
  it('lists customers with text risk labels and billing flags', async () => {
    renderAt(<CustomersPage />)
    expect(await screen.findByText('user1@x.example.com')).toBeInTheDocument()
    expect(screen.getByText('High risk')).toBeInTheDocument()
    expect(screen.getAllByText('Not scored')).toHaveLength(2)   // the filter option and the row badge
    expect(screen.getByText('Payment issue')).toBeInTheDocument()
    expect(screen.getByText('40.0%')).toBeInTheDocument()
  })

  it('sends the risk filter and resets to page 1', async () => {
    renderAt(<CustomersPage />)
    await screen.findByText('user1@x.example.com')
    await userEvent.selectOptions(screen.getByLabelText('Risk'), 'high')
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/customers', expect.objectContaining({ risk: 'high', page: 1 })))
  })

  it('debounces search input into a single request', async () => {
    renderAt(<CustomersPage />)
    await screen.findByText('user1@x.example.com')
    const before = get.mock.calls.filter((c) => c[0] === '/customers').length
    await userEvent.type(screen.getByLabelText('Search'), 'acme')
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/customers', expect.objectContaining({ q: 'acme' })))
    expect(get.mock.calls.filter((c) => c[0] === '/customers').length - before).toBe(1)
  })

  it('toggles sort order', async () => {
    renderAt(<CustomersPage />)
    await screen.findByText('user1@x.example.com')
    await userEvent.click(screen.getByRole('button', { name: /sort order: descending/i }))
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/customers', expect.objectContaining({ order: 'asc' })))
  })

  it('shows an empty state', async () => {
    get.mockImplementation((p: string) => p === '/customers/filters' ? Promise.resolve({ plans: [], statuses: [] }) : Promise.resolve({ total: 0, page: 1, page_size: 20, items: [] }))
    renderAt(<CustomersPage />)
    expect(await screen.findByText(/no customers match these filters/i)).toBeInTheDocument()
  })

  it('shows API errors with a retry that refetches', async () => {
    get.mockImplementation((p: string) => p === '/customers/filters' ? Promise.resolve({ plans: [], statuses: [] }) : Promise.reject(new Error('network')))
    renderAt(<CustomersPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach the server/i)
    get.mockImplementation((p: string) => p === '/customers/filters' ? Promise.resolve({ plans: [], statuses: [] }) : Promise.resolve({ total: 1, page: 1, page_size: 20, items: [row(9, 'low', 0.01)] }))
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('user9@x.example.com')).toBeInTheDocument()
  })
})
