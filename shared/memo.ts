import type { ParsedPaymentMemo } from './types'

export const MEMO_MAX_BYTES = 512
const TAG = 'zac1'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function utf8Length(value: string): number {
  return encoder.encode(value).length
}

/** Truncate a string to a maximum number of UTF-8 bytes without splitting a code point. */
export function truncateUtf8(value: string, maxBytes: number): string {
  if (maxBytes <= 0) return ''
  if (utf8Length(value) <= maxBytes) return value
  let result = ''
  let used = 0
  for (const char of value) {
    const bytes = encoder.encode(char).length
    if (used + bytes > maxBytes) break
    result += char
    used += bytes
  }
  return result
}

/** Remove NUL padding that some wallets keep on fixed-size memo fields. */
export function cleanMemo(memo: string): string {
  return memo.replace(/\u0000+$/g, '').trimEnd()
}

export function buildPaymentMemo(params: {
  invoiceId?: string
  from?: string
  note?: string
}): string {
  const id = (params.invoiceId ?? '-').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || '-'
  const from = params.from
    ? `@${params.from.replace(/^@+/, '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20)}`
    : '-'
  const base = `${TAG}|${id}|${from}|`
  const note = (params.note ?? '').replace(/\u0000/g, '').trim()
  const room = MEMO_MAX_BYTES - utf8Length(base)
  if (room <= 0) return base.slice(0, MEMO_MAX_BYTES)
  const truncated = truncateUtf8(note, room)
  const suffix = truncated.length < note.length && room > 3 ? '…' : ''
  if (!suffix) return base + truncated
  return base + truncateUtf8(truncated, room - 4) + '…'
}

export function parsePaymentMemo(memo?: string): ParsedPaymentMemo | null {
  if (!memo) return null
  const raw = cleanMemo(memo)
  if (!raw) return null
  if (!raw.startsWith(`${TAG}|`)) {
    return { raw }
  }
  const parts = raw.split('|')
  const [, invoiceId, from, ...noteParts] = parts
  return {
    invoiceId: invoiceId && invoiceId !== '-' ? invoiceId : undefined,
    from: from && from !== '-' ? from : undefined,
    note: noteParts.length ? noteParts.join('|').trim() || undefined : undefined,
    raw
  }
}

export function memoPreview(memo?: string): string {
  const parsed = parsePaymentMemo(memo)
  if (!parsed) return ''
  if (parsed.note) return parsed.note
  if (parsed.raw) return parsed.raw
  return ''
}

export function newInvoiceId(): string {
  const bytes = new Uint8Array(9)
  crypto.getRandomValues(bytes)
  return bytesToHex(bytes)
}

export function newNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return bytesToHex(bytes)
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
