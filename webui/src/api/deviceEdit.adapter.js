import { onewifiAdapterRequest, patchDeviceCapabilities } from './onewifi.adapter.js'
import { readSseJson } from './sse.js'
import { policyPatchToCapabilities } from '../utils/onewifiDevice.js'
import { applyLiveIccidToProfiles, normalizeEuiccHardware, parseOnewifiEsimPayload } from '../utils/onewifiModel.js'
import { parseLpaActivationCode } from '../utils/lpaCode.js'

function requireDeviceId(deviceId) {
  const id = String(deviceId || '').trim()
  if (!id) throw new Error('缺少设备编号')
  return id
}

function requireIccid(iccid) {
  const value = String(iccid || '').trim()
  if (!/^\d{10,32}$/.test(value)) throw new Error('缺少有效 ICCID')
  return value
}

function deviceApi(deviceId, suffix = '') {
  return `/api/devices/${encodeURIComponent(requireDeviceId(deviceId))}${suffix}`
}

function cardApi(iccid, suffix = '') {
  return `/api/cards/${encodeURIComponent(requireIccid(iccid))}${suffix}`
}

function toAdapterPath(path) {
  const raw = String(path || '')
  return raw.startsWith('/api') ? raw.slice(4) || '/' : raw
}

function editFetch(path, options = {}) {
  const {
    ctx = {},
    method,
    body,
    signal,
    trackLoading,
    headers,
    asResponse,
  } = options
  return onewifiAdapterRequest(toAdapterPath(path), {
    method,
    body,
    signal,
    trackLoading,
    headers,
    asResponse,
    ...ctx,
  })
}

function unwrapDevice(payload) {
  if (Array.isArray(payload?.devices)) return payload.devices[0] || null
  return payload || null
}

function deviceOnline(device = {}) {
  return device.physical_present === true
    || device.running === true
    || device.worker_running === true
    || device.present === true
    || device.healthy === true
    || device.control_online === true
    || device.online === true
}

function cleanIccid(value) {
  const text = String(value || '').trim()
  return /^\d{10,32}$/.test(text) ? text : ''
}

export function pickLiveIccid(status = {}, profileGroups = []) {
  const direct = [
    status?.modem?.iccid,
    status?.vowifi_runtime?.iccid,
    status?.vowifi?.iccid,
    status?.sim?.iccid,
  ].map(cleanIccid).find(Boolean)
  if (direct) return direct

  for (const group of profileGroups || []) {
    const active = (group?.profiles || []).find((profile) => profile?.state === 1 || profile?.state === 'enabled' || profile?.active === true)
    const iccid = cleanIccid(active?.iccid)
    if (iccid) return iccid
  }
  return ''
}

function maskTail4(value) {
  const text = String(value || '').trim()
  return text.length > 4 ? `****${text.slice(-4)}` : text || '—'
}

export function sanitizeApnRead(item = {}) {
  const { password: _password, ...safe } = item
  return { ...safe, has_password: Boolean(item.has_password) }
}

export function buildApnWriteBody(draft = {}) {
  const body = {}
  for (const key of ['apn', 'username', 'proxy', 'mcc', 'mnc', 'ip_version', 'roaming_ip_version', 'auth_type']) {
    if (draft[key] != null) body[key] = String(draft[key]).trim()
  }
  if (String(draft.password || '') !== '') body.password = String(draft.password)
  if (draft.clear_password === true) body.clear_password = true
  return body
}

export async function loadCardApns(iccid, ctx = {}) {
  const payload = await editFetch(cardApi(iccid, '/apns'), { trackLoading: false, ctx })
  const items = Array.isArray(payload?.items) ? payload.items : (Array.isArray(payload) ? payload : [])
  return items.map(sanitizeApnRead)
}

export function createCardApn(iccid, draft, ctx = {}) {
  return editFetch(cardApi(iccid, '/apns'), { method: 'POST', body: buildApnWriteBody(draft), ctx })
}

export function updateCardApn(iccid, profileId, draft, ctx = {}) {
  const id = Number(profileId)
  if (!Number.isInteger(id) || id < 1) throw new Error('APN Profile 无效')
  return editFetch(cardApi(iccid, `/apns/${id}`), { method: 'PATCH', body: buildApnWriteBody(draft), ctx })
}

export function deleteCardApn(iccid, profileId, ctx = {}) {
  const id = Number(profileId)
  if (!Number.isInteger(id) || id < 1) throw new Error('APN Profile 无效')
  return editFetch(cardApi(iccid, `/apns/${id}`), { method: 'DELETE', ctx })
}

