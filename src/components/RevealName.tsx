import { EyeOff, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'

/**
 * Whether the payer's @name goes into the encrypted receipt memo. Off for
 * every payment: the choice is deliberately not remembered, so signing once
 * for a friend never silently de-anonymises a later payment.
 */
export function useRevealName(): [boolean, (next: boolean) => void] {
  const [reveal, setReveal] = useState(false)
  useEffect(() => {
    // Earlier versions persisted the choice; clear it.
    try {
      localStorage.removeItem('zac.revealName.v1')
    } catch {
      /* storage may be unavailable */
    }
  }, [])
  return [reveal, setReveal]
}

export function RevealNameToggle({
  handle,
  reveal,
  onChange
}: {
  handle?: string
  reveal: boolean
  onChange: (next: boolean) => void
}) {
  if (!handle) return null
  return (
    <label className={reveal ? 'reveal-toggle is-on' : 'reveal-toggle'}>
      <input type="checkbox" checked={reveal} onChange={(event) => onChange(event.target.checked)} />
      {reveal ? <UserRound size={15} /> : <EyeOff size={15} />}
      <span>
        <strong>{reveal ? `Sign the receipt as @${handle}` : 'Pay without your name'}</strong>
        <small>
          {reveal
            ? 'Only the recipient can decrypt it. A signed receipt proves you paid, and they can show it to others.'
            : 'The receipt carries no sender. Tick to include your @name.'}
        </small>
      </span>
    </label>
  )
}
