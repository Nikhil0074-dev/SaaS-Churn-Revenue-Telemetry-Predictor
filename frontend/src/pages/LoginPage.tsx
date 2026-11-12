import { FormEvent, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { describeError } from '../api/client'
import { useAuth } from '../auth/AuthContext'

export default function LoginPage() {
  const { me, login, register } = useAuth()
  const nav = useNavigate()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [org, setOrg] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (me) return <Navigate to="/" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      if (mode === 'login') await login(email, password)
      else await register({ email, password, organization_name: org })
      nav('/')
    } catch (err) {
      setError(describeError(err))
    } finally { setBusy(false) }
  }

  return (
    <div className="grid min-h-screen md:grid-cols-[1.1fr_1fr]">
      <section className="hidden flex-col justify-between bg-night p-12 text-[#DDE5E1] md:flex">
        <div className="font-serif text-xl font-semibold text-white">Churn &amp; Revenue Telemetry</div>
        <div>
          <p className="max-w-md font-serif text-3xl font-semibold leading-snug text-white">See who is likely to leave before the cancellation lands.</p>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-[#9DB3AC]">Billing events and product usage in one place, with transparent risk estimates and a retention workflow your team can actually run.</p>
        </div>
        <p className="text-xs text-[#7FA39B]">Estimates come from historical patterns. They are not certainties.</p>
      </section>
      <main className="flex items-center justify-center p-8">
        <form onSubmit={submit} className="w-full max-w-sm" aria-label={mode === 'login' ? 'Sign in' : 'Create workspace'}>
          <h1 className="font-serif text-2xl font-semibold">{mode === 'login' ? 'Sign in' : 'Create your workspace'}</h1>
          <div className="mt-6 space-y-4">
            {mode === 'register' && (
              <div className="flex flex-col gap-1"><label className="label" htmlFor="org">Organization name</label>
                <input id="org" className="input" required minLength={2} value={org} onChange={(e) => setOrg(e.target.value)} /></div>
            )}
            <div className="flex flex-col gap-1"><label className="label" htmlFor="email">Email</label>
              <input id="email" type="email" autoComplete="username" className="input" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="flex flex-col gap-1"><label className="label" htmlFor="password">Password</label>
              <input id="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} className="input" required value={password} onChange={(e) => setPassword(e.target.value)} />
              {mode === 'register' && <span className="text-xs text-faint">At least 10 characters with upper and lower case letters and a digit.</span>}</div>
          </div>
          {error && <div role="alert" className="mt-4 rounded-md border border-risk-high/30 bg-risk-highsoft px-3 py-2 text-sm text-risk-high">{error}</div>}
          <button className="btn-primary mt-6 w-full" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create workspace'}</button>
          <button type="button" className="mt-4 text-sm text-muted underline underline-offset-2" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null) }}>
            {mode === 'login' ? 'Need a workspace? Create one' : 'Already have an account? Sign in'}
          </button>
        </form>
      </main>
    </div>
  )
}
