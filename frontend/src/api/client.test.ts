import { afterEach, beforeEach, vi } from 'vitest'
import { ApiError, api, describeError, setUnauthorizedHandler, tokenStore } from './client'

const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

describe('api client', () => {
  beforeEach(() => { sessionStorage.clear(); vi.restoreAllMocks() })
  afterEach(() => setUnauthorizedHandler(null))

  it('sends the bearer token and serializes query parameters, skipping empty ones', async () => {
    tokenStore.set('abc')
    const f = vi.spyOn(globalThis, 'fetch').mockImplementation(() => json(200, { ok: true }))
    await api.get('/customers', { q: 'a b', risk: '', page: 2, plan: undefined })
    const [url, init] = f.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/v1/customers?q=a+b&page=2')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer abc')
  })

  it('turns the structured error body into an ApiError', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => json(422, { error: { code: 'validation_error', message: 'Request validation failed', details: [{ field: 'email', message: 'bad' }] } }))
    const err: any = await api.post('/auth/login', {}).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(422)
    expect(describeError(err)).toBe('email: bad')
  })

  it('handles non-JSON error responses and 204', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => Promise.resolve(new Response('<html>', { status: 502 })))
    await expect(api.get('/x')).rejects.toMatchObject({ status: 502, code: 'http_error' })
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => Promise.resolve(new Response(null, { status: 204 })))
    await expect(api.del('/x')).resolves.toBeUndefined()
  })

  it('reports network failures in plain language', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('failed'))
    const err = await api.get('/x').catch((e) => e)
    expect(describeError(err)).toMatch(/could not reach the server/i)
  })

  it('signs the user out on 401 for authenticated calls but not for failed login', async () => {
    const handler = vi.fn(); setUnauthorizedHandler(handler)
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => json(401, { error: { code: 'invalid_token', message: 'expired' } }))
    await api.get('/customers').catch(() => undefined)
    expect(handler).not.toHaveBeenCalled()           // no token stored yet
    tokenStore.set('t')
    await api.get('/customers').catch(() => undefined)
    expect(handler).toHaveBeenCalledTimes(1)
    await api.post('/auth/login', {}).catch(() => undefined)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('uploads files as multipart without forcing a content type', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockImplementation(() => json(200, { imported: 1 }))
    await api.upload('/imports/customers', new File(['a'], 'a.csv'))
    const init = f.mock.calls[0][1] as RequestInit
    expect(init.body).toBeInstanceOf(FormData)
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined()
  })
})
