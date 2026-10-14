/** OneWifi 设备行 / 概览归一化 */

import { maskTail4 } from './onewifiDevice.js'
import { normalizeEsimSwitchProgress } from './onewifiModel.esim.js'
import { scalarText } from './onewifiModel.scalar.js'

export function normalizeDeviceList(payload) {
  if (Array.isArray(payload)) return payload.map(normalizeDevice)
  if (Array.isArray(payload?.devices)) return payload.devices.map(normalizeDevice)
  if (Array.isArray(payload?.items)) return payload.items.map(normalizeDevice)
  return []
}

function devicePresent(raw = {}) {
  return raw.physical_present === true
    || raw.running === true
    || raw.worker_running === true
    || raw.present === true
}

function deviceHealthy(raw = {}) {
  return raw.healthy === true || raw.control_online === true
}

export const LINE_UNBOUND_REASON = '未绑定线路，线路操作已禁用'

function bindingField(raw = {}) {
  if (Object.prototype.hasOwnProperty.call(raw, 'instance_id')) return raw.instance_id
  if (Object.prototype.hasOwnProperty.call(raw, 'instanceId')) return raw.instanceId
  return undefined
}

/** Line APIs use the bound instance. A missing binding field means the id is already a line id. */
export function lineActionId(device = {}) {
  if (!device || typeof device !== 'object') return ''
  if (Object.prototype.hasOwnProperty.call(device, 'lineId')) {
    return String(device.lineId || '').trim()
  }
  const physicalId = String(device.id || device.device_id || device.deviceId || '').trim()
  if (!Object.prototype.hasOwnProperty.call(device, 'instance_id')
      && !Object.prototype.hasOwnProperty.call(device, 'instanceId')) {
    return physicalId
  }
  const bound = device.instance_id ?? device.instanceId
  if (bound == null) return ''
  return String(bound).trim()
}

export function lineActionBlockReason(device = {}) {
  return lineActionId(device) ? '' : LINE_UNBOUND_REASON
}

export function normalizeDevice(raw = {}) {
  const id = raw.id || raw.device_id || raw.deviceId || raw.name || ''
  const name = raw.name || raw.label || raw.display_name || raw.model || raw.modem?.model || id
  const code = raw.code || raw.short_name || raw.alias || ''
  const cell = raw.cellular && typeof raw.cellular === 'object' ? raw.cellular : {}
  const iface = raw.interface || raw.iface || raw.net_device || raw.wwan || cell.interface || ''
  const present = devicePresent(raw)
  const healthy = deviceHealthy(raw)
  const online = present || healthy || raw.online === true
  const signal = raw.signal ?? raw.rsrp ?? cell.rsrp ?? raw.metrics?.rsrp ?? raw.modem?.signal_dbm ?? 0
  const statusText = scalarText(raw.status_text)
    || scalarText(raw.statusText)
    || (healthy ? '在线' : present ? '在位' : scalarText(raw.state_label) || scalarText(raw.lifecycle_phase))
    || (typeof raw.status === 'string' ? raw.status : '')
  const publicIp = cell.ip || raw.public_ip || raw.publicIp || raw.wan_ip || raw.ip || ''
  const iccid = raw.iccid || raw.modem?.iccid || raw.vowifi_runtime?.iccid || raw.sim?.iccid || ''
  const imei = raw.imei || raw.modem?.imei || raw.sim?.imei || ''
  const phone = raw.local_phone || raw.phone || raw.msisdn || raw.modem?.phone_number || raw.sim?.number || raw.number || ''
  const dataEnabled = raw.network_enabled ?? raw.data_enabled ?? raw.dataEnabled ?? raw.mobile_data
  const flightMode = raw.flight_mode ?? raw.flightMode ?? raw.airplane_mode
  const radioRegistered = raw.radio_registered === true
    || raw.radio_registered === 1
    || Number(raw.modem?.reg_status) === 1
    || Number(raw.modem?.reg_status) === 5
  const modemOperator = resolveOperatorFromModem(raw.modem || {})
  const operator = scalarText(modemOperator)
    || scalarText(raw.sim?.carrier?.name)
    || scalarText(raw.sim?.name)
    || scalarText(raw.operator)
  const country = scalarText(raw.country)
    || scalarText(raw.sim?.country)
    || scalarText(raw.egress?.detected_country)
    || scalarText(raw.egress?.country)
  const physicalId = String(id)
  const hasBinding = bindingField(raw) !== undefined
    || Object.prototype.hasOwnProperty.call(raw, 'instance_id')
    || Object.prototype.hasOwnProperty.call(raw, 'instanceId')
  const lineId = hasBinding ? lineActionId({ id: physicalId, instance_id: bindingField(raw) }) : physicalId

  return {
    ...raw,
    id: physicalId,
    physicalId,
    lineId,
    lineBound: Boolean(lineId),
    lineBlockReason: lineId ? '' : LINE_UNBOUND_REASON,
    name,
    code,
    operator,
    country,
    interface: iface,
    present,
    healthy,
    online: Boolean(online),
    signal: Number(signal) || 0,
    statusText: String(statusText || (online ? '在线' : '离线')),
    publicIp: String(publicIp || '—'),
    iccid: String(iccid || '—'),
    imei: String(imei || '—'),
    phone: String(phone || '—'),
    dataEnabled,
    flightMode: Boolean(flightMode),
    radio_registered: Boolean(radioRegistered),
  }
}

