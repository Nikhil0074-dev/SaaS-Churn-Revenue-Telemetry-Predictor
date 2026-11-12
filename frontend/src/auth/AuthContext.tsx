import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, setUnauthorizedHandler, tokenStore } from '../api/client'
import type { Me } from '../api/types'

interface AuthValue {
  me: Me | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (v: { email: string; password: string; organization_name: string; full_name?: string }) => Promise<void>
  logout: () => Promise<void>
  can: (permission: string) => boolean
}

const Ctx = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState<boolean>(!!tokenStore.get())

  const loadMe = useCallback(async () => {
    try { setMe(await api.get<Me>('/auth/me')) } catch { tokenStore.clear(); setMe(null) } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(() => { tokenStore.clear(); setMe(null) })
    if (tokenStore.get()) void loadMe()
    return () => setUnauthorizedHandler(null)
  }, [loadMe])

  const value = useMemo<AuthValue>(() => ({
    me, loading,
    async login(email, password) {
      const r = await api.post<{ access_token: string }>('/auth/login', { email, password })
      tokenStore.set(r.access_token)
      await loadMe()
    },
    async register(v) {
      const r = await api.post<{ access_token: string }>('/auth/register', v)
      tokenStore.set(r.access_token)
      await loadMe()
    },
    async logout() {
      try { await api.post('/auth/logout') } catch { /* token may already be invalid */ }
      tokenStore.clear(); setMe(null)
    },
    can: (p) => !!me?.permissions.includes(p),
  }), [me, loading, loadMe])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used inside AuthProvider')
  return v
}
