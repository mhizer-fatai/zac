import { useEffect, useState } from 'react'
import { zatoshiToZec } from '../../shared/amount'
import type { ZcashNetwork } from '../../shared/types'

/**
 * ZEC/USD price for display and USD entry. It comes from Zac's own server
 * (/api/price), which fetches it from CoinGecko, so no third party sees the
 * user. Payments are always made in ZEC; USD is an estimate only. Testnet
 * coins have no value, so there is no price on testnet.
 */
const REFRESH_MS = 5 * 60 * 1000
const API_BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '').replace(/\/$/, '')

let cached: { usd: number; at: number } | null = null
let inFlight: Promise<number | null> | null = null

async function fetchPrice(): Promise<number | null> {
  if (cached && Date.now() - cached.at < REFRESH_MS) return cached.usd
  inFlight ??= fetch(`${API_BASE}/api/price`, { credentials: 'omit', cache: 'no-store' })
    .then(async (response) => {
      if (!response.ok) return cached?.usd ?? null
      const body = (await response.json()) as { usd?: unknown }
      if (typeof body.usd !== 'number' || !(body.usd > 0)) return cached?.usd ?? null
      cached = { usd: body.usd, at: Date.now() }
      return body.usd
    })
    .catch(() => cached?.usd ?? null)
    .finally(() => {
      inFlight = null
    })
  return inFlight
}

/** USD per ZEC, or null on testnet, before it loads, or if unavailable. */
export function useZecPrice(network: ZcashNetwork | undefined): number | null {
  const [usd, setUsd] = useState<number | null>(() => (network === 'mainnet' ? (cached?.usd ?? null) : null))
  useEffect(() => {
    if (network !== 'mainnet') {
      setUsd(null)
      return
    }
    let active = true
    const load = () => void fetchPrice().then((value) => active && setUsd(value))
    load()
    const id = window.setInterval(load, REFRESH_MS)
    return () => {
      active = false
      window.clearInterval(id)
    }
  }, [network])
  return usd
}

/** ZEC amount (decimal string) to USD. */
export function zecToUsd(zec: string, usdPerZec: number): number {
  const value = Number(zec)
  return Number.isFinite(value) ? value * usdPerZec : 0
}

/**
 * USD amount to a ZEC decimal string, rounded down to whole zatoshi so the
 * payment never exceeds what the user typed. Null if the input is not a
 * positive dollar amount with at most 2 decimals.
 */
export function usdToZec(usd: string, usdPerZec: number): string | null {
  if (!/^\d+(\.\d{1,2})?$/.test(usd.trim()) || !(usdPerZec > 0)) return null
  const zatoshi = Math.floor((Number(usd) * 1e8) / usdPerZec)
  if (!(zatoshi > 0)) return null
  return zatoshiToZec(BigInt(zatoshi))
}

const usdFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })

export function formatUsd(value: number): string {
  if (value > 0 && value < 0.01) return '< $0.01'
  return usdFormat.format(value)
}
