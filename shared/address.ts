import type { AddressInfo, ZcashNetwork } from './types'
import {
  bech32Decode,
  decodeUnifiedAddress,
  encodeUnifiedAddress,
  isShieldedTypecode,
  isTransparentTypecode
} from './zip316'

const UA_HRP: Record<string, ZcashNetwork> = { u: 'mainnet', utest: 'testnet' }
const SAPLING_HRP: Record<string, ZcashNetwork> = { zs: 'mainnet', ztestsapling: 'testnet' }
const TRANSPARENT = /^(t1|t3|t2|tm|tex1)[0-9a-z]+$/i

/**
 * Classify a Zcash address without trusting it. Zac only ever accepts
 * shielded addresses: transparent addresses would publish the payment graph.
 *
 * Unified addresses are fully decoded (ZIP-316). One that bundles a
 * transparent receiver is reported as `mixed`, because a payer's wallet may
 * pick that receiver and send publicly. `shieldedOnly` is the same wallet's
 * address with the transparent receiver removed.
 */
export function classifyAddress(input: string): AddressInfo {
  const address = input.trim()
  if (!address) {
    return { address, network: 'unknown', kind: 'unknown', reason: 'Enter an address.' }
  }
  if (/\s/.test(address)) {
    return { address, network: 'unknown', kind: 'unknown', reason: 'Addresses cannot contain spaces.' }
  }
  if (address.length < 25 || address.length > 1000) {
    return { address, network: 'unknown', kind: 'unknown', reason: 'That does not look like a Zcash address.' }
  }
  if (TRANSPARENT.test(address)) {
    return {
      address,
      network: 'unknown',
      kind: 'transparent',
      reason: 'Transparent addresses are not private. Zac only pays shielded addresses.'
    }
  }

  const prefix = address.slice(0, address.lastIndexOf('1')).toLowerCase()
  if (prefix in UA_HRP) return classifyUnified(address, UA_HRP[prefix])
  if (prefix in SAPLING_HRP) {
    const decoded = bech32Decode(address, 'bech32')
    if (!decoded.ok) return { address, network: 'unknown', kind: 'unknown', reason: decoded.error }
    if (decoded.value.data.length !== 43) {
      return { address, network: 'unknown', kind: 'unknown', reason: 'Malformed Sapling address.' }
    }
    return { address: address.toLowerCase(), network: SAPLING_HRP[prefix], kind: 'shielded' }
  }
  return {
    address,
    network: 'unknown',
    kind: 'unknown',
    reason: 'Zac only accepts Zcash shielded (unified or Sapling) addresses.'
  }
}

function classifyUnified(address: string, network: ZcashNetwork): AddressInfo {
  const decoded = decodeUnifiedAddress(address)
  if (!decoded.ok) return { address, network: 'unknown', kind: 'unknown', reason: decoded.error }
  const { hrp, receivers } = decoded.value
  const shielded = receivers.filter((receiver) => isShieldedTypecode(receiver.typecode))
  if (shielded.length === 0) {
    return {
      address,
      network: 'unknown',
      kind: 'unknown',
      reason: 'This unified address has no Sapling or Orchard receiver.'
    }
  }
  const normalized = address.toLowerCase()
  if (receivers.some((receiver) => isTransparentTypecode(receiver.typecode))) {
    return {
      address: normalized,
      network,
      kind: 'mixed',
      shieldedOnly: encodeUnifiedAddress(
        hrp,
        receivers.filter((receiver) => !isTransparentTypecode(receiver.typecode))
      ),
      reason: 'This unified address also contains a transparent receiver, which could make a payment public.'
    }
  }
  return { address: normalized, network, kind: 'shielded' }
}

export function isShieldedAddress(address: string): boolean {
  return classifyAddress(address).kind === 'shielded'
}

export function networkOf(address: string): ZcashNetwork | 'unknown' {
  return classifyAddress(address).network
}

export function sameNetwork(a: ZcashNetwork | 'unknown', b: ZcashNetwork | 'unknown'): boolean {
  return a !== 'unknown' && b !== 'unknown' && a === b
}
