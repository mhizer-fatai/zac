import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'

import { classifyAddress } from '../shared/address'
import { buildClaimMessage, isNonce } from '../shared/claim'
import { validateUsername } from '../shared/username'
import type { Claim, DirectorySnapshot } from '../shared/types'
import {
  getClaim,
  hasNonce,
  listClaims,
  loadStore,
  storeUpdatedAt,
  storageKind,
  upsertClaim
} from './store'
import { verifySignedMessage } from './verify'

const app = new Hono()
const startedAt = Date.now()

/* ------------------------------------------------------------------ */
/* Privacy headers. No analytics, no third-party origins, no framing. */
/* The CSP makes "no third-party requests" a browser-enforced rule:    */
/* even injected or compromised code cannot fetch, load or beacon to   */
/* another origin. Everything Zac needs is bundled and same-origin.    */
/* ------------------------------------------------------------------ */
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'"
].join('; ')

app.use('*', async (c, next) => {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('Referrer-Policy', 'no-referrer')
  c.header('X-Frame-Options', 'DENY')
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  c.header('Cross-Origin-Resource-Policy', 'same-origin')
  c.header('Cross-Origin-Opener-Policy', 'same-origin')
  c.header('Content-Security-Policy', CONTENT_SECURITY_POLICY)
})

/* ------------------------------------------------------------------ */
/* Rate limiting without keeping IP addresses.                         */
/* A per-process salt hashes the address; buckets live in memory only. */
/* ------------------------------------------------------------------ */
const salt = randomBytes(16)
const buckets = new Map<string, { count: number; resetAt: number }>()

function allowClaim(headers: Headers): boolean {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const ip = forwarded || headers.get('x-real-ip') || 'local'
  const key = createHash('sha256').update(salt).update(ip).digest('base64url')
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + 60 * 60 * 1000 })
    return true
  }
  bucket.count += 1
  if (buckets.size > 5000) {
    for (const [bucketKey, value] of buckets) {
      if (value.resetAt < now) buckets.delete(bucketKey)
    }
  }
  return bucket.count <= 40
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

app.get('/api/health', (c) => {
  return c.json({
    ok: true,
    claims: listClaims().length,
    updatedAt: storeUpdatedAt(),
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000)
  })
})

app.get('/api/directory', (c) => {
  const snapshot: DirectorySnapshot = {
    version: 1,
    updatedAt: storeUpdatedAt(),
    claims: listClaims()
  }
  const json = JSON.stringify(snapshot)
  const etag = `"${createHash('sha256').update(json).digest('hex').slice(0, 32)}"`
  const headers = {
    ETag: etag,
    'Cache-Control': 'no-cache',
    'Content-Type': 'application/json; charset=utf-8'
  }
  if (c.req.header('if-none-match') === etag) {
    return new Response(null, { status: 304, headers })
  }
  return new Response(json, { status: 200, headers })
})

