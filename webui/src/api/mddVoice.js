/**
 * Browser WebRTC adapter. Writes reuse the board session and its CSRF token.
 */
import { getCsrf, setCsrf } from './onewifi.js'

const CSRF_HEADER = 'X-OneWIFI-CSRF-Token'
const SESSION_COOKIE = 'mdd_session'

let sessionBase = ''

export function setVoiceOrigin(origin) {
  sessionBase = String(origin || '').replace(/\/+$/, '')
}

function pageOrigin() {
  const loc = globalThis.location
  if (loc?.origin) return String(loc.origin).replace(/\/+$/, '')
  return ''
}

export function voiceOrigin() {
  return sessionBase || pageOrigin()
}

function readCookie(name) {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
  return match ? decodeURIComponent(match[1]) : ''
}

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const base = voiceOrigin()
  if (!base) throw new Error('缺少语音地址')
  const url = `${base}${path}`
  const isWrite = method !== 'GET' && method !== 'HEAD'
  const token = getCsrf()
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(isWrite && token ? { [CSRF_HEADER]: token } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let payload = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = { detail: text }
  }
  if (!res.ok) {
    const message = payload?.detail || payload?.message || `HTTP ${res.status}`
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message))
  }
  return payload
}

/** Login to MDD control and cache CSRF for mutating calls. */
export async function loginVoice(username, password) {
  const data = await request('/api/auth/login', {
    method: 'POST',
    body: { username, password },
  })
  const token = data?.csrf_token || data?.csrf || ''
  if (token) setCsrf(token)
  return data
}

export async function fetchLines() {
  const data = await request('/api/instances')
  return data?.instances || []
}

export async function fetchLineStatus(id) {
  return request(`/api/instances/${encodeURIComponent(id)}/status`)
}

export async function fetchSoftphone(id) {
  return request(`/api/instances/${encodeURIComponent(id)}/softphone`)
}

export async function dialLine(id, number) {
  return request(`/api/instances/${encodeURIComponent(id)}/call`, {
    method: 'POST',
    body: { to: number },
  })
}

export async function hangupLine(id) {
  return request(`/api/instances/${encodeURIComponent(id)}/hangup`, {
    method: 'POST',
    body: {},
  })
}

export async function fetchCallHistory(id) {
  return request(`/api/instances/${encodeURIComponent(id)}/calls`)
}

/** SIP WebSocket URL for JsSIP against the line's engine (via control relay). */
export function softphoneWsUrl(id) {
  const base = voiceOrigin()
  if (!base) throw new Error('缺少语音地址')
  const url = new URL(base)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = `/api/instances/${encodeURIComponent(id)}/softphone/ws`
  return url.toString()
}

export async function fetchReaders() {
  return request('/api/readers')
}

export async function detectSim() {
  return request('/api/sim/detect')
}

export { request as voiceRequest, CSRF_HEADER, SESSION_COOKIE }
