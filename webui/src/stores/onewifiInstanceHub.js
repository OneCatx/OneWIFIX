/**
 * OneWifi 连接 / 会话切换 — active backend 与全局 sync layer 统一入口。
 */
import { isOneWifiAuthenticated, clearOneWifiSession, setOneWifiSession } from './onewifiAuth'
import {
  clearOneWifiConnectionState,
  resolveOneWifiUpstreamBase,
  setOneWifiConnection,
  setOneWifiConnected,
  onewifiConnectionState,
} from './onewifiConnection'
import {
  ensureLanOneWifiInstance,
  getActiveInstanceId,
  getActiveOneWifiInstance,
  reconcileActiveInstanceId,
  removeInstance,
  setActiveInstanceId,
  onewifiInstances,
} from './onewifiInstances'
import { ControlPlaneEvents, emit } from './controlPlane/eventBus'
import {
  clearOneWifiRuntimeState,
  hydrateOneWifi,
  startOneWifiSyncLayer,
  stopOneWifiSyncLayer,
  onewifiSyncMeta,
} from './onewifiSyncLayer'

let lastAppliedUpstream = ''

function emitOneWifiConnectionChanged(reason, extra = {}) {
  const payload = {
    reason,
    upstream: resolveOneWifiUpstreamBase(),
    host: onewifiConnectionState.host,
    port: onewifiConnectionState.port,
    activeInstanceId: getActiveInstanceId(),
    authenticated: isOneWifiAuthenticated(),
    at: Date.now(),
    ...extra,
  }
  emit(ControlPlaneEvents.ONEWIFI_CONNECTION_CHANGED, payload)
}

function resetOneWifiSyncMeta(upstream) {
  onewifiSyncMeta.activeUpstream = upstream
  onewifiSyncMeta.lastHydrateAt = null
  onewifiSyncMeta.lastEventAt = null
  onewifiSyncMeta.healthOk = false
  onewifiSyncMeta.lastError = null
  onewifiSyncMeta.streamWarning = null
  onewifiSyncMeta.streamConnected = false
}

function syncGlobalFromInstance(inst) {
  if (!inst?.host?.trim()) return false
  setOneWifiConnection({ host: inst.host, port: inst.port })
  if (inst.token) setOneWifiSession(inst.token, inst.username || '')
  else clearOneWifiSession()
  return true
}

/**
 * @param {{ host?: string, port?: string|number|null, reason?: string }} options
 */
export async function applyOneWifiConnectionSwitch({
  host,
  port,
  reason = 'connection',
} = {}) {
  if (host != null || port !== undefined) {
    setOneWifiConnection({ host, port })
  }

  const upstream = resolveOneWifiUpstreamBase()
  const upstreamChanged = Boolean(lastAppliedUpstream && lastAppliedUpstream !== upstream)

  clearOneWifiRuntimeState()
  resetOneWifiSyncMeta(upstream)
  stopOneWifiSyncLayer()

  lastAppliedUpstream = upstream

  if (!upstream) {
    setOneWifiConnected(false, '')
    await hydrateOneWifi({ reason: 'logout' })
    emitOneWifiConnectionChanged(reason, { upstreamChanged, needsLogin: true, cleared: true })
    return
  }

  if (!isOneWifiAuthenticated()) {
    setOneWifiConnected(false, '')
    await hydrateOneWifi({ reason: 'logout' })
    emitOneWifiConnectionChanged(reason, { upstreamChanged, needsLogin: true })
    return
  }

  await startOneWifiSyncLayer({ reason, upstreamChanged: true })
  emitOneWifiConnectionChanged(reason, { upstreamChanged })
}

/**
 * 将指定实例设为 active backend，并同步全局 connection/auth/sync。
 * @param {object|string} instanceOrId
 */
export async function activateOneWifiInstance(instanceOrId, { reason = 'activate' } = {}) {
  const inst = typeof instanceOrId === 'string'
    ? onewifiInstances.find((item) => item.id === instanceOrId)
    : instanceOrId

  if (!inst?.host?.trim()) {
    await clearActiveOneWifiBackend({ reason: `${reason}-invalid` })
    return false
  }

  setActiveInstanceId(inst.id)
  syncGlobalFromInstance(inst)
  await applyOneWifiConnectionSwitch({ reason })
  return true
}

/** 清空 active backend 与全局连接状态，不回退旧地址 */
export async function clearActiveOneWifiBackend({ reason = 'clear' } = {}) {
  setActiveInstanceId('')
  clearOneWifiConnectionState()
  clearOneWifiSession()
  setOneWifiConnected(false, '')
  await applyOneWifiConnectionSwitch({ reason })
}

/** 删除实例并同步 active backend */
export async function removeOneWifiInstanceWithSync(id) {
  const wasActive = getActiveInstanceId() === id
  removeInstance(id)

  if (!wasActive) return

  const fallback = onewifiInstances.find((item) => item.host?.trim() && item.token)
  if (fallback) {
    await activateOneWifiInstance(fallback, { reason: 'remove-fallback' })
    return
  }

  await clearActiveOneWifiBackend({ reason: 'remove' })
}

/** 应用启动：校验 active backend，无效则清空全局残留 */
export async function initializeOneWifiActiveBackend() {
  let inst = reconcileActiveInstanceId()
  if (!inst?.host?.trim()) {
    inst = ensureLanOneWifiInstance()
    if (inst?.id) setActiveInstanceId(inst.id)
  }
  if (inst?.host?.trim()) {
    syncGlobalFromInstance(inst)
    lastAppliedUpstream = resolveOneWifiUpstreamBase()
    if (inst.token && isOneWifiAuthenticated()) {
      await startOneWifiSyncLayer({ reason: 'init', upstreamChanged: false })
    }
    return
  }

  if (getActiveInstanceId()) setActiveInstanceId('')
  clearOneWifiConnectionState()
  clearOneWifiSession()
  setOneWifiConnected(false, '')
  lastAppliedUpstream = ''
  clearOneWifiRuntimeState()
  resetOneWifiSyncMeta('')
}

export { getActiveOneWifiInstance }
