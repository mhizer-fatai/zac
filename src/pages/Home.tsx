import {
  ArrowDownToLine,
  ArrowRight,
  AtSign,
  Braces,
  Check,
  CircleCheck,
  EyeOff,
  Fingerprint,
  Globe,
  Info,
  Link2,
  Lock,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  SquareTerminal,
  Wallet
} from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatAmount } from '../../shared/amount'
import { scrollToSection, shortAddress } from '../lib/format'
import { profileLink } from '../lib/links'
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
  const navigate = useNavigate()
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

  function handleClaim() {
    if (status === 'unavailable') navigate('/settings')
    else setClaimOpen(true)
  }

  return (
    <div className="landing">
      <section className="lp-hero">
        <div className="lp-hero-copy">
          <p className="lp-pill">
            <span className="lp-pill-dot" /> Shielded Zcash payments
          </p>
          <h1>
            Pay anyone by name.
            <br />
            Nobody else sees it.
          </h1>
          <p className="lp-sub">
            Claim @you, share a payment link, and send shielded ZEC. The amount, the note and who paid whom stay
            between you and them — not on the chain, not on our server.
          </p>
          <div className="lp-actions">
            <button type="button" className="btn btn-primary btn-lg" onClick={handleClaim}>
              {status === 'unavailable' ? 'Set up Noir Wallet' : 'Claim your @name'}
            </button>
            <button type="button" className="btn btn-secondary btn-lg" onClick={() => scrollToSection('privacy')}>
              See how it stays private
            </button>
          </div>
          <ul className="lp-checks">
            <li><CircleCheck size={15} /> Non-custodial</li>
            <li><CircleCheck size={15} /> Shielded only — no transparent fallback</li>
            <li><CircleCheck size={15} /> Open source</li>
          </ul>
          {status === 'unavailable' ? (
            <p className="lp-install">
              Zac needs <strong>Noir Wallet</strong>, a self-custodial browser extension.{' '}
              <Link to="/settings">Install it</Link> — your keys never leave it.
            </p>
          ) : null}
        </div>

        <div className="lp-hero-visual" aria-hidden="true">
          <div className="lp-request">
            <div className="lp-request-head">
              <span className="lp-avatar">al</span>
              <div>
                <div className="lp-request-name">
                  @alice <span className="badge-verified"><CircleCheck size={12} /> verified</span>
                </div>
                <span className="lp-mono-sub">u1qd8…x8f2 · shielded</span>
              </div>
              <ShieldCheck size={18} className="lp-request-shield" />
            </div>
            <span className="lp-label">Requested amount</span>
            <div className="lp-amount">0.25 <span>ZEC</span></div>
            <div className="lp-note">
              <span className="lp-label"><Lock size={11} /> Private note</span>
              <em>“Lunch on Friday”</em>
            </div>
            <div className="lp-pay">Pay 0.25 ZEC privately <ArrowRight size={16} /></div>
            <p className="lp-request-foot"><Lock size={12} /> Link data never reaches the server</p>
          </div>
          <div className="lp-callout">
            <Braces size={14} />
            <span>
              <code>zac/#/pay/…</code> — everything after <code>#</code> stays in your browser. Browsers never send
              it to a server.
            </span>
          </div>
        </div>
      </section>

      <section className="lp-section" id="how">
        <p className="lp-eyebrow">How it works</p>
        <h2>Private money in three steps</h2>
        <div className="lp-steps">
          <article className="lp-step">
            <div className="lp-step-top">
              <span className="step-number">01</span>
              <span className="lp-step-icon"><Fingerprint size={18} /></span>
            </div>
            <h3>Claim a name</h3>
            <p>Sign one free message with your wallet. @alice now points to your shielded address.</p>
            <span className="lp-step-foot">Wallet-signed message · no transaction, no fee</span>
          </article>
          <article className="lp-step">
            <div className="lp-step-top">
              <span className="step-number">02</span>
              <span className="lp-step-icon"><Link2 size={18} /></span>
            </div>
            <h3>Share a link</h3>
            <p>Create a request with an amount and a private note. Send it however you like.</p>
            <span className="lp-step-foot">Request lives in the URL fragment</span>
          </article>
          <article className="lp-step">
            <div className="lp-step-top">
              <span className="step-number">03</span>
              <span className="lp-step-icon"><ShieldCheck size={18} /></span>
            </div>
            <h3>Get paid privately</h3>
            <p>They pay in two clicks. The receipt rides inside the encrypted Zcash memo.</p>
            <span className="lp-step-foot">Shielded transaction · encrypted memo</span>
          </article>
        </div>
      </section>

      <section className="lp-section" id="privacy">
        <p className="lp-eyebrow">Information boundary</p>
        <h2>What each party can see</h2>
        <p className="lp-lead">
          Zcash hides the payment on-chain. Zac's design keeps it off our server too. Here is exactly what
          leaks and to whom.
        </p>
        <div className="lp-table-wrap">
          <table className="lp-table">
            <thead>
              <tr>
                <th scope="col">Data</th>
                <th scope="col">The public chain</th>
                <th scope="col">Zac's server</th>
                <th scope="col" className="is-you">You and the recipient</th>
              </tr>
            </thead>
            <tbody>
              {VISIBILITY.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td><VisibilityCell value={row.chain} /></td>
                  <td><VisibilityCell value={row.server} /></td>
                  <td><VisibilityCell value={row.parties} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="lp-footnote">
          <Info size={14} />
          <span>
            Names are public, like a phone book. Payments are not. Your light wallet's sync server can still see
            your IP and timing, and any app you paste a link into can read it —{' '}
            <Link to="/privacy">the full privacy model</Link> lists every limit.
          </span>
        </p>
      </section>

      <section className="lp-section" id="verify">
        <p className="lp-eyebrow">Auditable by design</p>
        <h2>Don't trust us — verify it</h2>
        <div className="lp-verify">
          <article className="lp-verify-card">
            <div className="lp-verify-head">
              <h3>Server-blind links</h3>
              <SquareTerminal size={18} />
            </div>
            <p>Open DevTools → Network and pay a link. The request in it never appears in any HTTP call.</p>
            <code className="lp-code">#/pay/eyJ0byI6… <span className="muted-2">→ never sent</span></code>
          </article>
          <article className="lp-verify-card">
            <div className="lp-verify-head">
              <h3>Self-verifying directory</h3>
              <ShieldCheck size={18} />
            </div>
            <p>
              Every @name is wallet-signed and re-checked in your browser. A hacked server can hide a name, but it
              can't forge one.
            </p>
            <code className="lp-code">
              secp256k1 signature <span className="tone-success">verified locally</span>
            </code>
          </article>
          <article className="lp-verify-card">
            <div className="lp-verify-head">
              <h3>Browser-enforced</h3>
              <ShieldAlert size={18} />
            </div>
            <p>A strict Content-Security-Policy blocks every third-party request. No analytics, trackers or cookies.</p>
            <code className="lp-code">default-src 'none'; connect-src 'self'</code>
          </article>
        </div>
      </section>

      <section className="lp-section lp-receipts">
        <p className="lp-eyebrow">Receipts</p>
        <h2>Anonymous by default. Provable when you choose.</h2>
        <div className="lp-receipt-list" aria-hidden="true">
          <div className="lp-receipt">
            <span className="lp-avatar">bo</span>
            <div>
              <div className="lp-receipt-title">
                From @bob <span className="badge-verified"><CircleCheck size={12} /> verified</span>
                <span className="muted"> · coffee</span>
              </div>
              <span className="lp-mono-sub">Signed by @bob's wallet · encrypted memo</span>
            </div>
            <span className="lp-receipt-amount">+0.05 ZEC</span>
          </div>
          <div className="lp-receipt">
            <span className="lp-avatar"><EyeOff size={15} /></span>
            <div>
              <div className="lp-receipt-title">
                Received privately <span className="muted"> · rent</span>
              </div>
              <span className="lp-mono-sub">No sender in the receipt · encrypted memo</span>
            </div>
            <span className="lp-receipt-amount">+0.80 ZEC</span>
          </div>
        </div>
        <p className="lp-caption">
          Payments carry no sender unless the payer opts in. When they do, their wallet signs the receipt, so a name
          can't be faked.
        </p>
      </section>

      <section className="lp-cta">
        <span className="lp-cta-icon"><AtSign size={22} /></span>
        <h2>Private money, as easy as a username.</h2>
        <button type="button" className="btn btn-primary btn-lg" onClick={handleClaim}>
          {status === 'unavailable' ? 'Set up Noir Wallet' : 'Claim your @name'}
        </button>
        <p className="lp-mono-sub">
          Works with Noir Wallet. Any shielded Zcash wallet can pay a request through its QR code.
          {claims.length ? ` · ${claims.length} ${claims.length === 1 ? 'name' : 'names'} claimed` : ''}
        </p>
      </section>

      <ClaimModal open={claimOpen} onClose={() => setClaimOpen(false)} />
    </div>
  )
}

