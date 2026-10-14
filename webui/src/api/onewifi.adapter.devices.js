/**
 * OneWifi API Adapter · devices — 设备列表 / 健康 / 登录 / 设备详情与操作 / 设备配置。
 * 只从 ./onewifi.adapter.core.js 取 helper；禁止 import ./onewifi.adapter.js（桶文件）。
 */
import {
  ONEWIFI_ENDPOINTS,
  buildQuery,
  devicePath,
  onewifiAdapterRequest,
  unwrapOverviewDevice,
} from './onewifi.adapter.core.js'

// ── 设备列表 / 健康 ──

export function getDevices(ctx = {}) {
  return onewifiAdapterRequest(ONEWIFI_ENDPOINTS.DEVICES, { trackLoading: false, ...ctx })
}

export function getHealth(ctx = {}) {
  return onewifiAdapterRequest(ONEWIFI_ENDPOINTS.HEALTH, { trackLoading: false, ...ctx })
}

/** OneWifi 主机自身的版本 / 构建时间（GET /system/info -> { version, build_time, config, docs }） */
export function getSystemInfo(ctx = {}) {
  return onewifiAdapterRequest(ONEWIFI_ENDPOINTS.SYSTEM_INFO, { trackLoading: false, ...ctx })
}

/** 修改 OneWifi 登录密码（POST /settings/password -> { old_password, new_password, confirm_password }） */
export function changeOneWifiPassword(body, ctx = {}) {
  return onewifiAdapterRequest(ONEWIFI_ENDPOINTS.CHANGE_PASSWORD, {
    method: 'POST',
    body,
    trackLoading: false,
    ...ctx,
  })
}

export function getDeveloperMode(ctx = {}) {
  return onewifiAdapterRequest(ONEWIFI_ENDPOINTS.DEVELOPER_MODE, { trackLoading: false, ...ctx })
}

export function setDeveloperMode(enabled, ctx = {}) {
  return onewifiAdapterRequest(ONEWIFI_ENDPOINTS.DEVELOPER_MODE, {
    method: 'PUT',
    body: { enabled: Boolean(enabled) },
    trackLoading: false,
    ...ctx,
  })
}

export function getTraffic(params = {}) {
  const { deviceId, range, ...ctx } = params
  const path = `${ONEWIFI_ENDPOINTS.TRAFFIC}${buildQuery({
    device_id: deviceId,
    range,
  })}`
  return onewifiAdapterRequest(path, { trackLoading: false, ...ctx })
}

export async function fetchEgressStatus(ctx = {}) {
  const { projectProxyLibrary } = await import('./onewifiGateway.proxy.js')
  const settings = await onewifiAdapterRequest('/settings', { trackLoading: false, ...ctx })
  let live = {}
  let statusError = ''
  try {
    live = await onewifiAdapterRequest('/egress/status', { trackLoading: false, ...ctx })
  } catch (err) {
    statusError = err?.message || '无法读取出口状态'
  }
  return projectProxyLibrary(settings, live, statusError)
}

export async function login(username, password, options = {}) {
  const { upstream = '', ...ctx } = options
  const payload = await onewifiAdapterRequest(ONEWIFI_ENDPOINTS.LOGIN, {
    method: 'POST',
    body: { username, password },
    auth: false,
    trackLoading: true,
    upstream,
    ...ctx,
  })
  return {
    token: payload?.session_token || payload?.token || payload?.access_token || '',
    username: payload?.user?.username || payload?.username || username,
  }
}

// ── 设备详情 / 操作 ──

export async function getDeviceOverview(deviceId, ctx = {}) {
  try {
    const payload = await onewifiAdapterRequest(devicePath(deviceId, '/overview'), {
      trackLoading: false,
      ...ctx,
    })
    const resolved = unwrapOverviewDevice(payload)
    if (resolved) return resolved
  } catch {
    /* GET /devices/{id} is DELETE/PATCH/PUT only; use /status then the list. */
  }

  const status = await onewifiAdapterRequest(devicePath(deviceId, '/status'), {
    trackLoading: false,
    ...ctx,
  }).catch(() => null)
  const resolvedStatus = unwrapOverviewDevice(status) || status
  if (resolvedStatus) return resolvedStatus

  const list = await getDevices(ctx).catch(() => [])
  const devices = Array.isArray(list) ? list : (list?.devices || [])
  return devices.find((item) => String(item?.id) === String(deviceId)) || null
}

