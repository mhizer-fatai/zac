import type { AddressInfo, ZcashNetwork } from './types'

const MAINNET_UA = /^u1[0-9a-z]+$/i
const TESTNET_UA = /^utest1[0-9a-z]+$/i
const MAINNET_SAPLING = /^zs1[0-9a-z]+$/i
const TESTNET_SAPLING = /^ztestsapling1[0-9a-z]+$/i
const TRANSPARENT = /^(t1|t3|t2|tm|tex1)[0-9a-z]+$/i

/**
 * Classify a Zcash address without trusting it. Zac only ever accepts
 * shielded addresses: transparent addresses would publish the payment graph.
 */
export function classifyAddress(input: string): AddressInfo {
  const address = input.trim()
  if (!address) {
    return { address, network: 'unknown', kind: 'unknown', reason: 'Enter an address.' }
  }
  if (/\s/.test(address)) {
    return { address, network: 'unknown', kind: 'unknown', reason: 'Addresses cannot contain spaces.' }
  }
  if (address.length < 25 || address.length > 400) {
    return { address, network: 'unknown', kind: 'unknown', reason: 'That does not look like a Zcash address.' }
  }
  if (TESTNET_UA.test(address)) {
    return { address, network: 'testnet', kind: 'shielded' }
  }
  if (MAINNET_UA.test(address)) {
    return { address, network: 'mainnet', kind: 'shielded' }
  }
  if (TESTNET_SAPLING.test(address)) {
    return { address, network: 'testnet', kind: 'shielded' }
  }
  if (MAINNET_SAPLING.test(address)) {
    return { address, network: 'mainnet', kind: 'shielded' }
  }
  if (TRANSPARENT.test(address)) {
    return {
      address,
      network: 'unknown',
      kind: 'transparent',
      reason: 'Transparent addresses are not private. Zac only pays shielded addresses.'
    }
  }
  return {
    address,
    network: 'unknown',
    kind: 'unknown',
    reason: 'Zac only accepts Zcash shielded (unified or Sapling) addresses.'
  }
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
