/**
 * Control Plane Engine — bridges Mihomo + OneWifi into unified realtime layer.
 */
import { ControlPlaneEvents, emit, on } from './eventBus'
import { controlPlaneMeta } from './controlPlaneState'
import { stopOneWifiSyncLayer } from '../onewifiSyncLayer'

const unsubscribers = []

function trackHeartbeat({ event, at }) {
  controlPlaneMeta.lastEventAt = at
  controlPlaneMeta.lastEventType = event
  controlPlaneMeta.heartbeatPhase = (controlPlaneMeta.heartbeatPhase + 1) % 360
}

export function initControlPlaneEngine() {
  if (controlPlaneMeta.initialized) return
  controlPlaneMeta.initialized = true

  unsubscribers.push(on(ControlPlaneEvents.HEARTBEAT, trackHeartbeat))
  // OneWifi 已改为设备页多容器独立连接，不再启动全局 sync layer
}

export function stopControlPlaneEngine() {
  stopOneWifiSyncLayer()
  while (unsubscribers.length) unsubscribers.pop()?.()
  controlPlaneMeta.initialized = false
}

export { ControlPlaneEvents, emit, on }
