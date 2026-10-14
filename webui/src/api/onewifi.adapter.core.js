/**
 * OneWifi API Adapter · core — 路径白名单 / URL 构造 / 请求管道，以及各域文件共用的小 helper。
 * 叶子模块：只依赖 ./onewifi.js、../stores/globalLoading.js、../utils/onewifiEndpoint.js。
 * 禁止在此 import ./onewifi.adapter.js（桶文件），否则 ESM 循环 → TDZ ReferenceError。
 */
import { onewifiFetch } from './onewifi.js'
import { startLoading, stopLoading } from '../stores/globalLoading.js'
import { onewifiOriginMatchesPage } from '../utils/onewifiEndpoint.js'

export function isOnewifiSameOrigin(upstream = '') {
  if (typeof location === 'undefined') return false
  const raw = String(upstream || '').trim().replace(/\/+$/, '')
  if (!raw) return false
  return onewifiOriginMatchesPage(raw)
}

function rewriteOnewifiPath(path) {
  const { pathname, search } = splitPathAndQuery(path)
  return `/api${pathname}${search}`
}

/** 相对 /api 的路径 */
export const ONEWIFI_ENDPOINTS = Object.freeze({
  DEVICES: '/devices',
  HEALTH: '/health',
  TRAFFIC: '/traffic/analysis',
  LOGIN: '/auth/login',
  SYSTEM_INFO: '/system/info',
  CHANGE_PASSWORD: '/settings/password',
  DEVELOPER_MODE: '/settings/developer-mode',
})

const ALLOWED_EXACT = new Set([
  ONEWIFI_ENDPOINTS.DEVICES,
  ONEWIFI_ENDPOINTS.HEALTH,
  ONEWIFI_ENDPOINTS.TRAFFIC,
  ONEWIFI_ENDPOINTS.LOGIN,
  ONEWIFI_ENDPOINTS.SYSTEM_INFO,
  ONEWIFI_ENDPOINTS.CHANGE_PASSWORD,
  ONEWIFI_ENDPOINTS.DEVELOPER_MODE,
  '/devices/actions/rescan',
  '/devices/discovered',
  '/rotateip',
  '/settings',
  '/egress/status',
])

const ALLOWED_PREFIXES = [
  '/devices/',
  '/cards/',
  '/sms/',
]

const FORBIDDEN_PATH_PATTERNS = [
  /^\/dashboard(?:\/|$)/i,
  /^\/status(?:\/|$)/i,
  /^\/events(?:\/|$)/i,
  /^\/stream(?:\/|$)/i,
  /^\/proxy(?:\/|$)/i,
  /^\/settings(?:\/|$)/i,
  /^\/logs(?:\/|$)/i,
]

function splitPathAndQuery(path) {
  const raw = String(path || '').trim()
  const qIndex = raw.indexOf('?')
  if (qIndex === -1) return { pathname: raw, search: '' }
  return { pathname: raw.slice(0, qIndex), search: raw.slice(qIndex) }
}

