function isGenericCCIDName(name) {
  return /generic smart card reader interface/i.test(String(name || ''))
}

function serialFromReaderName(name) {
  const match = String(name || '').match(/\(([0-9A-Fa-f]{8,})\)/)
  return match ? match[1].toUpperCase() : ''
}

function suggestedDeviceId(device = {}) {
  const configured = String(device.configured_id || '').trim()
  if (configured) return configured
  const type = String(device.device_type || '').trim()
  const serial = serialFromReaderName(device.reader_name)
  if (type === 'usb_sim_reader' && serial) return `Dot-${serial}`
  const imei = String(device.imei || '').replace(/\D/g, '')
  const baiwang = type === 'dji_4g' || /baiwang|dotking/i.test(`${device.driver_name || ''} ${device.name || ''}`)
  if (baiwang && imei.length === 15) return `DJ-${imei}`
  return String(device.discovery_key || '').trim()
}

function discoveredDisplayName(device = {}) {
  const product = String(device.driver_name || '').trim()
  const reader = String(device.reader_name || '').trim()
  if (product && (!reader || isGenericCCIDName(reader))) return product
  return reader || product || String(device.configured_id || device.discovery_key || '').trim()
}

export function addDeviceDefaults(device = {}) {
  const discoveryKey = String(device.discovery_key || '').trim()
  return {
    selectedKey: discoveryKey,
    deviceId: suggestedDeviceId(device),
    name: discoveredDisplayName(device),
    deviceType: String(device.device_type || '').trim(),
  }
}

export function addDeviceRegisterConfig(device = {}, fields = {}) {
  return {
    id: String(fields.id || '').trim(),
    name: String(fields.name || '').trim(),
    device_type: String(fields.deviceType || fields.device_type || '').trim(),
    discovery_key: String(device.discovery_key || '').trim(),
    control_device: String(device.control_path || device.reader_name || '').trim(),
    at_port: String(device.at_port || '').trim(),
    usb_path: String(device.usb_path || '').trim(),
    modem_imei: String(device.imei || '').trim(),
    interface: String(device.net_interface || '').trim(),
    esim_transport: String(device.mode || '').trim(),
  }
}

export function discoveredDeviceLabel(device = {}) {
  const label = discoveredDisplayName(device)
  const serial = serialFromReaderName(device.reader_name)
  const usbPath = String(device.usb_path || '').trim()
  const extra = serial || usbPath
  if (extra && label && !label.includes(extra)) return `${label} · ${extra}`
  return label
}

export function discoveredRosterLabel(device = {}) {
  const label = discoveredDeviceLabel(device)
  if (device.configured) return `${label}（已登记）`
  return label
}

export function discoveryIssueText(issue) {
  switch (String(issue || '').trim()) {
    case 'pcsc_service_unavailable':
      return '已看到这台 USB 读卡器，但本机 PC/SC 服务未就绪。可先登记；读卡需安装并启动 pcscd / libccid。'
    case 'pcsc_driver_missing':
      return '已看到这台 USB 读卡器，但 PC/SC 尚未枚举它（通常缺 CCID 驱动）。可先登记。'
    default:
      return String(issue || '').trim()
  }
}
