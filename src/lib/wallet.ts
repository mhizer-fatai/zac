import { getNoirWallet } from '@noir-wallet/sdk'
import type { TransactionHistoryEntry } from '@noir-wallet/sdk'
import { classifyAddress } from '../../shared/address'
import { subtractAmounts, zatoshiToZec, zecToZatoshi } from '../../shared/amount'
import type { ZcashNetwork } from '../../shared/types'

export interface WalletAccount {
  id: string
  label: string
  address: string
}

export interface WalletConnection {
  address: string
  transparent?: string
  network: ZcashNetwork
  accounts: WalletAccount[]
}

export interface WalletBalance {
  shielded: string
  transparent: string
  available?: string
  total?: string
}

export interface WalletTx {
  txid: string
  type: string
  amount: string
  status: string
  timestamp: number
  memo?: string
}

export interface MaxTransfer {
  maxAmount: string
  fee: string
}

export interface WalletAdapter {
  kind: 'noir' | 'demo'
  label: string
  isAvailable(): boolean
  connect(): Promise<WalletConnection>
  getExisting(): Promise<WalletConnection | null>
  getBalance(): Promise<WalletBalance>
  getHistory(): Promise<WalletTx[]>
  getMaxTransfer(to: string, memo?: string): Promise<MaxTransfer | null>
  send(params: { to: string; amount: string; memo?: string }): Promise<string>
  signMessage(message: string): Promise<{ signature: string; pubkey: string; address?: string }>
  disconnect(): Promise<void>
}

export function connectionFromResult(result: {
  shielded: string
  transparent: string
  accounts?: Array<{ id: string; label: string; addresses: { shielded: string } }>
}): WalletConnection {
  const info = classifyAddress(result.shielded)
  if (info.kind !== 'shielded' || info.network === 'unknown') {
    throw new Error('The wallet returned an address that Zac cannot verify.')
  }
  const accounts: WalletAccount[] = (result.accounts ?? []).map((account) => ({
    id: account.id,
    label: account.label,
    address: account.addresses.shielded
  }))
  if (accounts.length === 0) {
    accounts.push({ id: 'primary', label: 'Primary', address: result.shielded })
  }
  return {
    address: result.shielded,
    transparent: result.transparent,
    network: info.network,
    accounts
  }
}

class NoirAdapter implements WalletAdapter {
  readonly kind = 'noir' as const
  readonly label = 'Noir Wallet'

  private wallet() {
    const wallet = getNoirWallet()
    if (!wallet) throw new Error('Noir Wallet is not installed.')
    return wallet
  }

  isAvailable(): boolean {
    return getNoirWallet() !== null
  }

  async connect(): Promise<WalletConnection> {
    const result = await this.wallet().zcash.connect()
    return connectionFromResult(result)
  }

  async getExisting(): Promise<WalletConnection | null> {
    const wallet = getNoirWallet()
    if (!wallet) return null
    const result = await wallet.zcash.getAccounts()
    return result ? connectionFromResult(result) : null
  }

  async getBalance(): Promise<WalletBalance> {
    const balance = await this.wallet().zcash.getBalance()
    return {
      shielded: balance.shielded,
      transparent: balance.transparent,
      available: balance.available,
      total: balance.total
    }
  }

  async getHistory(): Promise<WalletTx[]> {
    const history: TransactionHistoryEntry[] = await this.wallet().zcash.getTransactionHistory()
    return history.map((entry) => ({
      txid: entry.txid,
      type: entry.type,
      amount: entry.amount,
      status: entry.status,
      timestamp: entry.timestamp,
      memo: entry.memo
    }))
  }

  async getMaxTransfer(to: string, memo?: string): Promise<MaxTransfer | null> {
    const result = await this.wallet().zcash.getMaxTransfer({
      to,
      memo,
      fundingSource: 'shielded'
    })
    return { maxAmount: result.maxAmount, fee: result.fee }
  }

  async send(params: { to: string; amount: string; memo?: string }): Promise<string> {
    return this.wallet().zcash.sendTransaction({
      to: params.to,
      amount: params.amount,
      memo: params.memo,
      fundingSource: 'shielded'
    })
  }

  async signMessage(message: string): Promise<{ signature: string; pubkey: string; address?: string }> {
    const result = await this.wallet().zcash.signMessage(message, { signingMode: 'derived' })
    return { signature: result.signature, pubkey: result.pubkey, address: result.address }
  }

  async disconnect(): Promise<void> {
    const wallet = getNoirWallet()
    if (wallet) await wallet.zcash.disconnect()
  }
}

/* ------------------------------------------------------------------ */
/* Demo wallet                                                         */
/* A real secp256k1 key so demo claims verify on the server, but the   */
/* balance is simulated and clearly labelled. Never use for real ZEC.  */
/* ------------------------------------------------------------------ */

const DEMO_STORAGE = 'zac.demo.state.v1'
const DEMO_SECRET = 'zac.demo.secret.v1'
const DEMO_CONNECTED = 'zac.demo.connected.v1'
const BECH32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'

interface DemoState {
  address: string
  shielded: string
  transparent: string
  history: WalletTx[]
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* localStorage can be unavailable in hardened browsers */
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

function randomHex(bytes: number): string {
  const data = new Uint8Array(bytes)
  crypto.getRandomValues(data)
  return Array.from(data, (b) => b.toString(16).padStart(2, '0')).join('')
}

function randomDemoAddress(): string {
  const data = new Uint8Array(104)
  crypto.getRandomValues(data)
  let out = 'utest1'
  for (const byte of data) out += BECH32[byte % BECH32.length]
  return out
}

function loadDemoState(): DemoState {
  const raw = safeGet(DEMO_STORAGE)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as DemoState
      if (parsed.address && typeof parsed.shielded === 'string' && Array.isArray(parsed.history)) {
        return parsed
      }
    } catch {
      /* fall through */
    }
  }
  const state: DemoState = {
    address: randomDemoAddress(),
    shielded: '1.5',
    transparent: '0',
    history: []
  }
  saveDemoState(state)
  return state
}

