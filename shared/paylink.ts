import { classifyAddress } from './address'
import { isValidAmount } from './amount'
import { validateUsername } from './username'
import type { PaymentPayload } from './types'

const MAX_PAYLOAD_LENGTH = 1800

function bytesToBinary(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return binary
}

export function base64UrlEncode(value: string): string {
  return btoa(bytesToBinary(new TextEncoder().encode(value)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

export function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
  const binary = atob(padded + pad)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function encodePaymentPayload(payload: PaymentPayload): string {
  return base64UrlEncode(JSON.stringify(payload))
}

/**
 * Parse and validate a payment payload from a URL fragment. The fragment is
 * never sent to the server; this function runs entirely client-side.
 */
export function decodePaymentPayload(encoded: string): { ok: true; payload: PaymentPayload } | { ok: false; error: string } {
  if (!encoded || encoded.length > MAX_PAYLOAD_LENGTH) {
    return { ok: false, error: 'This payment link is not valid.' }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(base64UrlDecode(encoded))
  } catch {
    return { ok: false, error: 'This payment link is damaged.' }
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'This payment link is damaged.' }
  }
  const value = parsed as Record<string, unknown>

  if (value.v !== 1) return { ok: false, error: 'Unsupported payment link version.' }
  if (value.net !== 'mainnet' && value.net !== 'testnet') {
    return { ok: false, error: 'Unknown network in payment link.' }
  }
  if (typeof value.to !== 'string') return { ok: false, error: 'Missing recipient address.' }
  const address = classifyAddress(value.to)
  if (address.kind !== 'shielded') return { ok: false, error: 'The link does not point at a shielded address.' }
  if (address.network !== value.net) return { ok: false, error: 'The link network does not match its address.' }

  let handle: string | undefined
  if (value.h !== undefined) {
    if (typeof value.h !== 'string') return { ok: false, error: 'Invalid handle in link.' }
    const check = validateUsername(value.h)
    if (!check.ok) return { ok: false, error: 'Invalid handle in link.' }
    handle = check.username
  }

  let amount: string | undefined
  if (value.a !== undefined) {
    if (typeof value.a !== 'string' || !isValidAmount(value.a)) {
      return { ok: false, error: 'Invalid amount in link.' }
    }
    amount = value.a
  }

  let note: string | undefined
  if (value.m !== undefined) {
    if (typeof value.m !== 'string' || new TextEncoder().encode(value.m).length > 400) {
      return { ok: false, error: 'Invalid note in link.' }
    }
    note = value.m
  }

  if (typeof value.i !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(value.i)) {
    return { ok: false, error: 'Invalid invoice id in link.' }
  }
  if (typeof value.t !== 'number' || !Number.isFinite(value.t) || value.t < 0) {
    return { ok: false, error: 'Invalid timestamp in link.' }
  }

  return {
    ok: true,
    payload: {
      v: 1,
      net: value.net,
      to: value.to,
      h: handle,
      a: amount,
      m: note,
      i: value.i,
      t: value.t
    }
  }
}

/** Build a ZIP-321 URI for any wallet that does not have the Zac app. */
export function buildZip321Uri(payload: PaymentPayload): string {
  const params = new URLSearchParams()
  if (payload.a) params.set('amount', payload.a)
  if (payload.m) {
    const base = new TextEncoder().encode(payload.m)
    let binary = ''
    for (const byte of base) binary += String.fromCharCode(byte)
    const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
    params.set('memo', encoded)
  }
  const query = params.toString()
  return `zcash:${payload.to}${query ? `?${query}` : ''}`
}