export async function loadDeviceEditSnapshot(deviceId, { refresh = false, signal, includePolicy = true, ctx = {} } = {}) {
  const id = requireDeviceId(deviceId)
  const profilesPath = refresh ? '/esim?refresh=1' : '/esim'
  const [status, profilesPayload] = await Promise.all([
    editFetch(deviceApi(id, '/overview'), { trackLoading: false, signal, ctx }),
    editFetch(deviceApi(id, profilesPath), { trackLoading: false, signal, ctx }),
  ])
  const profileGroups = Array.isArray(profilesPayload)
    ? profilesPayload
    : (profilesPayload?.profiles || profilesPayload?.ses || [])
  const euiccs = normalizeEuiccHardware(profilesPayload)
  const liveIccid = pickLiveIccid(status, profileGroups)
  const policy = includePolicy && liveIccid
    ? await editFetch(cardApi(liveIccid, '/policy'), { trackLoading: false, signal, ctx })
    : null
  return {
    deviceId: id,
    status,
    profileGroups,
    euiccs,
    liveIccid,
    policy,
    deviceOnline: deviceOnline(unwrapDevice(status) || {}),
  }
}

export async function loadDeviceEdit(deviceId, options) {
  const snapshot = await loadDeviceEditSnapshot(deviceId, options)
  const device = unwrapDevice(snapshot.status)
  const available = Boolean(snapshot.liveIccid)
  return {
    scope: {
      deviceId: snapshot.deviceId,
      iccid: snapshot.liveIccid,
      deviceOnline: snapshot.deviceOnline,
    },
    identity: {
      name: String(device?.name || device?.id || snapshot.deviceId),
      iccid: String(snapshot.liveIccid || ''),
      imei: String(device?.modem?.imei || device?.imei || ''),
      iccidMasked: maskTail4(snapshot.liveIccid),
      imeiMasked: maskTail4(device?.modem?.imei || device?.imei),
      numberMasked: maskTail4(device?.local_phone || device?.modem?.phone_number),
    },
    policy: {
      available,
      apn: String(snapshot.policy?.apn || ''),
      ipVersion: String(snapshot.policy?.ip_version || 'IPV4V6').toUpperCase(),
    },
    profiles: applyLiveIccidToProfiles(parseOnewifiEsimPayload(snapshot.profileGroups), snapshot.liveIccid),
    euiccs: snapshot.euiccs,
  }
}

export function loadDeviceCardPolicy(iccid, { signal, ctx = {} } = {}) {
  return editFetch(cardApi(iccid, '/policy'), { trackLoading: false, signal, ctx })
}

function normalizePolicyIPVersion(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'v4' || normalized === 'ip' || normalized === 'ipv4') return 'IP'
  if (normalized === 'v6' || normalized === 'ipv6') return 'IPV6'
  return 'IPV4V6'
}

export function saveDeviceCardPolicy(scope, draft, ctx = {}) {
  const body = {}
  if (Object.prototype.hasOwnProperty.call(draft || {}, 'apn')) {
    body.apn = String(draft?.apn || '').trim()
  }
  if (Object.prototype.hasOwnProperty.call(draft || {}, 'ipVersion')) {
    body.ip_version = normalizePolicyIPVersion(draft?.ipVersion)
  }
  if (Object.prototype.hasOwnProperty.call(draft || {}, 'networkEnabled')) {
    body.network_enabled = Boolean(draft?.networkEnabled)
  }
  if (Object.prototype.hasOwnProperty.call(draft || {}, 'vowifiEnabled')) {
    body.vowifi_enabled = Boolean(draft?.vowifiEnabled)
  }
  if (Object.prototype.hasOwnProperty.call(draft || {}, 'airplaneEnabled')) {
    body.airplane_enabled = Boolean(draft?.airplaneEnabled)
  }
  if (Object.prototype.hasOwnProperty.call(draft || {}, 'mbnProfile')) {
    body.mbn_profile = String(draft?.mbnProfile || '').trim()
  }
  if (Object.prototype.hasOwnProperty.call(draft || {}, 'voicePath')) {
    body.voice_path = draft?.voicePath === 'cellular' ? 'cellular' : 'vowifi'
  }
  return editFetch(cardApi(scope?.iccid, '/policy'), {
    method: 'PUT',
    body,
    ctx,
  })
}

const LIVE_POLICY_KEYS = new Set(['networkEnabled', 'vowifiEnabled', 'airplaneEnabled'])

function isLivePolicyPatch(scope, profile, patch) {
  const keys = Object.keys(patch || {})
  return Boolean(
    scope?.deviceOnline
    && cleanIccid(scope?.iccid)
    && cleanIccid(scope?.iccid) === cleanIccid(profile?.iccid)
    && keys.length
    && keys.every((key) => LIVE_POLICY_KEYS.has(key)),
  )
}

/**
 * Match OneWIFI card-policy behavior: active online capability switches are
 * applied to the device now; inactive/offline profiles only update their own
 * stored ICCID policy for restoration on the next card activation.
 */
