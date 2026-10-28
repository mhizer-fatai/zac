/**
 * Sealed payment requests. The browser encrypts the encoded request with a
 * fresh random AES-256-GCM key, stores only the ciphertext on Zac's server
 * (30 minutes, one payment), and puts the key in the link fragment:
 *
 *   https://zac/#/r/<request id>.<key>
 *
 * Browsers never send the fragment, so the server holds ciphertext it cannot
 * read, and anything that stores the link after it dies (chat backups,
 * browser history) holds a dead pointer.
 */
const API_BASE = ((import.meta.env?.VITE_API_BASE_URL as string | undefined) ?? '').replace(/\/$/, '')

export type SealedLookup =
  | { status: 'open'; encodedPayload: string; expiresAt: number }
  | { status: 'paid' | 'expired' | 'missing' | 'invalid' }

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

async function importKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

/** Encrypt an encoded payload. Returns base64url (iv | ciphertext) and the base64url key. */
export async function encryptRequest(encodedPayload: string): Promise<{ ciphertext: string; key: string }> {
  const raw = crypto.getRandomValues(new Uint8Array(32))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, await importKey(raw), new TextEncoder().encode(encodedPayload))
  )
  const out = new Uint8Array(iv.length + sealed.length)
  out.set(iv)
  out.set(sealed, iv.length)
  return { ciphertext: toBase64Url(out), key: toBase64Url(raw) }
}

/** Decrypt; null for a wrong key, damaged data or tampering (GCM authenticates). */
export async function decryptRequest(ciphertext: string, key: string): Promise<string | null> {
  try {
    const raw = fromBase64Url(key)
    const bytes = fromBase64Url(ciphertext)
    if (raw.length !== 32 || bytes.length < 12 + 16) return null
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.slice(0, 12) as BufferSource },
      await importKey(raw),
      bytes.slice(12)
    )
    return new TextDecoder().decode(plain)
  } catch {
    return null
  }
}

/** Split "<id>.<key>" from the route; null if malformed. */
export function parseSealedToken(token: string): { id: string; key: string } | null {
  const match = /^([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(token)
  return match ? { id: match[1], key: match[2] } : null
}

/** Encrypt the request, store the ciphertext, and return the link token. */
export async function createSealedRequest(
  encodedPayload: string,
  options: { ttl?: '24h' } = {}
): Promise<{ token: string; expiresAt: number }> {
  const { ciphertext, key } = await encryptRequest(encodedPayload)
  const response = await fetch(`${API_BASE}/api/requests`, {
    method: 'POST',
    credentials: 'omit',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ ciphertext, ttl: options.ttl })
  })
  const body = (await response.json().catch(() => ({}))) as { id?: string; expiresAt?: number; error?: string }
  if (!response.ok || !body.id || !body.expiresAt) throw new Error(body.error ?? 'Could not create the payment link.')
  return { token: `${body.id}.${key}`, expiresAt: body.expiresAt }
}

/** Fetch and decrypt a sealed request. */
export async function openSealedRequest(token: string): Promise<SealedLookup> {
  const parsed = parseSealedToken(token)
  if (!parsed) return { status: 'invalid' }
  const response = await fetch(`${API_BASE}/api/requests/${parsed.id}`, { credentials: 'omit', cache: 'no-store' })
  const body = (await response.json().catch(() => ({}))) as { status?: string; ciphertext?: string; expiresAt?: number }
  if (body.status === 'paid' || body.status === 'expired' || body.status === 'missing') return { status: body.status }
  if (!response.ok || body.status !== 'open' || !body.ciphertext || !body.expiresAt) return { status: 'missing' }
  const encodedPayload = await decryptRequest(body.ciphertext, parsed.key)
  return encodedPayload ? { status: 'open', encodedPayload, expiresAt: body.expiresAt } : { status: 'invalid' }
}

/** Tell the server this request was paid so the link stops working. Best effort. */
export async function markSealedRequestPaid(token: string): Promise<void> {
  const parsed = parseSealedToken(token)
  if (!parsed) return
  await fetch(`${API_BASE}/api/requests/${parsed.id}/paid`, { method: 'POST', credentials: 'omit' }).catch(() => {})
}

const PAID_KEY = 'zac.paidRequests.v1'

function readPaid(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PAID_KEY) ?? '[]')
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

/** True if this browser already paid the request (shown before the server knows). */
export function paidInThisBrowser(token: string): boolean {
  const parsed = parseSealedToken(token)
  return Boolean(parsed && readPaid().includes(parsed.id))
}

/**
 * Record a payment for a sealed request. The server is told after a random
 * 1-3 minute delay so the "paid" call cannot be matched to the exact
 * broadcast time of a shielded transaction; meanwhile this browser remembers
 * it so the same payer cannot pay twice by reopening the link. If the tab is
 * closed before the delay ends, the link simply dies at its 30-minute expiry.
 */
export function schedulePaid(token: string): void {
  const parsed = parseSealedToken(token)
  if (!parsed) return
  try {
    localStorage.setItem(PAID_KEY, JSON.stringify([parsed.id, ...readPaid().filter((id) => id !== parsed.id)].slice(0, 50)))
  } catch {
    /* storage may be unavailable */
  }
  const jitter = new Uint32Array(1)
  crypto.getRandomValues(jitter)
  const delayMs = 60_000 + (jitter[0] % 120_000)
  window.setTimeout(() => void markSealedRequestPaid(token), delayMs)
}
