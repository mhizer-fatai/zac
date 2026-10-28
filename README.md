# Zac

> **Private payments, by name.**
> Claim `@you`, send a sealed payment link, get paid in shielded ZEC. No accounts, no analytics, no payment graph on-chain or in Zac's database.

Zac is a non-custodial Zcash payments app built for **ZECATHON 2026 — Track 01, Shielded Payments**,
focused on **remittance and person-to-person payments**. It turns a shielded Zcash address into a
human name and a one-time payment link, while keeping the payment private on-chain and the request
unreadable to everyone but the people involved, including Zac's own server.

- **Live app:** <https://zacpay.netlify.app>
- **Demo video:** _coming soon_
- **Privacy model:** [`docs/PRIVACY.md`](docs/PRIVACY.md) · **Architecture:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · **Deploy:** [`docs/DEPLOY.md`](docs/DEPLOY.md)

**Verified end to end on Zcash mainnet:** claim a name, send to `@name` with the amount entered in
USD through Noir Wallet, and the recipient sees the confirmed shielded payment as "From @name ✓
verified".

## What it does

- **Claim a name.** `@alice` is a public pointer to your shielded unified address. Claiming signs one
  free message with your wallet: no transaction, no fee.
- **Send by name.** Type `@alice` or paste a shielded address, enter the amount in **ZEC or USD**, and
  send a shielded payment through Noir Wallet. The exact ZEC amount is always shown before approval.
- **Sealed payment links.** Ask for money with a link like `https://zacpay.netlify.app/#/r/<id>.<key>`.
  The request (who to pay, how much, why) is **encrypted in your browser**; Zac stores only ciphertext
  and the key never leaves the link. Each link works for **one payment within 30 minutes**, then dies.
- **Pay from any wallet.** Opening a link shows who you are paying (with a verified name), the amount
  and the note. Pay with Noir in the browser, or tap **Open in wallet app** / scan the ZIP-321 QR to
  pay from Zodl, Zingo!, Ywallet or any shielded wallet.
- **Anonymous by default, verifiable on request.** Every payment carries an encrypted receipt memo.
  By default it has no sender. If the payer chooses, their wallet signs it, and the recipient sees
  **"From @name ✓ verified"**, which nobody else can fake.
- **Receive.** One screen with your address QR and a **Request payment** menu for sealed links,
  your profile link or a plain `zcash:` URI.

## How it stays private

| | Public chain | Zac's server | Sender & recipient |
| --- | --- | --- | --- |
| Who paid whom | Hidden | Hidden | Payer decides |
| Amount, note, receipt | Hidden | Hidden | Visible |
| Which `@name` you looked up | Hidden | Hidden | Only you |
| Payment request contents | Hidden | **Ciphertext only** | Link holders (one payment, 30 min) |
| That a shielded transaction happened, its fee and time | Visible | Hidden | Visible |
| Your `@name` and address | Hidden | Public (phone book) | Public |

How each guarantee is enforced:

- **Shielded only.** Every send uses shielded funding. Unified addresses are fully decoded (ZIP-316,
  tested against the official vectors) and any transparent receiver is stripped or refused, so no
  wallet can fall back to a public payment.
- **Server-blind lookups.** The directory is downloaded as one snapshot and searched in the browser.
- **Server can't forge names.** Every record is wallet-signed and re-verified in the browser.
- **Sealed links.** AES-256-GCM in the browser; key in the URL fragment, which browsers never send.
  The "paid" signal is delayed randomly so it can't be matched to a transaction's broadcast time.
- **No third parties in the browser.** A strict Content-Security-Policy (`default-src 'none'`,
  `connect-src 'self'`) blocks every external request. Even the ZEC/USD price comes through Zac's
  server, so the price source never sees users.
- **No cookies, analytics or request logs.**

What Zac cannot protect is written down too: hosting providers see network metadata (listed by name
in the privacy model), light wallets reveal timing to their sync server, and anyone holding a live
link can open it. See [`docs/PRIVACY.md`](docs/PRIVACY.md).

## Stack

