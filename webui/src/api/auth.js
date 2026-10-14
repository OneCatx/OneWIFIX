import { onewifiFetch, setCsrf, setSessionToken, restoreSessionToken } from './onewifi'
import {
  applyAuthStatus,
  clearAuthSession,
  getAuthToken,
  isUiPreview,
  setAuthSession,
} from '../stores/auth'

let hydratePromise = null

function sessionToStatus(payload = {}) {
  const user = payload.user || {}
  return {
    configured: payload.configured !== false,
    authenticated: payload.authenticated === true,
    csrf: payload.csrf_token || payload.csrf || '',
    username: user.username || user.name || payload.username || '',
  }
}

export async function authStatus() {
  const payload = await onewifiFetch('/api/auth/status', { trackLoading: false })
  return sessionToStatus(payload)
}

export function isGatewayDown(err) {
  const status = Number(err?.status) || 0
  const message = String(err?.message || '')
  return status === 502 || status === 503 || /Bad Gateway|ECONNREFUSED|Failed to fetch|NetworkError/i.test(message)
}

export function hydrateAuth() {
  if (!hydratePromise) {
    hydratePromise = (async () => {
      if (isUiPreview()) {
        applyAuthStatus({
          configured: true,
          authenticated: true,
          csrf: 'preview',
          username: 'preview',
        })
        return
      }
      try {
        restoreSessionToken()
        const status = await authStatus()
        applyAuthStatus(status)
      } catch (err) {
        applyAuthStatus({
          configured: true,
          authenticated: false,
          csrf: '',
        })
        setSessionToken('')
        if (err?.status && err.status !== 401) {
          /* session probe failed for a non-auth reason; still treat as logged out */
        }
      }
    })()
  }
  return hydratePromise
}

export function invalidateAuthHydrate() {
  hydratePromise = null
}

export async function login(username, password) {
  const data = await onewifiFetch('/api/auth/login', {
    method: 'POST',
    body: { username, password },
  })
  setSessionToken(String(data.session_token || '').startsWith('mdd_') ? '' : (data.session_token || ''))
  const status = sessionToStatus({ ...data, authenticated: true })
  setAuthSession(status.csrf, { username: status.username || username })
  invalidateAuthHydrate()
  return data
}

export async function setup(username, password) {
  const data = await onewifiFetch('/api/auth/setup', {
    method: 'POST',
    body: { username, password },
  })
  setSessionToken('')
  const status = sessionToStatus({ ...data, configured: true, username })
  setAuthSession(status.csrf, { username: status.username || username })
  invalidateAuthHydrate()
  return data
}

export async function logout() {
  try {
    await onewifiFetch('/api/auth/logout', {
      method: 'POST',
      body: {},
      trackLoading: false,
    })
  } catch {
    /* 离线时仍清除本地会话 */
  } finally {
    setCsrf('')
    setSessionToken('')
    clearAuthSession()
    invalidateAuthHydrate()
  }
}

export async function changePassword({ newPassword, currentPassword, confirmPassword }) {
  const data = await onewifiFetch('/api/auth/password', {
    method: 'POST',
    body: {
      current_password: currentPassword,
      new_password: newPassword,
    },
  })
  clearAuthSession()
  invalidateAuthHydrate()
  return data
}

export function hasAuthToken() {
  return Boolean(getAuthToken())
}
