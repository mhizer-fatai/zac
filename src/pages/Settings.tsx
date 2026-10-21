import {
  ArrowLeft,
  Check,
  Download,
  ExternalLink,
  Globe,
  LogOut,
  ShieldCheck,
  Trash2,
  Wallet
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { shortAddress } from '../lib/format'
import { useDirectory } from '../lib/directory'
import { useToast } from '../lib/toast'
import { useWallet } from '../lib/walletContext'
import { NetworkBadge } from '../components/NetworkBadge'
import { CopyButton } from '../components/CopyButton'

const CHROME_STORE = 'https://chromewebstore.google.com/detail/noir-wallet/mfoghjbpfanobmnoemoepenjjcmfpmdn'
const TESTNET_RELEASES = 'https://github.com/NoirWallet/noir-wallet-sdk/releases'
const FAUCET_VALAR = 'https://faucet.testnet.valargroup.dev/'
const FAUCET_FAUZEC = 'https://fauzec.com/'
const SOURCE_URL = (import.meta.env.VITE_SOURCE_URL as string | undefined) ?? ''

export function SettingsPage() {
  const { status, connection, connect, disconnect, adapter } = useWallet()
  const { claims } = useDirectory()
  const toast = useToast()

  async function handleConnect() {
    try {
      await connect()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not connect the wallet.')
    }
  }

  async function handleDisconnect() {
    try {
      await disconnect()
      toast.info('Wallet disconnected')
    } catch {
      toast.error('Could not disconnect the wallet.')
    }
  }

  function clearDirectoryCache() {
    try {
      localStorage.removeItem('zac.directory.cache.v1')
      toast.success('Directory cache cleared')
    } catch {
      toast.error('Could not clear local storage.')
    }
  }

  return (
    <div className="page settings-page">
      <div className="page-head">
        <p className="eyebrow">Settings</p>
        <h1>Wallet & privacy</h1>
        <p className="muted">Zac is non-custodial. Your keys stay in your wallet.</p>
      </div>

      <section className="card settings-card">
        <div className="section-head">
          <div>
            <p className="eyebrow">Wallet</p>
            <h2>{connection ? 'Noir Wallet' : 'Connect a wallet'}</h2>
          </div>
          {connection ? <NetworkBadge network={connection.network} /> : null}
        </div>
        {connection ? (
          <>
            <div className="settings-wallet">
              <span className="icon-orb"><Wallet size={20} /></span>
              <div>
                <span className="settings-address" title={connection.address}>{shortAddress(connection.address, 18, 12)}</span>
                <span className="muted small">
                  {connection.accounts.length} account{connection.accounts.length === 1 ? '' : 's'} authorized ·{' '}
                  self-custodial
                </span>
              </div>
              <CopyButton value={connection.address} label="Copy" />
            </div>
            <div className="settings-actions">
              <button type="button" className="btn btn-secondary" onClick={() => void handleDisconnect()}>
                <LogOut size={15} /> Disconnect
              </button>
            </div>
          </>
        ) : status === 'unavailable' ? (
          <div className="install-panel">
            <div className="install-step">
              <span className="step-number">01</span>
              <div>
                <h3>Install Noir Wallet</h3>
                <p>
                  Mainnet: install the official Chrome Web Store build. Testnet: download the official zip from GitHub
                  Releases and load it via <code>chrome://extensions</code> → Developer mode → Load unpacked.
                </p>
                <div className="install-links">
                  <a className="btn btn-primary btn-sm" href={CHROME_STORE} target="_blank" rel="noreferrer noopener">
                    <Download size={14} /> Chrome Web Store <ExternalLink size={12} />
                  </a>
                  <a className="btn btn-secondary btn-sm" href={TESTNET_RELEASES} target="_blank" rel="noreferrer noopener">
                    <Download size={14} /> Testnet builds <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            </div>
            <div className="install-step">
              <span className="step-number">02</span>
              <div>
                <h3>Create or restore a wallet</h3>
                <p>Back up the recovery phrase offline. Zac never asks for it and cannot recover it.</p>
              </div>
            </div>
            <div className="install-step">
              <span className="step-number">03</span>
              <div>
                <h3>Connect this site</h3>
                <p>Return here and approve the connection. The wallet will show every payment before signing.</p>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => void handleConnect()}>
                  <Wallet size={14} /> Try connecting
                </button>
              </div>
            </div>
            <div className="faucet-note">
              <Globe size={15} />
              <div>
                <strong>Need testnet TAZ?</strong>
                <span>
                  Use the Valar faucet or Fauzec — both pay shielded addresses without an account.{' '}
                  <a href={FAUCET_VALAR} target="_blank" rel="noreferrer noopener">Valar <ExternalLink size={11} /></a>{' '}
                  <a href={FAUCET_FAUZEC} target="_blank" rel="noreferrer noopener">Fauzec <ExternalLink size={11} /></a>
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="settings-connect">
            <p className="muted">No wallet is connected. Noir is the only wallet adapter in this build.</p>
            <button type="button" className="btn btn-primary" onClick={() => void handleConnect()}>
              <Wallet size={16} /> Connect Noir Wallet
            </button>
          </div>
        )}
      </section>

      <section className="card settings-card">
        <div className="section-head">
          <div>
            <p className="eyebrow">Privacy</p>
            <h2>What Zac does — and does not — see</h2>
          </div>
          <ShieldCheck size={20} className="gold" />
        </div>
        <ul className="check-list">
          <li><Check size={15} /> Payments are shielded Zcash transactions. No transparent fallback.</li>
          <li><Check size={15} /> Payment-link payloads live in the URL fragment and never reach our server.</li>
          <li><Check size={15} /> The name directory is fetched as a whole and resolved in your browser.</li>
          <li><Check size={15} /> Names are public; amounts, senders and recipients are not.</li>
          <li><Check size={15} /> No analytics, cookies, third-party scripts or request logs.</li>
          <li><Check size={15} /> Claims are wallet-signed and verified client-side, so the server cannot forge them.</li>
        </ul>
        <div className="settings-actions">
          <Link to="/privacy" className="btn btn-secondary">Read the privacy model</Link>
          <button type="button" className="btn btn-quiet" onClick={clearDirectoryCache}>
            <Trash2 size={15} /> Clear directory cache
          </button>
        </div>
      </section>

      <section className="card settings-card">
        <div className="section-head">
          <div>
            <p className="eyebrow">About</p>
            <h2>Zac</h2>
          </div>
          <span className="chip chip-gold">v0.1.0</span>
        </div>
        <p className="muted small">
          Private payments by name, built for the ZECATHON 2026. {claims.length} name
          {claims.length === 1 ? '' : 's'} in the directory.
        </p>
        <div className="about-rows">
          <div><span>Network</span><span>{connection?.network ?? 'Not connected'}</span></div>
          <div><span>Wallet adapter</span><span>{adapter.label}</span></div>
          <div><span>License</span><span>MIT</span></div>
          <div><span>Payment standard</span><span>ZIP-321 · ZIP-316 · ZIP-317</span></div>
        </div>
        <div className="settings-actions">
          {SOURCE_URL ? (
            <a className="btn btn-secondary btn-sm" href={SOURCE_URL} target="_blank" rel="noreferrer noopener">
              <ExternalLink size={14} /> Source code
            </a>
          ) : null}
          <Link to="/privacy" className="btn btn-quiet btn-sm">Privacy</Link>
        </div>
      </section>

      <Link to="/" className="back-home"><ArrowLeft size={15} /> Back home</Link>
    </div>
  )
}
