import { ArrowDownLeft, ArrowUpRight, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { parsePaymentMemo } from '../../shared/memo'
import type { WalletTx } from '../lib/wallet'
import { formatAmount } from '../../shared/amount'
import { cn, shortHash, timeAgo } from '../lib/format'

export function TxRow({ tx }: { tx: WalletTx }) {
  const incoming = tx.type === 'receive'
  const shielding = tx.type === 'shield'
  const memo = parsePaymentMemo(tx.memo)
  const title = incoming
    ? memo?.from
      ? `From ${memo.from}`
      : 'Received privately'
    : shielding
      ? 'Shielded funds'
      : 'Sent privately'
  const status = tx.status === 'mined' ? 'Confirmed' : tx.status === 'pending' ? 'Pending' : tx.status

  return (
    <div className={cn('tx-row', incoming && 'is-incoming')}>
      <span className={cn('tx-icon', incoming ? 'in' : shielding ? 'shield' : 'out')}>
        {incoming ? <ArrowDownLeft size={17} /> : shielding ? <ShieldCheck size={17} /> : <ArrowUpRight size={17} />}
      </span>
      <div className="tx-main">
        <div className="tx-title">
          {title}
          {memo?.note ? <span className="tx-note"> · {memo.note}</span> : null}
        </div>
        <div className="tx-sub">
          <span>{timeAgo(tx.timestamp)}</span>
          <span className="tx-status">{status}</span>
          <span className="tx-id" title={tx.txid}>
            {shortHash(tx.txid)}
          </span>
        </div>
      </div>
      <div className={cn('tx-amount', incoming && 'positive')}>
        {incoming ? '+' : '−'}
        {formatAmount(tx.amount)} <span>ZEC</span>
      </div>
    </div>
  )
}

export function TxListEmpty({ children }: { children?: ReactNode }) {
  return (
    <div className="tx-empty">
      <ShieldCheck size={22} />
      <p>No payments yet.</p>
      <span>{children ?? 'Payments will appear here once the wallet syncs.'}</span>
    </div>
  )
}
