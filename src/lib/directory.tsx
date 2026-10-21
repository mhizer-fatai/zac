import { verifyMessageSignature } from '@noir-wallet/sdk'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import type { Claim, DirectorySnapshot } from '../../shared/types'
import { classifyAddress } from '../../shared/address'
import { buildClaimMessage } from '../../shared/claim'
import { normalizeUsername, validateUsername } from '../../shared/username'
import { loadDirectory } from './api'

const CACHE_KEY = 'zac.directory.cache.v1'
const CACHE_TTL_MS = 10 * 60 * 1000

interface DirectoryContextValue {
  claims: Claim[]
  loading: boolean
  error: string | null
  fetchedAt: number
  refresh: (force?: boolean) => Promise<void>
  resolve: (username: string) => Claim | undefined
  findByAddress: (address: string) => Claim | undefined
}

const DirectoryContext = createContext<DirectoryContextValue | null>(null)

function verifyClaim(claim: Claim): boolean {
  try {
    const username = validateUsername(claim.username)
    if (!username.ok || username.username !== claim.username) return false
    const address = classifyAddress(claim.address)
    if (address.kind !== 'shielded' || address.network !== claim.network) return false
    const nonce = /(?:^|\n)nonce: ([a-f0-9]{32})$/i.exec(claim.message)?.[1]
    if (!nonce) return false
    const expected = buildClaimMessage({
      username: claim.username,
      address: claim.address,
      network: claim.network,
      nonce
    })
    if (expected !== claim.message) return false
    const result = verifyMessageSignature({
      message: claim.message,
      signature: claim.signature,
      pubkey: claim.pubkey,
      network: claim.network
    })
    return result.valid
  } catch {
    return false
  }
}

function readCache(): { snapshot: DirectorySnapshot; fetchedAt: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as { snapshot: DirectorySnapshot; fetchedAt: number }
  } catch {
    return null
  }
}

function writeCache(snapshot: DirectorySnapshot, fetchedAt: number): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ snapshot, fetchedAt }))
  } catch {
    /* storage may be unavailable */
  }
}

export function DirectoryProvider({ children }: { children: ReactNode }) {
  const [claims, setClaims] = useState<Claim[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState(0)
  const inFlight = useRef(false)

  const applySnapshot = useCallback((snapshot: DirectorySnapshot, when: number) => {
    setClaims(snapshot.claims.filter(verifyClaim).sort((a, b) => a.username.localeCompare(b.username)))
    setFetchedAt(when)
    writeCache(snapshot, when)
  }, [])

  const refresh = useCallback(
    async (force = false) => {
      if (inFlight.current) return
      if (!force && fetchedAt && Date.now() - fetchedAt < 30_000) return
      inFlight.current = true
      setLoading(true)
      try {
        const snapshot = await loadDirectory()
        applySnapshot(snapshot, Date.now())
        setError(null)
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'Could not load the name directory.'
        setError(message)
      } finally {
        setLoading(false)
        inFlight.current = false
      }
    },
    [applySnapshot, fetchedAt]
  )

  useEffect(() => {
    const cached = readCache()
    if (cached) {
      const freshEnough = Date.now() - cached.fetchedAt < CACHE_TTL_MS
      applySnapshot(cached.snapshot, cached.fetchedAt)
      if (freshEnough) setLoading(false)
    }
    void refresh(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const resolve = useCallback(
    (username: string) => {
      const normalized = normalizeUsername(username)
      return claims.find((claim) => claim.username === normalized)
    },
    [claims]
  )

  const findByAddress = useCallback(
    (address: string) => claims.find((claim) => claim.address === address),
    [claims]
  )

  const value = useMemo<DirectoryContextValue>(
    () => ({ claims, loading, error, fetchedAt, refresh, resolve, findByAddress }),
    [claims, loading, error, fetchedAt, refresh, resolve, findByAddress]
  )

  return <DirectoryContext.Provider value={value}>{children}</DirectoryContext.Provider>
}

export function useDirectory(): DirectoryContextValue {
  const value = useContext(DirectoryContext)
  if (!value) throw new Error('useDirectory must be used inside DirectoryProvider')
  return value
}
