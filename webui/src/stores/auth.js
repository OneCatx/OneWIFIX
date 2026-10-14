import { STORAGE_KEYS } from '../utils/storageKeys'
import { getCsrf, setCsrf } from '../api/onewifi'

const TOKEN_KEY = STORAGE_KEYS.authToken
const USER_KEY = STORAGE_KEYS.authUser
const PREVIEW_KEY = 'oneboard-ui-preview'

let authenticated = false
let configured = true

function readStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeStoredUser(user) {
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user))
    return
  }
  localStorage.removeItem(USER_KEY)
}

export function getCsrfToken() {
  return getCsrf()
}

/** @deprecated CSRF is not a Bearer token; kept for leftover callers. */
export function getAuthToken() {
  return getCsrf()
}

export function getAuthUser() {
  return readStoredUser()
}

export function isAuthConfigured() {
  return configured
}

export function applyAuthStatus(status = {}) {
  configured = status.configured !== false
  authenticated = Boolean(status.authenticated)
  setCsrf(authenticated ? status.csrf || '' : '')
  if (authenticated) writeStoredUser({ username: status.username || 'admin' })
  else writeStoredUser(null)
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
  return { authenticated, configured }
}

export function setAuthSession(csrf, user) {
  authenticated = Boolean(csrf)
  setCsrf(csrf || '')
  if (user) writeStoredUser(user)
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

export function updateAuthUser(patch) {
  const user = getAuthUser()
  if (!user) return
  writeStoredUser({ ...user, ...patch })
}

export function clearAuthSession() {
  authenticated = false
  setCsrf('')
  writeStoredUser(null)
  try {
    localStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(PREVIEW_KEY)
  } catch {
    /* ignore */
  }
}

export function isUiPreview() {
  return import.meta.env.DEV && sessionStorage.getItem(PREVIEW_KEY) === '1'
}

export function enterUiPreview() {
  sessionStorage.setItem(PREVIEW_KEY, '1')
  applyAuthStatus({
    configured: true,
    authenticated: true,
    csrf: 'preview',
    username: 'preview',
  })
}

export function isAuthenticated() {
  return authenticated
}

export function mustChangePassword() {
  return false
}

export function authHeaders(extra = {}) {
  const csrf = getCsrf()
  return {
    Accept: 'application/json',
    ...(csrf ? { 'X-OneWIFI-CSRF-Token': csrf } : {}),
    ...extra,
  }
}
