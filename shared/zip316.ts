import { blake2b } from '@noble/hashes/blake2.js'

/**
 * ZIP-316 unified address codec: Bech32m without the 90-char limit,
 * F4Jumble, and receiver parsing. Zac decodes addresses itself instead of
 * trusting the prefix, so a unified address that hides a transparent
 * receiver can never be published or paid by mistake.
 */

export const TYPECODE_P2PKH = 0x00
export const TYPECODE_P2SH = 0x01
export const TYPECODE_SAPLING = 0x02
export const TYPECODE_ORCHARD = 0x03

const RECEIVER_LENGTHS: Record<number, number> = {
  [TYPECODE_P2PKH]: 20,
  [TYPECODE_P2SH]: 20,
  [TYPECODE_SAPLING]: 43,
  [TYPECODE_ORCHARD]: 43
}

export interface UnifiedReceiver {
  typecode: number
  data: Uint8Array
}

export type DecodeResult<T> = { ok: true; value: T } | { ok: false; error: string }

/* ------------------------------------------------------------------ */
/* Bech32 / Bech32m (BIP-173 / BIP-350)                                */
/* ------------------------------------------------------------------ */

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
const BECH32_CONST = 1
const BECH32M_CONST = 0x2bc830a3

function polymod(values: number[]): number {
  const gen = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
  let chk = 1
  for (const value of values) {
    const top = chk >>> 25
    chk = ((chk & 0x1ffffff) << 5) ^ value
    for (let i = 0; i < 5; i++) {
      if ((top >>> i) & 1) chk ^= gen[i]
    }
  }
  return chk >>> 0
}

function hrpExpand(hrp: string): number[] {
  const out: number[] = []
  for (const char of hrp) out.push(char.charCodeAt(0) >> 5)
  out.push(0)
  for (const char of hrp) out.push(char.charCodeAt(0) & 31)
  return out
}

function convertBits(data: ArrayLike<number>, from: number, to: number, pad: boolean): number[] | null {
  let acc = 0
  let bits = 0
  const out: number[] = []
  const maxv = (1 << to) - 1
  for (let i = 0; i < data.length; i++) {
    const value = data[i]
    if (value < 0 || value >> from) return null
    acc = (acc << from) | value
    bits += from
    while (bits >= to) {
      bits -= to
      out.push((acc >> bits) & maxv)
    }
  }
  if (pad) {
    if (bits > 0) out.push((acc << (to - bits)) & maxv)
  } else if (bits >= from || ((acc << (to - bits)) & maxv)) {
    return null
  }
  return out
}

export function bech32Decode(
  input: string,
  variant: 'bech32' | 'bech32m'
): DecodeResult<{ hrp: string; data: Uint8Array }> {
  if (input !== input.toLowerCase() && input !== input.toUpperCase()) {
    return { ok: false, error: 'Mixed-case address.' }
  }
  const value = input.toLowerCase()
  const sep = value.lastIndexOf('1')
  if (sep < 1 || sep + 7 > value.length) return { ok: false, error: 'Malformed address.' }
  const hrp = value.slice(0, sep)
  const words: number[] = []
  for (const char of value.slice(sep + 1)) {
    const index = CHARSET.indexOf(char)
    if (index < 0) return { ok: false, error: 'Invalid character in address.' }
    words.push(index)
  }
  const expected = variant === 'bech32m' ? BECH32M_CONST : BECH32_CONST
  if (polymod([...hrpExpand(hrp), ...words]) !== expected) {
    return { ok: false, error: 'Address checksum failed. Check for a typo.' }
  }
  const bytes = convertBits(words.slice(0, -6), 5, 8, false)
  if (!bytes) return { ok: false, error: 'Malformed address.' }
  return { ok: true, value: { hrp, data: Uint8Array.from(bytes) } }
}

export function bech32Encode(hrp: string, data: Uint8Array, variant: 'bech32' | 'bech32m'): string {
  const words = convertBits(data, 8, 5, true)!
  const constant = variant === 'bech32m' ? BECH32M_CONST : BECH32_CONST
  const mod = polymod([...hrpExpand(hrp), ...words, 0, 0, 0, 0, 0, 0]) ^ constant
  const checksum: number[] = []
  for (let i = 0; i < 6; i++) checksum.push((mod >>> (5 * (5 - i))) & 31)
  return hrp + '1' + [...words, ...checksum].map((word) => CHARSET[word]).join('')
}

/* ------------------------------------------------------------------ */
/* F4Jumble (ZIP-316)                                                  */
/* ------------------------------------------------------------------ */

const F4_MIN = 48
const F4_MAX = 4194368
const ascii = (value: string) => Uint8Array.from(value, (char) => char.charCodeAt(0))
const PERSONAL_H = ascii('UA_F4Jumble_H')
const PERSONAL_G = ascii('UA_F4Jumble_G')

function personal(prefix: Uint8Array, tail: number[]): Uint8Array {
  const out = new Uint8Array(16)
  out.set(prefix)
  out.set(tail, prefix.length)
  return out
}

function roundH(i: number, input: Uint8Array, outLen: number): Uint8Array {
  return blake2b(input, { dkLen: outLen, personalization: personal(PERSONAL_H, [i, 0, 0]) })
}

function roundG(i: number, input: Uint8Array, outLen: number): Uint8Array {
  const out = new Uint8Array(outLen)
  for (let j = 0; j * 64 < outLen; j++) {
    const block = blake2b(input, { dkLen: 64, personalization: personal(PERSONAL_G, [i, j & 0xff, j >> 8]) })
    out.set(block.subarray(0, Math.min(64, outLen - j * 64)), j * 64)
  }
  return out
}

