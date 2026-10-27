# Architecture

Zac is intentionally small: a static React client, a tiny Node API, and a self-custodial wallet
extension. There is no payment server, no indexer and no database of payments.

```
┌──────────────────────────┐        window.noirwallet        ┌──────────────────────┐
│  React SPA (hash router) │ ◀─────────────────────────────▶ │  Noir Wallet         │
│                          │   connect / sign / send         │  (self-custodial)    │
│  - link codec (fragment) │                                 │  keys + proving      │
│  - directory resolver    │                                 └──────────┬───────────┘
│  - claim verifier        │                                            │ shielded tx
└────────────┬─────────────┘                                            ▼
             │ same-origin /api                             ┌──────────────────────┐
             ▼                                              │  Zcash network       │
┌──────────────────────────┐        signed claims           │  (Orchard/Ironwood)  │
│  Hono API (Node)         │ ◀───────────────────────────── │                      │
│  - verify claim sig      │                                └──────────────────────┘
│  - store public records  │
│  - serve dist/           │
└────────────┬─────────────┘
             ▼
      server/data/claims.json
```

## Components

### Client (`src/`)

- **React 19 + TypeScript + Vite.** No SSR. `HashRouter` is deliberate: every route and payment
  payload lives after `#`, so the server never receives names or payment details in a path or query.
- **Wallet adapter** (`src/lib/wallet.ts`): `NoirAdapter` wraps `@noir-wallet/sdk` (`connect`,
  `getAccounts`, `getBalance`, `getTransactionHistory`, `getMaxTransfer`, `sendTransaction`,
  `signMessage`, `disconnect`). Sends always use `fundingSource: 'shielded'` and a derived signing
  mode for claims. There is no simulated wallet: every flow uses the real extension.
- **Directory provider** (`src/lib/directory.tsx`): fetches the full `/api/directory` snapshot,
  verifies every claim locally, caches the last snapshot, and resolves names/addresses in memory.
- **Payment link codec** (`shared/paylink.ts`): base64url JSON in the URL fragment. Also builds a
  ZIP-321 `zcash:` URI for non-Noir wallets.
- **Memo codec** (`shared/memo.ts`): `zac1|invoice|@sender|note`, UTF-8 byte-safe, max 512 bytes.
- **Amounts** (`shared/amount.ts`): decimal ZEC ↔ zatoshi via `BigInt`; no floating point for money.
- **Pages**: Home (public marketing + connected dashboard), Send, Receive, Pay (request page),
  Profile (`/#/@name`), Settings, Privacy, 404.

### API (`server/`)

- **Hono on Node** (`server/index.ts`). Routes:
  - `GET /api/directory` → `{ version, updatedAt, claims[] }`, ETag + 304 support. One snapshot,
    no per-name lookups.
  - `POST /api/claims` → validates username/address/network/nonce/signature; verifies the Zcash
    signed-message proof; upserts the public claim. 40 claims/hour per salted-hashed connection
    identity, memory only.
  - `GET /api/health` → liveness + claim count.
- **Store** (`server/store.ts`): a JSON file with an in-memory map and serialized atomic writes.
  Intentionally swappable; see "Deployment".
- **Verifier** (`server/verify.ts`): the exact same pure `verifyMessageSignature` implementation as
  the client (`@noir-wallet/sdk`), so there is one source of truth for the signature format.

### Shared (`shared/`)

Code imported by both sides: address classification, amount arithmetic, claim message, memo,
link codec, username rules, types.

## Claim flow

1. Client checks the directory for the name (local lookup).
2. Wallet connects; client has a shielded address and network.
3. Client generates a 128-bit nonce and builds:
   ```
   Zac username claim
   username: alice
   address: <shielded address>
   network: testnet
   nonce: <32 hex>
   ```
4. Wallet signs with `signingMode: 'derived'` (unlinkable to the main transparent key).
5. Client POSTs `{ username, address, network, nonce, signature }`.
6. Server rebuilds the exact message, verifies the signature, checks the address/network, rejects
   used nonces, and stores `{ username, address, network, pubkey, signature, message, timestamps }`.
7. Client refreshes the directory and verifies the new record locally.

The server cannot forge a record; it only sees a public name/address binding. A compromised server
can omit records or serve an old snapshot.

## Payment link flow

