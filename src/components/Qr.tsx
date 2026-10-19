import { QRCodeSVG } from 'qrcode.react'
import { cn } from '../lib/format'

export function Qr({
  value,
  size = 220,
  className
}: {
  value: string
  size?: number
  className?: string
}) {
  return (
    <div className={cn('qr-frame', className)}>
      <QRCodeSVG
        value={value}
        size={size}
        bgColor="#ffffff"
        fgColor="#0b0b0d"
        level="M"
        marginSize={2}
        title="Zac QR code"
      />
    </div>
  )
}