function xor(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length)
  for (let i = 0; i < a.length; i++) out[i] = a[i] ^ b[i]
  return out
}

function split(message: Uint8Array): [Uint8Array, Uint8Array] {
  if (message.length < F4_MIN || message.length > F4_MAX) {
    throw new Error('F4Jumble input has an invalid length.')
  }
  const left = Math.min(64, Math.floor(message.length / 2))
  return [message.slice(0, left), message.slice(left)]
}

export function f4jumble(message: Uint8Array): Uint8Array {
  const [a, b] = split(message)
  const x = xor(b, roundG(0, a, b.length))
  const y = xor(a, roundH(0, x, a.length))
  const d = xor(x, roundG(1, y, x.length))
  const c = xor(y, roundH(1, d, y.length))
  return Uint8Array.from([...c, ...d])
}

export function f4jumbleInv(message: Uint8Array): Uint8Array {
  const [c, d] = split(message)
  const y = xor(c, roundH(1, d, c.length))
  const x = xor(d, roundG(1, y, d.length))
  const a = xor(y, roundH(0, x, y.length))
  const b = xor(x, roundG(0, a, x.length))
  return Uint8Array.from([...a, ...b])
}

/* ------------------------------------------------------------------ */
/* Unified addresses                                                   */
/* ------------------------------------------------------------------ */

function readCompactSize(bytes: Uint8Array, offset: number): [number, number] | null {
  const first = bytes[offset]
  if (first === undefined) return null
  if (first < 0xfd) return [first, offset + 1]
  if (first === 0xfd && offset + 3 <= bytes.length) {
    const value = bytes[offset + 1] | (bytes[offset + 2] << 8)
    return value >= 0xfd ? [value, offset + 3] : null
  }
  if (first === 0xfe && offset + 5 <= bytes.length) {
    const value =
      (bytes[offset + 1] | (bytes[offset + 2] << 8) | (bytes[offset + 3] << 16) | (bytes[offset + 4] << 24)) >>> 0
    return value > 0xffff ? [value, offset + 5] : null
  }
  return null
}

function writeCompactSize(value: number): number[] {
  if (value < 0xfd) return [value]
  if (value <= 0xffff) return [0xfd, value & 0xff, value >> 8]
  return [0xfe, value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, value >>> 24]
}

function hrpPadding(hrp: string): Uint8Array {
  const out = new Uint8Array(16)
  out.set(ascii(hrp))
  return out
}

export function decodeUnifiedAddress(address: string): DecodeResult<{ hrp: string; receivers: UnifiedReceiver[] }> {
  const decoded = bech32Decode(address, 'bech32m')
  if (!decoded.ok) return decoded
  const { hrp, data } = decoded.value
  if (hrp.length > 16) return { ok: false, error: 'Unknown address prefix.' }
  let raw: Uint8Array
  try {
    raw = f4jumbleInv(data)
  } catch {
    return { ok: false, error: 'Malformed unified address.' }
  }
  const padding = hrpPadding(hrp)
  const tail = raw.subarray(raw.length - 16)
  if (!padding.every((byte, i) => byte === tail[i])) {
    return { ok: false, error: 'Malformed unified address.' }
  }

  const body = raw.subarray(0, raw.length - 16)
  const receivers: UnifiedReceiver[] = []
  const seen = new Set<number>()
  let offset = 0
  while (offset < body.length) {
    const typecode = readCompactSize(body, offset)
    if (!typecode) return { ok: false, error: 'Malformed unified address.' }
    const length = readCompactSize(body, typecode[1])
    if (!length) return { ok: false, error: 'Malformed unified address.' }
    const start = length[1]
    const end = start + length[0]
    if (end > body.length) return { ok: false, error: 'Malformed unified address.' }
    if (seen.has(typecode[0])) return { ok: false, error: 'Unified address repeats a receiver type.' }
    const expected = RECEIVER_LENGTHS[typecode[0]]
    if (expected !== undefined && expected !== length[0]) {
      return { ok: false, error: 'Unified address has a malformed receiver.' }
    }
    seen.add(typecode[0])
    receivers.push({ typecode: typecode[0], data: body.slice(start, end) })
    offset = end
  }
  if (receivers.length === 0) return { ok: false, error: 'Unified address has no receivers.' }
  if (seen.has(TYPECODE_P2PKH) && seen.has(TYPECODE_P2SH)) {
    return { ok: false, error: 'Unified address has two transparent receivers.' }
  }
  return { ok: true, value: { hrp, receivers } }
}

export function encodeUnifiedAddress(hrp: string, receivers: UnifiedReceiver[]): string {
  const sorted = [...receivers].sort((a, b) => a.typecode - b.typecode)
  const body: number[] = []
  for (const receiver of sorted) {
    body.push(...writeCompactSize(receiver.typecode), ...writeCompactSize(receiver.data.length), ...receiver.data)
  }
  const raw = Uint8Array.from([...body, ...hrpPadding(hrp)])
  return bech32Encode(hrp, f4jumble(raw), 'bech32m')
}

export function isTransparentTypecode(typecode: number): boolean {
  return typecode === TYPECODE_P2PKH || typecode === TYPECODE_P2SH
}

export function isShieldedTypecode(typecode: number): boolean {
  return typecode === TYPECODE_SAPLING || typecode === TYPECODE_ORCHARD
}
