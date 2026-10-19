import { ArrowLeft, Check, EyeOff, Fingerprint, Link2, Lock, Server, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router-dom'

export function PrivacyPage() {
  return (
    <div className="page legal-page">
      <div className="page-head">
        <p className="eyebrow">Privacy model</p>
        <h1>Private by construction,<br /><span className="gold">not by promise.</span></h1>
        <p className="muted">
          Zac is a small, open-source client. Here is exactly what it sees, what it cannot see, and what no
          payment app can protect you from.
        </p>
      </div>

      <section className="card legal-card">
        <div className="legal-head">
          <ShieldCheck size={20} className="gold" />
          <h2>The short version</h2>
        </div>
        <div className="privacy-table">
          <div className="privacy-row head">
            <span>Data</span>
            <span>Who can see it</span>
          </div>
          <div className="privacy-row">
            <span>Your @name and shielded address</span>
            <span>Anyone — it is a public directory entry, like a phone book</span>
          </div>
          <div className="privacy-row">
            <span>Payment amount, sender, recipient</span>
            <span>Only the sender and recipient — shielded on-chain</span>
          </div>
          <div className="privacy-row">
            <span>Receipt note</span>
            <span>Only sender and recipient — encrypted in the Zcash memo</span>
          </div>
          <div className="privacy-row">
            <span>Payment-link contents</span>
            <span>Only the browser that opens the link — it lives in the URL fragment</span>
          </div>
          <div className="privacy-row">
            <span>Zac server logs / analytics / cookies</span>
            <span>None. They do not exist.</span>
          </div>
          <div className="privacy-row">
            <span>Wallet keys and seed phrase</span>
            <span>Only your wallet. Zac never asks for them.</span>
          </div>
        </div>
      </section>

      <section className="legal-grid">
        <article className="card legal-card">
          <div className="legal-head">
            <Lock size={19} className="gold" />
            <h2>On-chain</h2>
          </div>
          <p>
            Every Zac payment is a Zcash shielded transaction. The sender, recipient and amount are hidden on
            the public chain. Zac refuses transparent addresses and always asks the wallet for shielded funding;
            there is no transparent fallback.
          </p>
          <p>
            The receipt memo is part of the shielded output, so it is encrypted to the recipient. It is not a
            public note. It contains a small structured string so the recipient's app can show who paid and why.
          </p>
        </article>

        <article className="card legal-card">
          <div className="legal-head">
            <Link2 size={19} className="gold" />
            <h2>Payment links</h2>
          </div>
          <p>
            A Zac link looks like <code>{'<app>/#/pay/<payload>'}</code>. Everything after the <code>#</code> is a
            URL fragment: browsers do not send it in HTTP requests. The amount, note and recipient address are
            decoded in your browser.
          </p>
          <p>
            Our server therefore sees only a request for the app shell. It cannot see who the link is for, the
            amount, or the note. There are no link-expansion requests, shorteners or preview services.
          </p>
        </article>

        <article className="card legal-card">
          <div className="legal-head">
            <Fingerprint size={19} className="gold" />
            <h2>Names</h2>
          </div>
          <p>
            The directory maps public names to public shielded addresses. It is intentionally public: a name is
            a pointer, like an email address. It reveals nothing about balances, history or payments.
          </p>
          <p>
            Clients download the entire directory and resolve names locally. There is no per-name lookup API, so
            the server does not learn which name you searched for. Every claim is a wallet-signed message and is
            verified in your browser, so a compromised server can omit a name but cannot forge one.
          </p>
        </article>

        <article className="card legal-card">
          <div className="legal-head">
            <Server size={19} className="gold" />
            <h2>The server</h2>
          </div>
          <p>
            Zac has no accounts, cookies, analytics, third-party fonts, external scripts or request logging.
            Claims are stored as signed public records. Rate limiting uses an in-memory, salted hash of the
            connection address; raw IP addresses are not written to disk or logs.
          </p>
          <p>
            The app can be self-hosted. The directory is a single JSON snapshot; the client verifies every record
            locally, which makes mirroring possible.
          </p>
        </article>
      </section>

      <section className="card legal-card">
        <div className="legal-head">
          <EyeOff size={20} className="gold" />
          <h2>What this app cannot protect</h2>
        </div>
        <ul className="warning-list">
          <li>
            <TriangleAlert size={15} />
            <span>
              <strong>Wallet infrastructure.</strong> Your wallet talks to a lightwalletd or indexer to sync. That
              server can learn metadata such as your IP address and which blocks contain your shielded notes. This
              is a property of light wallets, not of Zac.
            </span>
          </li>
          <li>
            <TriangleAlert size={15} />
            <span>
              <strong>The channel you share a link through.</strong> If you paste a link into a chat app, that app
              can read the URL. The fragment protects you from our server and from link previews, not from the
              messenger.
            </span>
          </li>
          <li>
            <TriangleAlert size={15} />
            <span>
              <strong>Network observers.</strong> This app does not add Tor or a mixnet. Your connection to the app
              and to your wallet's sync server exposes network metadata to those hosts and your network operator.
            </span>
          </li>
          <li>
            <TriangleAlert size={15} />
            <span>
              <strong>Address reuse.</strong> A name points at one shielded address. Reusing it is normal for a
              phone-book entry, but a fresh wallet account per identity gives stronger separation. Wallets and
              zk proofs still have metadata edges; shielding is not magic.
            </span>
          </li>
          <li>
            <TriangleAlert size={15} />
            <span>
              <strong>Your device and your wallet.</strong> A compromised browser, extension, clipboard or wallet
              can see what you type. Zac is a small open-source client, not an audited hardware wallet.
            </span>
          </li>
        </ul>
      </section>

      <section className="card legal-card">
        <div className="legal-head">
          <Check size={20} className="gold" />
          <h2>Verify it yourself</h2>
        </div>
        <ol className="verify-list">
          <li>Open DevTools → Network and create a payment link. The payload never appears in a request.</li>
          <li>Search the directory response — it is one snapshot, not one query per name.</li>
          <li>Disconnect the network after the app loads; the directory and link remain usable from cache.</li>
          <li>Read the client code. Claims are verified with the same pure verifier the server uses.</li>
        </ol>
        <p className="muted small">
          Standards used: <a href="https://zips.z.cash/zip-0316" target="_blank" rel="noreferrer noopener">ZIP-316</a>{' '}
          unified addresses, <a href="https://zips.z.cash/zip-0321" target="_blank" rel="noreferrer noopener">ZIP-321</a>{' '}
          payment requests,{' '}
          <a href="https://zips.z.cash/zip-0317" target="_blank" rel="noreferrer noopener">ZIP-317</a> fees.
        </p>
      </section>

      <Link to="/" className="back-home"><ArrowLeft size={15} /> Back home</Link>
    </div>
  )
}
