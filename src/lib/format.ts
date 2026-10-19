export function shortAddress(address: string, start = 8, end = 6): string {
  if (!address) return ''
  if (address.length <= start + end + 1) return address
  return `${address.slice(0, start)}…${address.slice(-end)}`
}

export function shortHash(hash: string): string {
  return shortAddress(hash, 8, 8)
}

export function timeAgo(timestamp: number): string {
  if (!timestamp || timestamp <= 0) return 'Pending'
  const seconds = Math.max(1, Math.round((Date.now() - timestamp) / 1000))
  if (seconds < 60) return 'Just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function formatDate(timestamp: number): string {
  if (!timestamp) return ''
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function initials(name: string): string {
  const clean = name.replace(/^@/, '')
  return clean.slice(0, 2).toUpperCase() || 'Z'
}

export function avatarHue(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash) % 360
}

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

export function bytesLength(value: string): number {
  return new TextEncoder().encode(value).length
}