export function policyFromDeviceRow(device = {}) {
  return {
    ipVersion: 'v4',
    apn: String(device.modem?.apn || device.cellular?.apn || device.apn || ''),
    networkEnabled: Boolean(device.network_enabled ?? device.dataEnabled),
    vowifiEnabled: device.vowifi_enabled !== false,
    airplaneEnabled: Boolean(device.flight_mode ?? device.flightMode),
    voicePath: 'vowifi',
  }
}

export function deviceStatusTone(device) {
  if (!device?.online) return 'danger'
  if (/启动|连接|注册/.test(device.statusText || '')) return 'warning'
  return 'success'
}

export function signalLabel(dbm) {
  const n = Number(dbm) || 0
  if (n >= -80) return { label: '强', tone: 'success' }
  if (n >= -95) return { label: '中', tone: 'warning' }
  if (n === 0) return { label: '—', tone: 'neutral' }
  return { label: '弱', tone: 'danger' }
}

export function formatOneWifiTime(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function maskSecret(value) {
  return maskTail4(value)
}

export function displaySecret(value, revealed) {
  if (revealed) {
    const text = String(value ?? '').trim()
    return text && text !== '—' ? text : '—'
  }
  return maskSecret(value)
}

function pickBool(...values) {
  for (const value of values) {
    if (value === true || value === false) return value
    if (value === 1 || value === 0) return Boolean(value)
    if (typeof value === 'string') {
      const lower = value.toLowerCase()
      if (['ready', 'ok', 'true', 'yes', 'online', 'up', 'connected'].includes(lower)) return true
      if (['fail', 'false', 'no', 'offline', 'down', 'error'].includes(lower)) return false
    }
  }
  return false
}

function pickText(...values) {
  for (const value of values) {
    if (value == null || value === '') continue
    if (typeof value === 'object') continue
    return String(value)
  }
  return '—'
}

function radioServingFields(root = {}, device = {}, modem = {}) {
  const radioRegistered = pickBool(root.radio_registered, device.radio_registered)
    || Number(modem.reg_status) === 1
    || Number(modem.reg_status) === 5
  const servingOperator = scalarText(modem.operator)
  const radioMode = [modem.network_mode, modem.radio_band]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ')
  const radioRoaming = Number(modem.reg_status) === 5
    || /roaming/i.test(String(modem.reg_status_text || ''))
  const radioStatus = radioRegistered ? (radioRoaming ? '漫游驻留' : '已驻留') : ''
  const radioSignal = pickText(
    modem.signal_rsrp != null && Number(modem.signal_rsrp) !== 0 && `${modem.signal_rsrp} dBm`,
    modem.signal_dbm != null && Number(modem.signal_dbm) !== 0 && `${modem.signal_dbm} dBm`,
  )
  const radioLabel = radioRegistered
    ? [servingOperator, radioMode, radioStatus].filter(Boolean).join(' · ')
    : ''
  return {
    radioRegistered,
    servingOperator: servingOperator || '—',
    radioMode: radioMode || '—',
    radioStatus: radioStatus || '—',
    radioSignal,
    radioLabel,
  }
}

function formatRunningMode(deviceType, ...values) {
  const type = String(deviceType || '').trim()
  if (type === 'usb_sim_reader' || type === 'reader') return 'PC/SC'
  for (const value of values) {
    if (value == null || value === '') continue
    const text = String(value).trim()
    if (!text || text === '—') continue
    if (/^at$/i.test(text)) return 'QMI'
    if (/qmi/i.test(text)) return 'QMI'
    return text
  }
  return 'QMI'
}

function stageReady(source, keys) {
  for (const key of keys) {
    const direct = source?.[key]
    if (direct != null) return pickBool(direct)
  }
  return false
}

function unwrapOverviewRoot(raw = {}) {
  if (Array.isArray(raw?.devices) && raw.devices.length) return raw.devices[0]
  if (raw?.overview && typeof raw.overview === 'object') return raw.overview
  if (raw?.data && typeof raw.data === 'object') {
    if (Array.isArray(raw.data.devices) && raw.data.devices.length) return raw.data.devices[0]
    return raw.data
  }
  return raw
}

function plmnFromMccMnc(source = {}) {
  const mcc = String(source.native_mcc ?? source.mcc ?? '').trim()
  const mnc = String(source.native_mnc ?? source.mnc ?? '').trim()
  return mcc && mnc ? `${mcc}${mnc}` : ''
}

function pickNameRecord(record) {
  if (!record || typeof record !== 'object') return ''
  const name = record.full_name ?? record.fullName ?? record.short_name ?? record.shortName
  if (name == null || name === '') return ''
  return String(name).trim()
}

function plmnMatches(pattern, plmn) {
  const a = String(pattern ?? '').trim().toLowerCase()
  const b = String(plmn ?? '').trim().toLowerCase()
  if (!a || !b) return false
  if (a === b) return true
  if (!a.includes('x')) return a.length < b.length && b.startsWith(a)
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== 'x' && a[i] !== b[i]) return false
  }
  return true
}

