export function money(cents: number | null | undefined, currency = 'usd', compact = false): string {
  if (cents === null || cents === undefined) return '—'
  const value = cents / 100
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: currency.toUpperCase(),
      notation: compact && Math.abs(value) >= 10000 ? 'compact' : 'standard',
      maximumFractionDigits: compact && Math.abs(value) >= 10000 ? 1 : 0,
    }).format(value)
  } catch {
    return `${value.toFixed(0)} ${currency.toUpperCase()}`
  }
}

export function pct(v: number | null | undefined, digits = 1): string {
  return v === null || v === undefined ? '—' : `${(v * 100).toFixed(digits)}%`
}

export function num(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : new Intl.NumberFormat('en-US').format(v)
}

export function dateShort(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

export function relativeDays(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return 'never'
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

export function humanize(s: string | null | undefined): string {
  if (!s) return '—'
  const t = s.replace(/_/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })
}
