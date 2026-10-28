import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { verifyMessageSignature } from '@noir-wallet/sdk'

import { classifyAddress } from '../address'
import type { Claim } from '../types'
import { buildReceiptMemo, receiptSender } from '../../src/lib/receipt'
import type { WalletAdapter } from '../../src/lib/wallet'
import { bech32Encode, decodeUnifiedAddress, encodeUnifiedAddress, f4jumble, f4jumbleInv } from '../zip316'
import {
  addAmounts,
  formatAmount,
  isValidAmount,
  subtractAmounts,
  trimAmount,
  zatoshiToZec,
  zecToZatoshi
} from '../amount'
import { buildClaimMessage, normalizePubkey, verifyClaim } from '../claim'
import { findOwnClaim } from '../../src/lib/directory'
import { describeWalletError } from '../../src/lib/walletErrors'
import { formatUsd, usdToZec, zecToUsd } from '../../src/lib/price'
import {
  buildPaymentMemo,
  cleanMemo,
  MEMO_MAX_BYTES,
  newInvoiceId,
  newNonce,
  parsePaymentMemo,
  truncateUtf8,
  utf8Length
} from '../memo'
import { buildZip321Uri, decodePaymentPayload, encodePaymentPayload } from '../paylink'
import { normalizeUsername, validateUsername } from '../username'

describe('amounts', () => {
  it('parses decimal ZEC without floating point', () => {
    expect(zecToZatoshi('1')).toBe(100_000_000n)
    expect(zecToZatoshi('0.00000001')).toBe(1n)
    expect(zecToZatoshi('12.34567890')).toBe(1_234_567_890n)
    expect(zatoshiToZec(1_234_567_890n)).toBe('12.3456789')
  })

  it('rejects malformed amounts', () => {
    for (const value of ['', '0.', '.5', '01', '1.123456789', '-1', '1,5']) {
      expect(isValidAmount(value), value).toBe(false)
    }
    expect(isValidAmount('0')).toBe(true)
    expect(isValidAmount('1.12345678')).toBe(true)
  })

  it('trims, adds and subtracts', () => {
    expect(trimAmount('0.25000000')).toBe('0.25')
    expect(trimAmount('1.00000000')).toBe('1')
    expect(addAmounts('0.1', '0.2')).toBe('0.3')
    expect(subtractAmounts('0.2', '0.3')).toBe('0')
    expect(formatAmount('0.50000000')).toBe('0.5')
  })
})

// From zcash-test-vectors unified_address.json (ZIP-316).
const UA_SAPLING_ORCHARD =
  'u1ay3aawlldjrmxqnjf5medr5ma6p3acnet464ht8lmwplq5cd3ugytcmlf96rrmtgwldc75x94qn4n8pgen36y8tywlq6yjk7lkf3fa8wzjrav8z2xpxqnrnmjxh8tmz6jhfh425t7f3vy6p4pd3zmqayq49efl2c4xydc0gszg660q9p'
const UA_ORCHARD_ONLY =
  'u1ddnjsdcpm36r6aq79n3s68shjweksnmwtdltrh046s8m6xcws9ygyawalxx8n6hg6vegk0wh8zjnafxgh6msppjsljvyt0ynece3lvm0'
const UA_P2PKH_ORCHARD =
  'u1snf9yr883aj2hm8pksp9aymnqdwzy42rpzuffevj35hhxeckays5pcpeq7vy2mtgzlcuc4mnh9443qnuyje0yx6h59angywka4v2ap6kchh2j96ezf9w0c0auyz3wwts2lx5gmk2sk9'
const SAPLING_RAW = '88533c398a49c2513dc85162bf220abaf47dc983f14e908ddaaa7322dba16531bc62efe750fe575c8d149b'
const ORCHARD_RAW = '31844683a07bf8e30057902b0d23e2b2ce9cad0b22190238ca4f329da92c7979052b00f735cb210671bdb0'
const fromHex = (hex: string) => Uint8Array.from(hex.match(/.{2}/g)!, (byte) => parseInt(byte, 16))
const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
function signZcashMessage(message: string, secret: Uint8Array): string {
  const enc = (value: string) => new TextEncoder().encode(value)
  const prefix = enc('Zcash Signed Message:\n')
  const body = enc(message)
  const size = (n: number) => (n < 0xfd ? [n] : [0xfd, n & 0xff, n >> 8])
  const payload = Uint8Array.from([...size(prefix.length), ...prefix, ...size(body.length), ...body])
  const sha = (data: Uint8Array) => createHash('sha256').update(data).digest()
  const recovered = secp256k1.sign(sha(sha(payload)), secret, { prehash: false, format: 'recovered' })
  const out = new Uint8Array(65)
  out[0] = 31 + recovered[0]
  out.set(recovered.slice(1), 1)
  return Buffer.from(out).toString('hex')
}
const TESTNET_UA = encodeUnifiedAddress('utest', [{ typecode: 3, data: fromHex(ORCHARD_RAW) }])

