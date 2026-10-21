import { Check, Link2, Lock, ShieldCheck, Wallet } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Claim } from '../../shared/types'
import { buildClaimMessage } from '../../shared/claim'
import { newNonce } from '../../shared/memo'
import { normalizeUsername, validateUsername } from '../../shared/username'
import { claimUsername } from '../lib/api'
import { cn } from '../lib/format'
import { profileLink } from '../lib/links'
import { useDirectory } from '../lib/directory'
import { useToast } from '../lib/toast'
import { useWallet } from '../lib/walletContext'
import { CopyButton } from './CopyButton'
import { Modal } from './Modal'
import { Spinner } from './Spinner'

type Phase = 'form' | 'signing' | 'saving' | 'done'

function describeError(cause: unknown): string {
  if (cause instanceof Error && cause.message) return cause.message
  return 'The claim did not complete.'
}

export function ClaimModal({
  open,
  onClose,
  onClaimed,
  initialName
}: {
  open: boolean
  onClose: () => void
  onClaimed?: (claim: Claim) => void
  initialName?: string
}) {
  const { connection, adapter, connect, status } = useWallet()
  const { resolve, refresh } = useDirectory()
  const toast = useToast()
  const [input, setInput] = useState('')
  const [phase, setPhase] = useState<Phase>('form')
  const [error, setError] = useState<string | null>(null)
  const [claimed, setClaimed] = useState<Claim | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setInput(initialName ?? '')
    setPhase('form')
    setError(null)
    setClaimed(null)
    const id = window.setTimeout(() => inputRef.current?.focus(), 60)
    return () => window.clearTimeout(id)
  }, [open, initialName])

  const normalized = normalizeUsername(input)
  const check = normalized ? validateUsername(normalized) : null
  const existing = check?.ok ? resolve(check.username) : undefined
  const alreadyMine = Boolean(existing && connection && existing.address === connection.address)
  const taken = Boolean(existing && !alreadyMine)

  const availability = useMemo(() => {
    if (!normalized) return { tone: 'muted' as const, text: 'Lowercase letters, numbers and underscores.' }
    if (!check?.ok) return { tone: 'error' as const, text: check?.error ?? 'That name is not valid.' }
    if (taken) return { tone: 'error' as const, text: 'That name is already claimed by another wallet.' }
    if (alreadyMine) return { tone: 'success' as const, text: 'This name is already yours.' }
    return { tone: 'success' as const, text: 'Available.' }
  }, [normalized, check, taken, alreadyMine])

  const busy = phase === 'signing' || phase === 'saving'

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    if (!check?.ok) {
      setError(check?.error ?? 'Choose a valid name.')
      return
    }
    if (taken) {
      setError('That name is already claimed.')
      return
    }
    try {
      let activeConnection = connection
      if (!activeConnection) {
        await connect()
        return
      }
      if (alreadyMine && existing) {
        setClaimed(existing)
        setPhase('done')
        return
      }
      const nonce = newNonce()
      const message = buildClaimMessage({
        username: check.username,
        address: activeConnection.address,
        network: activeConnection.network,
        nonce
      })
      setPhase('signing')
      const signed = await adapter.signMessage(message)
      setPhase('saving')
      const result = await claimUsername({
        username: check.username,
        address: activeConnection.address,
        network: activeConnection.network,
        nonce,
        signature: signed.signature
      })
      await refresh(true)
      setClaimed(result.claim)
      setPhase('done')
      onClaimed?.(result.claim)
      toast.success(`@${result.claim.username} is yours`)
    } catch (cause) {
      setPhase('form')
      const message = describeError(cause)
      setError(message)
      toast.error(message)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={phase === 'done' ? 'Name claimed' : 'Claim your name'}>
      {phase === 'done' && claimed ? (
        <div className="claim-success">
          <div className="success-orb">
            <Check size={26} />
          </div>
          <h3>You are @{claimed.username}</h3>
          <p>
            Your name is now public in the Zac directory. Payments to it are still shielded and encrypted.
          </p>
          <div className="claim-link-row">
            <code>{profileLink(claimed.username)}</code>
            <CopyButton value={profileLink(claimed.username)} iconOnly />
          </div>
          <div className="claim-actions">
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Start using @{claimed.username}
            </button>
          </div>
        </div>
      ) : (
        <form className="claim-form" onSubmit={handleSubmit}>
          <p className="modal-lede">
            A name makes you payable as <strong>@you</strong>. It is a public address book entry — your payments
            stay private.
          </p>
          {!connection ? (
            <div className="claim-connect">
              <div>
                <strong>Connect a wallet first</strong>
                <span>Your name is bound to the wallet's shielded address.</span>
              </div>
              {status === 'unavailable' ? (
                <span className="muted small">Install Noir Wallet in Settings.</span>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => void connect().catch((cause) => toast.error(describeError(cause)))}
                >
                  <Wallet size={15} />
                  Connect
                </button>
              )}
            </div>
          ) : null}
          <label className="field">
            <span>Name</span>
            <div className={cn('handle-input', availability.tone === 'error' && 'is-invalid')}>
              <span className="handle-prefix">@</span>
              <input
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="alice"
                autoComplete="off"
                spellCheck={false}
                maxLength={24}
                disabled={busy}
              />
            </div>
            <span className={cn('field-hint', `tone-${availability.tone}`)}>{availability.text}</span>
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <div className="claim-sign-row">
            <Lock size={14} />
            <span>Signing is free. No transaction is sent, and no fee is paid.</span>
          </div>
          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={busy || !check?.ok || taken || (!connection && status === 'unavailable')}
          >
            {phase === 'signing' ? (
              <>
                <Spinner /> Approve in your wallet…
              </>
            ) : phase === 'saving' ? (
              <>
                <Spinner /> Publishing your name…
              </>
            ) : (
              <>
                <ShieldCheck size={16} />
                {alreadyMine ? 'That name is yours' : 'Claim with a signature'}
              </>
            )}
          </button>
          <div className="claim-footnote">
            <Link2 size={13} />
            <span>The claim is a signed message, verified by every Zac client.</span>
          </div>
        </form>
      )}
    </Modal>
  )
}
