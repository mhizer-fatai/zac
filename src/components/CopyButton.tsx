import { Check, Copy, Share2 } from 'lucide-react'
import { useState } from 'react'
import { copyText } from '../lib/clipboard'
import { cn } from '../lib/format'

export function CopyButton({
  value,
  label,
  className,
  iconOnly = false
}: {
  value: string
  label?: string
  className?: string
  iconOnly?: boolean
}) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    const ok = await copyText(value)
    if (ok) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    }
  }

  return (
    <button
      type="button"
      className={cn('btn btn-quiet btn-sm', iconOnly && 'btn-icon', className)}
      onClick={handleCopy}
      aria-label={label ?? 'Copy'}
      title={label ?? 'Copy'}
    >
      {copied ? <Check size={15} /> : <Copy size={15} />}
      {!iconOnly && <span>{copied ? 'Copied' : (label ?? 'Copy')}</span>}
    </button>
  )
}

export function ShareButton({
  value,
  title,
  label = 'Share',
  className
}: {
  value: string
  title?: string
  label?: string
  className?: string
}) {
  const [shared, setShared] = useState(false)

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: title ?? 'Zac payment link', url: value })
        setShared(true)
        window.setTimeout(() => setShared(false), 1600)
        return
      } catch {
        /* user cancelled — fall through to copy */
      }
    }
    const ok = await copyText(value)
    if (ok) {
      setShared(true)
      window.setTimeout(() => setShared(false), 1600)
    }
  }

  return (
    <button type="button" className={cn('btn btn-secondary btn-sm', className)} onClick={handleShare}>
      <Share2 size={15} />
      <span>{shared ? 'Shared' : label}</span>
    </button>
  )
}
