import { onewifiFetch } from './onewifi.js'
import { mapOnewifiDevice } from '../utils/onewifiDevice.js'

export { mapOnewifiDevice }

export async function fetchOnewifiDevices() {
  const data = await onewifiFetch('/api/devices', { trackLoading: false })
  const list = Array.isArray(data?.devices) ? data.devices : Array.isArray(data) ? data : []
  return {
    devices: list.map((device) => mapOnewifiDevice(device)),
    discovering: Boolean(data?.discovering),
  }
}

export async function fetchDiscoveredOnewifiDevices() {
  const data = await onewifiFetch('/api/devices/discovered', { trackLoading: false })
  const list = Array.isArray(data?.devices) ? data.devices : Array.isArray(data) ? data : []
  return list
}

export function registerOnewifiDevice(config) {
  return onewifiFetch('/api/devices', {
    method: 'POST',
    body: { config },
  })
}

export function patchOnewifiDeviceCapabilities(deviceId, patch = {}) {
  const id = encodeURIComponent(deviceId)
  const jobs = []
  if (Object.prototype.hasOwnProperty.call(patch, 'cellular_enabled')) {
    jobs.push(onewifiFetch(`/api/devices/${id}/network`, {
      method: 'PATCH',
      body: { enabled: Boolean(patch.cellular_enabled) },
    }))
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'flight_mode')) {
    jobs.push(onewifiFetch(`/api/devices/${id}/flight-mode`, {
      method: 'PATCH',
      body: { enabled: Boolean(patch.flight_mode) },
    }))
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'vowifi_enabled')) {
    jobs.push(onewifiFetch(`/api/devices/${id}/vowifi`, {
      method: 'PATCH',
      body: { enabled: Boolean(patch.vowifi_enabled) },
    }))
  }
  return Promise.all(jobs)
}

export function reconnectOnewifiVowifi(deviceId) {
  return onewifiFetch(`/api/devices/${encodeURIComponent(deviceId)}/vowifi/actions/reconnect`, {
    method: 'POST',
    body: {},
  })
}

export function fetchOnewifiDeviceAtHistory(deviceId) {
  return onewifiFetch(`/api/devices/${encodeURIComponent(deviceId)}/at`, { trackLoading: false })
}

export function sendOnewifiDeviceAt(deviceId, command) {
  return onewifiFetch(`/api/devices/${encodeURIComponent(deviceId)}/actions/at`, {
    method: 'POST',
    body: { cmd: command },
  })
}

export function sendOnewifiDeviceUssd(deviceId, code) {
  return onewifiFetch(`/api/devices/${encodeURIComponent(deviceId)}/actions/ussd`, {
    method: 'POST',
    body: { command: code },
  })
}

export function scanOnewifiDeviceOperators(deviceId) {
  return onewifiFetch(`/api/devices/${encodeURIComponent(deviceId)}/operator_selection/scan`, {
    method: 'POST',
    body: {},
  })
}

export function selectOnewifiDeviceOperator(deviceId, body) {
  return onewifiFetch(`/api/devices/${encodeURIComponent(deviceId)}/operator_selection`, {
    method: 'POST',
    body,
  })
}

export function fetchOnewifiDeviceUsbnet(deviceId) {
  return onewifiFetch(`/api/devices/${encodeURIComponent(deviceId)}/usbnet-mode`, { trackLoading: false })
}

export function setOnewifiDeviceUsbnet(deviceId, mode) {
  return onewifiFetch(`/api/devices/${encodeURIComponent(deviceId)}/usbnet-mode`, {
    method: 'PATCH',
    body: { mode },
  })
}

export function restartOnewifiDevice(deviceId) {
  return onewifiFetch(`/api/devices/${encodeURIComponent(deviceId)}/actions/reboot`, {
    method: 'POST',
    body: {},
  })
}

export function runOnewifiDeviceDiagnostics(deviceId) {
  return Promise.reject(new Error('OneWIFI 开源后端没有独立诊断接口'))
}

export function saveOnewifiDeviceHardware(deviceId, patch) {
  return onewifiFetch(`/api/devices/${encodeURIComponent(deviceId)}`, {
    method: 'PATCH',
    body: patch,
  })
}

/** Display-name only. Must not PUT full config — that zeroes NetworkEnabled when developer mode is off. */
export function renameOnewifiDevice(deviceId, name) {
  const id = String(deviceId || '').trim()
  const trimmed = String(name || '').trim()
  if (!id) throw new Error('缺少设备编号')
  if (!trimmed) throw new Error('设备名称不能为空')
  if ([...trimmed].length > 64) throw new Error('设备名称不能超过 64 个字符')
  return onewifiFetch(`/api/devices/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { name: trimmed },
  })
}

export function deleteOnewifiDevice(deviceId) {
  return onewifiFetch(`/api/devices/${encodeURIComponent(deviceId)}`, {
    method: 'DELETE',
  })
}
