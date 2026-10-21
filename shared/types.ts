export type ZcashNetwork = 'mainnet' | 'testnet'

/** `mixed` is a unified address that bundles a transparent receiver. */
export type AddressKind = 'shielded' | 'mixed' | 'transparent' | 'unknown'

export interface AddressInfo {
  address: string
  network: ZcashNetwork | 'unknown'
  kind: AddressKind
  /** For `mixed`: the same unified address with transparent receivers removed. */
  shieldedOnly?: string
  reason?: string
}

export interface Claim {
  username: string
  address: string
  network: ZcashNetwork
  pubkey: string
  signature: string
  message: string
  createdAt: number
  updatedAt: number
}

export interface DirectorySnapshot {
  version: 1
  updatedAt: number
  claims: Claim[]
}

export interface PaymentPayload {
  v: 1
  net: ZcashNetwork
  to: string
  h?: string
  a?: string
  m?: string
  i: string
  t: number
}

export interface ParsedPaymentMemo {
  invoiceId?: string
  from?: string
  note?: string
  raw: string
}
