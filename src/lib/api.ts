import type { Claim, DirectorySnapshot, ZcashNetwork } from '../../shared/types'

const API_BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '').replace(/\/$/, '')

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'omit',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers
    }
  })
  const text = await response.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = null
  }
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'string'
        ? (body as { error: string }).error
        : `Request failed (${response.status}).`
    throw new ApiError(message, response.status)
  }
  return body as T
}

export function loadDirectory(): Promise<DirectorySnapshot> {
  return request<DirectorySnapshot>('/api/directory')
}

export function claimUsername(input: {
  username: string
  address: string
  network: ZcashNetwork
  nonce: string
  signature: string
}): Promise<{ claim: Claim; result: 'created' | 'updated' }> {
  return request<{ claim: Claim; result: 'created' | 'updated' }>('/api/claims', {
    method: 'POST',
    body: JSON.stringify(input)
  })
}

export function health(): Promise<{ ok: boolean; claims: number; updatedAt: number }> {
  return request('/api/health')
}
