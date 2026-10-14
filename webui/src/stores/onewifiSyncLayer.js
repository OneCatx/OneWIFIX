/**
 * OneWifi Sync Layer — 通过 OneWifi REST API 轮询同步设备状态。
 */
import { reactive } from 'vue'
import {
  getDeviceOverview,
  getDevices,
  getEsimProfiles,
  getCardPolicy,
  putCardPolicy,
  getHealth,
  isOneWifiMissingApiError,
  refreshDeviceInfo,
} from '../api/onewifi.adapter'
import { isOneWifiAuthenticated } from '../stores/onewifiAuth'
import { resolveOneWifiUpstreamBase, setOneWifiConnected } from '../stores/onewifiConnection'
import {
  normalizeDeviceList,
  normalizeDeviceOverview,
  normalizeEsimProfiles,
  normalizeCardPolicy,
  cardPolicyToPayload,
  resolveActiveIccid,
  lineActionId,
} from '../utils/onewifiModel'
import { ControlPlaneEvents, emit } from './controlPlane/eventBus'

const POLL_INTERVAL_MS = 15000

export const onewifiSyncMeta = reactive({
  configured: false,
  streamConnected: false,
  hydrating: false,
  lastError: null,
  streamWarning: null,
  lastEventAt: null,
  lastHydrateAt: null,
  streamPath: '',
  healthOk: false,
  activeUpstream: '',
  policyLoading: false,
  policySaving: false,
})

export const onewifiSyncState = reactive({
  devices: [],
  overviews: {},
  esimProfiles: [],
  cardPolicy: null,
  policyIccid: '',
  selectedId: '',
})

let pollTimer = null
let visibilityHandler = null
let selectionGeneration = 0
let selectionLoadRequestId = 0
let hydrateRequestId = 0
const policySavingKeys = new Set()

const RESET_REASONS = new Set([
  'start',
  'login',
  'settings',
  'connection',
  'logout',
])

function cardPolicyKey(deviceId, iccid) {
  return `${String(deviceId || '').trim()}::${String(iccid || '').trim()}`
}

function syncPolicySavingMeta() {
  const policyKey = cardPolicyKey(onewifiSyncState.selectedId, onewifiSyncState.policyIccid)
  onewifiSyncMeta.policySaving = Boolean(policyKey && policySavingKeys.has(policyKey))
}

function resetOneWifiRuntimeState() {
  selectionGeneration += 1
  selectionLoadRequestId += 1
  policySavingKeys.clear()
  onewifiSyncState.devices = []
  onewifiSyncState.overviews = {}
  onewifiSyncState.esimProfiles = []
  onewifiSyncState.cardPolicy = null
  onewifiSyncState.policyIccid = ''
  onewifiSyncState.selectedId = ''
  onewifiSyncMeta.policyLoading = false
  syncPolicySavingMeta()
}

export function clearOneWifiRuntimeState() {
  hydrateRequestId += 1
  resetOneWifiRuntimeState()
}

function isSelectionCurrent(generation, id) {
  return generation === selectionGeneration && onewifiSyncState.selectedId === id
}

function isSelectionLoadCurrent(requestId, generation, id) {
  return requestId === selectionLoadRequestId && isSelectionCurrent(generation, id)
}

function isHydrateCurrent(requestId) {
  return requestId === hydrateRequestId
}

function shouldResetBeforeHydrate(reason, upstreamChanged = false) {
  return upstreamChanged || RESET_REASONS.has(reason)
}

function shouldRefreshRuntime(reason) {
  return reason === 'login' || reason === 'manual'
}

function setConfigured() {
  onewifiSyncMeta.configured = isOneWifiAuthenticated()
}

function emitDeviceEvent(type = 'update') {
  const online = onewifiSyncState.devices.filter((d) => d.online).length
  emit(ControlPlaneEvents.ONEWIFI_DEVICE, {
    type,
    online,
    total: onewifiSyncState.devices.length,
    devices: onewifiSyncState.devices,
  })
}

function emitSyncStatus() {
  emit(ControlPlaneEvents.ONEWIFI_SYNC, {
    streamConnected: onewifiSyncMeta.streamConnected,
    configured: onewifiSyncMeta.configured,
    lastError: onewifiSyncMeta.lastError,
    lastHydrateAt: onewifiSyncMeta.lastHydrateAt,
    healthOk: onewifiSyncMeta.healthOk,
  })
}

