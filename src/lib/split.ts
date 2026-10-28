import { zatoshiToZec, zecToZatoshi } from '../../shared/amount'
import { parsePaymentMemo } from '../../shared/memo'
import type { ZcashNetwork } from '../../shared/types'
import type { WalletTx } from './wallet'

/**
 * Bill splitting. The organiser enters a total and the people sharing it;
 * Zac creates one sealed, one-payment link per person. Names stay in this
 * browser only (never in links or on the server). A share counts as paid
 * when the organiser's own wallet history shows an incoming payment whose
 * encrypted memo carries that share's code, so no server tracks who paid.
 */

export type ShareStatus = 'pending' | 'paid' | 'partial'

export interface SplitShare {
  name: string
  amount: string
  invoiceId: string
  token: string
  expiresAt: number
  status: ShareStatus
  txid?: string
}

export interface Split {
  id: string
  title: string
  network: ZcashNetwork
  total: string
  /** The organiser's own share, already paid, if they included themselves. */
  ownShare?: string
  createdAt: number
  shares: SplitShare[]
}

/**
 * Divide a total into `count` equal shares in whole zatoshi. Any remainder
 * (at most count-1 zatoshi) is absorbed by the organiser, never charged.
 */
export function divideTotal(total: string, count: number): string {
  if (!Number.isInteger(count) || count < 1) throw new Error('Invalid number of people')
  return zatoshiToZec(zecToZatoshi(total) / BigInt(count))
}

/** Match a share to an incoming payment by the code in its memo. */
export function shareStatus(history: WalletTx[], share: Pick<SplitShare, 'invoiceId' | 'amount'>): { status: ShareStatus; txid?: string } {
  for (const tx of history) {
    if (tx.type !== 'receive') continue
    if (parsePaymentMemo(tx.memo)?.invoiceId !== share.invoiceId) continue
    try {
      const received = zecToZatoshi(tx.amount.replace(/^[+-]/, ''))
      return { status: received >= zecToZatoshi(share.amount) ? 'paid' : 'partial', txid: tx.txid }
    } catch {
      continue
    }
  }
  return { status: 'pending' }
}

const STORAGE_KEY = 'zac.splits.v1'

export function loadSplits(): Split[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(value) ? (value as Split[]) : []
  } catch {
    return []
  }
}

export function saveSplits(splits: Split[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(splits.slice(0, 50)))
  } catch {
    /* storage may be unavailable */
  }
}
