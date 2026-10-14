const CAP_STATES = ['off', 'starting', 'on', 'stopping', 'degraded', 'error', 'unsupported']

/** Default display for ICCID/IMEI/IMSI/phone: last 4 digits. */
export function maskTail4(value) {
  const text = String(value || '').trim()
  if (!text || text === '—') return '—'
  if (text.length <= 4) return text
  return `****${text.slice(-4)}`
}

const HEALTHY = new Set(['ok', 'working', 'registered', 'connected', 'active'])

export const CAP_FIELD = {
  cellular: 'cellular_enabled',
  vowifi: 'vowifi_enabled',
  flight: 'flight_mode',
}

export const CAP_LABEL = {
  cellular: '4G 数据',
  vowifi: 'VoWiFi',
  flight: '飞行模式',
}

export const CAP_STATE_LABEL = {
  off: '关闭',
  starting: '启动中',
  on: '已连接',
  stopping: '停止中',
  degraded: '降级',
  error: '异常',
  unsupported: '不支持',
}

export function normalizeCapState(value, desired) {
  const raw = typeof value === 'object' ? (value.actual || value.state) : value
  const state = String(raw || (desired ? 'starting' : 'off')).toLowerCase()
  if (CAP_STATES.includes(state)) return state
  return HEALTHY.has(state) ? 'on' : 'off'
}

export function deviceCapability(device, key) {
  const cap = device?.capabilities?.[key] || {}
  const desired = typeof cap === 'object' ? !!(cap.desired ?? cap.enabled) : !!cap
  return {
    desired,
    actual: normalizeCapState(cap, desired),
    reason: cap.reason || cap.error || '',
    available: cap.available !== false,
  }
}

export function deviceTitle(device, index = 0) {
  return device?.name || device?.label || device?.model || `设备 ${index + 1}`
}

export function carrierLabel(device) {
  const carrier = device?.sim?.carrier || {}
  const names = []
  if (carrier.name) names.push(carrier.name)
  if (carrier.home_network && !names.some((value) => value.toLowerCase() === String(carrier.home_network).toLowerCase())) {
    names.push(carrier.home_network)
  }
  if (names.length) return names.join(' · ')
  if (device?.sim?.name) return device.sim.name
  if (device?.present === false) return '设备未连接'
  if (device?.sim?.present === false) return '未插 SIM'
  return '未知运营商'
}

function isReaderDevice(device) {
  const type = String(device?.device_type || '').trim()
  return type === 'usb_sim_reader' || type === 'reader'
}

export function supportsCellular(device) {
  return !isReaderDevice(device) && deviceCapability(device, 'cellular').actual !== 'unsupported'
}

export function deviceIdentityLine(device) {
  const type = isReaderDevice(device) ? '读卡器' : '蜂窝模块'
  const imei = device?.imei_masked || ''
  return imei ? `${type} · ${imei}` : type
}

export function presentModems(devices = []) {
  return devices.filter((device) => {
    if (device?.device_type === 'reader') return false
    return device?.present === true
      || device?.online === true
      || device?.physical_present === true
      || device?.healthy === true
  })
}

