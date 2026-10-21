import { EyeOff, UserRound } from 'lucide-react'
import { useCallback, useState } from 'react'

const STORAGE_KEY = 'zac.revealName.v1'

/**
 * Whether the payer's @name goes into the encrypted receipt memo. Off by
 * default: a payment carries no sender identity unless the payer opts in.
 * The choice is remembered in this browser only.
 */
export function useRevealName(): [boolean, (next: boolean) => void] {
  const [reveal, setReveal] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })
  const update = useCallback((next: boolean) => {
    setReveal(next)
    try {
      if (next) localStorage.setItem(STORAGE_KEY, '1')
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* storage may be unavailable */
    }
  }, [])
  return [reveal, update]
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
            ? 'The recipient sees who paid. Only they can decrypt it.'
            : 'The receipt carries no sender. Tick to include your @name.'}
        </small>
      </span>
    </label>
  )
}