function hasSimIdentity(modem = {}, runtime = {}) {
  if (runtime.sim_ready === true || modem.sim_inserted === true) return true
  return [runtime.iccid, runtime.imsi, modem.iccid, modem.imsi, modem.native_spn, modem.home_carrier_name]
    .some((value) => {
      const text = String(value ?? '').trim()
      return text && text !== '—'
    })
}

/** 原运营商：卡面 SPN → IMSI 归属 → opl/pnn → 驻留网 */
function resolveOperatorFromModem(modem = {}) {
  const spn = String(modem.native_spn ?? modem.nativeSpn ?? '').trim()
  if (spn) return spn
  const home = String(modem.home_carrier_name ?? modem.homeCarrierName ?? '').trim()
  if (home) return home

  const plmn = plmnFromMccMnc(modem)
  const { opl, pnn } = modem
  if (plmn && Array.isArray(opl) && Array.isArray(pnn)) {
    for (const entry of opl) {
      if (!plmnMatches(entry?.plmn, plmn)) continue
      const recordId = Number(entry?.pnn_record ?? entry?.pnnRecord ?? 0)
      if (!recordId) continue
      const name = pickNameRecord(pnn.find((item) => Number(item?.record) === recordId))
      if (name) return name
    }
  }

  if (Array.isArray(pnn)) {
    for (const entry of pnn) {
      const name = pickNameRecord(entry)
      if (name) return name
    }
  }

  const operator = modem.operator
  if (operator && typeof operator === 'object') {
    return pickNameRecord(operator) || String(operator.name || operator.full_name || '').trim()
  }
  return String(operator ?? '').trim()
}

