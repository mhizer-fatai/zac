import { ArrowLeft, ArrowLeftRight, Check, Clock, Copy, RotateCcw, ShieldCheck, Store } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatAmount, isValidAmount, zatoshiToZec, zecToZatoshi } from '../../shared/amount'
import { buildPaymentMemo, newInvoiceId, parsePaymentMemo } from '../../shared/memo'
import { buildZip321Uri, encodePaymentPayload } from '../../shared/paylink'
import { findCheckoutPayment, type CheckoutMatch } from '../lib/checkout'
import { copyText } from '../lib/clipboard'
import { useDirectory, useOwnClaim } from '../lib/directory'
import { shortHash } from '../lib/format'
import { payLink } from '../lib/links'
import { formatUsd, usdToZec, useZecPrice, zecToUsd } from '../lib/price'
import { receiptSender } from '../lib/receipt'
import { useToast } from '../lib/toast'
import { useWallet } from '../lib/walletContext'
import { describeWalletError } from '../lib/walletErrors'
import { NetworkBadge } from '../components/NetworkBadge'
import { Qr } from '../components/Qr'
import { Spinner } from '../components/Spinner'

const POLL_MS = 5000

interface Sale {
  invoiceId: string
  amount: string
  note: string
  startedAt: number
}

/**
 * Private point of sale. The merchant sets a price; the screen shows a
 * ZIP-321 QR any shielded wallet can pay. The QR puts this sale's invoice id
 * in the encrypted memo, and the merchant's own wallet history (read here,
 * in the browser) confirms the payment. No processor, server or viewing key
 * ever sees the sale.
 */
