import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import {
  createWalletAdapter,
  exitDemoMode,
  type WalletAdapter,
  type WalletConnection
} from './wallet'

type WalletStatus = 'checking' | 'disconnected' | 'connected' | 'unavailable'

interface WalletContextValue {
  adapter: WalletAdapter
  connection: WalletConnection | null
  status: WalletStatus
  error: string | null
  demoMode: boolean
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  exitDemo: () => void
}

const WalletContext = createContext<WalletContextValue | null>(null)

function describeError(cause: unknown): string {
  if (cause instanceof Error && cause.message) return cause.message
  if (typeof cause === 'object' && cause && 'message' in cause) {
    const message = (cause as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return 'The wallet request did not complete.'
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [adapter] = useState<WalletAdapter>(() => createWalletAdapter())
  const [connection, setConnection] = useState<WalletConnection | null>(null)
  const [status, setStatus] = useState<WalletStatus>('checking')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!adapter.isAvailable()) {
        setStatus('unavailable')
        return
      }
      try {
        const existing = await adapter.getExisting()
        if (cancelled) return
        if (existing) {
          setConnection(existing)
          setStatus('connected')
        } else {
          setStatus('disconnected')
        }
      } catch {
        if (!cancelled) setStatus(adapter.isAvailable() ? 'disconnected' : 'unavailable')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [adapter])

  useEffect(() => {
    if (adapter.kind !== 'noir') return
    const onInitialized = () => {
      if (adapter.isAvailable()) {
        setStatus((current) => (current === 'unavailable' ? 'disconnected' : current))
      }
    }
    window.addEventListener('noirwallet#initialized', onInitialized)
    return () => window.removeEventListener('noirwallet#initialized', onInitialized)
  }, [adapter])

  const connect = useCallback(async () => {
    setError(null)
    setStatus(adapter.isAvailable() ? 'disconnected' : 'unavailable')
    try {
      const next = await adapter.connect()
      setConnection(next)
      setStatus('connected')
    } catch (cause) {
      setError(describeError(cause))
      setStatus(adapter.isAvailable() ? 'disconnected' : 'unavailable')
      throw cause
    }
  }, [adapter])

  const disconnect = useCallback(async () => {
    setError(null)
    try {
      await adapter.disconnect()
    } finally {
      setConnection(null)
      setStatus(adapter.isAvailable() ? 'disconnected' : 'unavailable')
    }
  }, [adapter])

  const exitDemo = useCallback(() => {
    exitDemoMode()
    window.location.assign(window.location.pathname)
  }, [])

  const value = useMemo<WalletContextValue>(
    () => ({
      adapter,
      connection,
      status,
      error,
      demoMode: adapter.kind === 'demo',
      connect,
      disconnect,
      exitDemo
    }),
    [adapter, connection, status, error, connect, disconnect, exitDemo]
  )

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet(): WalletContextValue {
  const value = useContext(WalletContext)
  if (!value) throw new Error('useWallet must be used inside WalletProvider')
  return value
}
