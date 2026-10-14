import { startLoading, stopLoading } from '../stores/globalLoading.js'
import { parseOnewifiDetail, onewifiErrorMessage } from './onewifiDetail.js'

const AUTH_EXPIRED_EVENT = 'onewifi-auth-expired'
const SESSION_BEARER_KEY = 'oneboard-session-bearer'

let csrfToken = ''
let sessionToken = ''

export function getCsrf() {
  return csrfToken
}

export function getSessionToken() {
  return sessionToken
}

export function setSessionToken(token) {
  sessionToken = token || ''
  persistSessionBearer(sessionToken)
}

function persistSessionBearer(token) {
  try {
    if (typeof sessionStorage === 'undefined') return
    if (token) sessionStorage.setItem(SESSION_BEARER_KEY, token)
    else sessionStorage.removeItem(SESSION_BEARER_KEY)
  } catch {
    /* private mode / opaque storage */
  }
}

export function restoreSessionToken() {
  if (sessionToken) return sessionToken
  try {
    if (typeof sessionStorage === 'undefined') return sessionToken
    sessionToken = sessionStorage.getItem(SESSION_BEARER_KEY) || ''
  } catch {
    /* ignore */
  }
  return sessionToken
}

export function resolveOnewifiURL(path, base = readApiBase()) {
  if (!path) return path
  if (/^https?:\/\//i.test(path)) return path
  const trimmed = String(base || '').replace(/\/$/, '')
  if (!trimmed) return path
  return trimmed + (path.startsWith('/') ? path : `/${path}`)
}

function readApiBase() {
  const env = import.meta.env
  return String(env?.VITE_API_BASE || '').trim()
}

export function setCsrf(token) {
  csrfToken = token || ''
}

function unwrapBody(data) {
  if (data && typeof data === 'object' && data.data !== undefined && data.error === undefined) {
    return data.data
  }
  return data
}

function pickCsrf(payload) {
  if (!payload || typeof payload !== 'object') return ''
  return payload.csrf_token || payload.csrf || ''
}

function throwHttpError(res, data) {
  const envelope = data?.error
  const envelopeMessage = envelope && typeof envelope === 'object'
    ? (envelope.message || envelope.code || '')
    : ''
  const err = new Error(
    onewifiErrorMessage(data, res.status)
    || envelopeMessage
    || (typeof data?.error === 'string' ? data.error : '')
    || data?.message
    || res.statusText
    || `Request failed → ${res.status}`,
  )
  err.status = res.status
  err.data = data
  err.retryAfter = res.headers.get('Retry-After') || ''
  throw err
}

async function parseResponseBody(res) {
  const text = await res.text()
  let data = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { raw: text }
  }
  return data
}

/**
 * OneWIFI client: cookie + CSRF on the embedded same-origin board.
 * Optional VITE_API_BASE prefixes absolute API hosts (Tauri / split web).
 * Optional in-memory Bearer (setSessionToken) for native shells; do not persist.
 */
export async function onewifiFetch(path, {
  method = 'GET',
  body,
  trackLoading = true,
  signal,
  headers: extraHeaders = {},
  asResponse = false,
} = {}) {
  const headers = { Accept: 'application/json', ...extraHeaders }
  if (!sessionToken) restoreSessionToken()
  if (sessionToken && !headers.Authorization) {
    headers.Authorization = `Bearer ${sessionToken}`
  }
  if (csrfToken && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    headers['X-OneWIFI-CSRF-Token'] = csrfToken
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let ticket = null
  if (trackLoading) ticket = startLoading()

  let res
  try {
    res = await fetch(resolveOnewifiURL(path), {
      method,
      headers,
      credentials: 'include',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    })
  } finally {
    if (ticket != null) stopLoading(ticket)
  }

  if (res.status === 401 && !['/api/auth/status', '/api/auth/login', '/api/auth/setup'].includes(path)) {
    csrfToken = ''
    sessionToken = ''
    persistSessionBearer('')
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT))
    }
  }

  if (asResponse) {
    if (!res.ok) {
      throwHttpError(res, await parseResponseBody(res))
    }
    return res
  }

  const data = await parseResponseBody(res)
  if (!res.ok) throwHttpError(res, data)

  const payload = unwrapBody(data)
  const nextCsrf = pickCsrf(payload) || pickCsrf(data)
  if (nextCsrf) csrfToken = nextCsrf
  return payload
}

export { AUTH_EXPIRED_EVENT, parseOnewifiDetail, onewifiErrorMessage }
