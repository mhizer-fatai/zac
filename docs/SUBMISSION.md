# ZECATHON submission notes

**Track:** 01 — Shielded Payments ($15,000)

**One-liner:** Zac is a private Zcash payments app: claim `@you`, share a server-blind payment link,
and send shielded ZEC in two clicks. No accounts, no analytics, no payment graph.

## The problem

Private Zcash still asks people to copy a 200-character address, and most "payment link" tools are
either transparent, custodial, or leak the request to their own server. The result is a privacy
product with a public front door — exactly the leak the hackathon says is disqualifying.

## The product

1. **Names.** `@alice` resolves to Alice's shielded unified address. Claims are signed messages; the
   public directory is verified locally by every client.
2. **Links.** A request is `https://…/#/pay/<payload>`. The recipient, amount and note live in the URL
   fragment, so the server never receives them. A payer gets a verified name, a private note, and one
   click to a shielded payment.
3. **Receipts.** The payer attaches `zac1|<invoice>|@payer|<note>` inside the encrypted Zcash memo.
   The recipient sees who paid and why; the public chain sees nothing.
4. **Interop.** Every request also renders a ZIP-321 `zcash:` URI and QR, so any shielded wallet can
   pay.

## Why it is different

| Existing tool | What it does | What Zac adds |
| --- | --- | --- |
| zcash.me | Public name directory | Payment requests, in-app send, encrypted receipts, server-blind links |
| ZNS / zcashnames | On-chain names via memos | A consumer payment flow, no claim transaction required |
| zecpay.rocks / ZecPay | Invoice links | A name layer, one-click shielded send, client-verified directory |
| Zashi / wallet apps | Wallets | A shareable payment surface and public names, with wallet approval |

The novel pieces are the **privacy properties**, not a new chain primitive: fragment-only request
payloads, a full-snapshot directory with local verification, and receipts that ride the existing
shielded memo. No new token, no custody, no indexer of payments.

## Demo script (2–3 min)

1. **Hook (0:00–0:15):** "Venmo is easy and public. Zcash is private and hard. Zac makes private ZEC
   as easy as a username."
2. **Home (0:15–0:35):** show the hero, the "server cannot read this link" claim, and the privacy page.
3. **Connect (0:35–1:00):** connect Noir Wallet (testnet), show the shielded balance and network badge.
4. **Claim (1:00–1:25):** claim `@alice`; the wallet signs a message (no transaction, no fee). Show the
   profile link.
5. **Request (1:25–1:50):** create a 0.05 TAZ request with the note "coffee"; show the link and QR.
6. **Pay (1:50–2:30):** open the link as a payer (second wallet/profile). Show the verified name,
   amount, note, then approve the shielded payment in Noir.
7. **Receipt (2:30–2:50):** recipient's Receive page shows "From @payer · coffee" and the shielded
   txid.
8. **Proof (2:50–3:10):** DevTools Network shows the link payload never leaves the browser; the only
   API call is `/api/directory` (one snapshot). Close on "Pay by name. Stay private."

## What is implemented

- React SPA with hash routing; no external runtime requests.
- Noir Wallet adapter: connect, balance, history, max, shielded send with memo, derived-key signing.
- Signed, nonce-protected claim directory with client verification and replay protection.
- Fragment payment links, ZIP-321 fallback, QR codes, private notes, structured receipts.
- Demo wallet for judges (local only, no real funds, no directory pollution).
- Privacy model, architecture and testnet docs; unit tests; production build.

## Known limitations (be explicit)

- Not audited; hackathon software.
- Names are global across testnet/mainnet in this build (the signed message binds the network).
- The claim signature attests to the wallet instance, not shielded-key ownership in zero knowledge.
- Light-wallet sync metadata and the link-sharing channel are outside the app's control.
- The JSON claim store needs a persistent disk/database for production.

## Before submitting

- [ ] Public GitHub repository with this code and the MIT license
- [ ] Live demo URL (HTTPS) with a persistent claim store
- [ ] Demo video uploaded (unlisted/public)
- [ ] Submission form: track 01, repo, video, description
- [ ] Confirm the account is the one that registered for ZECATHON
