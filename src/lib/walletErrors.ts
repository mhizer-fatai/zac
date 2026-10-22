/**
 * Turn wallet and node errors into messages a person can act on. Wallet
 * errors arrive as Error instances or as plain provider objects
 * ({ code, message }); node errors are passed through verbatim by the
 * wallet ("failed to validate tx: WtxId(...) ..."). Unknown errors keep
 * their original text so nothing is hidden.
 */
const KNOWN: Array<{ test: (message: string, code?: number) => boolean; message: string }> = [
  {
    // The wallet stamped the transaction with an older network upgrade's
    // consensus branch ID, so nodes rejected it before it was mined.
    test: (m) => /consensus branch id/i.test(m),
    message:
      'Your wallet built this payment for an outdated Zcash network version, so the network rejected it. ' +
      'No funds were spent. Update Noir Wallet and try again.'
  },
  {
    test: (m, code) => code === 4001 || /user (rejected|denied|cancel)|rejected the request|request (was )?(rejected|denied)/i.test(m),
    message: 'Request cancelled in your wallet.'
  },
  {
    test: (m) => /wallet (is )?locked|unlock (the|your) wallet/i.test(m),
    message: 'Noir Wallet is locked. Unlock it and try again.'
  },
  {
    test: (m) => /insufficient|not enough (funds|balance)|exceeds (the )?(available )?balance/i.test(m),
    message: 'Not enough shielded balance to cover this amount and the network fee.'
  },
  {
    test: (m) => /not (yet )?(fully )?synced|still syncing|sync in progress/i.test(m),
    message: 'Your wallet is still syncing. Wait for it to finish, then try again.'
  },
  {
    test: (m) => /failed to fetch|network ?error|timed? ?out|ECONNREFUSED/i.test(m),
    message: 'Could not reach the Zcash network. Check your connection and try again.'
  }
]

export function describeWalletError(cause: unknown, fallback = 'The wallet request did not complete.'): string {
  let message = ''
  let code: number | undefined
  if (cause instanceof Error) message = cause.message
  if (typeof cause === 'object' && cause) {
    const value = cause as { message?: unknown; code?: unknown }
    if (!message && typeof value.message === 'string') message = value.message
    if (typeof value.code === 'number') code = value.code
  } else if (typeof cause === 'string') {
    message = cause
  }
  const known = KNOWN.find((entry) => entry.test(message, code))
  if (known) return known.message
  return message || fallback
}
