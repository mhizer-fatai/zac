import { getNoirWallet } from '@noir-wallet/sdk'
import type { TransactionHistoryEntry } from '@noir-wallet/sdk'
import { classifyAddress } from '../../shared/address'
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
  kind: 'noir'
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

export function createWalletAdapter(): WalletAdapter {
  return new NoirAdapter()
}