/** 6688 横滑条：模组都列出（含离线），读卡器排除。 */
export function boardModems(devices = []) {
  return devices.filter((device) => device?.device_type !== 'reader')
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function truthy(...values) {
  return values.some((value) => value === true)
}

function capState({ desired, actualOn, starting }) {
  if (actualOn) return { desired, actual: 'on', available: true }
  if (starting && desired) return { desired, actual: 'starting', available: true }
  return { desired, actual: 'off', available: true }
}

/**
 * Map OneWIFI /api/devices rows onto the OneBoard card shape.
 * Tail-4 masks are the default display; full IDs stay on the model for the
 * reveal toggle.
 */
export function mapOnewifiDevice(device = {}) {
  const modem = asObject(device.modem)
  const runtime = asObject(device.vowifi_runtime)
  const physical = truthy(device.physical_present, device.running, device.healthy, device.control_online)
  const present = physical || device.present === true || device.online === true
  const flight = device.flight_mode === true
  const networkEnabled = device.network_enabled === true
  const vowifiEnabled = device.vowifi_enabled !== false
  const simInserted = modem.sim_inserted === true || runtime.sim_ready === true || Boolean(modem.iccid)
  const accessOn = runtime.access_ready === true
  const tunnelOn = runtime.tunnel_ready === true
  const imsOn = runtime.ims_ready === true || device.vowifi_active === true
  const operator = modem.native_spn || modem.operator || modem.home_carrier_name || ''
  const operatorCountry = String(modem.operator_country_code || device.operator_country_code || '').trim()
  const homeCountry = String(modem.home_carrier_country_code || device.home_carrier_country_code || '').trim()
  const cardCountry = String(modem.card_country || device.card_country || '').trim()
  const imei = String(modem.imei || device.imei || '').trim()
  const iccid = String(modem.iccid || runtime.iccid || '').trim()
  const imsi = String(modem.imsi || runtime.imsi || '').trim()
  const phone = String(device.local_phone || modem.phone_number || runtime.local_phone || '').trim()
  const imeiMasked = maskTail4(imei)
  const iccidMasked = maskTail4(iccid)
  const imsiMasked = maskTail4(imsi)
  const phoneMasked = maskTail4(phone)

  return {
    ...device,
    modem: {
      ...modem,
      imei,
      iccid,
      imsi,
      operator,
    },
    vowifi_runtime: {
      ...runtime,
      iccid,
      imsi,
      local_phone: phone,
      sim_ready: runtime.sim_ready === true || simInserted,
      access_ready: accessOn,
      tunnel_ready: tunnelOn,
      ims_ready: imsOn,
      sms_ready: runtime.sms_ready === true,
    },
    local_phone: phone,
    imei,
    present,
    online: present,
    ...(Object.prototype.hasOwnProperty.call(device, 'instance_id')
      ? { instance_id: device.instance_id == null ? '' : String(device.instance_id).trim() }
      : {}),
    device_type: device.device_type || 'modem',
    imei_masked: imeiMasked,
    firmware: modem.firmware || device.firmware || '',
    sim: {
      present: simInserted,
      name: operator,
      country: homeCountry || operatorCountry,
      operator_country_code: operatorCountry,
      home_carrier_country_code: homeCountry,
      card_country: cardCountry,
      carrier: { name: operator, home_network: modem.home_carrier_name || '' },
      iccid,
      iccid_masked: iccidMasked,
      imsi,
      imsi_masked: imsiMasked,
      number: phone,
      number_masked: phoneMasked,
    },
    cellular: {
      ip: device.public_ip || '',
      interface: device.interface || '',
      apn: modem.apn || '',
    },
    capabilities: {
      cellular: capState({
        desired: networkEnabled && !flight,
        actualOn: !flight && (device.data_connected === true || accessOn),
        starting: networkEnabled && present && !flight,
      }),
      vowifi: capState({
        desired: vowifiEnabled && !flight,
        actualOn: imsOn,
        starting: vowifiEnabled && (tunnelOn || present),
      }),
      flight: capState({
        desired: flight,
        actualOn: flight,
        starting: false,
      }),
    },
  }
}

export function presentDevices(devices = []) {
  return devices.filter((device) => device?.present === true)
}

/** 设备页 / 短信选择器：模组在位就列出，不要求线路引擎已经起来。 */
export function smsCapableDevices(devices = []) {
  return presentModems(devices)
}

export function engineLines(devices = []) {
  return presentModems(devices).filter((device) => device?.instance_id)
}

/** 旧皮「重新注册」：意图是开，但实际已停/降级/异常。 */
export function canRetryVowifi(device) {
  if (!device || device.present !== true) return false
  const cap = deviceCapability(device, 'vowifi')
  if (!cap.desired || cap.available === false || cap.actual === 'unsupported') return false
  return ['off', 'degraded', 'error'].includes(cap.actual)
}

export function esimReaderOf(device) {
  const reader = String(device?.reader || '').trim()
  if (reader) return reader
  const id = String(device?.id || '').trim()
  if (!isReaderDevice(device) && id) {
    return `VoWiFi Modem ${id} 00 00`
  }
  return String(device?.name || id || '').trim()
}

export function overviewCounts(devices = []) {
  return {
    devices: devices.length,
    cellular: devices.filter((device) => deviceCapability(device, 'cellular').actual === 'on').length,
    vowifi: devices.filter((device) => deviceCapability(device, 'vowifi').actual === 'on').length,
    attention: devices.filter((device) => {
      const cell = deviceCapability(device, 'cellular').actual
      const wifi = deviceCapability(device, 'vowifi').actual
      return ['error', 'degraded'].includes(cell) || ['error', 'degraded'].includes(wifi)
    }).length,
  }
}

function lineCapabilityState(status, desired) {
  const state = String(status?.state || '').toUpperCase()
  const code = String(status?.reason_code || '').toLowerCase()
  if (state === 'OK') return 'on'
  if (state === 'STOPPED') return desired ? 'degraded' : 'off'
  if (['ERROR', 'NO_CARD', 'PIN_PROBLEM'].includes(state)) return 'error'
  if (['tunnel_sim_auth', 'tunnel_not_authorized'].includes(code)) return 'error'
  if (code === 'registering' && status?.detail?.pcscf) return desired ? 'degraded' : 'off'
  return desired ? 'starting' : 'off'
}

export function mergeLiveLineStatus(device, status) {
  const currentCapability = device.capabilities?.vowifi || {}
  const isDraft = device.provisioning?.state === 'draft'
  const actual = isDraft
    ? (currentCapability.actual || 'off')
    : lineCapabilityState(status, currentCapability.desired !== false)
  const reason = isDraft
    ? (currentCapability.reason || '自动开通仍在等待 SIM 或硬件信息')
    : (status.reason || '')
  return {
    ...device,
    status,
    vowifi: {
      ...(device.vowifi || {}),
      epdg: status.detail || {},
      ims: isDraft ? (device.vowifi?.ims || '') : (status.label || ''),
    },
    capabilities: {
      ...(device.capabilities || {}),
      vowifi: { ...currentCapability, actual, reason },
    },
  }
}

export function exitNodeLabel(device) {
  const exit = device?.egress || {}
  if (!exit.node) return '未连接'
  if (!exit.pinned_node || exit.pinned_node === exit.node) return exit.node
  return `${exit.node}（不是你钉选的 ${exit.pinned_node}）`
}

function lineState(device) {
  const status = device?.status
  if (!status || typeof status !== 'object') return ''
  return String(status.state || '').toUpperCase()
}

/** 6688 设备页：OneWIFI 列表项 → 看板用的 overview 形状。敏感号默认星号，完整值留给眼睛开关。 */
export function boardOverviewFromDevice(device = {}) {
  const vowifi = deviceCapability(device, 'vowifi')
  const cellular = deviceCapability(device, 'cellular')
  const flight = deviceCapability(device, 'flight')
  const cell = device.cellular || {}
  const sim = device.sim || {}
  const runtime = device.vowifi_runtime || {}
  const line = device.status && typeof device.status === 'object' ? device.status : {}
  const state = lineState(device)
  const operator = carrierLabel(device)
  const publicIp = String(cell.ip || '').trim()
  const simReady = runtime.sim_ready === true || sim.present === true
  const tunnelReady = runtime.tunnel_ready === true
    || ['REGISTERING', 'OK'].includes(state)
    || /epdg/i.test(String(line.reason || ''))
  const accessReady = runtime.access_ready === true
    || cellular.actual === 'on'
    || tunnelReady
    || ['TUNNEL_DOWN', 'REGISTERING', 'OK'].includes(state)
  const imsReady = runtime.ims_ready === true || vowifi.actual === 'on' || state === 'OK'
  const iccid = sim.iccid || sim.iccid_masked || maskTail4(sim.iccid)
  const imei = device.imei || device.imei_masked || maskTail4(device.imei)
  const imsi = sim.imsi || sim.imsi_masked || maskTail4(sim.imsi)
  const phone = sim.number || sim.number_masked || maskTail4(sim.number)

  return {
    wificallLabel: CAP_STATE_LABEL[vowifi.actual] || '关闭',
    wificallReady: imsReady,
    stages: [
      { key: 'sim', label: 'SIM', ready: simReady },
      { key: 'access', label: 'Access', ready: accessReady },
      { key: 'tunnel', label: 'Tunnel', ready: tunnelReady },
      { key: 'ims', label: 'IMS', ready: imsReady },
      { key: 'policy', label: '卡策略', ready: Boolean(iccid && iccid !== '—') },
    ],
    dataPlane: cell.interface || '—',
    lastReason: runtime.last_reason || vowifi.reason || line.reason || '—',
    errorCategory: runtime.last_error_class || line.reason_code || '—',
    imei: imei || '—',
    iccid: iccid || '—',
    imsi: imsi || '—',
    phone: phone || '—',
    esimProfile: '—',
    operator,
    firmware: device.firmware || '—',
    flightMode: Boolean(flight.desired || flight.actual === 'on'),
    runningMode: isReaderDevice(device) ? 'PC/SC' : 'QMI',
    vowifiActive: imsReady || Boolean(vowifi.desired && vowifi.actual !== 'off'),
    dataEnabled: cellular.desired,
    present: device.present === true || device.physical_present === true,
    networkRows: [
      { label: '运营商', value: operator },
      { label: '公网 IP', value: publicIp || '—' },
      { label: '接口', value: cell.interface || '—' },
    ].filter((row) => row.value && row.value !== '—'),
    hasNetwork: Boolean(publicIp || cell.interface),
  }
}

export function policyFromOnewifiDevice(device = {}) {
  const cellular = deviceCapability(device, 'cellular')
  const vowifi = deviceCapability(device, 'vowifi')
  const flight = deviceCapability(device, 'flight')
  return {
    ipVersion: 'v4',
    apn: String(device.cellular?.apn || ''),
    networkEnabled: Boolean(cellular.desired),
    vowifiEnabled: Boolean(vowifi.desired),
    airplaneEnabled: Boolean(flight.desired),
  }
}

export function policyPatchToCapabilities(patch = {}) {
  const body = {}
  if (Object.prototype.hasOwnProperty.call(patch, 'networkEnabled')) {
    body.cellular_enabled = Boolean(patch.networkEnabled)
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'vowifiEnabled')) {
    body.vowifi_enabled = Boolean(patch.vowifiEnabled)
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'airplaneEnabled')) {
    body.flight_mode = Boolean(patch.airplaneEnabled)
  }
  return body
}