app.post('/api/claims', async (c) => {
  if (!allowClaim(c.req.raw.headers)) {
    return c.json({ error: 'Too many attempts. Try again later.' }, 429)
  }
  const length = Number(c.req.header('content-length') ?? 0)
  if (Number.isFinite(length) && length > 12_000) {
    return c.json({ error: 'Request too large.' }, 413)
  }

  let body: Record<string, unknown>
  try {
    body = (await c.req.json()) as Record<string, unknown>
  } catch {
    return c.json({ error: 'Invalid JSON body.' }, 400)
  }

  const usernameCheck = validateUsername(typeof body.username === 'string' ? body.username : '')
  if (!usernameCheck.ok) return c.json({ error: usernameCheck.error }, 400)
  const username = usernameCheck.username

  const address = typeof body.address === 'string' ? body.address.trim() : ''
  const addressInfo = classifyAddress(address)
  if (addressInfo.kind !== 'shielded' || addressInfo.network === 'unknown') {
    return c.json({ error: addressInfo.reason ?? 'A shielded Zcash address is required.' }, 400)
  }
  const network = addressInfo.network

  if (!isNonce(body.nonce)) {
    return c.json({ error: 'Invalid claim nonce.' }, 400)
  }
  const nonce = body.nonce.toLowerCase()

  const signature = typeof body.signature === 'string' ? body.signature.trim().toLowerCase().replace(/^0x/, '') : ''
  if (!/^[0-9a-f]{130}$/.test(signature)) {
    return c.json({ error: 'Invalid signature format.' }, 400)
  }

  if (hasNonce(nonce)) {
    return c.json({ error: 'This claim proof was already used. Try again.' }, 409)
  }

  const message = buildClaimMessage({ username, address, network, nonce })
  const verified = verifySignedMessage({ message, signature, network })
  if (!verified.ok || !verified.pubkey) {
    return c.json({ error: verified.error ?? 'The wallet signature did not verify.' }, 401)
  }

  const existing = getClaim(username)
  if (existing && existing.pubkey !== verified.pubkey) {
    return c.json({ error: 'That name is already claimed by another wallet.' }, 409)
  }

  const claim: Claim = {
    username,
    address,
    network,
    pubkey: verified.pubkey,
    signature,
    message,
    createdAt: 0,
    updatedAt: 0
  }

  let result: Awaited<ReturnType<typeof upsertClaim>>
  try {
    result = await upsertClaim(claim, nonce)
  } catch (error) {
    console.error('[zac] could not save claim:', error instanceof Error ? error.message : error)
    return c.json({ error: 'The name could not be saved. Try again in a moment.' }, 503)
  }
  const stored = getClaim(username)
  return c.json({ claim: stored, result }, result === 'created' ? 201 : 200)
})

/* ------------------------------------------------------------------ */
/* ZEC/USD price. Fetched server-side and cached, so the price source  */
/* never sees users' IPs and the browser's CSP stays same-origin only. */
/* A stale price is served if a refresh fails.                         */
/* ------------------------------------------------------------------ */
const PRICE_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=zcash&vs_currencies=usd'
const PRICE_TTL_MS = 5 * 60 * 1000
let price: { usd: number; fetchedAt: number } | null = null
let priceRefresh: Promise<void> | null = null

async function refreshPrice(): Promise<void> {
  try {
    const response = await fetch(PRICE_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000)
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const body = (await response.json()) as { zcash?: { usd?: unknown } }
    const usd = body.zcash?.usd
    if (typeof usd !== 'number' || !Number.isFinite(usd) || usd <= 0) throw new Error('bad price payload')
    price = { usd, fetchedAt: Date.now() }
  } catch (error) {
    console.warn('[zac] price refresh failed:', error instanceof Error ? error.message : error)
  }
}

app.get('/api/price', async (c) => {
  if (!price || Date.now() - price.fetchedAt > PRICE_TTL_MS) {
    priceRefresh ??= refreshPrice().finally(() => {
      priceRefresh = null
    })
    await priceRefresh
  }
  if (!price) return c.json({ error: 'Price unavailable.' }, 503)
  c.header('Cache-Control', 'no-cache')
  return c.json({ usd: price.usd, updatedAt: price.fetchedAt, source: 'CoinGecko' })
})

app.all('/api/*', (c) => c.json({ error: 'Not found.' }, 404))

/* ------------------------------------------------------------------ */
/* Static app (production build).                                      */
/* ------------------------------------------------------------------ */
const distDir = path.join(process.cwd(), 'dist')
if (existsSync(path.join(distDir, 'index.html'))) {
  app.use('*', serveStatic({ root: './dist' }))
  app.get('*', serveStatic({ path: './dist/index.html' }))
}

await loadStore()

const port = Number(process.env.PORT ?? 8787)
serve(
  {
    fetch: app.fetch,
    port,
    hostname: process.env.HOST ?? '0.0.0.0'
  },
  (info) => {
    const claims = listClaims().length
    console.log(`[zac] api listening on http://localhost:${info.port} · ${claims} claim${claims === 1 ? '' : 's'} · ${storageKind()} storage`)
    if (!existsSync(path.join(distDir, 'index.html'))) {
      console.log('[zac] no dist/ build found — run the Vite dev server for the UI')
    }
  }
)
