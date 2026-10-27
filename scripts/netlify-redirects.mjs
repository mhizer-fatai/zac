// Writes dist/_redirects so Netlify proxies /api/* to the Zac API on the VPS.
// Netlify config files cannot read environment variables, so the API origin
// comes from ZAC_API_ORIGIN at build time instead of being hard-coded.
import { writeFileSync } from 'node:fs'

const raw = (process.env.ZAC_API_ORIGIN ?? '').trim().replace(/\/+$/, '')

let origin
try {
  origin = new URL(raw)
} catch {
  console.error('ZAC_API_ORIGIN must be set to the API origin, e.g. https://api.example.com')
  process.exit(1)
}
if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash) {
  console.error(`ZAC_API_ORIGIN must be a bare https:// origin, got "${raw}"`)
  process.exit(1)
}

// "200" makes this a proxy (rewrite), not a redirect: the browser keeps
// talking to this site, so the CSP's connect-src 'self' still holds.
writeFileSync('dist/_redirects', `/api/*  ${origin.origin}/api/:splat  200\n`)
console.log(`[zac] proxying /api/* to ${origin.origin}`)
