import { avatarHue, cn, initials } from '../lib/format'

export function Avatar({
  seed,
  label,
  size = 38,
  className
}: {
  seed: string
  label?: string
  size?: number
  className?: string
}) {
  const hue = avatarHue(seed || 'zac')
  return (
    <span
      className={cn('avatar', className)}
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(11, Math.round(size * 0.34)),
        background: `linear-gradient(135deg, hsl(${hue} 78% 62%), hsl(${(hue + 58) % 360} 64% 36%))`
      }}
    >
      {initials(label || seed)}
    </span>
  )
}
