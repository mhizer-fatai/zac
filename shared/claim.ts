import type { ZcashNetwork } from './types'

/**
 * The exact string a wallet signs when claiming a name. Keep this stable:
 * every verifier rebuilds it from the stored fields.
 */
export function buildClaimMessage(params: {
  username: string
  address: string
  network: ZcashNetwork
  nonce: string
}): string {
  return [
    'Zac username claim',
    `username: ${params.username}`,
    `address: ${params.address}`,
    `network: ${params.network}`,
    `nonce: ${params.nonce}`
  ].join('\n')
}

export function isNonce(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{32}$/i.test(value)
}
