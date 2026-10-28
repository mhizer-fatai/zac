# Zac privacy model

This document is the long version of the in-app **Privacy** page. It is intentionally specific about
what Zac can and cannot protect. Privacy claims are only useful if they survive scrutiny.

## 1. Summary

| Data | Who can see it |
| --- | --- |
| Your `@name` and shielded address | Anyone — public directory entry, like a phone book |
| Payment sender, recipient, amount | Only the sender and recipient — hidden by Zcash shielded transactions |
| Receipt memo | Only sender and recipient — encrypted in the shielded output |
| Payment-link payload (recipient, amount, note) | Only the browser that opens the link — it is in the URL fragment |
| Wallet seed phrase / private keys | Only your wallet. Zac never asks for them. |
| Zac server request logs / analytics / cookies | None. They do not exist. |

There is no account, email, phone number, password or KYC in Zac.

## 2. On-chain privacy

Zac only constructs **shielded** payments. The recipient address must be a unified address (ZIP-316)
or a Sapling address; transparent `t1`/`t3`/`tm` addresses are rejected in the client, the link
validator and the server's claim validator. The wallet adapter always passes
`fundingSource: 'shielded'` and there is no UI switch to transparent funding.

**Unified addresses are decoded, not pattern-matched.** A `u1…` address is a bundle of receivers
and may include a transparent one. If it does, a payer's wallet could choose that receiver and
send publicly. Zac decodes every unified address (Bech32m, F4Jumble, receiver list, per ZIP-316;
`shared/zip316.ts`, tested against the official `zcash-test-vectors`) and:

- rejects any address that bundles a transparent receiver in the directory, payment links and the
  server's claim validator;
- publishes the connected wallet's address with its transparent receiver stripped, so the same
  wallet is reachable only through its Sapling/Orchard receivers;
- pays a pasted address through its shielded receivers only.

Checksums are verified too, so a mistyped address is refused instead of sent to.

On the public chain, a shielded transaction reveals that *a* transaction happened, its fee and its
timing, but not the sender, recipient or amount. This is Zcash's core guarantee, inherited from the
shielded pool; Zac does not add a custom anonymity layer.

The receipt memo is a 512-byte encrypted note attached to a shielded output. Zac's structured format
is:

```
zac1|<invoiceId>|-|<note>                         anonymous (default)
zac2|<invoiceId>|@<sender>|<signature>|<note>     payer chose to reveal their name
```

The recipient's wallet decrypts it with its incoming viewing key. It is not public. The payer's
wallet stores the outgoing memo locally.

**Anonymous by default.** A receipt carries no sender unless the payer ticks "Sign the receipt as
@name". The choice is remembered only in that browser.

**Signed sender names.** A name typed into a memo proves nothing — anyone can write `@alice`. When
the payer reveals their name, their wallet signs

```
Zac payment receipt
from: <name>
to: <recipient shielded address>
invoice: <invoiceId>
note-sha256: <hex>
```

with the same derived key that claimed the name. The recipient's Zac checks it against that name's
pubkey in the locally verified directory and shows **verified** or **unverified**. Binding the
recipient address and invoice means a signed receipt cannot be replayed into a payment to someone
else. The note is committed by hash so the signed text is pure ASCII (the Noir SDK's message
envelope counts UTF-16 code units, not bytes, for its length prefix). Revealing costs one extra
wallet approval; anonymous payments need none.

A signed receipt is **transferable proof**: anyone who is shown the memo can verify that @name paid
this recipient with this note, and the payer cannot deny it. That is what makes it trustworthy, and
it is why signing is opt-in; the app says so next to the checkbox.

## 3. Payment links

A Zac request link looks like:

```
https://<host>/#/pay/<base64url(JSON)>
```

Everything after `#` is a **URI fragment**. Per RFC 3986 and browser behavior, fragments are not sent
in HTTP requests, referrer headers or server logs. The app is a static SPA; the server only ever
receives `GET /` for the app shell.

The JSON payload contains:

```json
{ "v": 1, "net": "testnet", "to": "<shielded address>", "h": "alice", "a": "0.25", "m": "Lunch", "i": "<invoice id>", "t": 1750000000000 }
```

The client validates the network, address kind, amount, note length, invoice id and timestamp before
displaying it. If a name is present, the client resolves the name from the independently fetched
directory and compares the resolved address to the payload address. A mismatch blocks payment. A
name that is missing from the directory also blocks payment. Address-only links are allowed and
labelled as such.

There are no link shorteners, no server-side link records, no preview fetches and no analytics
beacons. The trade-off is that the link is long and that anyone who has the URL can read the amount
and note. Use a private channel when sharing it.

### Sealed links (default for Zac payment links)

