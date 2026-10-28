import { zecToZatoshi } from '../../shared/amount'
import { parsePaymentMemo } from '../../shared/memo'
import type { WalletTx } from './wallet'

export type CheckoutMatch =
  | { status: 'paid'; tx: WalletTx }
  | { status: 'underpaid'; tx: WalletTx; received: bigint }

/**
 * Point-of-sale detection without a server: the sale's QR asks the payer's
 * wallet to put the invoice id in the encrypted memo, so the merchant's own
 * wallet history can recognise the payment. Nothing leaves the browser and
 * no viewing key is shared. Returns the first incoming transaction for this
 * invoice, marked underpaid if it is below the requested amount.
 */
export function findCheckoutPayment(
  history: WalletTx[],
  invoiceId: string,
  requested: bigint
): CheckoutMatch | null {
  for (const tx of history) {
    if (tx.type !== 'receive') continue
    if (parsePaymentMemo(tx.memo)?.invoiceId !== invoiceId) continue
    let received: bigint
    try {
      received = zecToZatoshi(tx.amount.replace(/^[+-]/, ''))
    } catch {
      continue
    }
    return received >= requested ? { status: 'paid', tx } : { status: 'underpaid', tx, received }
  }
  return null
}