export function refreshDeviceInfo(deviceId, ctx = {}) {
  return onewifiAdapterRequest(devicePath(deviceId, '/actions/refresh'), {
    method: 'POST',
    trackLoading: true,
    ...ctx,
  })
}

export function rebootDevice(deviceId, ctx = {}) {
  return onewifiAdapterRequest(devicePath(deviceId, '/actions/reboot'), {
    method: 'POST',
    trackLoading: true,
    ...ctx,
  })
}

export function reconnectVowifi(deviceId, ctx = {}) {
  return onewifiAdapterRequest(devicePath(deviceId, '/vowifi/actions/reconnect'), {
    method: 'POST',
    trackLoading: true,
    ...ctx,
  })
}

export function sendAtCommand(deviceId, body, ctx = {}) {
  return onewifiAdapterRequest(devicePath(deviceId, '/actions/at'), {
    method: 'POST',
    body,
    trackLoading: true,
    ...ctx,
  })
}

export function rescanDevices() {
  return onewifiAdapterRequest('/devices/actions/rescan', {
    method: 'POST',
    trackLoading: true,
  })
}

export function rotateDeviceIp(deviceId) {
  return onewifiAdapterRequest('/rotateip', {
    method: 'POST',
    body: { device_id: deviceId },
    trackLoading: true,
  })
}

export async function getDeviceConfig(deviceId, ctx = {}) {
  const payload = await onewifiAdapterRequest(devicePath(deviceId, '/config'), {
    trackLoading: false,
    ...ctx,
  })
  if (payload?.config && typeof payload.config === 'object') return payload.config
  return payload
}

export function updateDeviceConfig(deviceId, config, ctx = {}) {
  return onewifiAdapterRequest(devicePath(deviceId), {
    method: 'PUT',
    body: { config },
    trackLoading: true,
    ...ctx,
  })
}

export function setDeviceFlightMode(deviceId, enabled, ctx = {}) {
  return onewifiAdapterRequest(devicePath(deviceId, '/flight-mode'), {
    method: 'PATCH',
    body: { enabled: Boolean(enabled) },
    trackLoading: true,
    ...ctx,
  })
}

export function setDeviceNetwork(deviceId, enabled, ctx = {}) {
  return onewifiAdapterRequest(devicePath(deviceId, '/network'), {
    method: 'PATCH',
    body: { enabled: Boolean(enabled) },
    trackLoading: true,
    ...ctx,
  })
}

export function setDeviceVowifi(deviceId, enabled, ctx = {}) {
  return onewifiAdapterRequest(devicePath(deviceId, '/vowifi'), {
    method: 'PATCH',
    body: { enabled: Boolean(enabled) },
    trackLoading: true,
    ...ctx,
  })
}

export function patchDeviceCapabilities(deviceId, patch = {}, ctx = {}) {
  const jobs = []
  if (Object.prototype.hasOwnProperty.call(patch, 'cellular_enabled')) {
    jobs.push(setDeviceNetwork(deviceId, patch.cellular_enabled, ctx))
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'flight_mode')) {
    jobs.push(setDeviceFlightMode(deviceId, patch.flight_mode, ctx))
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'vowifi_enabled')) {
    jobs.push(setDeviceVowifi(deviceId, patch.vowifi_enabled, ctx))
  }
  return Promise.all(jobs)
}

export function renameDevice(deviceId, name, ctx = {}) {
  const id = String(deviceId || '').trim()
  const trimmed = String(name || '').trim()
  if (!id) throw new Error('缺少设备编号')
  if (!trimmed) throw new Error('设备名称不能为空')
  if ([...trimmed].length > 64) throw new Error('设备名称不能超过 64 个字符')
  return onewifiAdapterRequest(devicePath(id), {
    method: 'PATCH',
    body: { name: trimmed },
    trackLoading: true,
    ...ctx,
  })
}

export function deleteDevice(deviceId, ctx = {}) {
  const id = String(deviceId || '').trim()
  if (!id) throw new Error('缺少设备编号')
  return onewifiAdapterRequest(devicePath(id), {
    method: 'DELETE',
    trackLoading: true,
    ...ctx,
  })
}
