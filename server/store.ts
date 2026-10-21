import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Claim } from '../shared/types'

interface StoreFile {
  version: 1
  updatedAt: number
  claims: Claim[]
  usedNonces: string[]
}

const DATA_DIR = process.env.ZAC_DATA_DIR ?? path.join(process.cwd(), 'server', 'data')
const DATA_FILE = path.join(DATA_DIR, 'claims.json')

const claims = new Map<string, Claim>()
const usedNonces = new Set<string>()
let updatedAt = 0
let loaded = false
let writeChain: Promise<void> = Promise.resolve()

export async function loadStore(): Promise<void> {
  if (loaded) return
  loaded = true
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
  claims.set(next.username, next)
  usedNonces.add(nonce)
  // Bound memory on a long-running instance.
  if (usedNonces.size > 20_000) {
    const drop = usedNonces.size - 15_000
    let i = 0
    for (const value of usedNonces) {
      usedNonces.delete(value)
      if (++i >= drop) break
    }
  }
  updatedAt = now
  await persist()
  return existing ? 'updated' : 'created'
}

async function persist(): Promise<void> {
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
