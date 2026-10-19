import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { verifyMessageSignature } from '@noir-wallet/sdk'

import { classifyAddress } from '../address'
import {
  addAmounts,
  formatAmount,
  isValidAmount,
  subtractAmounts,
  trimAmount,
  zatoshiToZec,
  zecToZatoshi
} from '../amount'
import { buildClaimMessage } from '../claim'
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

describe('addresses', () => {
  it('recognises shielded networks', () => {
    expect(classifyAddress('u1' + 'q'.repeat(70))).toMatchObject({ network: 'mainnet', kind: 'shielded' })
    expect(classifyAddress('utest1' + 'q'.repeat(70))).toMatchObject({ network: 'testnet', kind: 'shielded' })
    expect(classifyAddress('zs1' + 'q'.repeat(70))).toMatchObject({ network: 'mainnet', kind: 'shielded' })
    expect(classifyAddress('ztestsapling1' + 'q'.repeat(60))).toMatchObject({ network: 'testnet', kind: 'shielded' })
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
    to: 'utest1' + 'q'.repeat(90),
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
})