describe('addresses', () => {
  it('recognises shielded networks', () => {
    expect(classifyAddress(UA_SAPLING_ORCHARD)).toMatchObject({ network: 'mainnet', kind: 'shielded' })
    expect(classifyAddress(UA_ORCHARD_ONLY)).toMatchObject({ network: 'mainnet', kind: 'shielded' })
    expect(classifyAddress(TESTNET_UA)).toMatchObject({ network: 'testnet', kind: 'shielded' })
    expect(classifyAddress(bech32Encode('zs', fromHex(SAPLING_RAW), 'bech32'))).toMatchObject({
      network: 'mainnet',
      kind: 'shielded'
    })
    expect(classifyAddress(bech32Encode('ztestsapling', fromHex(SAPLING_RAW), 'bech32'))).toMatchObject({
      network: 'testnet',
      kind: 'shielded'
    })
  })

  it('rejects addresses with a bad checksum', () => {
    const typo = UA_ORCHARD_ONLY.slice(0, -1) + (UA_ORCHARD_ONLY.endsWith('q') ? 'p' : 'q')
    expect(classifyAddress(typo).kind).toBe('unknown')
    expect(classifyAddress('u1' + 'q'.repeat(70)).kind).toBe('unknown')
    expect(classifyAddress('zs1' + 'q'.repeat(70)).kind).toBe('unknown')
  })

  it('flags unified addresses that hide a transparent receiver', () => {
    const info = classifyAddress(UA_P2PKH_ORCHARD)
    expect(info).toMatchObject({ network: 'mainnet', kind: 'mixed' })
    const stripped = decodeUnifiedAddress(info.shieldedOnly!)
    expect(stripped.ok && stripped.value.receivers.map((r) => [r.typecode, toHex(r.data)])).toEqual([[3, ORCHARD_RAW]])
    expect(classifyAddress(info.shieldedOnly!)).toMatchObject({ kind: 'shielded' })
  })

  it('round-trips F4Jumble', () => {
    const message = fromHex('5d7a8f739a2d9e945b0ce152a8049e294c4d6e66b164939daffa2ef6ee6921481cdd86b3cc4318d9614fc820905d042b')
    const jumbled = '0304d029141b995da5387c125970673504d6c764d91ea6c082123770c7139ccd88ee27368cd0c0921a0444c8e5858d22'
    expect(toHex(f4jumble(message))).toBe(jumbled)
    expect(toHex(f4jumbleInv(fromHex(jumbled)))).toBe(toHex(message))
  })

  it('refuses transparent addresses', () => {
    expect(classifyAddress('t1' + 'q'.repeat(40))).toMatchObject({ kind: 'transparent' })
    expect(classifyAddress('t3' + 'q'.repeat(40))).toMatchObject({ kind: 'transparent' })
    expect(classifyAddress('tm' + 'q'.repeat(40))).toMatchObject({ kind: 'transparent' })
  })
})

describe('usernames', () => {
  it('normalises and validates', () => {
    expect(normalizeUsername('  @@Alice ')).toBe('alice')
    expect(validateUsername('alice')).toEqual({ ok: true, username: 'alice' })
    expect(validateUsername('a').ok).toBe(false)
    expect(validateUsername('_alice').ok).toBe(false)
    expect(validateUsername('alice_').ok).toBe(false)
    expect(validateUsername('alice!').ok).toBe(false)
    expect(validateUsername('pay').ok).toBe(false)
    expect(validateUsername('a'.repeat(21)).ok).toBe(false)
  })
})