function extractEsimFromDevice(device) {
  if (!device) return []
  const source =
    device.esim_profiles
    || device.esimProfiles
    || device.esim
    || device.profiles
    || []
  return normalizeEsimProfiles(source)
}

async function loadCardPolicyForSelection(id, generation, requestId) {
  if (!isSelectionLoadCurrent(requestId, generation, id)) return false
  const overview = id
    ? onewifiSyncState.overviews[id]
    : null
  const iccid = resolveActiveIccid(overview, onewifiSyncState.esimProfiles)
  if (!isSelectionLoadCurrent(requestId, generation, id)) return false
  onewifiSyncState.policyIccid = iccid
  syncPolicySavingMeta()
  if (!iccid) {
    onewifiSyncState.cardPolicy = null
    return true
  }
  onewifiSyncMeta.policyLoading = true
  try {
    const payload = await getCardPolicy(iccid)
    if (!isSelectionLoadCurrent(requestId, generation, id)) return false
    onewifiSyncState.cardPolicy = normalizeCardPolicy(payload)
  } catch {
    if (!isSelectionLoadCurrent(requestId, generation, id)) return false
    onewifiSyncState.cardPolicy = null
  } finally {
    if (isSelectionLoadCurrent(requestId, generation, id)) onewifiSyncMeta.policyLoading = false
  }
  return true
}

function applyOverview(device, overviewPayload) {
  return normalizeDeviceOverview(overviewPayload || device.overview || device, device)
}

async function loadOverviewsForDevices(list, { refreshRuntime = false, requestId = hydrateRequestId } = {}) {
  if (refreshRuntime && list.length) {
    await Promise.allSettled(list.map((device) => refreshDeviceInfo(device.id)))
    if (!isHydrateCurrent(requestId)) return false
  }

  const results = await Promise.allSettled(
    list.map((device) => {
      const lineId = lineActionId(device)
      return lineId ? getDeviceOverview(lineId) : Promise.resolve(null)
    }),
  )
  if (!isHydrateCurrent(requestId)) return false

  const next = {}
  list.forEach((device, index) => {
    const result = results[index]
    const payload = result.status === 'fulfilled' ? result.value : null
    next[device.id] = applyOverview(device, payload)
  })
  onewifiSyncState.overviews = next

  onewifiSyncState.devices = list.map((device) => {
    const overview = next[device.id]
    const ipRow = overview?.networkRows?.find((row) => row.label === '公网 IP')
    const publicIp = device.publicIp && device.publicIp !== '—'
      ? device.publicIp
      : ipRow?.value
    return publicIp && publicIp !== '—' ? { ...device, publicIp } : device
  })
  return true
}

async function loadSelectedExtras({
  refreshEsim = false,
  id = onewifiSyncState.selectedId,
  generation = selectionGeneration,
  requestId = ++selectionLoadRequestId,
} = {}) {
  if (!isSelectionLoadCurrent(requestId, generation, id)) return false
  if (!id) {
    onewifiSyncState.esimProfiles = []
    onewifiSyncState.cardPolicy = null
    onewifiSyncState.policyIccid = ''
    syncPolicySavingMeta()
    return true
  }

  const device = onewifiSyncState.devices.find((d) => d.id === id)

  try {
    const lineId = lineActionId(device || {})
    if (!lineId) {
      onewifiSyncState.esimProfiles = []
      return loadCardPolicyForSelection(id, generation, requestId)
    }
    const esimPayload = await getEsimProfiles(lineId, { refresh: refreshEsim })
    if (!isSelectionLoadCurrent(requestId, generation, id)) return false
    onewifiSyncState.esimProfiles = normalizeEsimProfiles(esimPayload)
  } catch {
    if (!isSelectionLoadCurrent(requestId, generation, id)) return false
    onewifiSyncState.esimProfiles = extractEsimFromDevice(device)
  }

  return loadCardPolicyForSelection(id, generation, requestId)
}

async function probeHealth() {
  try {
    await getHealth()
    return true
  } catch {
    return false
  }
}

