import { maskTail4 } from './onewifiDevice.js'

export function createAutomaticTaskProfileRequestGuard() {
  let latestRequestID = 0
  return {
    begin: () => ++latestRequestID,
    invalidate: () => { latestRequestID += 1 },
    isCurrent: (requestID) => requestID === latestRequestID,
  }
}

export function esimGroupsFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return []
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload.ses)) return payload.ses
  if (Array.isArray(payload.profiles)) {
    return [{ aidHex: payload.aidHex || '', profiles: payload.profiles }]
  }
  if (payload.data) return esimGroupsFromPayload(payload.data)
  return []
}

export function buildAutomaticTaskProfileOptions(payload, currentICCID = '') {
  const options = []
  for (const [groupIndex, group] of esimGroupsFromPayload(payload).entries()) {
    const groupAid = String(group?.aidHex || group?.AID || '')
    for (const profile of group?.profiles || []) {
      const iccid = String(profile?.iccid || '').trim()
      if (!iccid) continue
      const name = profile.name
        || profile.nickname
        || profile.profileNickname
        || profile.serviceProviderName
        || profile.service_provider_name
        || `Profile ${groupIndex + 1}`
      options.push({
        iccid,
        aidHex: groupAid || String(profile.aidHex || ''),
        label: `${name} · ${maskTail4(iccid)}`,
      })
    }
  }
  const iccid = String(currentICCID || '').trim()
  if (iccid && !options.some((option) => option.iccid.trim() === iccid)) {
    options.push({ iccid, aidHex: '', label: `当前 SIM · ${maskTail4(iccid)}` })
  }
  return options
}

export function selectAutomaticTaskProfileOption(options, requestedICCID) {
  const iccid = String(requestedICCID || '').trim()
  if (iccid) return options.find((option) => option.iccid.trim() === iccid)
  return options[0]
}

export function isUsbSimReader(device) {
  const type = String(device?.device_type || device?.deviceType || '')
  return type === 'usb_sim_reader' || type === 'reader'
}

export function currentDeviceICCID(device) {
  return String(
    device?.modem?.iccid
    || device?.vowifi_runtime?.iccid
    || device?.sim?.iccid
    || '',
  ).trim()
}
