import { Clock, Lock, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { openSealedRequest, paidInThisBrowser, type SealedLookup } from '../lib/sealedRequest'
import { Spinner } from '../components/Spinner'
import { PayPage } from './Pay'

const MESSAGES: Record<Exclude<SealedLookup['status'], 'open'>, { title: string; body: string }> = {
  paid: { title: 'Already paid', body: 'This request was paid once, so the link no longer opens. Ask for a new link to pay again.' },
  expired: { title: 'Link expired', body: 'Payment links stop working 30 minutes after they are created. Ask for a new one.' },
  missing: { title: 'Request not found', body: 'This link is no longer available. It may have expired or been paid. Ask for a new one.' },
  invalid: { title: 'Link damaged', body: 'This link is incomplete or was changed, so it cannot be opened. Ask the sender to share it again.' }
}

/**
 * Opens a sealed request link (/#/r/<id>.<key>): fetches the ciphertext,
 * decrypts it in the browser with the key from the fragment, then shows the
 * normal payment screen.
 */
export function SealedPayPage() {
  const { token = '' } = useParams<{ token: string }>()
  const [lookup, setLookup] = useState<SealedLookup | null>(null)

  useEffect(() => {
    let active = true
    setLookup(null)
    if (paidInThisBrowser(token)) {
      setLookup({ status: 'paid' })
      return
    }
    openSealedRequest(token)
      .then((result) => active && setLookup(result))
      .catch(() => active && setLookup({ status: 'missing' }))
    return () => {
      active = false
    }
  }, [token])

  if (!lookup) {
    return (
      <div className="page narrow-page">
        <div className="card sealed-card">
          <Spinner size={22} />
          <p className="muted">Unlocking the sealed request in your browser…</p>
        </div>
      </div>
    )
  }

  if (lookup.status === 'open') {
    return <PayPage encodedPayload={lookup.encodedPayload} sealedToken={token} expiresAt={lookup.expiresAt} />
  }

  const message = MESSAGES[lookup.status]
  return (
    <div className="page narrow-page">
      <div className="card sealed-card">
        <span className="icon-orb">{lookup.status === 'expired' ? <Clock size={24} /> : lookup.status === 'paid' ? <ShieldCheck size={24} /> : <Lock size={24} />}</span>
        <h1>{message.title}</h1>
        <p className="muted">{message.body}</p>
        <Link to="/" className="btn btn-secondary">Go to Zac</Link>
      </div>
    </div>
  )
}
