import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Check,
  Download,
  EyeOff,
  Fingerprint,
  Link2,
  Lock,
  Send,
  ShieldCheck,
  Sparkles,
  Wallet
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatAmount } from '../../shared/amount'
import { shortAddress } from '../lib/format'
import { profileLink, appRoot } from '../lib/links'
import { useDirectory } from '../lib/directory'
import { useToast } from '../lib/toast'
import { useWallet } from '../lib/walletContext'
import { useWalletData } from '../lib/useWalletData'
import { Avatar } from '../components/Avatar'
import { ClaimModal } from '../components/ClaimModal'
import { CopyButton } from '../components/CopyButton'
import { NetworkBadge } from '../components/NetworkBadge'
import { Spinner } from '../components/Spinner'
import { TxListEmpty, TxRow } from '../components/TxRow'

export function Home() {
  const { status, connection, connect } = useWallet()
  const { findByAddress, claims } = useDirectory()
  const toast = useToast()
  const [claimOpen, setClaimOpen] = useState(false)
  const { balance, history, loading, error, refresh } = useWalletData(status === 'connected')
  const ownClaim = connection ? findByAddress(connection.address) : undefined

  async function handleConnect() {
    try {
      await connect()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not connect the wallet.')
    }
  }

  if (status === 'connected' && connection) {
    const recent = (history ?? []).slice(0, 5)
    return (
      <div className="page home-page">
        <section className="dash-head">
          <div>
            <p className="eyebrow">Your private account</p>
            <h1 className="dash-title">
              gm, {ownClaim ? <span className="gold">@{ownClaim.username}</span> : 'anon'}
            </h1>
            <p className="muted">
              {ownClaim
                ? 'Your name is live. Payments to it are shielded end to end.'
                : 'Claim a name so people can pay you without an address.'}
            </p>
          </div>
          <div className="dash-head-right">
            <NetworkBadge network={connection.network} />
            <span className="address-mini" title={connection.address}>
              {shortAddress(connection.address, 10, 8)}
            </span>
          </div>
        </section>

        <div className="dash-grid">
          <section className="card balance-card">
            <div className="card-topline">
              <span className="chip chip-gold">
                <ShieldCheck size={14} /> Shielded balance
              </span>
              <button
                type="button"
                className="icon-btn"
                onClick={() => void refresh()}
                aria-label="Refresh balance"
                title="Refresh"
              >
                {loading ? <Spinner size={15} /> : <ArrowRight size={16} className="rotate-90" />}
              </button>
            </div>
            <div className="balance-amount">
              {loading && !balance ? (
                <span className="skeleton-amount" />
              ) : (
                <>
                  {formatAmount(balance?.shielded ?? '0')} <span className="balance-unit">ZEC</span>
                </>
              )}
            </div>
            <p className="balance-sub">
              Private, spendable ZEC. Transparent funds are never used for Zac payments.
            </p>
            <div className="balance-actions">
              <Link to="/send" className="btn btn-primary">
                <Send size={16} /> Send
              </Link>
              <Link to="/receive" className="btn btn-secondary">
                <ArrowDownToLine size={16} /> Receive
              </Link>
            </div>
            {error ? (
              <p className="inline-error">
                {error} <button type="button" onClick={() => void refresh()}>Retry</button>
              </p>
            ) : null}
          </section>

          <section className="card identity-card">
            {ownClaim ? (
              <>
                <div className="identity-top">
                  <Avatar seed={ownClaim.address} label={`@${ownClaim.username}`} size={48} />
                  <div>
                    <p className="eyebrow">Your name</p>
                    <h2>@{ownClaim.username}</h2>
                  </div>
                </div>
                <p className="muted small">
                  Public name, private payments. Share it like an email address.
                </p>
                <div className="identity-link">
                  <code>{profileLink(ownClaim.username)}</code>
                </div>
                <div className="identity-actions">
                  <CopyButton value={profileLink(ownClaim.username)} label="Copy profile link" />
                  <Link to="/receive" className="btn btn-quiet btn-sm">
                    <Link2 size={15} /> Payment link
                  </Link>
                </div>
              </>
            ) : (
              <>
                <div className="identity-top">
                  <span className="icon-orb">
                    <Fingerprint size={24} />
                  </span>
                  <div>
                    <p className="eyebrow">No name yet</p>
                    <h2>Claim your @name</h2>
                  </div>
                </div>
                <p className="muted small">
                  Turn your shielded address into a name people can remember and share.
                </p>
                <button type="button" className="btn btn-primary btn-block" onClick={() => setClaimOpen(true)}>
                  <Sparkles size={16} /> Claim a name
                </button>
              </>
            )}
          </section>
        </div>

        <section className="card activity-card">
          <div className="section-head">
            <div>
              <p className="eyebrow">Wallet history</p>
              <h2>Recent activity</h2>
            </div>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => void refresh()} disabled={loading}>
              {loading ? <Spinner size={14} /> : null}
              Refresh
            </button>
          </div>
          {loading && !history ? (
            <div className="tx-skeleton">
              <span />
              <span />
              <span />
            </div>
          ) : recent.length ? (
            <div className="tx-list">
              {recent.map((tx) => (
                <TxRow key={`${tx.txid}-${tx.timestamp}`} tx={tx} />
              ))}
            </div>
          ) : (
            <TxListEmpty>
              Send a payment or share a request link.
            </TxListEmpty>
          )}
        </section>

        <section className="privacy-strip">
          <div>
            <Lock size={16} />
            <span>Shielded transactions only</span>
          </div>
          <div>
            <EyeOff size={16} />
            <span>No analytics or request logs</span>
          </div>
          <div>
            <Wallet size={16} />
            <span>Non-custodial by design</span>
          </div>
        </section>

        <ClaimModal open={claimOpen} onClose={() => setClaimOpen(false)} />
      </div>
    )
  }

  return (
    <div className="home-public">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="live-dot" /> Private payments on Zcash
          </p>
          <h1>
            Pay anyone by name.
            <br />
            <span className="gold">Stay private.</span>
          </h1>
          <p className="hero-sub">
            Zac turns a shielded Zcash address into an @name and a shareable link. Two clicks to pay.
            No accounts. No analytics. Nobody sees who paid whom.
          </p>
          <div className="hero-actions">
            {status === 'unavailable' ? (
              <Link to="/settings" className="btn btn-primary btn-lg">
                <Download size={18} /> Set up Noir Wallet
              </Link>
            ) : (
              <button type="button" className="btn btn-primary btn-lg" onClick={handleConnect}>
                <Wallet size={18} />
                Connect Noir Wallet
              </button>
            )}
            <Link to="/privacy" className="btn btn-secondary btn-lg">
              How privacy works
            </Link>
          </div>
          <div className="hero-trust">
            <span><Check size={14} /> Non-custodial</span>
            <span><Check size={14} /> Shielded by default</span>
            <span><Check size={14} /> Open source</span>
          </div>
          {status === 'unavailable' ? (
            <div className="install-note">
              <strong>Noir Wallet is not installed.</strong>
              <span>
                It is a self-custodial Chrome extension. <Link to="/settings">Install the mainnet or testnet build</Link>.
              </span>
            </div>
          ) : null}
        </div>

        <div className="hero-visual" aria-hidden="true">
          <div className="phone-card">
            <div className="mini-top">
              <span className="mini-avatar">A</span>
              <div>
                <strong>@alice</strong>
                <span>Payment request</span>
              </div>
              <span className="mini-chip"><ShieldCheck size={12} /> Shielded</span>
            </div>
            <div className="mini-amount">0.25 <span>ZEC</span></div>
            <div className="mini-note">
              <Lock size={12} /> Private note · “lunch”
            </div>
            <div className="mini-button">Pay privately</div>
            <div className="mini-ledger">
              <div><span>Sender</span><em>hidden</em></div>
              <div><span>Recipient</span><em>hidden</em></div>
              <div><span>Amount</span><em>hidden</em></div>
            </div>
          </div>
          <div className="hero-glow" />
        </div>
      </section>

      <section className="feature-grid">
        <article className="feature-card">
          <span className="feature-icon"><Fingerprint size={20} /></span>
          <h3>Names, not addresses</h3>
          <p>Claim @you once. People can send to a name instead of a 200-character string.</p>
        </article>
        <article className="feature-card">
          <span className="feature-icon"><ShieldCheck size={20} /></span>
          <h3>Shielded by default</h3>
          <p>Every Zac payment uses Zcash shielded transactions. There is no transparent fallback.</p>
        </article>
        <article className="feature-card">
          <span className="feature-icon"><EyeOff size={20} /></span>
          <h3>Links the server cannot read</h3>
          <p>The request lives in the URL fragment. Our server only ever sees the app, never the payment.</p>
        </article>
      </section>

      <section className="how-section" id="how">
        <div className="section-head">
          <div>
            <p className="eyebrow">How it works</p>
            <h2>Private payments, three steps</h2>
          </div>
        </div>
        <div className="steps">
          <div className="step">
            <span className="step-number">01</span>
            <h3>Connect</h3>
            <p>Install Noir Wallet, a self-custodial Chrome wallet. Your keys never leave it.</p>
          </div>
          <div className="step">
            <span className="step-number">02</span>
            <h3>Claim a name</h3>
            <p>Sign one free message to bind @you to your shielded address. No transaction, no fee.</p>
          </div>
          <div className="step">
            <span className="step-number">03</span>
            <h3>Get paid</h3>
            <p>Share @you or a payment link. Every payment arrives shielded and carries an encrypted receipt memo.</p>
          </div>
        </div>
      </section>

      <section className="stat-band">
        <div>
          <strong>{claims.length}</strong>
          <span>{claims.length === 1 ? 'name claimed' : 'names claimed'}</span>
        </div>
        <div>
          <strong>100%</strong>
          <span>shielded only</span>
        </div>
        <div>
          <strong>0</strong>
          <span>analytics scripts</span>
        </div>
        <div>
          <strong>1</strong>
          <span>open-source app</span>
        </div>
      </section>

      <section className="cta-band">
        <div>
          <p className="eyebrow">Ready when you are</p>
          <h2>Get paid like it is 2026.</h2>
          <p>By name. By link. Without publishing your payment graph.</p>
        </div>
        <div className="cta-actions">
          <button type="button" className="btn btn-primary btn-lg" onClick={handleConnect}>
            <Wallet size={18} /> Connect Noir
          </button>
          <Link to="/privacy" className="btn btn-secondary btn-lg">
            <ArrowUpRight size={18} /> Read the privacy model
          </Link>
        </div>
      </section>

      <p className="public-footnote">
        Built for the ZECATHON · {appRoot().replace(/^https?:\/\//, '')}
      </p>

      <ClaimModal open={claimOpen} onClose={() => setClaimOpen(false)} />
    </div>
  )
}