export async function hydrateOneWifi({ reason = 'init', upstreamChanged = false } = {}) {
  const requestId = ++hydrateRequestId
  // A new global snapshot owns the selected-device extras too. Invalidate the
  // previous profile/policy request before awaiting health or device data.
  selectionLoadRequestId += 1
  const upstream = resolveOneWifiUpstreamBase()
  const upstreamSwitched = Boolean(
    onewifiSyncMeta.activeUpstream && onewifiSyncMeta.activeUpstream !== upstream,
  ) || upstreamChanged

  setConfigured()

  if (shouldResetBeforeHydrate(reason, upstreamSwitched)) {
    resetOneWifiRuntimeState()
    onewifiSyncMeta.lastHydrateAt = null
    onewifiSyncMeta.healthOk = false
  }

  onewifiSyncMeta.activeUpstream = upstream

  if (!onewifiSyncMeta.configured || !upstream) {
    resetOneWifiRuntimeState()
    onewifiSyncMeta.lastError = null
    onewifiSyncMeta.healthOk = false
    setOneWifiConnected(false, upstream ? '' : '未配置网关后端')
    emitSyncStatus()
    return
  }

  onewifiSyncMeta.hydrating = true
  try {
    const [healthOk, devicesPayload] = await Promise.all([
      probeHealth(),
      getDevices(),
    ])
    if (!isHydrateCurrent(requestId)) return false

    const list = normalizeDeviceList(devicesPayload)
    onewifiSyncMeta.healthOk = healthOk || list.length > 0
    onewifiSyncMeta.streamWarning = null
    const prevOnline = new Set(onewifiSyncState.devices.filter((d) => d.online).map((d) => d.id))

    const overviewLoaded = await loadOverviewsForDevices(list, {
      refreshRuntime: shouldRefreshRuntime(reason),
      requestId,
    })
    if (!overviewLoaded || !isHydrateCurrent(requestId)) return false

    if (!onewifiSyncState.selectedId || !list.some((d) => d.id === onewifiSyncState.selectedId)) {
      selectionGeneration += 1
      onewifiSyncState.selectedId = list[0]?.id || ''
      syncPolicySavingMeta()
    }

    await loadSelectedExtras({
      refreshEsim: reason === 'manual',
      id: onewifiSyncState.selectedId,
      generation: selectionGeneration,
    })
    if (!isHydrateCurrent(requestId)) return false

    onewifiSyncMeta.lastError = null
    onewifiSyncMeta.lastHydrateAt = Date.now()
    onewifiSyncMeta.lastEventAt = Date.now()
    onewifiSyncMeta.streamConnected = false

    list.forEach((device) => {
      const wasOnline = prevOnline.has(device.id)
      if (device.online && !wasOnline) {
        emit(ControlPlaneEvents.ONEWIFI_DEVICE, { type: 'online', deviceId: device.id, device })
      } else if (!device.online && wasOnline) {
        emit(ControlPlaneEvents.ONEWIFI_DEVICE, { type: 'offline', deviceId: device.id, device })
      }
    })
    emitDeviceEvent(reason)
    emitSyncStatus()
    setOneWifiConnected(true)
    return true
  } catch (err) {
    if (!isHydrateCurrent(requestId)) return false
    const message = err?.message || '网关连接失败'
    onewifiSyncMeta.healthOk = false
    if (shouldResetBeforeHydrate(reason, upstreamSwitched)) {
      resetOneWifiRuntimeState()
      onewifiSyncMeta.lastHydrateAt = null
    }
    if (isOneWifiMissingApiError(err)) {
      onewifiSyncMeta.streamWarning = '网关地址或路径错误：请在设置中填写正确的主机与端口（勿带 /api 后缀）'
      onewifiSyncMeta.lastError = null
      setOneWifiConnected(false, onewifiSyncMeta.streamWarning)
    } else {
      onewifiSyncMeta.lastError = message
      setOneWifiConnected(false, message)
    }
    emitSyncStatus()
    return false
  } finally {
    if (isHydrateCurrent(requestId)) onewifiSyncMeta.hydrating = false
  }
}

function startPolling() {
  if (pollTimer) return
  pollTimer = window.setInterval(() => {
    if (!onewifiSyncMeta.configured) return
    void hydrateOneWifi({ reason: 'poll' })
  }, POLL_INTERVAL_MS)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible' && onewifiSyncMeta.configured) {
    void hydrateOneWifi({ reason: 'visibility' })
  }
}