Payment links created in Zac are sealed. The browser encrypts the encoded request with a fresh
random AES-256-GCM key and stores only the ciphertext on Zac’s server; the key goes in the link’s
fragment (`/#/r/<id>.<key>`), which browsers never send. Opening the link fetches the ciphertext and
decrypts it in the payer’s browser.

- **One payment, 30 minutes.** After a successful payment the payer’s browser marks the request paid
  (it sends only the request id, never a transaction id or amount), and the server refuses to serve
  it again. Unpaid requests expire after 30 minutes and are purged. Old links in chats, backups or
  browser history become dead pointers.
- **No payment timing.** The "paid" call is sent after a random 1–3 minute delay, so it cannot be
  matched to the broadcast time of a shielded transaction on-chain. The payer's browser remembers the
  payment locally in the meantime so the same link cannot be paid twice from it; if the tab closes
  first, the link simply dies at its 30-minute expiry.
- **What the server sees.** Ciphertext it cannot read, plus *when* a request is created, opened and
  marked paid, from which network connection. A server that logged IPs could therefore tell that two
  connections interacted, without knowing who, how much or why. Zac keeps no request logs and stores
  no IPs (rate limiting uses salted hashes held in memory only).
- **What it does not protect.** Anyone who has the full link before it is paid or expires can open
  it. The “Any wallet” ZIP-321 QR is a standard, unsealed request so other wallets can read it.

## 4. Names and the directory

Names are a public addressing layer. `@alice` maps to Alice's shielded address; this is public by
design, exactly like an email address. The mapping does not reveal balances, history, payment
counterparties or amounts.

### Claims

Claiming a name signs this canonical message with the wallet's **derived** secp256k1 key
(`m/44'/133'/2147483647'/0/0`), which is unlinkable to the wallet's main transparent address:

```
Zac username claim
username: alice
address: <shielded address>
network: testnet
nonce: <32 hex chars>
```

- The signature is a Zcash "signed message" (compact ECDSA + recovery byte, double SHA-256 over the
  Zcash message envelope).
- The server verifies the signature, checks the address/network, normalizes the name and stores the
  public record. It never sees a seed or spending key.
- Every claim includes a random nonce. The server remembers used nonces and rejects replays, so an
  old signed update cannot be replayed to roll a name back.
- The name is bound to the first pubkey that claims it. A different wallet cannot take it over.

### Client-side verification

The client downloads the **whole** directory and verifies every record locally:

1. the message is rebuilt from the record fields and must match exactly (so a malicious server cannot
   rename a record or swap its address);
2. the signature must verify against the stored pubkey;
3. the username and shielded address must be valid for the claimed network.

As a result, a compromised directory server can **omit or withhold** names, but it cannot forge them.
The client also caches the last snapshot locally, so a temporary outage does not break resolution.

There is deliberately **no `/resolve/<name>` endpoint**. A per-name lookup would tell the server which
name you are about to pay. Bulk download + local resolution removes that metadata channel. The trade-off
is that the whole directory is public (it already is) and the snapshot grows with the number of names.

## 5. Server data and operations

Zac stores exactly the public claim records:

```ts
{
  username, address, network, pubkey, signature, message, createdAt, updatedAt
}
```

That is the entire database. No names are tied to accounts, emails, IPs or payment history.

Other operational facts:

- **No analytics, cookies, third-party scripts, fonts or CDNs.** Fonts and icons are bundled.
- **USD estimates come through Zac's server.** On mainnet the app shows approximate USD values and
  lets you type an amount in USD. The browser asks Zac's own `/api/price`; the server fetches the
  ZEC/USD price from CoinGecko at most every five minutes and caches it, so CoinGecko never sees
  users, and the CSP stays same-origin. The request carries no amount, address or name. Payments are
  always made in ZEC: a USD entry is converted to ZEC (rounded down to whole zatoshi) and the exact
  ZEC amount is shown before the wallet asks for approval.
- **No request logging.** The Node process prints one startup line; Hono has no logger installed.
- **Rate limiting** is an in-memory map keyed by a salted hash of the connection IP. The salt is
  generated per process; raw IPs are never written to disk. Known limitation: the limiter reads the
  first `X-Forwarded-For` entry, which a client can set, so the limits are best-effort against spam.
  This affects abuse resistance, not privacy.
- **Public timestamps are rounded to the day.** The directory and health endpoint publish claim and
  update times rounded down to the day, so they cannot be matched to request times in hosting logs.
- **Server logs carry no user data.** Database failures are logged by error code only, because
  database messages can echo submitted values.
- **A strict Content-Security-Policy** makes "no third-party requests" a rule the browser enforces,
  not a promise: `default-src 'none'` with only `'self'` allowed for scripts, styles, images, fonts
  and `connect-src`. Even injected or compromised code in the page cannot fetch, beacon or load
  anything from another origin. The build emits every asset as a file (no inlined `data:` URIs) so
  nothing needs an exception.