describe('memo', () => {
  it('round-trips structured receipts', () => {
    const memo = buildPaymentMemo({ invoiceId: 'abc123', from: '@bob', note: 'Lunch | coffee' })
    expect(utf8Length(memo)).toBeLessThanOrEqual(MEMO_MAX_BYTES)
    expect(parsePaymentMemo(memo)).toMatchObject({
      invoiceId: 'abc123',
      from: '@bob',
      note: 'Lunch | coffee'
    })
  })

  it('truncates long notes by UTF-8 bytes', () => {
    const memo = buildPaymentMemo({ invoiceId: 'id', from: 'bob', note: '🙂'.repeat(400) })
    expect(utf8Length(memo)).toBeLessThanOrEqual(MEMO_MAX_BYTES)
    expect(parsePaymentMemo(memo)?.note).toBeTruthy()
    expect(utf8Length(truncateUtf8('🙂🙂', 4))).toBe(4)
  })

  it('cleans NUL padding', () => {
    expect(cleanMemo('hello\u0000\u0000')).toBe('hello')
    expect(parsePaymentMemo('plain note')).toEqual({ raw: 'plain note' })
  })

  it('generates ids', () => {
    expect(newInvoiceId()).toMatch(/^[a-f0-9]{18}$/)
    expect(newNonce()).toMatch(/^[a-f0-9]{32}$/)
  })
})

describe('payment links', () => {
  const payload = {
    v: 1 as const,
    net: 'testnet' as const,
    to: TESTNET_UA,
    h: 'alice',
    a: '0.25',
    m: 'Lunch',
    i: 'abc123',
    t: 1_700_000_000_000
  }

  it('round-trips', () => {
    const decoded = decodePaymentPayload(encodePaymentPayload(payload))
    expect(decoded).toEqual({ ok: true, payload })
  })

  it('rejects bad payloads', () => {
    expect(decodePaymentPayload('not-base64').ok).toBe(false)
    const transparent = encodePaymentPayload({ ...payload, to: 't1' + 'q'.repeat(40) })
    expect(decodePaymentPayload(transparent).ok).toBe(false)
    const wrongNetwork = encodePaymentPayload({ ...payload, net: 'mainnet' })
    expect(decodePaymentPayload(wrongNetwork).ok).toBe(false)
    const badAmount = encodePaymentPayload({ ...payload, a: '1.123456789' })
    expect(decodePaymentPayload(badAmount).ok).toBe(false)
    const mixed = encodePaymentPayload({ ...payload, net: 'mainnet', to: UA_P2PKH_ORCHARD })
    expect(decodePaymentPayload(mixed).ok).toBe(false)
  })

  it('builds ZIP-321 URIs', () => {
    const uri = buildZip321Uri(payload)
    expect(uri.startsWith('zcash:utest1')).toBe(true)
    expect(uri).toContain('amount=0.25')
    expect(uri).toContain('memo=THVuY2g')
  })
})

