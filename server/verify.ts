import { verifyMessageSignature } from '@noir-wallet/sdk'
import type { ZcashNetwork } from '../shared/types'

export interface VerifyResult {
  ok: boolean
  pubkey?: string
  error?: string
}

/**
 * Verify a Zcash "Signed Message" signature produced by Noir Wallet.
 *
 * The SDK's verifier is pure (no window access), so the exact same
 * implementation runs on the server and in the browser.
 */
export function verifySignedMessage(params: {
  message: string
  signature: string
  network: ZcashNetwork
}): VerifyResult {
  const result = verifyMessageSignature({
    message: params.message,
    signature: params.signature,
    network: params.network
  })
  if (!result.valid) {
    return { ok: false, error: result.error || 'Signature did not verify.' }
  }
  return { ok: true, pubkey: result.recoveredPubkey }
}
