const TOKEN_KEY = 'churn.token'

export class ApiError extends Error {
  status: number
  code: string
  details?: { field: string; message: string }[] | null
  constructor(status: number, code: string, message: string, details?: { field: string; message: string }[] | null) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

export const tokenStore = {
  get: () => sessionStorage.getItem(TOKEN_KEY),
  set: (t: string) => sessionStorage.setItem(TOKEN_KEY, t),
  clear: () => sessionStorage.removeItem(TOKEN_KEY),
}

type Query = Record<string, string | number | boolean | undefined | null>

function qs(q?: Query): string {
  if (!q) return ''
  const p = new URLSearchParams()
  Object.entries(q).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, String(v)) })
  const s = p.toString()
  return s ? `?${s}` : ''
}

let onUnauthorized: (() => void) | null = null
export const setUnauthorizedHandler = (fn: (() => void) | null) => { onUnauthorized = fn }

export function describeError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'validation_error' && e.details?.length) return e.details.map((d) => `${d.field}: ${d.message}`).join('; ')
    return e.message
  }
  return e instanceof Error ? 'Could not reach the server. Check your connection and try again.' : 'Something went wrong.'
}

async function request<T>(method: string, path: string, opts: { query?: Query; body?: unknown; form?: FormData; raw?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {}
  const token = tokenStore.get()
  if (token) headers.Authorization = `Bearer ${token}`
  let body: BodyInit | undefined
  if (opts.form) body = opts.form
  else if (opts.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.body) }
  let res: Response
  try {
    res = await fetch(`/api/v1${path}${qs(opts.query)}`, { method, headers, body })
  } catch {
    throw new Error('network')
  }
  if (!res.ok) {
    let payload: any = null
    try { payload = await res.json() } catch { /* non-JSON error */ }
    const err = payload?.error
    if (res.status === 401 && token && path !== '/auth/login') onUnauthorized?.()
    throw new ApiError(res.status, err?.code ?? 'http_error', err?.message ?? `Request failed (${res.status})`, err?.details)
  }
  if (res.status === 204) return undefined as T
  return (opts.raw ? await res.text() : await res.json()) as T
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, { query }),
  post: <T>(path: string, body?: unknown, query?: Query) => request<T>('POST', path, { body, query }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body }),
  del: (path: string) => request<void>('DELETE', path),
  upload: <T>(path: string, file: File) => { const f = new FormData(); f.append('file', file); return request<T>('POST', path, { form: f }) },
  text: (path: string, query?: Query) => request<string>('GET', path, { query, raw: true }),
}
