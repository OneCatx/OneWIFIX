import { reactive } from 'vue'
import { STORAGE_KEYS } from '../utils/storageKeys'
import {
  DEFAULT_ONEWIFI_PORT,
  buildOneWifiUpstreamOrigin,
  normalizeOneWifiOrigin,
} from '../utils/onewifiEndpoint'
import { getActiveOneWifiInstance } from './onewifiInstances'

export { DEFAULT_ONEWIFI_PORT, normalizeOneWifiOrigin }
export const ONEWIFI_CONNECTION_STORAGE_KEY = STORAGE_KEYS.onewifiConnection
/** @deprecated 使用 DEFAULT_ONEWIFI_PORT */
export const ONEWIFI_PORT = DEFAULT_ONEWIFI_PORT

function readStored() {
  try {
    const raw = localStorage.getItem(ONEWIFI_CONNECTION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

function parseStoredPort(raw) {
  if (raw === null || raw === undefined || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

function loadInitialState() {
  const stored = readStored()
  const host = String(stored?.host || '').trim()
  const port = parseStoredPort(stored?.port)
  return {
    host,
    port,
    connected: false,
    lastError: '',
  }
}

export const onewifiConnectionState = reactive(loadInitialState())

/** 统一读取当前 active backend 的连接字段 */
export function resolveOneWifiBackend() {
  const active = getActiveOneWifiInstance()
  if (active?.host?.trim()) {
    const upstream = buildOneWifiUpstreamOrigin({ host: active.host, port: active.port })
    return {
      instanceId: active.id,
      host: active.host,
      port: active.port ?? null,
      upstream,
      token: active.token || '',
      username: active.username || '',
    }
  }

  const host = onewifiConnectionState.host.trim()
  if (!host) {
    return {
      instanceId: null,
      host: '',
      port: null,
      upstream: '',
      token: '',
      username: '',
    }
  }

  return {
    instanceId: null,
    host,
    port: onewifiConnectionState.port ?? null,
    upstream: buildOneWifiUpstreamOrigin({ host, port: onewifiConnectionState.port }),
    token: '',
    username: '',
  }
}

export function isOneWifiGlobalConfigured() {
  return Boolean(resolveOneWifiBackend().upstream)
}

/**
 * 根据 host/port 拼 OneWifi 上游 origin（不含 /api）。
 * 主机留空时返回 ''，不自动回退到 LAN / .env。
 */
export function buildOneWifiUpstream(host = '', port = null) {
  return buildOneWifiUpstreamOrigin({ host, port })
}

/** 解析全局 OneWifi 上游 — 仅使用 active backend 或已保存的主机。 */
export function resolveOneWifiUpstreamBase() {
  return resolveOneWifiBackend().upstream
}

export function shouldUseOneWifiProxy() {
  // Same-origin /api：Go 嵌入 web/dist 后直接提供，Vite 开发态也只代理 /api。
  // Set VITE_ONEWIFI_USE_PROXY=false only if the console must call a remote origin.
  return import.meta.env.VITE_ONEWIFI_USE_PROXY !== 'false'
}

export function resolveOneWifiApiBase() {
  if (shouldUseOneWifiProxy()) return '/api'
  const origin = resolveOneWifiUpstreamBase()
  return origin ? `${origin.replace(/\/api\/?$/i, '')}/api` : '/api'
}

export function getOneWifiApiBase() {
  return resolveOneWifiApiBase()
}

export function getOneWifiHostLabel() {
  return resolveOneWifiUpstreamBase()
}

/** @deprecated 使用 resolveOneWifiUpstreamBase */
export function getOneWifiUpstreamBase() {
  return resolveOneWifiUpstreamBase()
}

export function resolveOneWifiProxyTarget() {
  return resolveOneWifiUpstreamBase()
}

export function setOneWifiConnection({ host, port }) {
  if (host != null) onewifiConnectionState.host = String(host).trim()
  if (port !== undefined) {
    if (port === null || port === '') onewifiConnectionState.port = null
    else {
      const n = Number(port)
      onewifiConnectionState.port = Number.isFinite(n) && n > 0 ? n : null
    }
  }
  persistOneWifiConnection()
}

export function persistOneWifiConnection() {
  try {
    localStorage.setItem(
      ONEWIFI_CONNECTION_STORAGE_KEY,
      JSON.stringify({
        host: onewifiConnectionState.host,
        port: onewifiConnectionState.port,
      }),
    )
  } catch {
    /* ignore */
  }
}

export function clearOneWifiConnectionState() {
  onewifiConnectionState.host = ''
  onewifiConnectionState.port = null
  onewifiConnectionState.connected = false
  onewifiConnectionState.lastError = ''
  persistOneWifiConnection()
}

export function setOneWifiConnected(connected, error = '') {
  onewifiConnectionState.connected = Boolean(connected)
  onewifiConnectionState.lastError = connected ? '' : String(error || '')
}

export function getOneWifiProxyUpstreamHeader(upstreamOverride = '') {
  if (!shouldUseOneWifiProxy()) return ''
  return upstreamOverride || resolveOneWifiUpstreamBase()
}

export function applyOneWifiProxyHeaders(headers = {}, upstreamOverride = '') {
  const next = { ...headers }
  const upstream = getOneWifiProxyUpstreamHeader(upstreamOverride)
  if (upstream) next['X-OneBord-OneWifi-Upstream'] = upstream
  return next
}