1. Recipient opens **Receive**, optionally enters an amount and private note. The client builds:
   ```json
   { "v": 1, "net": "testnet", "to": "<UA>", "h": "alice", "a": "0.25", "m": "Lunch", "i": "<id>", "t": 1750000000000 }
   ```
2. The JSON is base64url-encoded into the URL fragment: `https://host/#/pay/<payload>`.
3. The recipient shares the link. The server never sees the payload.
4. The payer opens the link. The SPA decodes/validates it locally.
5. If `h` is present, the payer's client resolves the name from its directory snapshot and compares
   the address. Mismatch or missing name → payment blocked. Address-only links are allowed with a
   warning.
6. Payer connects the same-network wallet, reviews amount/note, and approves the shielded send.
7. The wallet attaches the structured receipt memo and broadcasts.
8. Recipient's wallet syncs and decrypts the memo; Zac shows "From @payer · note" in history.

## Payment link format

```ts
interface PaymentPayload {
  v: 1
  net: 'mainnet' | 'testnet'
  to: string          // shielded unified or Sapling address
  h?: string          // optional claimed name
  a?: string          // optional amount, decimal string max 8 dp
  m?: string          // optional note, <= 400 UTF-8 bytes
  i: string           // invoice id, [A-Za-z0-9_-]{1,40}
  t: number           // created-at ms
}
```

Validation rejects transparent addresses, wrong network/address combinations, malformed amounts,
notes over the limit, invalid names, oversized payloads and bad base64/JSON.

## Receipts

The memo is built by the payer, includes the link's invoice id, the payer's claimed name (if any)
and the note, and is attached to a shielded output. It is encrypted end-to-end by Zcash. The
recipient app parses it; other wallets show the raw memo. No receipt data goes to the server.

## Crypto details

- **Claim signature:** Zcash signed-message envelope: `CompactSize("Zcash Signed Message:\n") ||
  prefix || CompactSize(message) || message`, double SHA-256, secp256k1 compact ECDSA with recovery
  byte (header 31–34), 65-byte hex.
- **Verification:** recovers the uncompressed pubkey, checks the record's pubkey, then rebuilds the
  message from the record fields and compares it before accepting the claim.
- **Unified addresses:** client accepts `u1…`/`utest1…` and Sapling `zs1…`/`ztestsapling1…`; network
  is inferred from the prefix. Full bech32 decoding is delegated to the wallet's send validation.
- **Fees:** delegated to Noir Wallet (ZIP-317); `getMaxTransfer` is used for the "Max" button.

## Trust boundaries

| Boundary | Trust |
| --- | --- |
| Browser → wallet extension | User approval is required for every signature/send; the extension holds keys |
| Browser → API | Untrusted server; claims verified locally; no payment data sent |
| Browser → directory snapshot | Untrusted; per-record signature verification |
| Wallet → lightwalletd/indexer | Trusted for chain view + metadata exposure (inherent to light clients) |
| Link channel | Trusted by the parties; anyone with the link sees amount/note |

## Deployment

The public deployment is Netlify for the static app plus a VPS for the API, with Netlify
proxying `/api/*` so the browser talks to one origin. Step-by-step: `docs/DEPLOY.md`
(`netlify.toml`, `scripts/netlify-redirects.mjs`, `deploy/zac-api.service`, `deploy/Caddyfile`).

The simplest production shape is one Node service:

```
npm run build   # dist/
npm start       # serves dist/ + /api on PORT
```

The claim store must persist across restarts. Options:

- Mount a persistent volume at `ZAC_DATA_DIR`.
- Replace `server/store.ts` with Postgres/SQLite/Redis while keeping the same interfaces.
- For a serverless host, port `server/index.ts` to the platform's request handler and back the
  store with the platform's KV/database. Hono runs on Workers/Deno/Bun.

The client has no build-time dependency on the API origin; it uses same-origin `/api` by default, or
`VITE_API_BASE_URL` if hosted separately (add CORS in that case).

## Deliberate trade-offs

- **Hash routing** makes URLs slightly less pretty but guarantees names and link payloads never reach
  the server. This is the main privacy/UX trade-off in the app.
- **Full directory downloads** avoid per-name lookup metadata at the cost of a growing snapshot.
- **A public directory** is required for names to be useful; the design makes the public data minimal
  and self-verifying.
- **No frame/iframe embedding and no external assets** reduce the attack surface and metadata leaks.
