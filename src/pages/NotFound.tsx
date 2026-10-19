import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="page narrow-page">
      <div className="card error-card">
        <span className="eyebrow">404</span>
        <h1>This page is not private — it does not exist.</h1>
        <p className="muted">Check the link, or head back to your wallet.</p>
        <Link to="/" className="btn btn-primary"><ArrowLeft size={15} /> Back home</Link>
      </div>
    </div>
  )
}