- **Frontend:** React 19 + TypeScript + Vite, hash routing, self-hosted fonts, no external requests.
- **Wallet:** [Noir Wallet](https://zknoir.com) via `@noir-wallet/sdk` (self-custodial browser extension).
- **API:** Hono on Node. Postgres (e.g. Neon) when `DATABASE_URL` is set, otherwise a JSON file.
- **Crypto:** ZIP-316 decoding (Bech32m, F4Jumble), Zcash signed messages (secp256k1), WebCrypto
  AES-256-GCM for sealed links, ZIP-321 payment URIs, ZIP-317 fees (computed by the wallet).

## Run it locally

Requires **Node 20+** (built on Node 24).

```bash
npm install
npm run dev
```

- UI: <http://localhost:5173> (proxies `/api` to the API)
- API: <http://localhost:8787>

Without `DATABASE_URL`, names are kept in `server/data/claims.json` and sealed requests in memory.

### Tests

```bash
npm test
```

33 tests: exact zatoshi arithmetic, memo encoding, payment-link validation, username rules,
ZIP-316/F4Jumble against the official test vectors, directory forgery attempts, signed receipts
(replay, tampering, blank keys), sealed-link encryption (wrong key, tampering), USD conversion and
wallet error messages.

## Deployment

The live app runs as **Netlify** (static app, proxying `/api/*`) + **Render** (API) + **Neon**
(Postgres). A self-hosted VPS setup (systemd + Caddy) is also documented. Step by step:
[`docs/DEPLOY.md`](docs/DEPLOY.md).

| Variable | Where | Meaning |
| --- | --- | --- |
| `ZAC_API_ORIGIN` | Netlify | API origin that `/api/*` is proxied to (e.g. `https://zac-api.onrender.com`) |
| `VITE_SOURCE_URL` | Netlify | Optional link to this repository |
| `DATABASE_URL` | API | Postgres connection string; tables are created on start |
| `PORT`, `HOST` | API | Listen address (default `0.0.0.0:8787`) |
| `ZAC_DATA_DIR` | API | Directory for the JSON store when no database is set |

## API

Small on purpose. Nothing here ever receives an address you are paying, an amount, a note or a
transaction id.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/directory` | Full snapshot of wallet-signed name records (no per-name lookup exists) |
| `POST` | `/api/claims` | Publish a signed name claim |
| `POST` | `/api/requests` | Store a sealed request's **ciphertext** for 30 minutes |
| `GET` | `/api/requests/:id` | Fetch that ciphertext, or `paid` / `expired` |
| `POST` | `/api/requests/:id/paid` | Mark a sealed request used (request id only) |
| `GET` | `/api/price` | Cached ZEC/USD price (fetched server-side) |
| `GET` | `/api/health` | Liveness |

## Project layout

```
src/
  pages/        Home (landing + dashboard), Send, Receive, Pay, SealedPay, Profile, Settings, Privacy
  components/   Layout, claim modal, QR, receipt toggle, tx rows
  lib/          Noir adapter, directory + own-name lookup, sealed requests, receipts,
                USD price, wallet error messages, scroll reveal
shared/         Used by browser and server
  zip316.ts     Unified address codec (Bech32m, F4Jumble, receivers)
  address.ts    Shielded / mixed / transparent classification
  claim.ts      Signed claim message + verification
  memo.ts       Receipt memos and signed-receipt message
  paylink.ts    Request payload + ZIP-321 URIs
  amount.ts     Exact zatoshi arithmetic
server/         Hono API, Postgres/JSON store
deploy/         systemd unit + Caddyfile for the VPS option
docs/           Privacy model, architecture, deployment, testnet guide
```

## Known limitations

- **Not audited.** Hackathon software; an internal privacy review is reflected in the privacy model.
- **Noir testnet sends fail today.** Noir v1.0.39 (testnet build) stamps transactions with a
  pre-NU6.3 consensus branch ID, so testnet nodes reject them. Zac explains the error and nothing is
  spent. Mainnet works.
- **One recipient per transaction.** Split payments in a single transaction need multi-output signing,
  which Noir's dApp API and Zodl's QR flow do not expose yet. Zac does not fake it.
- **A signed receipt is proof of payment** the recipient can show to others; that is why signing is
  opt-in.
- Names claimed from the same wallet share a public signing key, so they are linkable; use a
  separate wallet per identity.
- Sealed links store ciphertext on the server, so the server and its hosting providers can see that
  a request was created and later opened from two network connections (never what it says).
- Names are a public phone book, global across mainnet and testnet. A claim attests that the wallet
  supplied the address; it is not a zero-knowledge proof of key ownership.

## License

MIT — see [`LICENSE`](LICENSE).
