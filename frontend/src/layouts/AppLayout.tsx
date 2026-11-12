import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

const NAV = [
  { to: '/', label: 'Overview', end: true },
  { to: '/churn', label: 'Churn risk' },
  { to: '/customers', label: 'Customers' },
  { to: '/retention', label: 'Retention' },
  { to: '/model', label: 'Model' },
  { to: '/reports', label: 'Reports' },
  { to: '/settings', label: 'Settings' },
]

export default function AppLayout() {
  const { me, logout } = useAuth()
  const nav = useNavigate()
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col bg-night text-[#DDE5E1] md:sticky md:top-0 md:h-screen md:w-60">
        <div className="px-5 py-5">
          <div className="font-serif text-lg font-semibold leading-tight text-white">Churn &amp; Revenue<br />Telemetry</div>
          <div className="mt-1 text-[11px] uppercase tracking-widest text-[#7FA39B]">Retention intelligence</div>
        </div>
        <nav aria-label="Primary" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:overflow-visible">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => `whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium ${isActive ? 'bg-pine text-white' : 'text-[#B8C7C1] hover:bg-white/10 hover:text-white'}`}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden border-t border-white/10 px-5 py-4 text-xs text-[#9DB3AC] md:block">
          <div className="truncate font-medium text-white">{me?.user.full_name ?? me?.user.email}</div>
          <div className="capitalize">{me?.role}</div>
          <button className="mt-2 underline underline-offset-2 hover:text-white" onClick={async () => { await logout(); nav('/login') }}>Sign out</button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between gap-3 border-b border-line bg-white px-6 py-2.5 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-medium">{me?.organization.name}</span>
            {me?.organization.is_demo && <span className="rounded bg-pine-soft px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-pine">Synthetic demo data</span>}
          </div>
          <button className="text-muted underline underline-offset-2 md:hidden" onClick={async () => { await logout(); nav('/login') }}>Sign out</button>
        </header>
        <main className="mx-auto max-w-[1280px] px-6 py-6"><Outlet /></main>
      </div>
    </div>
  )
}
