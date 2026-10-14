/**
 * Realtime Control Plane — stable status snapshot for Hero / status UI.
 *
 * Principle: REST sync success = healthy. Polling is enough for the showcase.
 */
import { computed, reactive } from 'vue'
import { hub } from '../onewifiHub'

export const controlPlaneMeta = reactive({
  lastEventAt: null,
  lastEventType: null,
  heartbeatPhase: 0,
  initialized: false,
})

/** Unified cover status: running | warning | offline */
function resolveSystemStatus() {
  if (hub.error) return 'warning'
  if (hub.system || hub.devices.length) return 'running'
  if (hub.started) return 'warning'
  return 'offline'
}

export function useControlPlaneState() {
  const systemStatus = computed(() => resolveSystemStatus())

  return {
    meta: controlPlaneMeta,
    mihomoSync: { connected: false, lastError: '', degraded: false },
    onewifiSync: { configured: false, streamConnected: false, lastHydrateAt: 0, lastError: '', hydrating: false },
    onewifi: {},
    mihomoStatus: computed(() => 'idle'),
    onewifiStatus: computed(() => 'idle'),
    systemStatus,
    mihomoLive: computed(() => false),
    onewifiLive: computed(() => false),
  }
}
