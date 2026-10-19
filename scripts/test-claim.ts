/**
 * Dev-only check for the claim signature plumbing. Not shipped to the client.
 * Run with: npx tsx scripts/test-claim.ts
 */
import { createHash, randomBytes } from 'node:crypto'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { verifyMessageSignature } from '@noir-wallet/sdk'

const prefix = 'Zcash Signed Message:\n'

function compactSize(size: number): Uint8Array {
  if (size <= 0xfc) return new Uint8Array([size])
  throw new Error('test messages are short')
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function sha256(data: Uint8Array): Uint8Array {
  return createHash('sha256').update(data).digest()
}

const message = [
  'Zac username claim',
  'username: signaltest',
  `address: utest1${'q'.repeat(80)}`,
  'network: testnet',
  `nonce: ${randomBytes(16).toString('hex')}`
].join('\n')

const prefixBytes = new TextEncoder().encode(prefix)
const messageBytes = new TextEncoder().encode(message)
const payload = concat(
  compactSize(prefixBytes.length),
  prefixBytes,
  compactSize(messageBytes.length),
  messageBytes
)
const msgHash = sha256(sha256(payload))

const privateKey = secp256k1.utils.randomSecretKey()
const recovered = secp256k1.sign(msgHash, privateKey, { prehash: false, format: 'recovered' })
const recovery = recovered[0]
const compact = recovered.slice(1)
const header = 31 + recovery
const signature = Buffer.concat([Buffer.from([header]), Buffer.from(compact)]).toString('hex')

const result = verifyMessageSignature({ message, signature, network: 'testnet' })
console.log(JSON.stringify({ signature, valid: result.valid, error: result.error, pubkey: result.recoveredPubkey }, null, 2))

if (process.argv.includes('--post')) {
  const response = await fetch('http://localhost:8787/api/claims', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'signaltest',
      address: message.split('\n')[2].replace('address: ', ''),
      network: 'testnet',
      nonce: message.split('\n')[4].replace('nonce: ', ''),
      signature
    })
  })
  console.log('POST /api/claims', response.status, await response.text())
  const directory = await fetch('http://localhost:8787/api/directory')
  console.log('GET /api/directory', directory.status, (await directory.text()).slice(0, 600))
}