export async function applyDeviceEditCardPolicy(scope, profile, current, patch, ctx = {}) {
  const iccid = requireIccid(profile?.iccid)
  const next = { ...(current || {}), ...(patch || {}) }
  if (isLivePolicyPatch(scope, profile, patch)) {
    await patchDeviceCapabilities(
      requireDeviceId(scope?.deviceId),
      policyPatchToCapabilities(patch),
      ctx,
    )
    return loadDeviceCardPolicy(iccid, { ctx })
  }
  return saveDeviceCardPolicy({ iccid }, next, ctx)
}

function profileActionBody(profile, extra = {}) {
  const body = { iccid: String(profile?.iccid || '').trim(), ...extra }
  const aidHex = String(profile?.aidHex || extra.aidHex || '').trim()
  if (aidHex) {
    body.aidHex = aidHex
    body.aid_hex = aidHex
  }
  return body
}

export function toggleDeviceEditProfile(scope, profile, ctx = {}) {
  const action = profile?.active ? 'disable' : 'switch'
  return editFetch(deviceApi(scope?.deviceId, `/esim/actions/${action}`), {
    method: 'POST',
    body: profileActionBody(profile),
    ctx,
  })
}

export function renameDeviceEditProfile(scope, profile, ctx = {}) {
  const iccid = requireIccid(profile?.iccid)
  const name = String(profile?.name || '').trim()
  if (!name) throw new Error('卡名字不能为空')
  const body = { name }
  const aidHex = String(profile?.aidHex || '').trim()
  if (aidHex) {
    body.aidHex = aidHex
    body.aid_hex = aidHex
  }
  return editFetch(deviceApi(scope?.deviceId, `/esim/profiles/${encodeURIComponent(iccid)}`), {
    method: 'PATCH',
    body,
    ctx,
  })
}

export function deleteDeviceEditProfile(scope, profile, ctx = {}) {
  const iccid = requireIccid(profile?.iccid)
  const aidHex = String(profile?.aidHex || '').trim()
  const query = aidHex ? `?aid_hex=${encodeURIComponent(aidHex)}` : ''
  return editFetch(deviceApi(scope?.deviceId, `/esim/profiles/${encodeURIComponent(iccid)}${query}`), {
    method: 'DELETE',
    ctx,
  })
}

export async function loadEsimNotifications(deviceId, ctx = {}) {
  const payload = await editFetch(deviceApi(deviceId, '/esim/notifications'), { trackLoading: false, ctx })
  return Array.isArray(payload?.items) ? payload.items : (Array.isArray(payload) ? payload : [])
}

export function retryEsimNotification(deviceId, sequenceNumber, aidHex = '', ctx = {}) {
  const seq = String(sequenceNumber ?? '').trim()
  if (!/^\d+$/.test(seq)) throw new Error('通知序号无效')
  const query = String(aidHex || '').trim() ? `?aid_hex=${encodeURIComponent(String(aidHex).trim())}` : ''
  return editFetch(deviceApi(deviceId, `/esim/notifications/${encodeURIComponent(seq)}/actions/retry${query}`), {
    method: 'POST',
    ctx,
  })
}

export async function downloadEsimProfileSSE(deviceId, params = {}, { signal, onProgress, ctx = {} } = {}) {
  if (params.method && params.method !== 'POST') throw new Error('eSIM 下载仅支持 POST')
  const smdp = String(params.smdp || '').trim()
  if (!smdp) throw new Error('SM-DP+ 地址不能为空')
  const response = await editFetch(deviceApi(deviceId, '/esim/actions/download'), {
    method: 'POST',
    body: {
      smdp,
      ...(params.matching_id ? { matching_id: String(params.matching_id) } : {}),
      ...(params.confirmation_code ? { confirmation_code: String(params.confirmation_code) } : {}),
      ...(params.aid_hex ? { aid_hex: String(params.aid_hex) } : {}),
      ...(params.imei ? { imei: String(params.imei) } : {}),
    },
    trackLoading: true,
    signal,
    asResponse: true,
    headers: { Accept: 'text/event-stream' },
    ctx,
  })
  if (!response.body) throw new Error('下载连接未返回进度流')
  const events = await readSseJson(response, (event) => {
    onProgress?.(event)
    if (event.step === 'error') throw new Error(event.msg || 'eSIM 下载失败')
  })
  const done = events.find((event) => event.step === 'done')
  if (!done) throw new Error('下载连接意外结束')
  return done
}

export function downloadDeviceEditProfile(scope, activationCode, options = {}) {
  const { smdp, matchingId, confirmationCode } = parseLpaActivationCode(activationCode)
  const typedCode = String(options.confirmationCode || '').trim()
  const aidHex = String(options.aidHex || scope?.aidHex || '').trim()
  return downloadEsimProfileSSE(scope?.deviceId, {
    smdp,
    matching_id: matchingId,
    confirmation_code: typedCode || confirmationCode,
    aid_hex: aidHex,
  }, options)
}
