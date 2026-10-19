export function ShieldMark({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className="shield-mark"
    >
      <defs>
        <linearGradient id="zac-gold" x1="6" y1="3" x2="27" y2="29" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFD76A" />
          <stop offset="0.5" stopColor="#F4B728" />
          <stop offset="1" stopColor="#D98E0B" />
        </linearGradient>
      </defs>
      <path
        d="M16 2.4 27.1 6.6v8.7c0 7.3-4.5 12.4-11.1 14.3C9.4 27.7 4.9 22.6 4.9 15.3V6.6L16 2.4Z"
        fill="url(#zac-gold)"
      />
      <path
        d="M11.2 10.4h9.7l-6.2 6.7h6.2v4.5h-9.7l6.2-6.7h-6.2v-4.5Z"
        fill="#0B0B0D"
      />
      <path
        d="M16 2.4 27.1 6.6v8.7c0 7.3-4.5 12.4-11.1 14.3C9.4 27.7 4.9 22.6 4.9 15.3V6.6L16 2.4Z"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth="0.7"
      />
    </svg>
  )
}

export function Wordmark() {
  return (
    <span className="wordmark">
      zac<span className="wordmark-dot">.</span>
    </span>
  )
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <span className="logo">
      <ShieldMark size={size} />
      <Wordmark />
    </span>
  )
}
