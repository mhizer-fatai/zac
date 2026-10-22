import { ArrowDownToLine, ArrowLeft, ChevronDown, Copy, Link2, QrCode, ShieldCheck, Sparkles, UserRound } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { newInvoiceId } from '../../shared/memo'
import { buildZip321Uri, encodePaymentPayload } from '../../shared/paylink'
import type { PaymentPayload } from '../../shared/types'
import { isValidAmount } from '../../shared/amount'
import { copyText } from '../lib/clipboard'
import { bytesLength } from '../lib/format'
import { payLink, profileLink } from '../lib/links'
import { useOwnClaim } from '../lib/directory'
import { useToast } from '../lib/toast'
import { useWallet } from '../lib/walletContext'
import { ClaimModal } from '../components/ClaimModal'
import { CopyButton, ShareButton } from '../components/CopyButton'
import { Modal } from '../components/Modal'
import { NetworkBadge } from '../components/NetworkBadge'
import { Qr } from '../components/Qr'

export function ReceivePage() {
  const { status, connection, connect } = useWallet()
  const toast = useToast()
  const ownClaim = useOwnClaim()
  const [claimOpen, setClaimOpen] = useState(false)
  const [requestOpen, setRequestOpen] = useState(false)

  if (status !== 'connected' || !connection) {
    return (
      <div className="page narrow-page">
        <div className="page-head">
          <p className="eyebrow">Receive</p>
          <h1>Receive</h1>
          <p className="muted">Connect a wallet to see your shielded address and create payment links.</p>
        </div>
        <div className="card connect-card">
          <span className="icon-orb"><ArrowDownToLine size={24} /></span>
          <h2>{status === 'unavailable' ? 'Install Noir Wallet' : 'Connect your wallet'}</h2>
          <p className="muted">Your keys stay in your wallet. Zac only shows what you choose to share.</p>
          {status === 'unavailable' ? (
            <Link className="btn btn-primary" to="/settings">Set up Noir Wallet</Link>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void connect().catch((cause) => toast.error(cause instanceof Error ? cause.message : 'Could not connect.'))}
            >
              Connect Noir Wallet
            </button>
          )}
          <Link to="/" className="btn btn-quiet btn-sm"><ArrowLeft size={15} /> Back home</Link>
        </div>
      </div>
    )
  }

  // The name's registered address when there is one, so the address shown
  // here, the QR and every link agree with what payers resolve for @name.
  const address = ownClaim?.address ?? connection.address
  const zcashUri = `zcash:${address}`

  async function copy(value: string, label: string) {
    if (await copyText(value)) toast.success(`${label} copied`)
    else toast.error('Could not copy to the clipboard.')
  }

  return (
    <div className="page receive-page">
      <div className="receive-head">
        <div className="page-head">
          <p className="eyebrow">Receive</p>
          <h1>Receive</h1>
          <p className="muted">Scan or copy your shielded address. Only shielded funds can be sent to it.</p>
        </div>
        <RequestMenu
          onCreateLink={() => setRequestOpen(true)}
          onCopyProfile={ownClaim ? () => void copy(profileLink(ownClaim.username), 'Profile link') : undefined}
          onCopyUri={() => void copy(zcashUri, 'zcash: URI')}
        />
      </div>

      <section className="card receive-card">
        <div className="receive-card-top">
          {ownClaim ? (
            <span className="receive-name">@{ownClaim.username}</span>
          ) : (
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setClaimOpen(true)}>
              <Sparkles size={14} /> Claim a name
            </button>
          )}
          <NetworkBadge network={connection.network} />
        </div>
        <div className="receive-qr">
          <Qr value={zcashUri} size={232} />
        </div>
        <span className="receive-label"><ShieldCheck size={13} /> Shielded address</span>
        <div className="receive-address" title={address}>{address}</div>
        <CopyButton value={address} label="Copy address" className="btn-secondary receive-copy" />
      </section>

      <RequestModal
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        address={address}
        network={connection.network}
        username={ownClaim?.username}
      />
      <ClaimModal open={claimOpen} onClose={() => setClaimOpen(false)} />
    </div>
  )
}

function RequestMenu({
  onCreateLink,
  onCopyProfile,
  onCopyUri
}: {
  onCreateLink: () => void
  onCopyProfile?: () => void
  onCopyUri: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const run = (action: () => void) => () => {
    setOpen(false)
    action()
  }

  return (
    <div className="menu" ref={ref}>
      <button
        type="button"
        className="btn btn-primary"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Link2 size={16} /> Request payment <ChevronDown size={15} />
      </button>
      {open ? (
        <div className="menu-list" role="menu">
          <button type="button" role="menuitem" onClick={run(onCreateLink)}>
            <Link2 size={15} />
            <span>
              <strong>Create payment link</strong>
              <small>Set an amount and a private note</small>
            </span>
          </button>
          {onCopyProfile ? (
            <button type="button" role="menuitem" onClick={run(onCopyProfile)}>
              <UserRound size={15} />
              <span>
                <strong>Copy profile link</strong>
                <small>Anyone can pay your @name, any amount</small>
              </span>
            </button>
          ) : null}
          <button type="button" role="menuitem" onClick={run(onCopyUri)}>
            <Copy size={15} />
            <span>
              <strong>Copy zcash: URI</strong>
              <small>For wallets that don't use Zac</small>
            </span>
          </button>
        </div>
      ) : null}
    </div>
  )
}

function RequestModal({
  open,
  onClose,
  address,
  network,
  username
}: {
  open: boolean
  onClose: () => void
  address: string
  network: PaymentPayload['net']
  username?: string
}) {
  const toast = useToast()
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [invoiceId, setInvoiceId] = useState(() => newInvoiceId())
  const [qrMode, setQrMode] = useState<'link' | 'zip321'>('link')

  // Every request opened from the menu is a new invoice.
  useEffect(() => {
    if (open) setInvoiceId(newInvoiceId())
  }, [open])

  const amountValid = !amount || (isValidAmount(amount) && Number(amount) > 0)
  const noteBytes = bytesLength(note)
  const noteValid = noteBytes <= 300

  const payload: PaymentPayload = useMemo(
    () => ({
      v: 1,
      net: network,
      to: address,
      h: username,
      a: amount && amountValid ? amount : undefined,
      m: note && noteValid ? note : undefined,
      i: invoiceId,
      t: Date.now()
    }),
    [network, address, username, amount, amountValid, note, noteValid, invoiceId]
  )
  const link = payLink(encodePaymentPayload(payload))
  const zipUri = buildZip321Uri(payload)
  const value = qrMode === 'link' ? link : zipUri

  return (
    <Modal open={open} onClose={onClose} title="Create payment link" className="request-modal">
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
          <Qr value={value} size={176} />
        </div>
        <div className="request-details">
          <code className="request-link">{value}</code>
          <div className="request-actions">
            <CopyButton value={value} label="Copy" className="btn-secondary" />
            {qrMode === 'link' ? <ShareButton value={link} title={`Pay ${username ? `@${username}` : 'me'} privately`} /> : null}
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
              ? 'Request details stay after the # in the link. Our server never sees them.'
              : 'Any ZIP-321 wallet can scan this. The note travels as the encrypted memo.'}
          </p>
        </div>
      </div>
    </Modal>
  )
}
