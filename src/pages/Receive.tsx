import {
  ArrowDownToLine,
  ArrowLeft,
  Fingerprint,
  Link2,
  Lock,
  QrCode,
  ShieldCheck,
  Sparkles,
  UserRound
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { buildPaymentMemo, newInvoiceId } from '../../shared/memo'
import { buildZip321Uri, encodePaymentPayload } from '../../shared/paylink'
import type { PaymentPayload } from '../../shared/types'
import { isValidAmount } from '../../shared/amount'
import { bytesLength } from '../lib/format'
import { payLink, profileLink } from '../lib/links'
import { useDirectory } from '../lib/directory'
import { useToast } from '../lib/toast'
import { isDemoAdapter } from '../lib/wallet'
import { useWallet } from '../lib/walletContext'
import { useWalletData } from '../lib/useWalletData'
import { Avatar } from '../components/Avatar'
import { ClaimModal } from '../components/ClaimModal'
import { CopyButton, ShareButton } from '../components/CopyButton'
import { EmptyState } from '../components/EmptyState'
import { NetworkBadge } from '../components/NetworkBadge'
import { Qr } from '../components/Qr'
import { Spinner } from '../components/Spinner'
import { TxListEmpty, TxRow } from '../components/TxRow'

export function ReceivePage() {
  const { status, connection, connect, demoMode, adapter } = useWallet()
  const { findByAddress } = useDirectory()
  const { history, refresh: refreshWallet } = useWalletData(status === 'connected')
  const toast = useToast()
  const [claimOpen, setClaimOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [invoiceId, setInvoiceId] = useState(() => newInvoiceId())
  const [qrMode, setQrMode] = useState<'link' | 'zip321'>('link')
  const [simulating, setSimulating] = useState(false)

  const ownClaim = connection ? findByAddress(connection.address) : undefined
  const amountValid = !amount || (isValidAmount(amount) && Number(amount) > 0)
  const noteBytes = bytesLength(note)
  const noteValid = noteBytes <= 300

  const payload: PaymentPayload | null = useMemo(() => {
    if (!connection) return null
    return {
      v: 1,
      net: connection.network,
      to: connection.address,
      h: ownClaim?.username,
      a: amount && amountValid ? amount : undefined,
      m: note && noteValid ? note : undefined,
      i: invoiceId,
      t: Date.now()
    }
  }, [connection, ownClaim?.username, amount, amountValid, note, noteValid, invoiceId])

  const encoded = payload ? encodePaymentPayload(payload) : ''
  const link = encoded ? payLink(encoded) : ''
  const zipUri = payload ? buildZip321Uri(payload) : ''

  const incoming = (history ?? []).filter((tx) => tx.type === 'receive')

  if (status !== 'connected' || !connection) {
    return (
      <div className="page narrow-page">
        <div className="page-head">
          <p className="eyebrow">Receive</p>
          <h1>Get paid privately</h1>
          <p className="muted">Connect a wallet to see your shielded address, name and payment links.</p>
        </div>
        <div className="card connect-card">
          <span className="icon-orb"><ArrowDownToLine size={24} /></span>
          <h2>{status === 'unavailable' ? 'Install Noir Wallet' : 'Connect your wallet'}</h2>
          <p className="muted">
            Your address and name stay in your wallet. Zac only publishes what you choose to share.
          </p>
          {status === 'unavailable' ? (
            <Link className="btn btn-primary" to="/settings">Set up Noir Wallet</Link>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => void connect().catch((cause) => toast.error(cause instanceof Error ? cause.message : 'Could not connect.'))}>
              Connect Noir Wallet
            </button>
          )}
          <Link to="/" className="btn btn-quiet btn-sm"><ArrowLeft size={15} /> Back home</Link>
        </div>
      </div>
    )
  }

  async function simulateIncoming() {
    if (!isDemoAdapter(adapter)) return
    setSimulating(true)
    try {
      adapter.simulateIncoming(
        '0.05',
        buildPaymentMemo({ from: 'bob', note: 'Demo coffee', invoiceId: newInvoiceId() })
      )
      await refreshWallet()
      toast.success('Simulated an incoming demo payment')
    } finally {
      setSimulating(false)
    }
  }

  return (
    <div className="page receive-page">
      <div className="page-head">
        <p className="eyebrow">Receive</p>
        <h1>Get paid privately</h1>
        <p className="muted">
          Share your name or a request link. Both point to your shielded address; neither reveals a payment.
        </p>
      </div>

      <div className="receive-grid">
        <section className="card address-card">
          <div className="card-topline">
            <span className="chip chip-gold"><ShieldCheck size={14} /> Your shielded address</span>
            <NetworkBadge network={connection.network} />
          </div>
          <div className="address-qr">
            <Qr value={`zcash:${connection.address}`} size={196} />
          </div>
          <div className="address-text" title={connection.address}>{connection.address}</div>
          <div className="address-actions">
            <CopyButton value={connection.address} label="Copy address" />
            <CopyButton value={`zcash:${connection.address}`} label="Copy zcash: URI" />
          </div>
          <p className="muted small">
            Scan with any Zcash wallet. This address only receives shielded funds.
          </p>
        </section>

        <section className="card request-card">
          <div className="section-head">
            <div>
              <p className="eyebrow">Payment request</p>
              <h2>Create a private link</h2>
            </div>
            <Link2 size={20} className="muted" />
          </div>
          <div className="request-form-grid">
            <label className="field">
              <span>Amount <em>optional</em></span>
              <div className="amount-input compact">
                <input
                  value={amount}
                  onChange={(event) => setAmount(event.target.value.replace(',', '.'))}
                  placeholder="Any amount"
                  inputMode="decimal"
                  className={!amountValid ? 'is-invalid' : undefined}
                />
                <span className="amount-suffix">ZEC</span>
              </div>
              {!amountValid ? <span className="field-hint tone-error">Invalid amount.</span> : null}
            </label>
            <label className="field">
              <span>Private note <em>optional</em></span>
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="e.g. Coffee, invoice 42"
                maxLength={320}
                className={!noteValid ? 'is-invalid' : undefined}
              />
              <span className={noteValid ? 'field-hint' : 'field-hint tone-error'}>{noteBytes}/300 bytes</span>
            </label>
          </div>

          <div className="qr-toggle">
            <button type="button" className={qrMode === 'link' ? 'is-active' : ''} onClick={() => setQrMode('link')}>
              <QrCode size={14} /> Zac link
            </button>
            <button type="button" className={qrMode === 'zip321' ? 'is-active' : ''} onClick={() => setQrMode('zip321')}>
              <QrCode size={14} /> Any wallet
            </button>
          </div>

          <div className="request-result">
            <div className="request-qr">
              {qrMode === 'link' ? <Qr value={link} size={188} /> : <Qr value={zipUri} size={188} />}
            </div>
            <div className="request-details">
              <span className="eyebrow">{qrMode === 'link' ? 'Zac payment link' : 'ZIP-321 payment URI'}</span>
              <code className="request-link">{qrMode === 'link' ? link : zipUri}</code>
              <div className="request-actions">
                <CopyButton value={qrMode === 'link' ? link : zipUri} label="Copy" />
                {qrMode === 'link' ? <ShareButton value={link} title={`Pay @${ownClaim?.username ?? 'me'} privately`} /> : null}
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  onClick={() => {
                    setInvoiceId(newInvoiceId())
                    toast.info('New request id created')
                  }}
                >
                  <Sparkles size={14} /> New id
                </button>
              </div>
              <p className="muted small">
                {qrMode === 'link'
                  ? 'Everything after the # stays in the browser. Our server never sees the amount or who this is for.'
                  : 'Any ZIP-321 wallet can scan this. The note is included as the encrypted memo.'}
              </p>
            </div>
          </div>
        </section>
      </div>

      <section className="card identity-wide">
        {ownClaim ? (
          <>
            <div className="identity-top">
              <Avatar seed={ownClaim.address} label={`@${ownClaim.username}`} size={50} />
              <div>
                <p className="eyebrow">Your public name</p>
                <h2>@{ownClaim.username}</h2>
              </div>
              <div className="identity-wide-actions">
                <CopyButton value={profileLink(ownClaim.username)} label="Copy profile link" />
                <ShareButton value={profileLink(ownClaim.username)} title={`Pay @${ownClaim.username} privately`} />
              </div>
            </div>
            <p className="muted small">
              The name and address are public, like a phone book. Transaction details are not.
            </p>
          </>
        ) : (
          <>
            <div className="identity-top">
              <span className="icon-orb"><Fingerprint size={24} /></span>
              <div>
                <p className="eyebrow">Make it memorable</p>
                <h2>Claim your @name</h2>
              </div>
              <div className="identity-wide-actions">
                <button type="button" className="btn btn-primary" onClick={() => setClaimOpen(true)}>
                  <Sparkles size={16} /> Claim a name
                </button>
              </div>
            </div>
            <p className="muted small">
              A name is a public pointer to your shielded address. It costs nothing and signs no transaction.
            </p>
          </>
        )}
      </section>

      <section className="card activity-card">
        <div className="section-head">
          <div>
            <p className="eyebrow">Incoming</p>
            <h2>Payments received</h2>
          </div>
          <div className="section-actions">
            {demoMode ? (
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => void simulateIncoming()} disabled={simulating}>
                {simulating ? <Spinner size={13} /> : <UserRound size={14} />} Simulate incoming
              </button>
            ) : null}
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => void refreshWallet()}>
              Refresh
            </button>
          </div>
        </div>
        {incoming.length ? (
          <div className="tx-list">
            {incoming.slice(0, 12).map((tx) => (
              <TxRow key={`${tx.txid}-${tx.timestamp}`} tx={tx} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<ArrowDownToLine size={22} />}
            title="No incoming payments yet"
            action={<CopyButton value={connection.address} label="Copy address" />}
          >
            Share your @name or a payment link. Received payments appear here after the wallet syncs.
          </EmptyState>
        )}
      </section>

      <div className="privacy-note">
        <Lock size={15} />
        <span>
          Your address is public only if you share it. Payments are shielded on-chain. For stronger separation,
          use a separate wallet account per identity.
        </span>
      </div>

      <ClaimModal open={claimOpen} onClose={() => setClaimOpen(false)} />
      <Link to="/" className="back-home"><ArrowLeft size={15} /> Back home</Link>
    </div>
  )
}
