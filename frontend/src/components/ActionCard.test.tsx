import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, vi } from 'vitest'
import type { Action } from '../api/types'
import { renderAt } from '../test/utils'
import ActionCard from './ActionCard'

const patch = vi.fn()
const post = vi.fn()
vi.mock('../api/client', async (orig) => ({ ...(await orig<typeof import('../api/client')>()), api: { patch: (...a: unknown[]) => patch(...a), post: (...a: unknown[]) => post(...a) } }))

const base: Action = { id: 5, customer_id: 1, action_type: 'billing_review', suggested_step: 'Ask the customer to review their billing details and payment method.', priority: 'high', status: 'suggested',
  reason: 'Subscription is past due', signals: [{ code: 'payment_failures', label: 'Subscription is past due' }], risk_category: 'high', source: 'rules', assigned_user_id: null, assigned_to: null,
  due_at: null, completed_at: null, outcome: null, created_at: '2026-10-01T00:00:00Z', overdue: false, notes: [],
  customer: { id: 1, external_customer_id: 'cus_1', email: 'a@x.example.com', mrr_cents: 9900, currency: 'usd', risk_category: 'high', churn_probability: 0.3 } }

beforeEach(() => { patch.mockReset().mockResolvedValue({}); post.mockReset().mockResolvedValue({}) })

describe('ActionCard', () => {
  it('shows triggering signals, step, and priority', () => {
    renderAt(<ActionCard action={base} canWrite meId={7} onChanged={() => undefined} />)
    expect(screen.getByRole('list', { name: 'Triggering signals' })).toHaveTextContent('Subscription is past due')
    expect(screen.getByText(/review their billing details/)).toBeInTheDocument()
    expect(screen.getByText(/high priority/i)).toBeInTheDocument()
  })

  it('accept assigns the action to the current user', async () => {
    const changed = vi.fn()
    renderAt(<ActionCard action={base} canWrite meId={7} onChanged={changed} />)
    await userEvent.click(screen.getByRole('button', { name: /accept and assign to me/i }))
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/retention/actions/5', { assigned_user_id: 7 }))
    expect(changed).toHaveBeenCalled()
  })

  it('completing requires choosing an outcome', async () => {
    renderAt(<ActionCard action={{ ...base, status: 'in_progress', assigned_user_id: 7 }} canWrite meId={7} onChanged={() => undefined} />)
    await userEvent.click(screen.getByRole('button', { name: /complete…/i }))
    const done = screen.getByRole('button', { name: 'Mark done' })
    expect(done).toBeDisabled()
    await userEvent.selectOptions(screen.getByLabelText('Outcome'), 'customer_retained')
    await userEvent.click(done)
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/retention/actions/5', { status: 'done', outcome: 'customer_retained' }))
  })

  it('adds a contact attempt note', async () => {
    renderAt(<ActionCard action={{ ...base, status: 'open' }} canWrite meId={7} onChanged={() => undefined} />)
    await userEvent.selectOptions(screen.getByLabelText('Note type'), 'contact_attempt')
    await userEvent.type(screen.getByLabelText('Add a note'), 'Left voicemail')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/retention/actions/5/notes', { kind: 'contact_attempt', body: 'Left voicemail' }))
  })

  it('surfaces server errors without crashing', async () => {
    patch.mockRejectedValue(Object.assign(new Error('x'), { status: 409 }))
    renderAt(<ActionCard action={base} canWrite meId={7} onChanged={() => undefined} />)
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('read-only users see no controls', () => {
    renderAt(<ActionCard action={base} canWrite={false} meId={7} onChanged={() => undefined} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('flags overdue actions and completed outcomes', () => {
    renderAt(<ActionCard action={{ ...base, status: 'done', outcome: 'customer_retained', overdue: true }} canWrite meId={7} onChanged={() => undefined} />)
    expect(screen.getByText('Overdue')).toBeInTheDocument()
    expect(screen.getByText(/Outcome: Customer retained/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reopen' })).toBeInTheDocument()
  })
})
