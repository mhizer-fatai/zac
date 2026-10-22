import { secp256k1 } from '@noble/curves/secp256k1.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
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

/**
 * Canonical (uncompressed, lowercase hex) form of a secp256k1 public key,
 * so a compressed key from the wallet matches the uncompressed key the
 * server recovered from the claim signature. Null if it is not a valid key.
 */
export function normalizePubkey(hex: string | undefined): string | null {
  if (!hex) return null
  try {
    return bytesToHex(secp256k1.Point.fromBytes(hexToBytes(hex.replace(/^0x/, ''))).toBytes(false))
  } catch {
    return null
  }
}
