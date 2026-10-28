import {
  Smartphone,
  Clock,
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  Lock,
  ShieldCheck,
  Sparkles,
  Wallet
} from 'lucide-react'
import { useMemo, useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { zecToZatoshi, isValidAmount } from '../../shared/amount'
import { buildZip321Uri, decodePaymentPayload } from '../../shared/paylink'
import type { PaymentPayload } from '../../shared/types'
import { Avatar } from '../components/Avatar'
import { CopyButton } from '../components/CopyButton'
import { NetworkBadge } from '../components/NetworkBadge'
import { Qr } from '../components/Qr'
import { RevealNameToggle, useRevealName } from '../components/RevealName'
import { Spinner } from '../components/Spinner'
import { formatAmount } from '../../shared/amount'
import { shortAddress, timeAgo } from '../lib/format'
import { useDirectory, useOwnClaim } from '../lib/directory'
import { formatUsd, useZecPrice, zecToUsd } from '../lib/price'
import { buildReceiptMemo } from '../lib/receipt'
import { buildPaymentMemo } from '../../shared/memo'
import { useToast } from '../lib/toast'
import { useWallet } from '../lib/walletContext'
import { useWalletData } from '../lib/useWalletData'
import { describeWalletError } from '../lib/walletErrors'
import { schedulePaid } from '../lib/sealedRequest'

export function PayPage({
  encodedPayload,
  sealedToken,
  expiresAt
}: {
  /** Set by SealedPayPage after decrypting a sealed request. */
  encodedPayload?: string
  sealedToken?: string
  expiresAt?: number
} = {}) {
  const params = useParams<{ payload: string }>()
  const encoded = encodedPayload ?? params.payload
  const { status, connection, connect, adapter } = useWallet()
  const { resolve, loading: directoryLoading } = useDirectory()
  const { balance, refresh: refreshWallet } = useWalletData(status === 'connected')
  const toast = useToast()

  const decoded = useMemo(() => {
    if (!encoded) return { ok: false as const, error: 'Missing payment request.' }
    return decodePaymentPayload(encoded)
  }, [encoded])

  const payload: PaymentPayload | null = decoded.ok ? decoded.payload : null
  const claim = payload?.h ? resolve(payload.h) : undefined
  const ownClaim = useOwnClaim()
  const usdPrice = useZecPrice(payload?.net)
  const [revealName, setRevealName] = useRevealName()

  const [customAmount, setCustomAmount] = useState('')
  const [sending, setSending] = useState(false)
  const [txid, setTxid] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAddress, setShowAddress] = useState(false)

  // Sealed links expire: tick a live countdown and stop payment at zero.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!expiresAt) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [expiresAt])
  const remainingMs = expiresAt ? Math.max(0, expiresAt - now) : 0
  const linkExpired = Boolean(expiresAt) && remainingMs === 0
  const countdown = `${Math.floor(remainingMs / 60000)}:${String(Math.floor((remainingMs % 60000) / 1000)).padStart(2, '0')}`
  useEffect(() => {
    setCustomAmount('')
    setTxid(null)
    setError(null)
  }, [payload?.i])

  const amount = payload?.a ?? customAmount
  const amountValid = isValidAmount(amount) && Number(amount) > 0
  const handleMismatch = Boolean(payload?.h && claim && claim.address !== payload.to)
  const handleMissing = Boolean(payload?.h && !claim && !directoryLoading)
  const directoryChecking = Boolean(payload?.h) && !claim && directoryLoading
  const networkMismatch = Boolean(payload && connection && payload.net !== connection.network)
  const selfRequest = Boolean(payload && connection && (payload.to === connection.address || payload.to === ownClaim?.address))
  const canPay =
    Boolean(payload) &&
    Boolean(connection) &&
    !handleMismatch &&
    !handleMissing &&
    !directoryChecking &&
    !networkMismatch &&
    !linkExpired &&
    amountValid &&
    !sending
  const zipUri = useMemo(
    () =>
      payload
        ? buildZip321Uri({
            ...payload,
            a: payload.a ?? (amountValid ? amount : undefined),
            // Carry the request code in the memo, as a Zac payment does, so the
            // requester can recognise payments made from other wallets too.
            m: buildPaymentMemo({ invoiceId: payload.i, note: payload.m })
          })
        : '',
    [payload, amount, amountValid]
  )

  async function handlePay() {
    if (!payload || !connection) return
    setError(null)
    if (!amountValid) {
      setError('Enter an amount with up to 8 decimal places.')
      return
    }
    if (handleMismatch || handleMissing) {
      setError('This link does not match the claimed name. Refusing to pay.')
      return
    }
    if (payload.h && !claim && directoryLoading) {
      setError('Still checking the name. Try again in a moment.')
      return
    }
    if (networkMismatch) {
      setError('This request is for a different network than your wallet.')
      return
    }
    if (balance && zecToZatoshi(amount) > zecToZatoshi(balance.shielded)) {
      setError('That is more than your shielded balance.')
      return
    }
    setSending(true)
    try {
      const memo = await buildReceiptMemo({
        adapter,
        to: payload.to,
        invoiceId: payload.i,
        from: revealName ? ownClaim?.username : undefined,
        note: payload.m
      })
      const hash = await adapter.send({ to: payload.to, amount, memo })
      setTxid(hash)
      // One payment per sealed link: tell the server so the link stops working.
      if (sealedToken) schedulePaid(sealedToken)
      await refreshWallet()
    } catch (cause) {
      const message = describeWalletError(cause, 'The payment did not go through.')
      setError(message)
      toast.error(message)
    } finally {
      setSending(false)
    }
  }

  async function handleConnect() {
    try {
      await connect()
    } catch (cause) {
      toast.error(describeWalletError(cause, 'Could not connect the wallet.'))
    }
  }

  if (!decoded.ok) {
    return (
      <div className="page narrow-page">
        <div className="card error-card">
          <span className="icon-orb danger"><AlertTriangle size={24} /></span>
          <h1>This link cannot be read</h1>
          <p className="muted">{decoded.error}</p>
          <Link to="/" className="btn btn-primary">Back to Zac</Link>
        </div>
      </div>
    )
  }

  if (!payload) return null

  if (txid) {
    return (
      <div className="page narrow-page">
        <div className="card success-card pay-success">
          <div className="success-orb">
            <Check size={30} />
          </div>
          <p className="eyebrow">Shielded payment</p>
          <h1>Payment submitted</h1>
          <p className="success-amount">{formatAmount(amount)} <span>ZEC</span></p>
          {usdPrice !== null ? <p className="success-usd">≈ {formatUsd(zecToUsd(amount, usdPrice))}</p> : null}
          <p className="muted">
            to {claim ? `@${claim.username}` : shortAddress(payload.to, 12, 8)}
          </p>
          <p className="submitted-status">
            <Clock size={14} /> Broadcast to the Zcash network · confirms in a few minutes
          </p>
          <div className="txid-box">
            <span>Transaction</span>
            <code>{txid}</code>
            <CopyButton value={txid} iconOnly />
          </div>
          <p className="muted small">
            Your wallet has submitted this shielded payment. It is final once it is included in a block; follow it
            under Recent activity. The recipient sees it, with its encrypted receipt, after their wallet syncs.
            Nobody else can read the details. You can close your wallet window.
          </p>
          <div className="success-actions">
            <Link to="/" className="btn btn-primary">View activity</Link>
            <Link to="/receive" className="btn btn-secondary">Receive</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page pay-page">
      <div className="pay-wrap">
        <section className="card pay-card">
          <div className="card-topline">
            <span className="chip chip-gold">
              <ShieldCheck size={14} /> {sealedToken ? 'Sealed payment request' : 'Private payment request'}
            </span>
            {expiresAt ? (
              <span className={linkExpired ? 'sealed-expiry is-expired' : 'sealed-expiry'}>
                {linkExpired ? 'Expired' : `Expires in ${countdown}`}
              </span>
            ) : null}
            <NetworkBadge network={payload.net} />
          </div>

          <div className="pay-from">
            <Avatar
              seed={claim?.address ?? payload.to}
              label={payload.h ? `@${payload.h}` : claim ? `@${claim.username}` : undefined}
              size={52}
            />
            <div>
              <p className="eyebrow">
                {handleMismatch
                  ? 'Name mismatch'
                  : claim
                    ? 'Pay'
                    : payload.h
                      ? 'Unverified name'
                      : 'Shielded address'}
              </p>
              <h1>{payload.h ? `@${payload.h}` : shortAddress(payload.to, 10, 8)}</h1>
              {claim && !handleMismatch ? (
                <span className="verified-line">
                  <ShieldCheck size={13} /> Verified name · {timeAgo(payload.t)}
                </span>
              ) : handleMismatch ? (
                <span className="verified-line danger">
                  <AlertTriangle size={13} /> Does not match this link
                </span>
              ) : payload.h ? (
                <span className="verified-line warn">
                  <AlertTriangle size={13} /> Name not verified
                </span>
              ) : (
                <span className="verified-line">
                  <AlertTriangle size={13} /> Address-only request
                </span>
              )}
            </div>
          </div>

          <div className="pay-amount-block">
            {payload.a ? (
              <div className="pay-amount">
                {formatAmount(payload.a)} <span>ZEC</span>
              </div>
            ) : null}
            {payload.a && usdPrice !== null ? (
              <p className="pay-usd">≈ {formatUsd(zecToUsd(payload.a, usdPrice))}</p>
            ) : null}
            {payload.a ? null : (
              <label className="field pay-amount-field">
                <span>Amount</span>
                <div className="amount-input">
                  <input
                    value={customAmount}
                    onChange={(event) => setCustomAmount(event.target.value.replace(',', '.'))}
                    placeholder="0.00"
                    inputMode="decimal"
                    autoFocus
                    className={customAmount && !amountValid ? 'is-invalid' : undefined}
                  />
                  <span className="amount-suffix">ZEC</span>
                </div>
                {!amountValid && customAmount ? (
                  <span className="field-hint tone-error">Enter a valid amount.</span>
                ) : amountValid && usdPrice !== null ? (
                  <span className="field-hint usd-hint">≈ {formatUsd(zecToUsd(customAmount, usdPrice))}</span>
                ) : null}
              </label>
            )}
            {payload.m ? (
              <blockquote className="pay-note">
                <Lock size={13} />
                <span>{payload.m}</span>
              </blockquote>
            ) : null}
          </div>

          <button type="button" className="pay-address-toggle" onClick={() => setShowAddress((value) => !value)}>
            <span>Recipient address</span>
            <span className="mono">{shortAddress(payload.to, 14, 10)}</span>
            <ChevronDown size={15} className={showAddress ? 'rotate-180' : ''} />
          </button>
          {showAddress ? (
            <div className="pay-address-full">
              <code>{payload.to}</code>
              <CopyButton value={payload.to} iconOnly />
            </div>
          ) : null}

          {handleMismatch ? (
            <div className="alert alert-danger">
              <AlertTriangle size={16} />
              <span>
                This link claims to be @{payload.h}, but that name resolves to a different address. Do not pay it.
              </span>
            </div>
          ) : null}
          {handleMissing && !directoryLoading ? (
            <div className="alert alert-danger">
              <AlertTriangle size={16} />
              <span>@{payload.h} is not in the Zac directory. This link could be forged.</span>
            </div>
          ) : null}
          {linkExpired ? (
            <div className="alert alert-danger">
              <AlertTriangle size={16} />
              <span>This payment link has expired. Ask for a new one; no payment can be made with it.</span>
            </div>
          ) : null}
          {networkMismatch ? (
            <div className="alert alert-warning">
              <AlertTriangle size={16} />
              <span>
                This request is on {payload.net}; your wallet is on {connection?.network}. Install the matching
                Noir build or open the request in a {payload.net} wallet.
              </span>
            </div>
          ) : null}
          {selfRequest ? (
            <div className="alert alert-info">
              <Sparkles size={16} />
              <span>This is your own payment request. You can still test the flow.</span>
            </div>
          ) : null}
          {!payload.a && amountValid && balance ? (
            <p className="field-hint">Available: {formatAmount(balance.shielded)} ZEC shielded.</p>
          ) : null}

          {status === 'connected' && connection ? (
            <>
              <RevealNameToggle handle={ownClaim?.username} reveal={revealName} onChange={setRevealName} />
              <button type="button" className="btn btn-primary btn-block btn-lg" disabled={!canPay} onClick={() => void handlePay()}>
                {handleMismatch || handleMissing ? (
                  <>
                    <Lock size={17} /> Payment blocked
                  </>
                ) : sending ? (
                  <>
                    <Spinner /> Waiting for wallet approval…
                  </>
                ) : (
                  <>
                    <Lock size={17} /> {amountValid ? `Pay ${formatAmount(amount)} ZEC privately` : 'Enter an amount'}
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-primary btn-block btn-lg"
                onClick={() => void handleConnect()}
                disabled={status === 'unavailable'}
              >
                <Wallet size={17} /> Connect Noir Wallet
              </button>
              {status === 'unavailable' ? (
                <p className="field-hint">
                  Noir Wallet is not installed. <Link to="/settings">Set it up</Link>, or pay from any wallet
                  with the QR below.
                </p>
              ) : null}
            </>
          )}

          {error ? <p className="form-error">{error}</p> : null}
          <div className="pay-privacy-line">
            <Lock size={13} />
            <span>This request is decoded in your browser. Our server never saw it.</span>
          </div>
        </section>

        <aside className="card pay-side">
          <p className="eyebrow">Any wallet</p>
          <h2>Pay from another wallet</h2>
          <p className="muted small">
            On a phone, open it in your wallet app. On a computer, scan the code with Zodl, Zingo!, Ywallet or any
            wallet that supports shielded payments.
          </p>
          <Qr value={zipUri} size={190} />
          <div className="pay-side-code">
            <code>{zipUri}</code>
          </div>
          <a className="btn btn-primary btn-block" href={zipUri}>
            <Smartphone size={16} /> Open in wallet app
          </a>
          <div className="pay-side-actions">
            <CopyButton value={zipUri} label="Copy URI" />
            <CopyButton value={payload.to} label="Copy address" />
          </div>
          <p className="field-hint">
            This code is a standard wallet request: anyone who scans it or sees your screen can read the
            address, amount and note.
          </p>
          <div className="pay-side-foot">
            <ShieldCheck size={14} />
            <span>Only shielded addresses are accepted by Zac.</span>
          </div>
        </aside>
      </div>
      <Link to="/" className="back-home"><ArrowLeft size={15} /> Back home</Link>
    </div>
  )
}