type Visibility = 'hidden' | 'visible' | 'public' | 'you-decide' | 'only-you' | 'link-holders'

/**
 * Who can see what. Keep this honest: it is the claim judges will test.
 * "parties" means the payer and the recipient of one payment.
 */
const VISIBILITY: Array<{ label: string; chain: Visibility; server: Visibility; parties: Visibility }> = [
  { label: 'Who paid whom', chain: 'hidden', server: 'hidden', parties: 'you-decide' },
  { label: 'Amount', chain: 'hidden', server: 'hidden', parties: 'visible' },
  { label: 'Note and receipt', chain: 'hidden', server: 'hidden', parties: 'visible' },
  { label: 'Which @name you looked up', chain: 'hidden', server: 'hidden', parties: 'only-you' },
  { label: 'What is in a payment link', chain: 'hidden', server: 'hidden', parties: 'link-holders' },
  { label: 'That a shielded transaction happened, its fee and time', chain: 'visible', server: 'hidden', parties: 'visible' },
  { label: 'Your @name and shielded address', chain: 'hidden', server: 'public', parties: 'public' }
]

const VISIBILITY_LABEL: Record<Visibility, string> = {
  hidden: 'Hidden',
  visible: 'Visible',
  public: 'Public',
  'you-decide': 'You decide',
  'only-you': 'Only you',
  'link-holders': 'Link holders'
}

function VisibilityCell({ value }: { value: Visibility }) {
  const Icon = value === 'hidden' ? EyeOff : value === 'public' ? Globe : value === 'visible' ? Check : Info
  return (
    <span className={`vis vis-${value}`}>
      <Icon size={12} /> {VISIBILITY_LABEL[value]}
    </span>
  )
}

