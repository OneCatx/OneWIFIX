import {
  applyLiveIccidToProfiles,
  parseOnewifiEsimPayload,
} from './onewifiModel.js'

export function liveIccidFromDevice(device) {
  return device?.vowifi_runtime?.iccid || device?.iccid || device?.sim?.iccid || ''
}

export function profilesFromDevicePayload(payload, device) {
  return applyLiveIccidToProfiles(parseOnewifiEsimPayload(payload), liveIccidFromDevice(device))
}

export function fallbackEsimProfiles(device) {
  if (!device) return []
  return profilesFromDevicePayload(
    device.esim_profiles || device.esimProfiles || device.esim || device.profiles || [],
    device,
  )
}

export function esimBadgeClass(profile) {
  if (profile?.active) return 'current'
  if (/启用|enabled/i.test(profile?.stateText || '')) return 'enabled'
  if (/禁用|disabled/i.test(profile?.stateText || '')) return 'disabled'
  return ''
}

export function esimStateLabel(profile) {
  const raw = String(profile?.stateText || '').trim()
  if (/disabled/i.test(raw)) return '已禁用'
  if (/enabled/i.test(raw) && !/已启用/.test(raw)) return '已启用'
  return raw || '已禁用'
}