export function CheckoutPage() {
  const { status, connection, connect, adapter } = useWallet()
  const { resolve } = useDirectory()
  const ownClaim = useOwnClaim()
  const toast = useToast()
  const usdPrice = useZecPrice(connection?.network)

  const [entry, setEntry] = useState('')
  const [unit, setUnit] = useState<'ZEC' | 'USD'>('USD')
  const [note, setNote] = useState('')
  const [sale, setSale] = useState<Sale | null>(null)
  const [match, setMatch] = useState<CheckoutMatch | null>(null)
  const [pollError, setPollError] = useState<string | null>(null)

  const usdMode = unit === 'USD' && usdPrice !== null
  const amount = usdMode ? (usdToZec(entry, usdPrice) ?? '') : entry
  const amountValid = isValidAmount(amount) && Number(amount) > 0

  const address = connection ? (ownClaim?.address ?? connection.address) : ''

  const qrValue = useMemo(() => {
    if (!sale || !connection) return ''
    return buildZip321Uri({
      v: 1,
      net: connection.network,
      to: address,
      a: sale.amount,
      m: buildPaymentMemo({ invoiceId: sale.invoiceId, note: sale.note }),
      i: sale.invoiceId,
      t: sale.startedAt
    })
  }, [sale, connection, address])

  const zacLink = useMemo(() => {
    if (!sale || !connection) return ''
    return payLink(
      encodePaymentPayload({
        v: 1,
        net: connection.network,
        to: address,
        h: ownClaim?.username,
        a: sale.amount,
        m: sale.note || undefined,
        i: sale.invoiceId,
        t: sale.startedAt
      })
    )
  }, [sale, connection, address, ownClaim?.username])

  // Watch the merchant's own wallet for this invoice until it is paid.
  useEffect(() => {
    if (!sale || match?.status === 'paid') return
    let active = true
    const requested = zecToZatoshi(sale.amount)
    const check = async () => {
      try {
        const history = await adapter.getHistory()
        if (!active) return
        setPollError(null)
        const found = findCheckoutPayment(history, sale.invoiceId, requested)
        if (found) setMatch(found)
      } catch (cause) {
        if (active) setPollError(describeWalletError(cause, 'Could not read your wallet.'))
      }
    }
    void check()
    const id = window.setInterval(() => void check(), POLL_MS)
    return () => {
      active = false
      window.clearInterval(id)
    }
  }, [sale, match?.status, adapter])

  function start() {
    if (!amountValid) return
    setMatch(null)
    setPollError(null)
    setSale({ invoiceId: newInvoiceId(), amount, note: note.trim(), startedAt: Date.now() })
  }

  function reset() {
    setSale(null)
    setMatch(null)
    setEntry('')
    setNote('')
  }

  if (status !== 'connected' || !connection) {
    return (
      <div className="page narrow-page">
        <div className="page-head">
          <p className="eyebrow">Checkout</p>
          <h1>Private point of sale</h1>
          <p className="muted">Connect the wallet that should receive the payments.</p>
        </div>
        <div className="card connect-card">
          <span className="icon-orb"><Store size={24} /></span>
          <h2>{status === 'unavailable' ? 'Install Noir Wallet' : 'Connect your wallet'}</h2>
          <p className="muted">Checkout reads your own wallet history to confirm payments. Nothing is sent to a server.</p>
          {status === 'unavailable' ? (
            <Link className="btn btn-primary" to="/settings">Set up Noir Wallet</Link>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void connect().catch((cause) => toast.error(describeWalletError(cause, 'Could not connect.')))}
            >
              Connect Noir Wallet
            </button>
          )}
        </div>
      </div>
    )
  }

  const usdOf = (zec: string) => (usdPrice !== null ? formatUsd(zecToUsd(zec, usdPrice)) : null)

  if (sale && match?.status === 'paid') {
    const sender = receiptSender(parsePaymentMemo(match.tx.memo), {
      recipient: address,
      network: connection.network,
      resolve
    })
    return (
      <div className="page checkout-page">
        <section className="card checkout-card checkout-paid">
          <div className="checkout-paid-orb"><Check size={44} /></div>
          <p className="eyebrow">Payment received</p>
          <h1>Paid</h1>
          <p className="checkout-amount">{formatAmount(match.tx.amount.replace(/^[+-]/, ''))} <span>ZEC</span></p>
          {usdOf(sale.amount) ? <p className="checkout-usd">≈ {usdOf(sale.amount)}</p> : null}
          <p className="muted">
            {sender?.verified ? `From @${sender.name} · verified` : sender ? `Says @${sender.name} · unverified` : 'From a private payer'}
            {sale.note ? ` · ${sale.note}` : ''}
          </p>
          <p className="submitted-status">
            <Clock size={14} /> {match.tx.status === 'mined' ? 'Confirmed on-chain' : 'Seen by your wallet · confirming'} ·{' '}
            {shortHash(match.tx.txid)}
          </p>
          <button type="button" className="btn btn-primary btn-lg" onClick={reset}>
            <RotateCcw size={17} /> New sale
          </button>
        </section>
      </div>
    )
  }

  if (sale) {
    return (
      <div className="page checkout-page">
        <section className="card checkout-card">
          <div className="checkout-top">
            <span className="checkout-merchant">{ownClaim ? `@${ownClaim.username}` : 'Checkout'}</span>
            <NetworkBadge network={connection.network} />
          </div>
          <p className="checkout-amount">{formatAmount(sale.amount)} <span>ZEC</span></p>
          {usdOf(sale.amount) ? <p className="checkout-usd">≈ {usdOf(sale.amount)}</p> : null}
          {sale.note ? <p className="muted">{sale.note}</p> : null}
          <div className="checkout-qr">
            <Qr value={qrValue} size={280} />
          </div>
          <p className="checkout-waiting">
            <Spinner size={15} /> Scan with any Zcash wallet · waiting for payment
          </p>
          {match?.status === 'underpaid' ? (
            <p className="alert alert-warning">
              Received {formatAmount(zatoshiToZec(match.received))} ZEC, less than
              the {formatAmount(sale.amount)} ZEC requested.
            </p>
          ) : null}
          {pollError ? <p className="form-error">{pollError}</p> : null}
          <p className="muted small checkout-help">
            The payment is recognised by this sale's code inside the encrypted memo, read from your own wallet. It
            shows here once your wallet sees it, usually within a minute or two of being mined.
          </p>
          <div className="checkout-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => void copyText(zacLink).then((ok) => (ok ? toast.success('Payment link copied') : toast.error('Could not copy.')))}
            >
              <Copy size={14} /> Copy Zac link
            </button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={reset}>
              <ArrowLeft size={14} /> Cancel sale
            </button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="page narrow-page checkout-page">
      <div className="page-head">
        <p className="eyebrow">Checkout</p>
        <h1>Private point of sale</h1>
        <p className="muted">
          Enter a price and show the QR code. The customer pays from any Zcash wallet, and this screen confirms it
          from your own wallet. No payment processor sees the sale.
        </p>
      </div>
      <section className="card">
        <label className="field">
          <span>Price</span>
          <div className="amount-input">
            <input
              value={entry}
              onChange={(event) => setEntry(event.target.value.replace(',', '.'))}
              placeholder="0.00"
              inputMode="decimal"
              autoComplete="off"
              autoFocus
              className={entry && !amountValid ? 'is-invalid' : undefined}
            />
            {usdPrice !== null ? (
              <button
                type="button"
                className="unit-toggle"
                onClick={() => {
                  if (usdMode) setEntry(amountValid ? amount : '')
                  else setEntry(amountValid ? zecToUsd(amount, usdPrice).toFixed(2) : '')
                  setUnit(usdMode ? 'ZEC' : 'USD')
                }}
              >
                {usdMode ? 'USD' : 'ZEC'} <ArrowLeftRight size={12} />
              </button>
            ) : (
              <span className="amount-suffix">ZEC</span>
            )}
          </div>
          {entry && !amountValid ? (
            <span className="field-hint tone-error">
              {usdMode ? 'Enter a dollar amount with at most 2 decimal places.' : 'Enter a valid ZEC amount.'}
            </span>
          ) : amountValid && usdPrice !== null ? (
            <span className="field-hint usd-hint">
              {usdMode ? `Charges ${formatAmount(amount)} ZEC` : `≈ ${formatUsd(zecToUsd(amount, usdPrice))}`}
            </span>
          ) : null}
        </label>
        <label className="field">
          <span>Note <em>optional</em></span>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. Order 12 · flat white"
            maxLength={120}
          />
        </label>
        <button type="button" className="btn btn-primary btn-block btn-lg" disabled={!amountValid} onClick={start}>
          <Store size={17} /> Show payment QR
        </button>
        <p className="form-note">
          <ShieldCheck size={14} />
          <span>Payments arrive shielded. The customer stays anonymous unless they choose to sign their name.</span>
        </p>
      </section>
    </div>
  )
}

