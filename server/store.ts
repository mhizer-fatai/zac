import { promises as fs } from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import type { Claim } from '../shared/types'

/**
 * Claim storage. All reads are served from memory; writes go to the backing
 * store first, then memory, so a restart reloads exactly what was saved.
 *
 * Backing store:
 * - Postgres when DATABASE_URL is set (used on hosts with no persistent
 *   disk, e.g. Render's free plan with a free Neon database);
 * - otherwise a JSON file in ZAC_DATA_DIR (local development, VPS).
 *
 * Only public, wallet-signed claim records and used nonces are stored.
 */

interface StoreFile {
  version: 1
  updatedAt: number
  claims: Claim[]
  usedNonces: string[]
}

const DATA_DIR = process.env.ZAC_DATA_DIR ?? path.join(process.cwd(), 'server', 'data')
const DATA_FILE = path.join(DATA_DIR, 'claims.json')
const DATABASE_URL = process.env.DATABASE_URL?.trim() || undefined

const claims = new Map<string, Claim>()
const usedNonces = new Set<string>()
let updatedAt = 0
let loaded = false
let writeChain: Promise<void> = Promise.resolve()
let pool: pg.Pool | undefined

export function storageKind(): 'postgres' | 'file' {
  return DATABASE_URL ? 'postgres' : 'file'
}

export async function loadStore(): Promise<void> {
  if (loaded) return
  loaded = true
  if (DATABASE_URL) {
    await loadFromPostgres(DATABASE_URL)
  } else {
    await loadFromFile()
  }
}

export function getClaim(username: string): Claim | undefined {
  return claims.get(username)
}

export function listClaims(): Claim[] {
  return Array.from(claims.values()).sort((a, b) => a.username.localeCompare(b.username))
}

export function hasNonce(nonce: string): boolean {
  return usedNonces.has(nonce)
}

export function storeUpdatedAt(): number {
  return updatedAt
}

export async function upsertClaim(claim: Claim, nonce: string): Promise<'created' | 'updated'> {
  const existing = claims.get(claim.username)
  const now = Date.now()
  const next: Claim = existing
    ? { ...claim, createdAt: existing.createdAt, updatedAt: now }
    : { ...claim, createdAt: now, updatedAt: now }

  if (pool) {
    // Persist before touching memory: if the database write fails, the
    // claim is rejected rather than silently lost on the next restart.
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `INSERT INTO zac_claims (username, address, network, pubkey, signature, message, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (username) DO UPDATE SET
           address = EXCLUDED.address, network = EXCLUDED.network, pubkey = EXCLUDED.pubkey,
           signature = EXCLUDED.signature, message = EXCLUDED.message, updated_at = EXCLUDED.updated_at`,
        [next.username, next.address, next.network, next.pubkey, next.signature, next.message, next.createdAt, next.updatedAt]
      )
      await client.query('INSERT INTO zac_nonces (nonce) VALUES ($1) ON CONFLICT DO NOTHING', [nonce])
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    } finally {
      client.release()
    }
  }

  claims.set(next.username, next)
  usedNonces.add(nonce)
  updatedAt = now

  if (!pool) {
    // Bound memory on a long-running instance; the database keeps all nonces.
    if (usedNonces.size > 20_000) {
      const drop = usedNonces.size - 15_000
      let i = 0
      for (const value of usedNonces) {
        usedNonces.delete(value)
        if (++i >= drop) break
      }
    }
    await persistFile()
  }
  return existing ? 'updated' : 'created'
}

/* ------------------------------------------------------------------ */
/* Postgres                                                            */
/* ------------------------------------------------------------------ */

async function loadFromPostgres(url: string): Promise<void> {
  pool = new pg.Pool({ connectionString: url, max: 3, idleTimeoutMillis: 30_000 })
  await pool.query(`
    CREATE TABLE IF NOT EXISTS zac_claims (
      username   text PRIMARY KEY,
      address    text NOT NULL,
      network    text NOT NULL,
      pubkey     text NOT NULL,
      signature  text NOT NULL,
      message    text NOT NULL,
      created_at bigint NOT NULL,
      updated_at bigint NOT NULL
    );
    CREATE TABLE IF NOT EXISTS zac_nonces (nonce text PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS zac_requests (
      id         text PRIMARY KEY,
      ciphertext text NOT NULL,
      expires_at bigint NOT NULL,
      paid_at    bigint
    );
  `)
  const rows = await pool.query<{
    username: string
    address: string
    network: Claim['network']
    pubkey: string
    signature: string
    message: string
    created_at: string
    updated_at: string
  }>('SELECT * FROM zac_claims')
  for (const row of rows.rows) {
    claims.set(row.username, {
      username: row.username,
      address: row.address,
      network: row.network,
      pubkey: row.pubkey,
      signature: row.signature,
      message: row.message,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at)
    })
    updatedAt = Math.max(updatedAt, Number(row.updated_at))
  }
  const nonces = await pool.query<{ nonce: string }>('SELECT nonce FROM zac_nonces')
  for (const row of nonces.rows) usedNonces.add(row.nonce)
}

