import {
  ArrowLeft,
  Check,
  Lock,
  ShieldCheck,
  Wallet,
  Zap
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Claim } from '../../shared/types'
import { classifyAddress } from '../../shared/address'
import { buildPaymentMemo, newInvoiceId } from '../../shared/memo'
import { isValidAmount, zecToZatoshi, formatAmount } from '../../shared/amount'
import { validateUsername } from '../../shared/username'
import { Avatar } from '../components/Avatar'
import { CopyButton } from '../components/CopyButton'
import { NetworkBadge } from '../components/NetworkBadge'
import { RevealNameToggle, useRevealName } from '../components/RevealName'
import { Spinner } from '../components/Spinner'
import { bytesLength, shortAddress } from '../lib/format'
import { useDirectory, useOwnClaim } from '../lib/directory'
import { buildReceiptMemo } from '../lib/receipt'
import { useToast } from '../lib/toast'
import { useWallet } from '../lib/walletContext'
import { useWalletData } from '../lib/useWalletData'
import { describeWalletError } from '../lib/walletErrors'

interface ResolvedRecipient {
  address: string
  network: 'mainnet' | 'testnet'
  claim?: Claim
}

function resolveRecipient(
  input: string,
  resolve: (username: string) => Claim | undefined,
  findByAddress: (address: string) => Claim | undefined
): { recipient?: ResolvedRecipient; error?: string } {
  const trimmed = input.trim()
  if (!trimmed) return { error: 'Enter a name or a shielded address.' }
  if (trimmed.startsWith('@') || /^[a-zA-Z0-9_]{3,20}$/.test(trimmed)) {
    const checked = validateUsername(trimmed)
    if (!checked.ok) return { error: checked.error }
    const claim = resolve(checked.username)
    if (!claim) return { error: `@${checked.username} has not claimed a name yet.` }
    return { recipient: { address: claim.address, network: claim.network, claim } }
  }
  const info = classifyAddress(trimmed)
  // A unified address with a transparent receiver is paid through its
  // shielded receivers only, so the wallet cannot fall back to a public send.
  const address = info.kind === 'mixed' ? info.shieldedOnly : info.kind === 'shielded' ? info.address : undefined
  if (!address || info.network === 'unknown') {
    return { error: info.reason ?? 'Enter a shielded Zcash address.' }
  }
  const claim = findByAddress(address)
  return { recipient: { address, network: info.network, claim } }
}