function saveDemoState(state: DemoState): void {
  safeSet(DEMO_STORAGE, JSON.stringify(state))
}

function loadDemoSecret(): Uint8Array {
  const stored = safeGet(DEMO_SECRET)
  if (stored && /^[0-9a-f]{64}$/i.test(stored)) {
    return Uint8Array.from(stored.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)))
  }
  const secret = new Uint8Array(32)
  crypto.getRandomValues(secret)
  safeSet(DEMO_SECRET, Array.from(secret, (b) => b.toString(16).padStart(2, '0')).join(''))
  return secret
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const buffer = new ArrayBuffer(data.byteLength)
  new Uint8Array(buffer).set(data)
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return new Uint8Array(digest)
}

function compactSize(size: number): Uint8Array {
  if (size <= 0xfc) return new Uint8Array([size])
  const out = new Uint8Array(3)
  out[0] = 0xfd
  out[1] = size & 0xff
  out[2] = (size >> 8) & 0xff
  return out
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

export class DemoAdapter implements WalletAdapter {
  readonly kind = 'demo' as const
  readonly label = 'Demo wallet'
  private state = loadDemoState()

  isAvailable(): boolean {
    return true
  }

  private connection(): WalletConnection {
    return {
      address: this.state.address,
      transparent: 'demo',
      network: 'testnet',
      accounts: [{ id: 'demo', label: 'Demo account', address: this.state.address }]
    }
  }

  async connect(): Promise<WalletConnection> {
    await delay(450)
    safeSet(DEMO_CONNECTED, '1')
    return this.connection()
  }

  async getExisting(): Promise<WalletConnection | null> {
    return safeGet(DEMO_CONNECTED) === '1' ? this.connection() : null
  }

  async getBalance(): Promise<WalletBalance> {
    return {
      shielded: this.state.shielded,
      transparent: this.state.transparent,
      available: this.state.shielded,
      total: this.state.shielded
    }
  }

  async getHistory(): Promise<WalletTx[]> {
    return [...this.state.history].sort((a, b) => b.timestamp - a.timestamp)
  }

  async getMaxTransfer(): Promise<MaxTransfer> {
    return { maxAmount: subtractAmounts(this.state.shielded, '0.0001'), fee: '0.0001' }
  }

  async send(params: { to: string; amount: string; memo?: string }): Promise<string> {
    await delay(1100)
    const available = zecToZatoshi(this.state.shielded)
    const amount = zecToZatoshi(params.amount)
    if (amount <= 0n) throw new Error('Enter an amount greater than zero.')
    if (amount > available) throw new Error('Not enough shielded demo ZEC.')
    this.state.shielded = zatoshiToZec(available - amount)
    const txid = randomHex(32)
    this.state.history.unshift({
      txid,
      type: 'send',
      amount: params.amount,
      status: 'mined',
      timestamp: Date.now(),
      memo: params.memo
    })
    saveDemoState(this.state)
    return txid
  }

  async signMessage(message: string): Promise<{ signature: string; pubkey: string; address?: string }> {
    const secret = loadDemoSecret()
    const { secp256k1 } = await import('@noble/curves/secp256k1.js')
    const prefix = 'Zcash Signed Message:\n'
    const prefixBytes = new TextEncoder().encode(prefix)
    const messageBytes = new TextEncoder().encode(message)
    const payload = concatBytes(
      compactSize(prefixBytes.length),
      prefixBytes,
      compactSize(messageBytes.length),
      messageBytes
    )
    const hash = await sha256(await sha256(payload))
    const recovered = secp256k1.sign(hash, secret, {
      prehash: false,
      lowS: true,
      format: 'recovered'
    })
    const signature = new Uint8Array(65)
    signature[0] = 31 + recovered[0]
    signature.set(recovered.slice(1), 1)
    const pubkey = secp256k1.getPublicKey(secret, false)
    return {
      signature: Array.from(signature, (byte) => byte.toString(16).padStart(2, '0')).join(''),
      pubkey: Array.from(pubkey, (byte) => byte.toString(16).padStart(2, '0')).join('')
    }
  }

  async disconnect(): Promise<void> {
    safeRemove(DEMO_CONNECTED)
  }

  /** Test-only helper: simulate a received payment so the receipts UI can be explored. */
  simulateIncoming(amount: string, memo?: string): WalletTx {
    this.state.shielded = zatoshiToZec(zecToZatoshi(this.state.shielded) + zecToZatoshi(amount))
    const txid = randomHex(32)
    const tx: WalletTx = {
      txid,
      type: 'receive',
      amount,
      status: 'mined',
      timestamp: Date.now(),
      memo
    }
    this.state.history.unshift(tx)
    saveDemoState(this.state)
    return tx
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function isDemoRequested(): boolean {
  const params = new URLSearchParams(window.location.search)
  if (params.get('demo') === '1') safeSet('zac.demo.enabled', '1')
  if (params.get('demo') === '0') safeRemove('zac.demo.enabled')
  return safeGet('zac.demo.enabled') === '1'
}

export function exitDemoMode(): void {
  safeRemove('zac.demo.enabled')
  safeRemove('zac.localclaims.v1')
}

export function createWalletAdapter(): WalletAdapter {
  return isDemoRequested() ? new DemoAdapter() : new NoirAdapter()
}

export function isDemoAdapter(adapter: WalletAdapter): adapter is DemoAdapter {
  return adapter.kind === 'demo'
}
