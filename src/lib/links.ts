export function appRoot(): string {
  const base = `${window.location.origin}${import.meta.env.BASE_URL}`
  return base.replace(/\/$/, '')
}

export function payLink(encodedPayload: string): string {
  return `${appRoot()}/#/pay/${encodedPayload}`
}

export function profileLink(username: string): string {
  return `${appRoot()}/#/@${username}`
}

export function zip321Link(address: string): string {
  return `zcash:${address}`
}
