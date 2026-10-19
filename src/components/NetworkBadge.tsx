import { cn } from '../lib/format'
import type { ZcashNetwork } from '../../shared/types'

export function NetworkBadge({
  network,
  className
}: {
  network: ZcashNetwork | 'unknown'
  className?: string
}) {
  const testnet = network === 'testnet'
  return (
    <span className={cn('network-badge', testnet ? 'is-testnet' : 'is-mainnet', className)}>
      <span className="network-dot" aria-hidden="true" />
      {testnet ? 'Testnet' : network === 'mainnet' ? 'Mainnet' : 'Unknown network'}
    </span>
  )
}
