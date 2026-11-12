import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { ApiError } from '../api/client'
import { renderAt } from '../test/utils'
import LoginPage from './LoginPage'

const login = vi.fn()
const register = vi.fn()
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ me: null, login, register }) }))

describe('LoginPage', () => {
  beforeEach(() => { login.mockReset(); register.mockReset() })

  it('has labelled fields', () => {
    renderAt(<LoginPage />)
    expect(screen.getByLabelText('Email')).toBeRequired()
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
  })

  it('shows the server error message in an alert', async () => {
    login.mockRejectedValue(new ApiError(401, 'invalid_credentials', 'Invalid email or password.'))
    renderAt(<LoginPage />)
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.com')
    await userEvent.type(screen.getByLabelText('Password'), 'wrongpass')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.')
    expect(login).toHaveBeenCalledWith('a@b.com', 'wrongpass')
  })

  it('switches to registration and sends the organization name', async () => {
    register.mockResolvedValue(undefined)
    renderAt(<LoginPage />)
    await userEvent.click(screen.getByRole('button', { name: /create one/i }))
    await userEvent.type(screen.getByLabelText('Organization name'), 'Acme')
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.com')
    await userEvent.type(screen.getByLabelText('Password'), 'GoodPassw0rd!')
    await userEvent.click(screen.getByRole('button', { name: 'Create workspace' }))
    await waitFor(() => expect(register).toHaveBeenCalledWith({ email: 'a@b.com', password: 'GoodPassw0rd!', organization_name: 'Acme' }))
  })
})
