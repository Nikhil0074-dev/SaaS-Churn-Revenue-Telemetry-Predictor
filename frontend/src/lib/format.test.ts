import { dateShort, humanize, money, monthLabel, num, pct, relativeDays } from './format'

describe('format helpers', () => {
  it('formats money from integer cents without floating drift', () => {
    expect(money(1999, 'usd')).toBe('$20')
    expect(money(123456789, 'usd')).toBe('$1,234,568')
    expect(money(0)).toBe('$0')
    expect(money(null)).toBe('—')
    expect(money(250000000, 'usd', true)).toMatch(/\$2\.5M/)
  })
  it('falls back safely for an unknown currency code', () => {
    expect(money(5000, 'zz1')).toContain('50')
  })
  it('formats percentages and counts, treating missing values as an em dash', () => {
    expect(pct(0.0714)).toBe('7.1%')
    expect(pct(0.5, 0)).toBe('50%')
    expect(pct(null)).toBe('—')
    expect(num(12345)).toBe('12,345')
    expect(num(undefined)).toBe('—')
  })
  it('formats dates in UTC and tolerates bad input', () => {
    expect(dateShort('2026-03-05T23:30:00Z')).toBe('Mar 5, 2026')
    expect(dateShort(null)).toBe('—')
    expect(dateShort('not-a-date')).toBe('—')
  })
  it('describes relative days', () => {
    const now = new Date('2026-10-30T12:00:00Z')
    expect(relativeDays('2026-10-30T01:00:00Z', now)).toBe('today')
    expect(relativeDays('2026-10-29T01:00:00Z', now)).toBe('1 day ago')
    expect(relativeDays('2026-10-20T01:00:00Z', now)).toBe('10 days ago')
    expect(relativeDays(null, now)).toBe('never')
  })
  it('humanizes snake_case and month labels', () => {
    expect(humanize('customer_reengaged')).toBe('Customer reengaged')
    expect(humanize(null)).toBe('—')
    expect(monthLabel('2026-03')).toBe('Mar 26')
  })
})
