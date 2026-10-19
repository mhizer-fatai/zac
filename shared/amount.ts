const DECIMALS = 8
const SATOSHIS_PER_ZEC = 10n ** BigInt(DECIMALS)
const AMOUNT_RE = /^(0|[1-9]\d*)(?:\.(\d{1,8}))?$/

/** Strictly validate a human-entered ZEC amount (decimal string, max 8 dp). */
export function isValidAmount(value: string): boolean {
  return AMOUNT_RE.test(value.trim())
}

/** Convert a ZEC decimal string to zatoshi without floating point. */
export function zecToZatoshi(value: string): bigint {
  const normalized = value.trim()
  const match = AMOUNT_RE.exec(normalized)
  if (!match) throw new Error('Invalid ZEC amount')
  const whole = BigInt(match[1])
  const fraction = BigInt((match[2] ?? '').padEnd(DECIMALS, '0') || '0')
  return whole * SATOSHIS_PER_ZEC + fraction
}

export function zatoshiToZec(value: bigint): string {
  if (value < 0n) throw new Error('Negative amount')
  const whole = value / SATOSHIS_PER_ZEC
  const fraction = (value % SATOSHIS_PER_ZEC).toString().padStart(DECIMALS, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : `${whole}`
}

/** Normalize an amount for display: "0.25000000" -> "0.25", "1.00000000" -> "1". */
export function trimAmount(value: string): string {
  if (!value) return '0'
  if (!value.includes('.')) return value
  const trimmed = value.replace(/0+$/, '').replace(/\.$/, '')
  return trimmed || '0'
}

/** Pretty display with thousands separators. Display only — never use for math. */
export function formatAmount(value: string, maxFractionDigits = 8): string {
  const n = Number(trimAmount(value))
  if (!Number.isFinite(n)) return value
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits
  })
}

export function addAmounts(a: string, b: string): string {
  return zatoshiToZec(zecToZatoshi(a) + zecToZatoshi(b))
}

export function subtractAmounts(a: string, b: string): string {
  const result = zecToZatoshi(a) - zecToZatoshi(b)
  return zatoshiToZec(result < 0n ? 0n : result)
}
