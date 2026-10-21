import { verifyMessageSignature } from '@noir-wallet/sdk'
import {
  buildPaymentMemo,
  buildReceiptMessage,
  parsePaymentMemo,
  RECEIPT_SIGNATURE_CHARS
} from '../../shared/memo'
import type { Claim, ParsedPaymentMemo, ZcashNetwork } from '../../shared/types'
import type { WalletAdapter } from './wallet'

function hexToBase64Url(hex: string): string {
  const bytes = hex.match(/.{2}/g)?.map((byte) => parseInt(byte, 16)) ?? []
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlToHex(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  return Array.from(binary, (char) => char.charCodeAt(0).toString(16).padStart(2, '0')).join('')
}

/**
 * Build the receipt memo for a payment. With a sender name, the wallet
 * signs the receipt using the same derived key that claimed the name, so
 * the recipient can check it against the public directory. That costs one
 * extra wallet approval, and only happens when the payer chose to reveal.
 */
export async function buildReceiptMemo(params: {
  adapter: WalletAdapter
  to: string
  invoiceId?: string
  from?: string
  note?: string
}): Promise<string> {
  const { adapter, to, invoiceId, from, note } = params
  if (!from) return buildPaymentMemo({ invoiceId, note })
  // The signature has a fixed length, so a placeholder yields the exact
  // invoice id and (possibly truncated) note that will be in the final memo.
  const draft = parsePaymentMemo(
    buildPaymentMemo({ invoiceId, from, note, signature: 'x'.repeat(RECEIPT_SIGNATURE_CHARS) })
  )
  const message = buildReceiptMessage({ from, to, invoiceId: draft?.invoiceId, note: draft?.note })
  const signed = await adapter.signMessage(message)
  return buildPaymentMemo({ invoiceId, from, note, signature: hexToBase64Url(signed.signature) })
}

export type ReceiptSender = { name: string; verified: boolean } | null

/**
 * Who a received payment claims to be from. `verified` only when the memo
 * carries a signature from the key that owns that @name in the directory,
 * bound to this recipient address.
 */
export function receiptSender(
  memo: ParsedPaymentMemo | null,
  context: { recipient: string; network: ZcashNetwork; resolve: (name: string) => Claim | undefined }
): ReceiptSender {
  if (!memo?.from) return null
  const name = memo.from.replace(/^@+/, '')
  if (!memo.signature) return { name, verified: false }
  const claim = context.resolve(name)
  if (!claim || claim.network !== context.network) return { name, verified: false }
  try {
    const result = verifyMessageSignature({
      message: buildReceiptMessage({ from: name, to: context.recipient, invoiceId: memo.invoiceId, note: memo.note }),
      signature: base64UrlToHex(memo.signature),
      pubkey: claim.pubkey,
      network: claim.network
    })
    // pubkeyMatch must be explicitly true: the SDK reports valid for an
    // empty pubkey, which would accept any signer.
    return { name, verified: result.valid && result.pubkeyMatch === true }
  } catch {
    return { name, verified: false }
  }
}