/* ------------------------------------------------------------------ */
/* JSON file                                                           */
/* ------------------------------------------------------------------ */

async function loadFromFile(): Promise<void> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8')
    const parsed = JSON.parse(raw) as Partial<StoreFile>
    for (const claim of parsed.claims ?? []) {
      if (claim && typeof claim.username === 'string') {
        claims.set(claim.username, claim)
      }
    }
    for (const nonce of parsed.usedNonces ?? []) usedNonces.add(nonce)
    updatedAt = typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now()
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      console.warn('[zac] could not read claims store:', code ?? error)
    }
  }
}

async function persistFile(): Promise<void> {
  writeChain = writeChain.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true })
    const payload: StoreFile = {
      version: 1,
      updatedAt,
      claims: listClaims(),
      usedNonces: Array.from(usedNonces)
    }
    const json = JSON.stringify(payload, null, 2)
    const tmp = path.join(DATA_DIR, `claims.${process.pid}.${Date.now()}.tmp`)
    await fs.writeFile(tmp, json, 'utf8')
    try {
      await fs.rename(tmp, DATA_FILE)
    } catch {
      await fs.copyFile(tmp, DATA_FILE)
      await fs.unlink(tmp).catch(() => {})
    }
  })
  return writeChain
}

/* ------------------------------------------------------------------ */
/* Sealed payment requests                                             */
/* Only ciphertext is stored: the browser encrypts the request and the */
/* key stays in the link fragment, which never reaches the server.     */
/* A request lives 30 minutes and is marked paid after one payment;    */
/* expired rows are purged. No IP or other client data is stored.      */
/* ------------------------------------------------------------------ */

export interface StoredRequest {
  ciphertext: string
  expiresAt: number
  paidAt: number | null
}

// Without Postgres (local development) requests live in memory only.
const memoryRequests = new Map<string, StoredRequest>()

export async function createRequest(id: string, ciphertext: string, expiresAt: number): Promise<void> {
  if (pool) {
    await pool.query('INSERT INTO zac_requests (id, ciphertext, expires_at) VALUES ($1, $2, $3)', [id, ciphertext, expiresAt])
  } else {
    memoryRequests.set(id, { ciphertext, expiresAt, paidAt: null })
  }
}

export async function getRequest(id: string): Promise<StoredRequest | null> {
  if (pool) {
    const rows = await pool.query<{ ciphertext: string; expires_at: string; paid_at: string | null }>(
      'SELECT ciphertext, expires_at, paid_at FROM zac_requests WHERE id = $1',
      [id]
    )
    const row = rows.rows[0]
    if (!row) return null
    return { ciphertext: row.ciphertext, expiresAt: Number(row.expires_at), paidAt: row.paid_at === null ? null : Number(row.paid_at) }
  }
  return memoryRequests.get(id) ?? null
}

/** Marks a live request paid. Returns false if it is unknown, expired or already paid. */
export async function markRequestPaid(id: string, now: number): Promise<boolean> {
  if (pool) {
    const result = await pool.query('UPDATE zac_requests SET paid_at = $2 WHERE id = $1 AND paid_at IS NULL AND expires_at > $2', [id, now])
    return (result.rowCount ?? 0) > 0
  }
  const request = memoryRequests.get(id)
  if (!request || request.paidAt !== null || request.expiresAt <= now) return false
  request.paidAt = now
  return true
}

export async function purgeExpiredRequests(now: number): Promise<void> {
  if (pool) {
    await pool.query('DELETE FROM zac_requests WHERE expires_at <= $1', [now])
    return
  }
  for (const [id, request] of memoryRequests) {
    if (request.expiresAt <= now) memoryRequests.delete(id)
  }
}
