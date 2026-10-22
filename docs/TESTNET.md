# Testnet walkthrough

Zac is testnet-first. TAZ has no monetary value; never reuse testnet keys or phrases on mainnet.

## 1. Install the testnet wallet

1. Open the official [Noir Wallet releases](https://github.com/NoirWallet/noir-wallet-sdk/releases).
2. Download the asset whose filename ends in **`-testnet.zip`** (for example
   `noir-wallet-v1.0.38-testnet.zip`). Do not use mirrors or files sent in chat.
3. Unzip it into a folder you will keep.
4. In Chrome/Edge, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**,
   and select the unzipped folder. The extension name should include **[Testnet]**.
5. Create a new wallet, set a strong password, and write the recovery phrase down offline. Zac cannot
   recover it, and no legitimate app will ask for it.

Mainnet users install the Chrome Web Store build instead. Never install both expecting the same
data: mainnet and testnet builds use separate extension IDs and storage.

## 2. Get TAZ

Open the wallet's **Receive** screen and copy the **shielded unified address** (`utest1…`). Then use
one of:

- [Valar testnet faucet](https://faucet.testnet.valargroup.dev/) — 0.125 TAZ/day, accepts UAs.
- [Fauzec](https://fauzec.com/) — 1 TAZ/day, accepts UAs, returns a shielded memo receipt.

Faucets are third-party services; the links open in a new tab with `noreferrer`. Wait for the
transaction to confirm and for the wallet to sync before spending.

## 3. Run Zac

From the repository:

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. (Production: `npm run build && npm start`, then
<http://localhost:8787>.)

## 4. Connect

1. Click **Connect** / **Connect Noir Wallet**.
2. Approve the connection in the Noir popup. Zac asks for read access and transaction approval — not
   for keys.
3. The header should show your testnet badge and a `utest1…` address.

If the wallet is not detected:

- Confirm the testnet build is installed and enabled in `chrome://extensions`.
- Reload the Zac tab after installing.
- Open the extension popup once, unlock it, then reload.
- Make sure you are on `localhost` or HTTPS, not a plain-HTTP LAN address.
- Check the browser console for provider errors.

## 5. Claim a name

1. Click **Claim a name** and enter a lowercase name (3–20 chars, letters/numbers/underscore).
2. Click **Claim with a signature**.
3. Approve the **message signature** in Noir. Signing is free; no transaction is created and no fee
   is paid.
4. The name appears on your dashboard and at `/#/@yourname`.

The claim is a signed public record. Your name and shielded address are public; payments are not.

## 6. Create and pay a link

1. Open **Receive**. Optionally set an amount and a private note.
2. Copy the **Zac link** or scan its QR. The amount/note/address are in the URL fragment; the server
   never sees them.
3. Open the link in another tab (or send it to a second wallet). Review the verified name/amount/note.
4. Connect a testnet wallet and click **Pay … privately**; approve the transaction in Noir.
5. The success screen shows the shielded txid and the encrypted receipt memo.

To test the receiving side, connect the recipient wallet and open **Receive → Payments received**
after the wallet syncs. You should see "From @payer · note".

## 7. Pay from another wallet

Every request also renders a **ZIP-321** `zcash:` URI and QR code. In a wallet that supports shielded
ZIP-321 requests, scan it or paste the URI. Compare the address and amount before approving.
Support varies by wallet; the QR/copy path is the most interoperable fallback.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| "Noir Wallet is not installed" | Testnet build installed/enabled; reload the tab; try `localhost` not `127.0.0.1` (both should work, but extensions can be picky) |
| Wrong network warning | You are mixing a mainnet link with the testnet extension (or vice versa). Install the matching build. |
| Faucet drip not visible | Wait for confirmation and wallet sync; faucets pay from shielded wallets and can be rate-limited |
| Claim says "already claimed" | The name is already bound to another wallet's key. Pick another name. |
| Send fails with "incorrect consensus branch id" | The wallet built the transaction for an older network upgrade. NU6.3 (ZIP-258, branch ID `0x37A5165B`) is active on Testnet from height 4134000; a wallet build without it is rejected by nodes after proving. Nothing is spent. Update the wallet; Zac shows this as a plain-language error |
| Signature fails | Unlock the wallet, retry; make sure the message shown by the wallet matches the name/address |

## Safety

- Never share your seed phrase, wallet password or private key with Zac or anyone.
- Verify the link name/address before paying; Zac blocks obvious mismatches but cannot protect a
  user who ignores warnings.
- TAZ is worthless; do not buy it.