export function assertOneWifiEndpointAllowed(path) {
  const { pathname, search } = splitPathAndQuery(path)
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`

  // Exact allowlist wins so POST /settings/password and developer-mode
  // are not blocked by the generic /settings denylist.
  if (ALLOWED_EXACT.has(normalized)) {
    return `${normalized}${search}`
  }

  if (FORBIDDEN_PATH_PATTERNS.some((re) => re.test(normalized))) {
    throw new Error(`OneWifi API 路径已禁用: ${normalized}`)
  }

  const allowed = ALLOWED_PREFIXES.some((prefix) => normalized.startsWith(prefix))
  if (!allowed) {
    throw new Error(`OneWifi API 未注册: ${normalized}`)
  }

  return `${normalized}${search}`
}

function buildUrl(path, upstreamOverride = '') {
  const safePath = assertOneWifiEndpointAllowed(path)
  if (!upstreamOverride || isOnewifiSameOrigin(upstreamOverride)) {
    return `/api${safePath}`
  }
  const base = String(upstreamOverride).replace(/\/+$/, '')
  const url = `${base}/api${safePath}`
  if (/\/api\/api(?:\/|$)/i.test(url)) {
    throw new Error('OneWIFI API 地址配置错误：出现了 /api/api。主机不要带 /api 后缀')
  }
  return url
}

function parseErrorPayload(text, status) {
  if (status === 502 || status === 503) {
    return `无法连接 OneWIFI 服务（HTTP ${status}）`
  }
  if (!text) return `OneWIFI HTTP ${status}`
  try {
    const json = JSON.parse(text)
    if (typeof json.message === 'string' && json.message) return json.message
    if (typeof json.error === 'string' && json.error) return json.error
    return text
  } catch {
    return text
  }
}

export function isOneWifiMissingApiError(err) {
  const msg = String(err?.message || err || '').trim()
  if (!msg) return false
  if (/api\s*不存在|api\s*未注册|路径已禁用|not\s*found|404/i.test(msg)) {
    return true
  }
  if (msg.startsWith('{')) {
    try {
      const json = JSON.parse(msg)
      return isOneWifiMissingApiError(json.message || json.error || '')
    } catch {
      return /api\s*不存在|"status"\s*:\s*"error"/i.test(msg)
    }
  }
  return false
}

function unwrapPayload(payload) {
  if (payload == null) return payload
  if (Array.isArray(payload)) return payload
  if (typeof payload !== 'object') return payload
  if (payload.status === 'error' || payload.ok === false) {
    throw new Error(payload.message || payload.error || 'OneWIFI 请求失败')
  }
  if (payload.data !== undefined) return payload.data
  if (payload.result !== undefined) return payload.result
  return payload
}

export async function onewifiAdapterRequest(path, options = {}) {
  const {
    method = 'GET',
    body,
    headers = {},
    trackLoading = method !== 'GET',
    auth = true,
    upstream = '',
    token: tokenOverride = '',
    onUnauthorized,
    signal,
    asResponse = false,
  } = options

  let ticket = null
  if (trackLoading) ticket = startLoading()

  try {
    const safePath = assertOneWifiEndpointAllowed(path)
    const pathname = splitPathAndQuery(safePath).pathname
    let payload = body
    if (/\/actions\/at$/.test(pathname) && payload && typeof payload === 'object' && !payload.cmd) {
      payload = { cmd: payload.at || payload.command || payload.text || '' }
    }
    if (!upstream || isOnewifiSameOrigin(upstream)) {
      return await onewifiFetch(rewriteOnewifiPath(safePath), {
        method,
        body: payload,
        trackLoading: false,
        signal,
        asResponse,
        headers,
      })
    }

    const reqHeaders = { Accept: 'application/json', ...headers }
    const token = auth ? String(tokenOverride || '').trim() : ''
    if (token) reqHeaders.Authorization = `Bearer ${token}`
    let reqBody
    if (payload !== undefined) {
      reqHeaders['Content-Type'] = 'application/json'
      reqBody = JSON.stringify(payload)
    }
    const res = await fetch(buildUrl(safePath, upstream), {
      method,
      headers: reqHeaders,
      body: reqBody,
      credentials: 'omit',
      cache: 'no-store',
      signal,
    })
    if (res.status === 401 && auth) {
      onUnauthorized?.()
      throw new Error('OneWIFI 登录已失效，请重新登录')
    }
    if (!res.ok) {
      throw new Error(parseErrorPayload(await res.text(), res.status))
    }
    if (asResponse) return res
    const text = await res.text()
    if (!text) return null
    try {
      return unwrapPayload(JSON.parse(text))
    } catch {
      return text
    }
  } catch (err) {
    if (err?.name === 'TypeError' && String(err.message).includes('fetch')) {
      throw new Error(upstream ? `无法连接 OneWIFI（${upstream}）` : '无法连接 OneWIFI')
    }
    throw err
  } finally {
    if (ticket != null) stopLoading(ticket)
  }
}

export function devicePath(deviceId, suffix = '') {
  const id = encodeURIComponent(String(deviceId || '').trim())
  if (!id) throw new Error('缺少 deviceId')
  return `/devices/${id}${suffix}`
}

/** OneWifi /overview 返回 { devices: [device] }，与官方前端一致取首项 */
export function unwrapOverviewDevice(payload) {
  if (!payload) return null
  if (Array.isArray(payload.devices)) return payload.devices[0] || null
  if (payload.overview && typeof payload.overview === 'object') return payload.overview
  return payload
}

export function buildQuery(params = {}) {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === '') return
    qs.set(key, String(value))
  })
  const q = qs.toString()
  return q ? `?${q}` : ''
}

export function cardPolicyPath(iccid) {
  const id = encodeURIComponent(String(iccid || '').trim())
  if (!id) throw new Error('缺少 ICCID')
  return `/cards/${id}/policy`
}
