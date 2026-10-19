# Zac

> **Private payments, by name.**
> Claim `@you`, share a link, send shielded ZEC. No accounts, no analytics, no payment graph.

Zac is a non-custodial Zcash payments app built for **ZECATHON 2026 — Track 01, Shielded Payments**.
It turns a shielded Zcash address into a human name and a shareable payment request, while keeping the
payment itself private on-chain and invisible to the app's server.

- **Live demo:** _coming soon_
- **Demo video:** _coming soon_
- **Privacy model:** [`docs/PRIVACY.md`](docs/PRIVACY.md)
- **Architecture:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## What it does

- **Claim a name.** `@alice` is a public pointer to your shielded unified address. Claiming signs one
  free message with your wallet — no transaction, no fee.
- **Send by name.** Type `@alice` or paste a shielded address. Zac resolves names locally and sends a
  shielded payment through Noir Wallet.
- **Share a private request.** Create `https://…/#/pay/<payload>` for a fixed or open amount. The
  recipient, amount and note live in the **URL fragment**, which browsers never send to a server.
- **Encrypted receipts.** Every Zac payment carries a structured memo (`zac1|invoice|@sender|note`)
  inside the shielded output. Only the sender and recipient can decrypt it.
- **Pay from any wallet.** Each request also renders a standard **ZIP-321** `zcash:` URI and QR code,
  so Zashi, Zodl, Zingo!, Ywallet and other shielded wallets can pay without installing Zac.

## Privacy in one breath

Zac never touches funds or keys. Payments are shielded Zcash transactions; there is no transparent
fallback. The server stores only public, wallet-signed name records — never amounts, memos, senders,
recipients or payment links. The name directory is fetched as one snapshot and resolved in the browser,
so the server does not learn which name you looked up. There are no cookies, analytics, third-party
scripts, external fonts or request logs.

The app is deliberately honest about the edges: light wallets reveal some metadata to their sync server,
the channel you share a link through can read it, and shielding is not anonymity against a global
network observer. See [`docs/PRIVACY.md`](docs/PRIVACY.md) for the full model.

## Stack

- **Frontend:** React 19 + TypeScript + Vite, hash-based routing, one self-hosted font, no external
  requests.
- **Wallet:** [Noir Wallet](https://zknoir.com) via `@noir-wallet/sdk` — a self-custodial Chrome
  extension with mainnet and testnet builds.
- **API:** Hono on Node, a small JSON store for signed name records.
- **Crypto:** Zcash signed-message verification (secp256k1 + double SHA-256) shared by client and
  server; Zcash shielded memos; ZIP-316 unified addresses; ZIP-321 payment URIs; ZIP-317 fees.

## Run it locally

Requires **Node 20+** (built on Node 24).

```bash
npm install
npm run dev
```

- UI: <http://localhost:5173>
- API: <http://localhost:8787>

The Vite dev server proxies `/api` to the API server. The first `npm run dev` starts both processes.

### Production build

```bash
npm run build
npm start
```

`npm start` serves the built SPA and the API from a single Node process on port **8787**. Set `PORT`
and `ZAC_DATA_DIR` to taste. The JSON store is intentionally simple; for a public deployment use a
persistent disk or replace `server/store.ts` with a database.

### Tests

```bash
npm test
```

Covers amount arithmetic (no floating point), memo encoding/truncation, payment-link validation,
username rules, address classification and the claim signature format.

## Noir Wallet setup

Zac needs the **Noir Wallet** browser extension. It is self-custodial: the seed and keys never leave
the extension.

- **Mainnet:** install from the [Chrome Web Store](https://chromewebstore.google.com/detail/noir-wallet/mfoghjbpfanobmnoemoepenjjcmfpmdn).
- **Testnet:** download the official `*-testnet.zip` from
  [GitHub Releases](https://github.com/NoirWallet/noir-wallet-sdk/releases), unzip it, open
  `chrome://extensions`, enable Developer mode and **Load unpacked**.
- Create or restore a wallet and back up the recovery phrase offline.

Never install a Noir build from a third-party mirror, and never give Zac (or anyone) your seed phrase.
Zac cannot recover it.

### Testnet walkthrough

See [`docs/TESTNET.md`](docs/TESTNET.md). In short:

1. Install the testnet build and create a wallet.
2. Copy the shielded address and request TAZ from a faucet
   ([Valar](https://faucet.testnet.valargroup.dev/) or [Fauzec](https://fauzec.com/)).
3. Open Zac, connect, claim a name, create a link and pay it.
4. Use **Try the demo** to explore the whole interface without an extension or funds. Demo names are
   local to your browser and never enter the public directory.

## Project layout

```
src/                 React app
  components/        Layout, claim modal, QR, copy/share, tx rows
  lib/               Wallet adapters (Noir + demo), directory, links, API
  pages/             Home, Send, Receive, Pay, Profile, Settings, Privacy
shared/              Code used by both client and server
  address.ts         Shielded/transparent/network classification
  amount.ts          Exact zatoshi arithmetic
  claim.ts           Canonical signed claim message
  memo.ts            Structured encrypted receipt memos
  paylink.ts         Fragment payload encode/decode + ZIP-321
  username.ts        Public name rules
server/              Hono API + signed claim store
docs/                Privacy model, architecture, testnet guide
scripts/             Dev-only signature smoke test
```

## API

The public API is tiny on purpose.

| Method | Path             | Purpose                                                         |
| ------ | ---------------- | --------------------------------------------------------------- |
| `GET`  | `/api/directory` | Full snapshot of verified, wallet-signed name records           |
| `POST` | `/api/claims`    | Publish a name claim, signed by the wallet (nonce + signature)  |
| `GET`  | `/api/health`    | Liveness and claim count                                        |

There is **no** endpoint that resolves a single name, and no endpoint that receives payment data.
The client downloads the snapshot and resolves names locally.

## Deployment

The app is a single Node service. Build it, then run `npm start` behind HTTPS. Environment:

| Variable            | Meaning                                                        |
| ------------------- | -------------------------------------------------------------- |
| `PORT`              | API/static port (default `8787`)                               |
| `ZAC_DATA_DIR`      | Directory for `claims.json` (default `server/data`)            |
| `VITE_API_BASE_URL` | Optional absolute API base if the UI is hosted separately      |
| `VITE_SOURCE_URL`   | Optional link to the source repository shown in Settings       |

The directory store must survive restarts for names to persist. Mount a volume or swap the store for
a database before a real launch. The app never stores payment data, so a database only needs the
public claim records.

## Status & limitations

Zac is a hackathon build, not audited. Names are global across testnet/mainnet in this version (the
signed message binds the network, so a claim cannot be replayed on the other network). The directory
is a public phone book by design. A name binds to a wallet-supplied shielded address with a signature
from the wallet's derived transparent key — it is an attestation, not a zero-knowledge proof of
shielded-key ownership. See the privacy model for the full list.

## License

MIT — see [`LICENSE`](LICENSE).