describe('claim signatures', () => {
  it('matches the Noir wallet message-signing format', () => {
    const message = buildClaimMessage({
      username: 'alice',
      address: 'utest1' + 'q'.repeat(90),
      network: 'testnet',
      nonce: 'a'.repeat(32)
    })
    const prefix = 'Zcash Signed Message:\n'
    const compactSize = (size: number) => {
      if (size > 0xfc) throw new Error('test message too long')
      return new Uint8Array([size])
    }
    const bytes = (value: string) => new TextEncoder().encode(value)
    const concat = (...parts: Uint8Array[]) => {
      const total = parts.reduce((sum, part) => sum + part.length, 0)
      const out = new Uint8Array(total)
      let offset = 0
      for (const part of parts) {
        out.set(part, offset)
        offset += part.length
      }
      return out
    }
    const sha = (data: Uint8Array) => createHash('sha256').update(data).digest()
    const payloadBytes = concat(
      compactSize(bytes(prefix).length),
      bytes(prefix),
      compactSize(bytes(message).length),
      bytes(message)
    )
    const hash = sha(sha(payloadBytes))
    const secret = secp256k1.utils.randomSecretKey()
    const recovered = secp256k1.sign(hash, secret, { prehash: false, format: 'recovered' })
    const signatureBytes = new Uint8Array(65)
    signatureBytes[0] = 31 + recovered[0]
    signatureBytes.set(recovered.slice(1), 1)
    const signature = Buffer.from(signatureBytes).toString('hex')
    const result = verifyMessageSignature({ message, signature, network: 'testnet' })
    expect(result.valid).toBe(true)
    expect(result.recoveredPubkey).toMatch(/^04[0-9a-f]{128}$/)
  })

  it('accepts a real directory record and rejects forged ones', () => {
    const address = TESTNET_UA
    const message = buildClaimMessage({ username: 'alice', address, network: 'testnet', nonce: 'b'.repeat(32) })
    const secret = secp256k1.utils.randomSecretKey()
    const signature = signZcashMessage(message, secret)
    const pubkey = verifyMessageSignature({ message, signature, network: 'testnet' }).recoveredPubkey
    const record: Claim = {
      username: 'alice',
      address,
      network: 'testnet',
      pubkey,
      signature,
      message,
      createdAt: 0,
      updatedAt: 0
    }
    expect(verifyClaim(record)).toBe(true)
    // A server cannot blank the pubkey to make any signature pass.
    const attacker = signZcashMessage(message, secp256k1.utils.randomSecretKey())
    expect(verifyClaim({ ...record, pubkey: '', signature: attacker })).toBe(false)
    expect(verifyClaim({ ...record, signature: attacker })).toBe(false)
    // Nor swap the address under an existing signature.
    expect(verifyClaim({ ...record, address: encodeUnifiedAddress('utest', [{ typecode: 2, data: fromHex(SAPLING_RAW) }]) })).toBe(false)
  })
})

describe('signed receipts', () => {
  const secret = secp256k1.utils.randomSecretKey()
  let signCalls = 0
  const adapter = {
    signMessage: async (message: string) => {
      signCalls += 1
      return { signature: signZcashMessage(message, secret), pubkey: '' }
    }
  } as unknown as WalletAdapter
  const bobPubkey = () => {
    const message = 'probe'
    return verifyMessageSignature({ message, signature: signZcashMessage(message, secret), network: 'testnet' })
      .recoveredPubkey
  }
  const bob = { username: 'bob', network: 'testnet', pubkey: bobPubkey() } as Claim
  const context = (recipient: string, claim: Claim | null = bob) => ({
    recipient,
    network: 'testnet' as const,
    resolve: (name: string) => (name === 'bob' && claim ? claim : undefined)
  })

  it('verifies a receipt signed by the name owner', async () => {
    const memo = await buildReceiptMemo({ adapter, to: TESTNET_UA, invoiceId: 'inv1', from: 'bob', note: 'coffee' })
    expect(memo.startsWith('zac2|inv1|@bob|')).toBe(true)
    const parsed = parsePaymentMemo(memo)
    expect(parsed).toMatchObject({ invoiceId: 'inv1', from: '@bob', note: 'coffee' })
    expect(receiptSender(parsed, context(TESTNET_UA))).toEqual({ name: 'bob', verified: true })
  })

  it('still verifies when a long note is truncated to fit the memo', async () => {
    const memo = await buildReceiptMemo({ adapter, to: TESTNET_UA, invoiceId: 'inv2', from: 'bob', note: 'é'.repeat(400) })
    expect(new TextEncoder().encode(memo).length).toBeLessThanOrEqual(512)
    expect(receiptSender(parsePaymentMemo(memo), context(TESTNET_UA))?.verified).toBe(true)
  })

  it('rejects replays, edits, unsigned names and blank keys', async () => {
    const memo = await buildReceiptMemo({ adapter, to: TESTNET_UA, invoiceId: 'inv3', from: 'bob', note: 'rent' })
    const parsed = parsePaymentMemo(memo)!
    const otherRecipient = encodeUnifiedAddress('utest', [{ typecode: 2, data: fromHex(SAPLING_RAW) }])
    expect(receiptSender(parsed, context(otherRecipient))?.verified).toBe(false)
    expect(receiptSender({ ...parsed, note: 'rent x2' }, context(TESTNET_UA))?.verified).toBe(false)
    expect(receiptSender(parsePaymentMemo('zac1|inv3|@bob|rent'), context(TESTNET_UA))).toEqual({
      name: 'bob',
      verified: false
    })
    expect(receiptSender(parsed, context(TESTNET_UA, { ...bob, pubkey: '' }))?.verified).toBe(false)
    expect(receiptSender(parsed, context(TESTNET_UA, null))?.verified).toBe(false)
  })

  it('does not ask the wallet to sign when the payer stays anonymous', async () => {
    signCalls = 0
    const memo = await buildReceiptMemo({ adapter, to: TESTNET_UA, invoiceId: 'inv4', note: 'gift' })
    expect(signCalls).toBe(0)
    expect(memo).toBe('zac1|inv4|-|gift')
    expect(receiptSender(parsePaymentMemo(memo), context(TESTNET_UA))).toBeNull()
  })
})