- **Referrer-Policy: no-referrer**, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Cross-Origin-Resource-Policy: same-origin` and `Cross-Origin-Opener-Policy: same-origin` are also
  set by the server.
- The app makes **no external network requests** at runtime (the wallet extension's own sync traffic is
  separate and outside the page).
- The server is open source and self-hostable; the directory can be mirrored.

## 6. Wallet boundary

Zac is a dApp. It connects to **Noir Wallet** through `window.noirwallet` and its typed SDK. The wallet
shows every transaction for approval; Zac cannot sign or broadcast anything on its own.

- Zac never requests a seed phrase, password, private key or wallet database.
- The app reads the authorized shielded address, balance and transaction history only after the user
  approves the connection.
- Sending uses `fundingSource: 'shielded'`; the wallet performs proof generation and broadcast.
- Claim signatures use the wallet's **derived** signing mode, which is designed to be unlinkable to the
  main transparent address.

Noir Wallet is an independent product. Its own privacy policy and security model apply to the
extension, its sync servers and its analytics settings. Zac does not control them.

## 7. What Zac cannot protect

- **Wallet sync metadata.** A light wallet talks to a lightwalletd/Zaino-style server. That server can
  learn your IP, user agent and which blocks contain your shielded notes. This is inherent to light
  clients, not specific to Zac. Run your own infrastructure for stronger metadata privacy.
- **The sharing channel.** A link is readable by whoever holds it: a chat app, email provider, clipboard
  manager or shoulder-surfer. The fragment protects you from our server and from link previews, not
  from the messenger.
- **Hosting providers.** The public deployment involves four infrastructure companies (see
  `docs/DEPLOY.md`). None of them can read payments, notes, amounts or request contents; all of them
  can see some network metadata under their own logging policies:

  | Provider | Role | Can see |
  | --- | --- | --- |
  | Netlify | Serves the app; proxies `/api/*` | Page loads and every API call (directory, claims, price, sealed-request create/open/paid), with IP and time |
  | Cloudflare | Network edge in front of Render | The same API calls, with the client IP forwarded by Netlify, and time |
  | Render | Runs the API | The same API calls, with forwarded IP and time; the process itself logs no requests |
  | Neon | Postgres database | Stored rows: public name claims, used nonces, and sealed-request ciphertext with expiry/paid times. Its backups may keep deleted ciphertext briefly; without the key from the link it is unreadable |

  The fragment of a link (request data, sealed-link keys) is never sent to any of them. Self-hosting
  the static files and the API (see `docs/DEPLOY.md`, VPS option) removes all four.
- **Network observers.** Zac does not add Tor, a VPN or a mixnet. Your ISP/hosting provider can see that
  you use a Zcash app and when.
- **Address reuse.** A name points to one shielded address. Address reuse is normal for a phone-book
  entry, but it creates linkability edges if that address is ever connected to an identity elsewhere.
  A fresh wallet account per identity gives stronger separation.
- **The name attestation is not a proof of shielded-key ownership.** The claim signature comes from the
  wallet's derived transparent key. It proves "this wallet instance supplied this shielded address",
  not "I can spend notes at this address" in zero knowledge. A malicious claimant could bind a name to
  somebody else's address (griefing, not theft). Stronger schemes (memo-based ownership proofs) are
  future work.
- **Compromised endpoints.** A malicious host can serve modified JavaScript. Mitigations are open
  source, self-hosting, reproducible builds, SRI/pinning and reviewing the code. None of these are
  applied automatically by visiting a deployment.
- **Supply chain.** The app depends on npm packages, the browser, the extension and Zcash libraries.
  A compromised dependency can defeat any application-level privacy claim.
- **Testnet.** TAZ has no value and testnet is for development. Do not use testnet keys on mainnet.
- **No audit.** This is a hackathon build, not audited software. Treat it accordingly.

## 8. Design rules

1. Shielded only; reject transparent addresses everywhere.
2. The server never receives payment data.
3. The directory is public and wallet-signed; clients verify it.
4. No accounts, no cookies, no analytics, no request logs.
5. No third-party runtime requests.
6. Link payloads live in fragments; no shorteners or previews.
7. Names are resolved from a full snapshot, not per-name queries.
8. Be explicit about metadata that cannot be removed.

## 9. Verify it yourself

- Open DevTools → Network, create a payment link and pay it. There is no request containing the
  payload, amount or recipient.
- Search the directory response: it is one snapshot, not a request per name.
- Inspect `localStorage`: it contains only the directory cache, never a seed or key.
- Read `shared/claim.ts`, `shared/paylink.ts` and `src/lib/directory.tsx`; the client verification is
  the same code the server runs.
- Self-host the app and compare the only outbound requests: same-origin static assets and `/api`.
