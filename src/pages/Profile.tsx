import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Fingerprint,
  Link2,
  Lock,
  QrCode,
  ShieldCheck,
  Sparkles
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { validateUsername } from '../../shared/username'
import { Avatar } from '../components/Avatar'
import { ClaimModal } from '../components/ClaimModal'
import { CopyButton, ShareButton } from '../components/CopyButton'
import { NetworkBadge } from '../components/NetworkBadge'
import { Qr } from '../components/Qr'
import { Spinner } from '../components/Spinner'
import { shortAddress } from '../lib/format'
import { profileLink } from '../lib/links'
import { useDirectory } from '../lib/directory'

export function ProfilePage() {
  const { username } = useParams<{ username: string }>()
  const { resolve, loading } = useDirectory()
  const [claimOpen, setClaimOpen] = useState(false)
  const [showAddress, setShowAddress] = useState(false)

  const raw = username?.startsWith('@') ? username.slice(1) : username ?? ''
  const checked = useMemo(() => validateUsername(raw), [raw])
  const claim = checked.ok ? resolve(checked.username) : undefined
  const link = checked.ok ? profileLink(checked.username) : ''

  if (!username?.startsWith('@')) {
    return (
      <div className="page narrow-page">
        <div className="card error-card">
          <h1>Not a Zac name</h1>
          <p className="muted">Names on Zac look like <code>@alice</code>.</p>
          <Link to="/" className="btn btn-primary">Back home</Link>
        </div>
      </div>
    )
  }

  if (!checked.ok) {
    return (
      <div className="page narrow-page">
        <div className="card error-card">
          <h1>That name is not valid</h1>
          <p className="muted">{checked.error}</p>
          <Link to="/" className="btn btn-primary">Back home</Link>
        </div>
      </div>
    )
  }

  if (loading && !claim) {
    return (
      <div className="page narrow-page">
        <div className="card loading-card">
          <Spinner size={22} /> Looking up @{checked.username}…
        </div>
      </div>
    )
  }

  if (!claim) {
    return (
      <div className="page narrow-page">
        <div className="card profile-missing">
          <span className="icon-orb"><Fingerprint size={24} /></span>
          <p className="eyebrow">Name not found</p>
          <h1>@{checked.username} is unclaimed</h1>
          <p className="muted">
            This name has not been bound to a wallet. You can claim it with one free signature.
          </p>
          <div className="profile-missing-actions">
            <button type="button" className="btn btn-primary" onClick={() => setClaimOpen(true)}>
              <Sparkles size={16} /> Claim @{checked.username}
            </button>
            <Link to="/" className="btn btn-secondary">Back home</Link>
          </div>
        </div>
        <ClaimModal
          open={claimOpen}
          onClose={() => setClaimOpen(false)}
          initialName={checked.username}
        />
      </div>
    )
  }

  return (
    <div className="page profile-page">
      <div className="profile-grid">
        <section className="card profile-card">
          <div className="profile-head">
            <Avatar seed={claim.address} label={`@${claim.username}`} size={76} />
            <div className="profile-identity">
              <p className="eyebrow">Zac name</p>
              <h1>@{claim.username}</h1>
              <div className="profile-badges">
                <span className="chip chip-green">
                  <ShieldCheck size={13} /> Verified by wallet signature
                </span>
                <NetworkBadge network={claim.network} />
              </div>
            </div>
          </div>

          <p className="profile-lede">
            This is a public pointer to a shielded Zcash address. It does not reveal balances, history or
            payment amounts.
          </p>

          <button type="button" className="pay-address-toggle" onClick={() => setShowAddress((value) => !value)}>
            <span>Shielded address</span>
            <span className="mono">{shortAddress(claim.address, 14, 10)}</span>
            <QrCode size={15} />
          </button>
          {showAddress ? (
            <div className="pay-address-full">
              <code>{claim.address}</code>
              <CopyButton value={claim.address} iconOnly />
            </div>
          ) : null}

          <div className="profile-actions">
            <Link to={`/send?to=@${claim.username}`} className="btn btn-primary btn-lg">
              <ArrowUpRight size={17} /> Pay @{claim.username}
            </Link>
            <CopyButton value={link} label="Copy profile link" />
            <ShareButton value={link} title={`Pay @${claim.username} privately`} />
          </div>

          <div className="profile-note">
            <Lock size={14} />
            <span>Zac payments are shielded on-chain. Only the recipient can decrypt the receipt memo.</span>
          </div>
        </section>

        <aside className="card profile-side">
          <p className="eyebrow">Any wallet</p>
          <h2>Scan to pay</h2>
          <p className="muted small">
            Send shielded ZEC from any Zcash wallet. Always compare the address before approving.
          </p>
          <Qr value={`zcash:${claim.address}`} size={200} />
          <div className="profile-side-actions">
            <CopyButton value={`zcash:${claim.address}`} label="Copy zcash: URI" />
            <CopyButton value={claim.address} label="Copy address" />
          </div>
          <div className="profile-side-foot">
            <ShieldCheck size={14} />
            <span>Receives shielded funds only.</span>
          </div>
        </aside>
      </div>

      <div className="public-footnote">
        <span><Check size={13} /> The name is public by design.</span>
        <span><Link2 size={13} /> {link}</span>
      </div>

      <Link to="/" className="back-home"><ArrowLeft size={15} /> Back home</Link>
    </div>
  )
}
