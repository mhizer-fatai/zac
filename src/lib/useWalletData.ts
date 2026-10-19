import { useCallback, useEffect, useState } from 'react'
import { useWallet } from './walletContext'
import type { WalletBalance, WalletTx } from './wallet'

interface WalletData {
  balance: WalletBalance | null
  history: WalletTx[] | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useWalletData(enabled = true): WalletData {
  const { adapter, connection } = useWallet()
  const [balance, setBalance] = useState<WalletBalance | null>(null)
  const [history, setHistory] = useState<WalletTx[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!enabled || !connection) return
    setLoading(true)
    setError(null)
    try {
      const [nextBalance, nextHistory] = await Promise.all([adapter.getBalance(), adapter.getHistory()])
      setBalance(nextBalance)
      setHistory(nextHistory)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not read your wallet.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [adapter, connection, enabled])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { balance, history, loading, error, refresh }
}