export function normalizeDeviceOverview(raw = {}, device = {}) {
  const root = unwrapOverviewRoot(raw?.overview || raw?.data || raw || {})
  // The overview is the current snapshot; never merge stale list readiness into it.
  const runtime = root.vowifi_runtime ?? device.vowifi_runtime ?? {}
  const running = root.running || root.wificall || root.wifi_calling || root.status || runtime || root
  const modem = root.modem || device.modem || {}
  const sim = root.sim || root.device || modem || device
  const network = root.network || root.net || root.connectivity || {}
  const modemOperator = resolveOperatorFromModem(modem)

  const stages = [
    { key: 'sim', label: 'SIM', ready: stageReady(runtime, ['sim_ready', 'simReady']) || stageReady(running, ['sim', 'sim_ready', 'simReady']) || stageReady(running?.stages, ['sim']) },
    { key: 'access', label: 'Access', ready: stageReady(runtime, ['access_ready', 'accessReady']) || stageReady(running, ['access', 'access_ready', 'accessReady']) || stageReady(running?.stages, ['access']) },
    { key: 'tunnel', label: 'Tunnel', ready: stageReady(runtime, ['tunnel_ready', 'tunnelReady']) || stageReady(running, ['tunnel', 'tunnel_ready', 'tunnelReady']) || stageReady(running?.stages, ['tunnel']) },
    { key: 'ims', label: 'IMS', ready: stageReady(runtime, ['ims_ready', 'imsReady']) || stageReady(running, ['ims', 'ims_ready', 'imsReady']) || stageReady(running?.stages, ['ims']) },
    {
      key: 'policy',
      label: '卡策略',
      ready: stageReady(runtime, ['sms_ready', 'smsReady', 'policy_ready', 'policyReady'])
        || stageReady(running, ['sms', 'policy', 'card_policy', 'sms_ready', 'policy_ready'])
        || stageReady(running?.stages, ['policy', 'sms']),
    },
  ]

  const allReady = pickBool(
    runtime.sms_ready,
    running.all_ready,
    running.allReady,
    running.ready,
    stages.every((stage) => stage.ready) && stages.some((stage) => stage.ready),
  )

  const failedPhase = String(runtime.phase || running.phase || '').toLowerCase() === 'failed'
  const wificallLabel = allReady
    ? 'WiFi-Calling · 全部就绪'
    : pickText(
      failedPhase && 'VoWiFi 未就绪',
      running.label,
      running.status_text,
      running.statusText,
      'WiFi-Calling',
    )

  const operatorFallback = plmnFromMccMnc(modem) || plmnFromMccMnc(sim)

  const dataEnabled = network.data_enabled
    ?? network.dataEnabled
    ?? network.mobile_data
    ?? root.network_enabled
    ?? device.network_enabled
    ?? device.data_connected
  const networkRows = [
    { label: '运营商', value: pickText(modemOperator, network.operator, network.carrier, sim.operator, sim.carrier, modem.operator) },
    { label: '信号', value: pickText(modem.signal_dbm && `${modem.signal_dbm} dBm`, modem.signal_rsrp && `${modem.signal_rsrp} dBm`, network.signal_dbm && `${network.signal_dbm} dBm`, network.signal, network.rsrp, device.signal && `${device.signal} dBm`, sim.signal_dbm && `${sim.signal_dbm} dBm`) },
    { label: '公网 IP', value: pickText(network.public_ip, network.publicIp, device.publicIp) },
    { label: '接口', value: pickText(network.interface, network.iface, device.interface) },
    { label: '网络模式', value: pickText(modem.network_mode, runtime.network_mode, sim.network_mode, network.network_mode) },
  ].filter((row) => row.value !== '—')
  const radio = radioServingFields(root, device, modem)

  return {
    wificallLabel,
    wificallReady: allReady,
    ...radio,
    stages,
    dataPlane: pickText(runtime.dataplane_mode, running.data_plane, running.dataPlane, running.plane),
    lastReason: pickText(runtime.last_reason, running.last_reason, running.lastReason, running.reason, device.capabilities?.vowifi?.reason, device.capabilities?.cellular?.reason),
    errorCategory: pickText(runtime.last_error_class, runtime.last_error, running.error_category, running.errorCategory, running.error),
    imei: pickText(modem.imei, sim.imei, device.imei),
    iccid: pickText(runtime.iccid, modem.iccid, sim.iccid, device.iccid),
    imsi: pickText(runtime.imsi, modem.imsi, sim.imsi, sim.IMSI),
    phone: pickText(root.local_phone, runtime.local_phone, modem.phone_number, modem.phone, sim.phone, sim.msisdn, sim.number, device.local_phone, device.phone),
    esimProfile: pickText(
      sim.esim_profile,
      sim.esimProfile,
      sim.current_esim,
      sim.currentEsim,
      modem.native_spn,
      modem.home_carrier_name,
      runtime.iccid && `ICCID ${runtime.iccid.slice(-4)}`,
    ),
    operator: pickText(
      modemOperator,
      modem.home_carrier_name,
      sim.operator,
      sim.carrier,
      sim.original_operator,
      sim.originalOperator,
      modem.operator,
      operatorFallback,
      !hasSimIdentity(modem, runtime) && modem.sim_inserted === false ? '未插 SIM' : '',
    ),
    firmware: pickText(modem.firmware, sim.firmware, sim.firmware_version, sim.firmwareVersion, device.firmware),
    flightMode: pickBool(root.flight_mode, sim.flight_mode, sim.flightMode, sim.airplane_mode, device.flightMode),
    runningMode: formatRunningMode(
      device.device_type || root.device_type,
      sim.qmi_mode,
      sim.qmiMode,
      runtime.qmi_mode,
      runtime.qmiMode,
      sim.running_mode,
      sim.runningMode,
      sim.mode,
      device.qmi_mode,
      device.esim_transport,
    ),
    vowifiActive: pickBool(device.vowifi_enabled, runtime.phase, running.vowifi, running.vo_wifi, running.vowifi_active, running.vowifiActive),
    dataEnabled: dataEnabled == null ? null : pickBool(dataEnabled),
    networkRows,
    hasNetwork: dataEnabled === true || networkRows.length > 0,
    switchProgress: normalizeEsimSwitchProgress(root.esim_switch || raw.esim_switch || device.esim_switch),
    smsStorage: normalizeSmsStorage(root.sms_storage || raw.sms_storage || device.sms_storage),
    smsStorageWarning: smsStorageWarning(root.sms_storage || raw.sms_storage || device.sms_storage),
  }
}

function normalizeSmsStorageArea(area) {
  if (!area || typeof area !== 'object') return null
  const used = Number(area.used ?? 0)
  const total = Number(area.total ?? 0)
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return null
  return { used, total }
}

export function normalizeSmsStorage(raw) {
  if (!raw || typeof raw !== 'object') return null
  const sm = normalizeSmsStorageArea(raw.sm)
  const me = normalizeSmsStorageArea(raw.me)
  if (!sm && !me) return null
  return { sm, me }
}

export function smsStorageAreaFull(area) {
  const used = Number(area?.used ?? 0)
  const total = Number(area?.total ?? 0)
  if (total <= 0) return false
  return used >= total || used / total >= 0.9
}

export function smsStorageWarning(storage) {
  const normalized = normalizeSmsStorage(storage)
  const meFull = smsStorageAreaFull(normalized?.me)
  const smFull = smsStorageAreaFull(normalized?.sm)
  if (meFull && smFull) return '模组和 SIM 短信存储已满，新短信可能无法接收'
  if (smFull) return 'SIM 短信存储已满，新短信可能无法接收'
  if (meFull) return '模组短信存储已满，新短信可能无法接收'
  return ''
}
