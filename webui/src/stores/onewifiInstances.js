/**
 * OneWifi 多容器实例 — 每个实例 = 一个独立后端连接（主机/端口/账号/token）。
 * active instance 决定全局 OneWifi API 使用的 upstream + token。
 */
import { reactive } from 'vue'
import { STORAGE_KEYS } from '../utils/storageKeys'
import { onewifiEndpointIsThisBoard } from '../utils/onewifiEndpoint'

const STORAGE_KEY = STORAGE_KEYS.onewifiInstances
const ACTIVE_KEY = STORAGE_KEYS.onewifiActiveInstance

/** Same-origin OneWIFI on this Board. Empty instance first-open fills local host. */
export const LAN_ONEWIFI_HOST = '127.0.0.1'
export const LAN_ONEWIFI_PORT = 6688

function boardLanTarget() {
  if (typeof location === 'undefined') {
    return { host: '127.0.0.1', port: 6688, label: 'OneWIFI' }
  }
  return {
    host: location.hostname,
    port: Number(location.port) || (location.protocol === 'https:' ? 443 : 80),
    label: 'OneWIFI',
  }
}

function genId() {
  return `ow_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

function parsePort(raw) {
  if (raw === null || raw === undefined || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

function normalizeInstance(raw = {}) {
  return {
    id: raw.id || genId(),
    label: String(raw.label || 'OneWIFI').trim() || 'OneWIFI',
    host: String(raw.host || '').trim(),
    port: parsePort(raw.port),
    token: String(raw.token || ''),
    username: String(raw.username || ''),
    collapsed: Boolean(raw.collapsed),
  }
}

function readActiveInstanceId() {
  try {
    return localStorage.getItem(ACTIVE_KEY) || ''
  } catch {
    return ''
  }
}

let activeInstanceId = readActiveInstanceId()

export function getActiveInstanceId() {
  return activeInstanceId
}

export function setActiveInstanceId(id) {
  activeInstanceId = String(id || '').trim()
  try {
    if (activeInstanceId) localStorage.setItem(ACTIVE_KEY, activeInstanceId)
    else localStorage.removeItem(ACTIVE_KEY)
  } catch {
    /* ignore */
  }
}

export function getActiveOneWifiInstance() {
  if (!activeInstanceId) return null
  return onewifiInstances.find((item) => item.id === activeInstanceId) || null
}

export function createInstance(overrides = {}) {
  return normalizeInstance({ id: genId(), ...overrides })
}

function loadInstances() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.map((item) => normalizeInstance(item))
      }
    }
  } catch {
    /* ignore */
  }
  return [
    createInstance(boardLanTarget()),
  ]
}

/** Keep a same-host board container even if it was saved as https:// or :6688. */
export function ensureLanOneWifiInstance() {
  const lan = boardLanTarget()
  const boardish = onewifiInstances.filter((item) => (
    onewifiEndpointIsThisBoard({ host: item.host, port: item.port })
  ))
  if (boardish.length) {
    const boardInst = boardish[0]
    const extras = boardish.slice(1)
    const hostChanged = String(boardInst.host || '').trim() !== lan.host
      || Number(boardInst.port) !== Number(lan.port)
    if (hostChanged) {
      Object.assign(boardInst, { host: lan.host, port: lan.port })
    }
    extras.forEach((item) => {
      const idx = onewifiInstances.findIndex((row) => row.id === item.id)
      if (idx !== -1) onewifiInstances.splice(idx, 1)
    })
    if (hostChanged || extras.length) persistInstances()
    return boardInst
  }
  const blank = onewifiInstances.find((item) => !String(item.host || '').trim())
  if (blank) {
    Object.assign(blank, {
      host: lan.host,
      port: lan.port,
      label: blank.label?.trim() || lan.label,
    })
    persistInstances()
    return blank
  }
  const inst = createInstance(lan)
  onewifiInstances.unshift(inst)
  persistInstances()
  return inst
}

export const onewifiInstances = reactive(loadInstances())

export function persistInstances() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(onewifiInstances.map((item) => ({ ...item }))),
    )
  } catch {
    /* ignore */
  }
}

export function addInstance(overrides = {}) {
  const inst = createInstance({
    label: `容器 ${onewifiInstances.length + 1}`,
    ...overrides,
  })
  onewifiInstances.push(inst)
  persistInstances()
  return inst
}

export function removeInstance(id) {
  const idx = onewifiInstances.findIndex((item) => item.id === id)
  if (idx !== -1) {
    onewifiInstances.splice(idx, 1)
    persistInstances()
  }
}

export function updateInstance(id, patch = {}) {
  const inst = onewifiInstances.find((item) => item.id === id)
  if (!inst) return
  if ('port' in patch) {
    patch = { ...patch, port: parsePort(patch.port) }
  }
  Object.assign(inst, patch)
  persistInstances()
}

/** 启动时校验 active id 是否仍指向有效实例 */
export function reconcileActiveInstanceId() {
  if (!activeInstanceId) return null
  const inst = onewifiInstances.find((item) => item.id === activeInstanceId)
  if (!inst) {
    setActiveInstanceId('')
    return null
  }
  return inst
}
