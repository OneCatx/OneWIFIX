import { computed, reactive } from 'vue'
import { fetchOnewifiDevices } from '../api/onewifiDevices'
import { fetchOnewifiSystemStatus } from '../api/onewifiGateway'
import { isAuthenticated } from './auth'
import { overviewCounts } from '../utils/onewifiDevice'
import { useAppStore } from './app'

export const hub = reactive({
  devices: [],
  discovering: false,
  system: null,
  loading: false,
  error: '',
  started: false,
})

let pollTimer = 0
let systemTimer = 0
let refreshInFlight = false
let hubGeneration = 0
let systemRequestId = 0
let refreshDevicesPromise = null
let hubVisibilityBound = false

function hubPageVisible() {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden'
}

function clearHubTimers() {
  if (pollTimer) window.clearInterval(pollTimer)
  if (systemTimer) window.clearInterval(systemTimer)
  pollTimer = 0
  systemTimer = 0
}

function armHubTimers() {
  clearHubTimers()
  if (!hub.started || !hubPageVisible()) return
  pollTimer = window.setInterval(() => {
    if (isAuthenticated() && hubPageVisible()) void refreshOnewifiDevices()
  }, 10000)
  systemTimer = window.setInterval(() => {
    if (isAuthenticated() && hubPageVisible()) void refreshOnewifiSystem()
  }, 30000)
}

function onHubVisibilityChange() {
  if (!hub.started) return
  if (hubPageVisible()) {
    armHubTimers()
    if (isAuthenticated()) {
      void refreshOnewifiDevices()
      void refreshOnewifiSystem()
    }
    return
  }
  clearHubTimers()
}

function bindHubVisibility() {
  if (typeof document === 'undefined' || hubVisibilityBound) return
  document.addEventListener('visibilitychange', onHubVisibilityChange)
  hubVisibilityBound = true
}

function unbindHubVisibility() {
  if (typeof document === 'undefined' || !hubVisibilityBound) return
  document.removeEventListener('visibilitychange', onHubVisibilityChange)
  hubVisibilityBound = false
}

export function refreshOnewifiDevices() {
  if (refreshDevicesPromise) return refreshDevicesPromise
  const generation = hubGeneration
  refreshInFlight = true
  refreshDevicesPromise = (async () => {
    try {
      const data = await fetchOnewifiDevices()
      if (generation !== hubGeneration) return false
      hub.devices = Array.isArray(data?.devices) ? data.devices : []
      hub.discovering = Boolean(data?.discovering)
      hub.error = ''
      return true
    } catch (err) {
      if (generation !== hubGeneration) return false
      hub.error = err?.message || '无法读取设备'
      return false
    } finally {
      if (generation === hubGeneration) {
        hub.loading = false
        refreshInFlight = false
      }
      refreshDevicesPromise = null
    }
  })()
  return refreshDevicesPromise
}

export async function refreshOnewifiSystem() {
  const generation = hubGeneration
  const requestId = ++systemRequestId
  try {
    const system = await fetchOnewifiSystemStatus()
    if (generation !== hubGeneration || requestId !== systemRequestId) return false
    hub.system = system
    const host = hub.system?.host || {}
    const { state } = useAppStore()
    if (host.model) state.system.hostname = host.model
    if (host.model) state.system.os = hub.system?.system_name || host.model
    return true
  } catch {
    /* keep last snapshot */
    return false
  }
}

export function startOnewifiHub() {
  if (!isAuthenticated() || hub.started) return
  systemRequestId += 1
  hub.started = true
  hub.loading = true
  bindHubVisibility()
  if (isAuthenticated()) {
    void refreshOnewifiDevices()
    void refreshOnewifiSystem()
  }
  armHubTimers()
}

export function stopOnewifiHub() {
  hubGeneration += 1
  systemRequestId += 1
  refreshInFlight = false
  refreshDevicesPromise = null
  hub.started = false
  unbindHubVisibility()
  clearHubTimers()
}

export function useOnewifiHub() {
  const counts = computed(() => overviewCounts(hub.devices))
  const host = computed(() => hub.system?.host || {})
  return { hub, counts, host, refreshOnewifiDevices, refreshOnewifiSystem }
}
