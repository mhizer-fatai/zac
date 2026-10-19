/**
 * Usernames are public directory keys. They are not wallet keys and they do
 * not reveal anything about a payment. Rules are deliberately boring.
 */
const USERNAME_RE = /^[a-z0-9][a-z0-9_]{1,18}[a-z0-9]$/

export const RESERVED_USERNAMES = new Set([
  'about',
  'admin',
  'api',
  'app',
  'cash',
  'contact',
  'demo',
  'help',
  'home',
  'login',
  'logout',
  'me',
  'my',
  'official',
  'pay',
  'payment',
  'privacy',
  'profile',
  'receive',
  'root',
  'security',
  'send',
  'settings',
  'support',
  'system',
  'terms',
  'test',
  'wallet',
  'you',
  'zac',
  'zcash',
  'zec',
  'zero'
])

export function normalizeUsername(input: string): string {
  return input.trim().replace(/^@+/, '').toLowerCase()
}

export function validateUsername(input: string): { ok: true; username: string } | { ok: false; error: string } {
  const username = normalizeUsername(input)
  if (username.length < 3) return { ok: false, error: 'Use at least 3 characters.' }
  if (username.length > 20) return { ok: false, error: 'Use at most 20 characters.' }
  if (!USERNAME_RE.test(username)) {
    return { ok: false, error: 'Use lowercase letters, numbers and underscores. Start and end with a letter or number.' }
  }
  if (RESERVED_USERNAMES.has(username)) {
    return { ok: false, error: 'That name is reserved. Try another.' }
  }
  return { ok: true, username }
}

export function displayHandle(username: string): string {
  return `@${username}`
}
