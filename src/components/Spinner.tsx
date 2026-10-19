export function Spinner({ size = 16 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-hidden="true" />
}

export function SpinnerBlock({ label = 'Loading' }: { label?: string }) {
  return (
    <span className="spinner-row" role="status">
      <Spinner /> <span>{label}</span>
    </span>
  )
}
