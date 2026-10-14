/** OneWifi 卡策略 / ICCID 归一化 */

const IP_VERSION_FROM_API = Object.freeze({
  ip: 'v4',
  ipv4: 'v4',
  v4: 'v4',
  ipv6: 'v6',
  v6: 'v6',
  ipv4v6: 'v4v6',
  v4v6: 'v4v6',
})

const IP_VERSION_TO_API = Object.freeze({
  v4: 'IP',
  v6: 'IPV6',
  v4v6: 'IPV4V6',
})

export function normalizeCardPolicy(raw = {}) {
  const ip = String(raw.ip_version ?? raw.ipVersion ?? 'v4').toLowerCase()
  return {
    ipVersion: IP_VERSION_FROM_API[ip] || 'v4',
    apn: String(raw.apn ?? '').trim(),
    networkEnabled: Boolean(raw.network_enabled ?? raw.networkEnabled),
    vowifiEnabled: Boolean(raw.vowifi_enabled ?? raw.vowifiEnabled),
    airplaneEnabled: Boolean(raw.airplane_enabled ?? raw.airplaneEnabled),
    mbnProfile: String(raw.mbn_profile ?? raw.mbnProfile ?? '').trim(),
    voicePath: normalizeVoicePath(raw.voice_path ?? raw.voicePath),
  }
}

export function normalizeVoicePath(value) {
  const text = String(value || '').trim().toLowerCase()
  return text === 'cellular' || text === 'cs' || text === 'csfb' ? 'cellular' : 'vowifi'
}

export function cardPolicyToPayload(policy = {}) {
  const payload = {
    ip_version: IP_VERSION_TO_API[String(policy.ipVersion || '').toLowerCase()] || 'IP',
    apn: policy.apn || '',
    network_enabled: Boolean(policy.networkEnabled),
    vowifi_enabled: Boolean(policy.vowifiEnabled),
    airplane_enabled: Boolean(policy.airplaneEnabled),
    voice_path: normalizeVoicePath(policy.voicePath),
  }
  if (Object.prototype.hasOwnProperty.call(policy, 'mbnProfile')) {
    payload.mbn_profile = String(policy.mbnProfile || '').trim()
  }
  return payload
}

export function esimIccidKey(value) {
  return String(value || '').replace(/\D/g, '')
}

export function applyLiveIccidToProfiles(profiles = [], liveIccid = '') {
  const live = esimIccidKey(liveIccid)
  if (!live || !profiles.some((profile) => esimIccidKey(profile.iccid) === live)) {
    return profiles
  }
  return profiles.map((profile) => {
    const active = esimIccidKey(profile.iccid) === live
    if (profile.locked) return { ...profile, active }
    return { ...profile, active, stateText: active ? '已启用' : '已禁用' }
  })
}

export function isPlaceholderEsimProfileName(name) {
  const text = String(name || '').trim()
  return !text || text === '—' || /^ICCID\s+\S+$/i.test(text)
}

export function retainEsimProfileName(prevName, incomingName = '', activeName = '') {
  const active = String(activeName || '').trim()
  if (active && !isPlaceholderEsimProfileName(active)) return active
  const incoming = String(incomingName || '').trim()
  if (incoming && !isPlaceholderEsimProfileName(incoming)) return incoming
  const prev = String(prevName || '').trim()
  if (prev && !isPlaceholderEsimProfileName(prev)) return prev
  return incoming || prev || '—'
}

export function mergeOverviewKeepingEsimName(prev, incoming, activeName = '') {
  const next = incoming && typeof incoming === 'object' ? incoming : {}
  return {
    ...next,
    esimProfile: retainEsimProfileName(prev?.esimProfile, next.esimProfile, activeName),
  }
}

export function resolveActiveIccid(overview, esimProfiles = []) {
  const live = String(overview?.iccid || '').trim()
  if (live && live !== '—' && esimProfiles.some((profile) => esimIccidKey(profile.iccid) === esimIccidKey(live))) {
    return live
  }
  const active = esimProfiles.find((profile) => profile.active)
  const iccid = active?.iccid || overview?.iccid
  const text = String(iccid || '').trim()
  return text && text !== '—' ? text : ''
}
