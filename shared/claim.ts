import { verifyMessageSignature } from '@noir-wallet/sdk'
import { classifyAddress } from './address'
import type { Claim, ZcashNetwork } from './types'
import { validateUsername } from './username'

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

/**
 * Verify a directory record without trusting whoever served it: the
 * message must rebuild exactly from the record's fields and be signed by
 * the record's pubkey. A server can withhold records but not forge them.
 */
export function verifyClaim(claim: Claim): boolean {
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
    // Require an explicit key match: the SDK treats an empty pubkey as "no
    // expectation" and reports valid, which would let a server forge records.
    return result.valid && result.pubkeyMatch === true
  } catch {
    return false
  }
}
