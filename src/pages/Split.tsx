import { ArrowLeft, ArrowLeftRight, Check, Clock, Plus, Trash2, Users, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatAmount, isValidAmount, zecToZatoshi } from '../../shared/amount'
import { newInvoiceId } from '../../shared/memo'
import { encodePaymentPayload } from '../../shared/paylink'
import { useOwnClaim } from '../lib/directory'
import { appRoot } from '../lib/links'
import { formatUsd, usdToZec, useZecPrice, zecToUsd } from '../lib/price'
import { createSealedRequest } from '../lib/sealedRequest'
import { divideTotal, loadSplits, saveSplits, shareStatus, type Split, type SplitShare } from '../lib/split'
import { useToast } from '../lib/toast'
import { useWallet } from '../lib/walletContext'
import { describeWalletError } from '../lib/walletErrors'
import { CopyButton, ShareButton } from '../components/CopyButton'
import { Spinner } from '../components/Spinner'

const POLL_MS = 10_000
const MAX_PEOPLE = 10

export function SplitPage() {
  const { status, connection, connect, adapter } = useWallet()
  const ownClaim = useOwnClaim()
  const toast = useToast()
  const usdPrice = useZecPrice(connection?.network)

  const [splits, setSplits] = useState<Split[]>(() => loadSplits())
  const [openId, setOpenId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [entry, setEntry] = useState('')
  const [unit, setUnit] = useState<'ZEC' | 'USD'>('USD')
  const [people, setPeople] = useState<string[]>(['', ''])
  const [includeMe, setIncludeMe] = useState(true)
  const [creating, setCreating] = useState<string | null>(null)

  const usdMode = unit === 'USD' && usdPrice !== null
  const total = usdMode ? (usdToZec(entry, usdPrice) ?? '') : entry
  const totalValid = isValidAmount(total) && Number(total) > 0
  const names = people.map((name) => name.trim()).filter(Boolean)
  const shareCount = names.length + (includeMe ? 1 : 0)
  const share = totalValid && names.length > 0 ? divideTotal(total, shareCount) : ''
  const shareValid = Boolean(share) && zecToZatoshi(share) > 0n
  const canCreate = Boolean(title.trim()) && totalValid && names.length > 0 && shareValid && !creating

  const current = splits.find((split) => split.id === openId) ?? null

  function update(next: Split[]) {
    setSplits(next)
    saveSplits(next)
  }

  // Watch the organiser's own wallet for the open split's pending shares.
  useEffect(() => {
    if (!current || !connection || current.shares.every((item) => item.status === 'paid')) return
    let active = true
    const check = async () => {
      try {
        const history = await adapter.getHistory()
        if (!active) return
        setSplits((all) => {
          let changed = false
          const next = all.map((split) => {
            if (split.id !== current.id) return split
            const shares = split.shares.map((item) => {
              if (item.status === 'paid') return item
              const found = shareStatus(history, item)
              if (found.status === item.status) return item
              changed = true
              return { ...item, status: found.status, txid: found.txid }
            })
            return { ...split, shares }
          })
          if (changed) saveSplits(next)
          return changed ? next : all
        })
      } catch {
        /* the wallet may be locked or syncing; try again next tick */
      }
    }
    void check()
    const id = window.setInterval(() => void check(), POLL_MS)
    return () => {
      active = false
      window.clearInterval(id)
    }
  }, [current?.id, current?.shares.map((item) => item.status).join(), connection, adapter])

  async function create() {
    if (!connection || !canCreate) return
    const address = ownClaim?.address ?? connection.address
    const shares: SplitShare[] = []
    try {
      for (const [index, name] of names.entries()) {
        setCreating(`Sealing link ${index + 1} of ${names.length}…`)
        const invoiceId = newInvoiceId()
        // The note carries the title only: names never leave this browser.
        const { token, expiresAt } = await createSealedRequest(
          encodePaymentPayload({
            v: 1,
            net: connection.network,
            to: address,
            h: ownClaim?.username,
            a: share,
            m: `${title.trim()} · split`,
            i: invoiceId,
            t: Date.now()
          }),
          { ttl: '24h' }
        )
        shares.push({ name, amount: share, invoiceId, token, expiresAt, status: 'pending' })
      }
      const split: Split = {
        id: newInvoiceId(),
        title: title.trim(),
        network: connection.network,
        total,
        ownShare: includeMe ? share : undefined,
        createdAt: Date.now(),
        shares
      }
      update([split, ...splits])
      setOpenId(split.id)
      setTitle('')
      setEntry('')
      setPeople(['', ''])
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not create the split.')
    } finally {
      setCreating(null)
    }
  }

  if (status !== 'connected' || !connection) {
    return (
      <div className="page narrow-page">
        <div className="page-head">
          <p className="eyebrow">Split</p>
          <h1>Split a bill</h1>
          <p className="muted">Connect the wallet that should receive everyone's share.</p>
        </div>
        <div className="card connect-card">
          <span className="icon-orb"><Users size={24} /></span>
          <h2>{status === 'unavailable' ? 'Install Noir Wallet' : 'Connect your wallet'}</h2>
          <p className="muted">Shares are paid to your shielded address and confirmed from your own wallet.</p>
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

  if (current) {
    const paid = current.shares.filter((item) => item.status === 'paid').length
    return (
      <div className="page narrow-page split-page">
        <button type="button" className="btn btn-quiet btn-sm split-back" onClick={() => setOpenId(null)}>
          <ArrowLeft size={15} /> All splits
        </button>
        <section className="card split-card">
          <div className="split-head">
            <div>
              <p className="eyebrow">Split</p>
              <h1>{current.title}</h1>
              <p className="muted">
                {formatAmount(current.total)} ZEC{usdOf(current.total) ? ` ≈ ${usdOf(current.total)}` : ''} ·{' '}
                {current.shares.length + (current.ownShare ? 1 : 0)} people · {formatAmount(current.shares[0]?.amount ?? '0')} ZEC each
              </p>
            </div>
            <span className="split-progress-label">
              {paid} of {current.shares.length} paid
            </span>
          </div>
          <div className="split-bar"><span style={{ width: `${(paid / Math.max(1, current.shares.length)) * 100}%` }} /></div>

          <ul className="split-list">
            {current.ownShare ? (
              <li className="split-row">
                <span className="split-name">You</span>
                <span className="split-amount">{formatAmount(current.ownShare)} ZEC</span>
                <span className="split-status is-paid"><Check size={12} /> Paid</span>
              </li>
            ) : null}
            {current.shares.map((item) => {
              const link = `${appRoot()}/#/r/${item.token}`
              const expired = item.status !== 'paid' && item.expiresAt <= Date.now()
              return (
                <li key={item.invoiceId} className="split-row">
                  <span className="split-name">{item.name}</span>
                  <span className="split-amount">
                    {formatAmount(item.amount)} ZEC
                    {usdOf(item.amount) ? <small> ≈ {usdOf(item.amount)}</small> : null}
                  </span>
                  {item.status === 'paid' ? (
                    <span className="split-status is-paid"><Check size={12} /> Paid</span>
                  ) : item.status === 'partial' ? (
                    <span className="split-status is-partial">Partly paid</span>
                  ) : expired ? (
                    <span className="split-status is-expired"><X size={12} /> Expired</span>
                  ) : (
                    <span className="split-status"><Clock size={12} /> Pending</span>
                  )}
                  {item.status !== 'paid' && !expired ? (
                    <span className="split-actions">
                      <CopyButton value={link} label="Copy link" />
                      <ShareButton value={link} title={`${current.title}: your share`} />
                    </span>
                  ) : null}
                </li>
              )
            })}
          </ul>

          <p className="muted small split-help">
            Send each person their own link. Each opens for one payment within 24 hours, and shows them only their
            share. Payments are confirmed from your own wallet as they arrive; names stay on this device.
          </p>
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            onClick={() => {
              update(splits.filter((split) => split.id !== current.id))
              setOpenId(null)
            }}
          >
            <Trash2 size={14} /> Remove from this device
          </button>
        </section>
      </div>
    )
  }

  return (
    <div className="page narrow-page split-page">
      <div className="page-head">
        <p className="eyebrow">Split</p>
        <h1>Split a bill</h1>
        <p className="muted">
          Dinner, rent or a trip: enter the total and who shares it. Everyone gets their own sealed link for their
          share, and you see who has paid, without anyone else learning who paid whom.
        </p>
      </div>

      <section className="card">
        <label className="field">
          <span>What for</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Friday dinner" maxLength={60} />
        </label>

        <label className="field">
          <span>Total</span>
          <div className="amount-input">
            <input
              value={entry}
              onChange={(event) => setEntry(event.target.value.replace(',', '.'))}
              placeholder="0.00"
              inputMode="decimal"
              autoComplete="off"
              className={entry && !totalValid ? 'is-invalid' : undefined}
            />
            {usdPrice !== null ? (
              <button
                type="button"
                className="unit-toggle"
                onClick={() => {
                  if (usdMode) setEntry(totalValid ? total : '')
                  else setEntry(totalValid ? zecToUsd(total, usdPrice).toFixed(2) : '')
                  setUnit(usdMode ? 'ZEC' : 'USD')
                }}
              >
                {usdMode ? 'USD' : 'ZEC'} <ArrowLeftRight size={12} />
              </button>
            ) : (
              <span className="amount-suffix">ZEC</span>
            )}
          </div>
          {totalValid && usdPrice !== null ? (
            <span className="field-hint usd-hint">
              {usdMode ? `${formatAmount(total)} ZEC` : `≈ ${formatUsd(zecToUsd(total, usdPrice))}`}
            </span>
          ) : null}
        </label>

        <div className="field">
          <span>Who pays a share <em>names stay on this device</em></span>
          <div className="split-people">
            {people.map((name, index) => (
              <div key={index} className="split-person">
                <input
                  value={name}
                  onChange={(event) => setPeople(people.map((value, i) => (i === index ? event.target.value : value)))}
                  placeholder={`Person ${index + 1}`}
                  maxLength={40}
                />
                {people.length > 1 ? (
                  <button
                    type="button"
                    className="btn btn-quiet btn-icon"
                    aria-label="Remove person"
                    onClick={() => setPeople(people.filter((_, i) => i !== index))}
                  >
                    <X size={15} />
                  </button>
                ) : null}
              </div>
            ))}
            {people.length < MAX_PEOPLE ? (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPeople([...people, ''])}>
                <Plus size={14} /> Add person
              </button>
            ) : null}
          </div>
        </div>

        <label className="reveal-toggle split-include">
          <input type="checkbox" checked={includeMe} onChange={(event) => setIncludeMe(event.target.checked)} />
          <span>
            <strong>Include me</strong>
            <small>I already paid my own share, so it is not requested.</small>
          </span>
        </label>

        {shareValid ? (
          <p className="split-summary">
            {names.length} sealed {names.length === 1 ? 'link' : 'links'} · {formatAmount(share)} ZEC each
            {usdOf(share) ? ` (≈ ${usdOf(share)})` : ''}
          </p>
        ) : null}

        <button type="button" className="btn btn-primary btn-block btn-lg" disabled={!canCreate} onClick={() => void create()}>
          {creating ? (
            <>
              <Spinner /> {creating}
            </>
          ) : (
            <>
              <Users size={17} /> Create split
            </>
          )}
        </button>
      </section>

      {splits.length ? (
        <section className="split-history">
          <p className="eyebrow">Your splits</p>
          {splits.map((split) => {
            const paid = split.shares.filter((item) => item.status === 'paid').length
            return (
              <button key={split.id} type="button" className="card split-item" onClick={() => setOpenId(split.id)}>
                <span>
                  <strong>{split.title}</strong>
                  <small>
                    {formatAmount(split.total)} ZEC · {new Date(split.createdAt).toLocaleDateString()}
                  </small>
                </span>
                <span className={paid === split.shares.length ? 'split-status is-paid' : 'split-status'}>
                  {paid} of {split.shares.length} paid
                </span>
              </button>
            )
          })}
        </section>
      ) : null}
    </div>
  )
}