export function SendPage() {
  const { status, connection, connect, adapter } = useWallet()
  const { resolve, findByAddress } = useDirectory()
  const { balance, refresh: refreshWallet } = useWalletData(status === 'connected')
  const toast = useToast()
  const [searchParams] = useSearchParams()

  const [recipientInput, setRecipientInput] = useState(searchParams.get('to') ?? '')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [maxLoading, setMaxLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [txid, setTxid] = useState<string | null>(null)
  const [lastAmount, setLastAmount] = useState('')
  const [lastRecipient, setLastRecipient] = useState<ResolvedRecipient | null>(null)

  const resolved = useMemo(
    () => (recipientInput.trim() ? resolveRecipient(recipientInput, resolve, findByAddress) : {}),
    [recipientInput, resolve, findByAddress]
  )
  const ownClaim = useOwnClaim()
  const [revealName, setRevealName] = useRevealName()
  const fromName = revealName ? ownClaim?.username : undefined
  const recipient = resolved.recipient
  const networkMismatch =
    Boolean(recipient && connection && recipient.network !== connection.network)
  const recipientError = resolved.error
  const amountValid = isValidAmount(amount) && Number(amount) > 0
  const noteBytes = bytesLength(note)
  const noteValid = noteBytes <= 300
  const canSend =
    status === 'connected' &&
    Boolean(connection) &&
    Boolean(recipient) &&
    !networkMismatch &&
    amountValid &&
    noteValid &&
    !sending

  const invoiceId = useMemo(() => newInvoiceId(), [recipient?.address, amount, note])
  const memo = useMemo(
    () =>
      buildPaymentMemo({
        invoiceId,
        from: fromName,
        note
      }),
    [invoiceId, fromName, note]
  )

  useEffect(() => {
    if (recipientError) setError(null)
  }, [recipientError])
  async function handleMax() {
    if (!recipient) return
    setMaxLoading(true)
    try {
      const max = await adapter.getMaxTransfer(recipient.address, memo)
      if (max) {
        setAmount(max.maxAmount)
        toast.info(`Max after the ${formatAmount(max.fee)} ZEC network fee`)
      }
    } catch (cause) {
      toast.error(describeWalletError(cause, 'Could not estimate the maximum.'))
    } finally {
      setMaxLoading(false)
    }
  }

  async function handleSend() {
    setError(null)
    if (!connection || !recipient) return
    if (!amountValid) {
      setError('Enter a valid amount with up to 8 decimal places.')
      return
    }
    if (networkMismatch) {
      setError('This recipient is on a different network than your wallet.')
      return
    }
    if (balance && zecToZatoshi(amount) > zecToZatoshi(balance.shielded)) {
      setError('That is more than your shielded balance.')
      return
    }
    setSending(true)
    try {
      // Signed only if the payer chose to reveal their name. Memo contents
      // do not change the ZIP-317 fee, so the Max estimate above still holds.
      const receipt = await buildReceiptMemo({ adapter, to: recipient.address, invoiceId, from: fromName, note })
      const hash = await adapter.send({ to: recipient.address, amount, memo: receipt })
      setTxid(hash)
      setLastAmount(amount)
      setLastRecipient(recipient)
      await refreshWallet()
    } catch (cause) {
      const message = describeWalletError(cause, 'The payment did not go through.')
      setError(message)
      toast.error(message)
    } finally {
      setSending(false)
    }
  }

  function reset() {
    setTxid(null)
    setAmount('')
    setNote('')
    setRecipientInput('')
    setError(null)
    setLastRecipient(null)
  }

  if (status !== 'connected' || !connection) {
    return (
      <div className="page narrow-page">
        <div className="page-head">
          <p className="eyebrow">Send</p>
          <h1>Send privately</h1>
          <p className="muted">Connect a self-custodial wallet to send shielded ZEC by @name or address.</p>
        </div>
        <div className="card connect-card">
          <span className="icon-orb"><Wallet size={24} /></span>
          <h2>{status === 'unavailable' ? 'Install Noir Wallet' : 'Connect your wallet'}</h2>
          <p className="muted">
            {status === 'unavailable'
              ? 'Noir Wallet is a Chrome extension. Install the mainnet build from the Chrome Web Store, or the testnet build from GitHub Releases.'
              : 'Zac never sees your keys. The wallet approves every shielded payment.'}
          </p>
          {status === 'unavailable' ? (
            <Link className="btn btn-primary" to="/settings">Set up Noir Wallet</Link>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => void connect().catch((cause) => toast.error(describeWalletError(cause, 'Could not connect.')))}>
              <Wallet size={16} /> Connect Noir Wallet
            </button>
          )}
          <Link to="/" className="btn btn-quiet btn-sm"><ArrowLeft size={15} /> Back home</Link>
        </div>
      </div>
    )
  }

  if (txid) {
    return (
      <div className="page narrow-page">
        <div className="card success-card">
          <div className="success-orb">
            <Check size={30} />
          </div>
          <p className="eyebrow">Shielded payment</p>
          <h1>Sent privately</h1>
          <p className="success-amount">
            {formatAmount(lastAmount)} <span>ZEC</span>
          </p>
          {lastRecipient ? (
            <p className="muted">
              to {lastRecipient.claim ? `@${lastRecipient.claim.username}` : shortAddress(lastRecipient.address, 12, 8)}
            </p>
          ) : null}
          <div className="txid-box">
            <span>Transaction</span>
            <code>{txid}</code>
            <CopyButton value={txid} iconOnly />
          </div>
          <p className="muted small">
            The recipient will see a private receipt memo in their wallet. Nobody else can read it.
          </p>
          <div className="success-actions">
            <button type="button" className="btn btn-primary" onClick={reset}>
              Send another
            </button>
            <Link to="/" className="btn btn-secondary">Done</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-head">
        <p className="eyebrow">Send</p>
        <h1>Send privately</h1>
        <p className="muted">
          Pay an @name or a shielded address. The payment is shielded and the receipt memo is encrypted.
        </p>
      </div>

      <div className="send-grid">
        <div className="card form-card">
          <button type="button" className="back-link" onClick={() => reset()}>
            <ArrowLeft size={15} /> Clear
          </button>
          <label className="field">
            <span>Recipient</span>
            <input
              value={recipientInput}
              onChange={(event) => setRecipientInput(event.target.value)}
              placeholder="@alice or u1…"
              autoComplete="off"
              spellCheck={false}
              className={recipientError ? 'is-invalid' : undefined}
            />
            {recipientError ? <span className="field-hint tone-error">{recipientError}</span> : null}
            {recipient ? (
              <span className="recipient-resolved">
                <ShieldCheck size={14} />
                {recipient.claim ? `Verified @${recipient.claim.username}` : 'Shielded address'}
                <span className="mono">{shortAddress(recipient.address, 12, 8)}</span>
                <NetworkBadge network={recipient.network} />
              </span>
            ) : null}
            {networkMismatch ? (
              <span className="field-hint tone-error">
                This recipient is on {recipient?.network}, but your wallet is on {connection.network}.
              </span>
            ) : null}
          </label>

          <label className="field">
            <span>Amount</span>
            <div className="amount-input">
              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value.replace(',', '.'))}
                placeholder="0.00"
                inputMode="decimal"
                autoComplete="off"
                className={amount && !amountValid ? 'is-invalid' : undefined}
              />
              <span className="amount-suffix">ZEC</span>
              <button type="button" className="max-btn" onClick={() => void handleMax()} disabled={!recipient || maxLoading}>
                {maxLoading ? <Spinner size={13} /> : <Zap size={13} />} Max
              </button>
            </div>
            {amount && !amountValid ? (
              <span className="field-hint tone-error">Use a positive amount with at most 8 decimal places.</span>
            ) : null}
            {balance ? (
              <span className="field-hint">
                Available: {formatAmount(balance.shielded)} ZEC · wallet network fee is calculated at signing.
              </span>
            ) : null}
          </label>

          <label className="field">
            <span>Private note <em>optional</em></span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="What is this for? Only the recipient will see it."
              rows={3}
              maxLength={320}
              className={!noteValid ? 'is-invalid' : undefined}
            />
            <span className={noteValid ? 'field-hint' : 'field-hint tone-error'}>
              {noteBytes}/300 bytes · encrypted inside the Zcash memo
            </span>
          </label>

          <RevealNameToggle handle={ownClaim?.username} reveal={revealName} onChange={setRevealName} />

          <button type="button" className="btn btn-primary btn-block btn-lg" disabled={!canSend} onClick={() => void handleSend()}>
            {sending ? (
              <>
                <Spinner /> Waiting for wallet approval…
              </>
            ) : (
              <>
                <Lock size={17} /> Send shielded ZEC
              </>
            )}
          </button>
          {error ? <p className="form-error">{error}</p> : null}
          <div className="form-note">
            <ShieldCheck size={14} />
            <span>Shielded funding only. Zac never sends from transparent funds.</span>
          </div>
        </div>

        <aside className="card preview-card">
          <p className="eyebrow">Preview</p>
          <h2>What they receive</h2>
          <div className="preview-recipient">
            <Avatar
              seed={recipient?.address ?? recipientInput}
              label={recipient?.claim ? `@${recipient.claim.username}` : undefined}
              size={42}
            />
            <div>
              <strong>{recipient?.claim ? `@${recipient.claim.username}` : recipient ? 'Shielded recipient' : 'Add a recipient'}</strong>
              <span>{recipient ? shortAddress(recipient.address, 10, 8) : 'Name or address'}</span>
            </div>
          </div>
          <div className="preview-amount">
            {amount && amountValid ? formatAmount(amount) : '0.00'} <span>ZEC</span>
          </div>
          <div className="preview-row">
            <span>Network</span>
            <NetworkBadge network={connection.network} />
          </div>
          <div className="preview-row">
            <span>Funding</span>
            <span className="chip chip-green"><ShieldCheck size={12} /> Shielded</span>
          </div>
          <div className="preview-row">
            <span>Receipt memo</span>
            <span className="mono small">{fromName ? `from @${fromName}` : 'no sender name'}</span>
          </div>
          {note ? <blockquote className="preview-note">{note}</blockquote> : null}
          <div className="preview-foot">
            <Lock size={13} />
            <span>Amount, sender and recipient are hidden on-chain.</span>
          </div>
        </aside>
      </div>

      <Link to="/" className="back-home"><ArrowLeft size={15} /> Back home</Link>
    </div>
  )
}