describe('own name lookup', () => {
  const secret = secp256k1.utils.randomSecretKey()
  const uncompressed = Buffer.from(secp256k1.getPublicKey(secret, false)).toString('hex')
  const compressed = Buffer.from(secp256k1.getPublicKey(secret, true)).toString('hex')
  const claim = { username: 'fataidev', network: 'testnet', address: TESTNET_UA, pubkey: uncompressed } as Claim
  const rotated = encodeUnifiedAddress('utest', [{ typecode: 2, data: fromHex(SAPLING_RAW) }])
  const connection = (address: string, signingKey?: string, network: 'testnet' | 'mainnet' = 'testnet') => ({
    address,
    network,
    accounts: [],
    signingKey
  })

  it('finds the name by signing key even after the wallet rotates its address', () => {
    expect(findOwnClaim([claim], connection(rotated, compressed))).toBe(claim)
    expect(findOwnClaim([claim], connection(rotated, uncompressed))).toBe(claim)
  })

  it('falls back to the exact address when the key is unavailable', () => {
    expect(findOwnClaim([claim], connection(TESTNET_UA))).toBe(claim)
    expect(findOwnClaim([claim], connection(rotated))).toBeUndefined()
  })

  it('ignores other keys and other networks', () => {
    const other = Buffer.from(secp256k1.getPublicKey(secp256k1.utils.randomSecretKey(), true)).toString('hex')
    expect(findOwnClaim([claim], connection(rotated, other))).toBeUndefined()
    expect(findOwnClaim([claim], connection(rotated, compressed, 'mainnet'))).toBeUndefined()
    expect(normalizePubkey('not-a-key')).toBeNull()
  })
})

describe('wallet error messages', () => {
  it('explains the outdated consensus branch id rejection', () => {
    const noir = new Error(
      'failed to validate tx: WtxId("private"), error: transaction did not pass consensus validation: transaction uses an incorrect consensus branch id'
    )
    expect(describeWalletError(noir)).toMatch(/outdated Zcash network version.*No funds were spent.*Update Noir Wallet/)
  })

  it('recognises a cancelled request as an Error or a provider object', () => {
    expect(describeWalletError(new Error('[Noir Wallet Provider - zcash] request error: User rejected the request'))).toBe(
      'Request cancelled in your wallet.'
    )
    expect(describeWalletError({ code: 4001, message: 'whatever' })).toBe('Request cancelled in your wallet.')
  })

  it('passes unknown errors through and falls back when empty', () => {
    expect(describeWalletError(new Error('Something specific broke'))).toBe('Something specific broke')
    expect(describeWalletError(undefined, 'The payment did not go through.')).toBe('The payment did not go through.')
  })
})

describe('USD estimates', () => {
  it('converts USD to ZEC, rounding down to whole zatoshi', () => {
    expect(usdToZec('10', 25)).toBe('0.4')
    expect(usdToZec('1', 3)).toBe('0.33333333')
    expect(usdToZec('8.10', 1275.35)).toBe(zatoshiToZec(BigInt(Math.floor((8.1 * 1e8) / 1275.35))))
  })

  it('rejects invalid USD input', () => {
    expect(usdToZec('', 25)).toBeNull()
    expect(usdToZec('abc', 25)).toBeNull()
    expect(usdToZec('1.234', 25)).toBeNull()
    expect(usdToZec('0', 25)).toBeNull()
    expect(usdToZec('5', 0)).toBeNull()
  })

  it('converts ZEC to USD and formats it', () => {
    expect(zecToUsd('0.5', 30)).toBe(15)
    expect(formatUsd(8.098)).toBe('$8.10')
    expect(formatUsd(0.004)).toBe('< $0.01')
    expect(formatUsd(0)).toBe('$0.00')
  })
})