export function selectOneWifiDevice(id) {
  if (!id || onewifiSyncState.selectedId === id) return
  selectionGeneration += 1
  onewifiSyncState.selectedId = id
  selectionLoadRequestId += 1
  syncPolicySavingMeta()
  void reloadOneWifiSelection()
}

export function startOneWifiSyncLayer({ reason = 'start', upstreamChanged = false } = {}) {
  stopOneWifiSyncLayer()
  setConfigured()
  onewifiSyncMeta.streamWarning = null
  const hydratePromise = hydrateOneWifi({ reason, upstreamChanged })
  startPolling()

  visibilityHandler = onVisibilityChange
  document.addEventListener('visibilitychange', visibilityHandler)

  return hydratePromise
}

export function stopOneWifiSyncLayer() {
  hydrateRequestId += 1
  selectionLoadRequestId += 1
  onewifiSyncMeta.hydrating = false
  onewifiSyncMeta.policyLoading = false
  stopPolling()
  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler)
    visibilityHandler = null
  }
  onewifiSyncMeta.streamConnected = false
  onewifiSyncMeta.streamPath = ''
}

export function refreshOneWifiNow(options) {
  return hydrateOneWifi(options)
}

export async function reloadOneWifiSelection() {
  const id = onewifiSyncState.selectedId
  const generation = selectionGeneration
  const requestId = ++selectionLoadRequestId
  if (!isSelectionLoadCurrent(requestId, generation, id)) return
  if (!id) {
    onewifiSyncState.esimProfiles = []
    onewifiSyncState.cardPolicy = null
    onewifiSyncState.policyIccid = ''
    syncPolicySavingMeta()
    return
  }

  const device = onewifiSyncState.devices.find((d) => d.id === id)
  if (device && !onewifiSyncState.overviews[id]) {
    onewifiSyncState.overviews = {
      ...onewifiSyncState.overviews,
      [id]: applyOverview(device, device),
    }
  }

  try {
    const lineId = lineActionId(device || {})
    const overviewPayload = lineId ? await getDeviceOverview(lineId) : null
    if (!isSelectionLoadCurrent(requestId, generation, id)) return
    if (overviewPayload) {
      onewifiSyncState.overviews = {
        ...onewifiSyncState.overviews,
        [id]: applyOverview(device, overviewPayload),
      }
    }
    await loadSelectedExtras({ refreshEsim: false, id, generation, requestId })
  } catch {
    if (!isSelectionLoadCurrent(requestId, generation, id)) return
    await loadSelectedExtras({ refreshEsim: false, id, generation, requestId })
  }
}

export async function patchOneWifiCardPolicy(patch) {
  const selectedId = onewifiSyncState.selectedId
  const iccid = onewifiSyncState.policyIccid
    || resolveActiveIccid(
      onewifiSyncState.overviews[onewifiSyncState.selectedId],
      onewifiSyncState.esimProfiles,
    )
  const policyKey = cardPolicyKey(selectedId, iccid)
  if (!iccid || !onewifiSyncState.cardPolicy || policySavingKeys.has(policyKey)) return false

  const next = { ...onewifiSyncState.cardPolicy, ...patch }
  policySavingKeys.add(policyKey)
  syncPolicySavingMeta()
  try {
    await putCardPolicy(iccid, cardPolicyToPayload(next))
    const payload = await getCardPolicy(iccid)
    if (onewifiSyncState.selectedId === selectedId && onewifiSyncState.policyIccid === iccid) {
      onewifiSyncState.cardPolicy = normalizeCardPolicy(payload || next)
      await hydrateOneWifi({ reason: 'manual-silent' })
      if (onewifiSyncState.selectedId === selectedId && onewifiSyncState.policyIccid === iccid) {
        onewifiSyncMeta.lastError = null
        return true
      }
    }
    return false
  } catch (err) {
    if (onewifiSyncState.selectedId === selectedId && onewifiSyncState.policyIccid === iccid) {
      onewifiSyncMeta.lastError = err?.message || '卡策略保存失败'
    }
    return false
  } finally {
    policySavingKeys.delete(policyKey)
    syncPolicySavingMeta()
  }
}
