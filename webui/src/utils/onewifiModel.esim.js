/** OneWifi eSIM 芯片 / Profile / 切卡进度归一化 */

import { decorateEuiccHardware, explicitEuiccLabel } from './euiccCardCatalog.js'
import { scalarText } from './onewifiModel.scalar.js'

function esimProfileState(profile = {}) {
  return profile.state ?? profile.profileState ?? profile.profile_state ?? ''
}

function esimProfileActive(profile = {}) {
  const state = esimProfileState(profile)
  return state === 1 || state === '1' || state === 'enabled' || profile.active === true || profile.enabled === true
}

function esimProfileName(profile = {}) {
  return String(
    profile.profileNickname
    || profile.nickname
    || profile.profileName
    || profile.name
    || profile.serviceProviderName
    || profile.service_provider_name
    || '未命名',
  )
}

function euiccCardLabel(group = {}) {
  const profiles = Array.isArray(group?.profiles) ? group.profiles : [group]
  for (const profile of profiles) {
    if (!profile || typeof profile !== 'object') continue
    const label = explicitEuiccLabel(
      profile.profileNickname || profile.nickname || profile.profileName || profile.name,
    )
    if (label) return label
  }
  return ''
}

function esimProfileProvider(profile = {}) {
  return String(
    profile.serviceProviderName
    || profile.service_provider_name
    || profile.provider
    || '—',
  )
}

/**
 * Physical eUICC identity from GET /devices/{id}/esim.
 * Profile carrier fields are deliberately out of scope: they identify a
 * downloaded subscription, not the eUICC hardware that stores it.
 */
export function normalizeEuiccHardware(payload) {
  if (!payload || typeof payload !== 'object') return []
  const root = payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
    ? payload.data
    : payload
  const eids = Array.isArray(root?.chipInfo?.eids) ? root.chipInfo.eids : []
  const firmware = scalarText(root?.chipInfo?.firmware).trim()
  const groups = Array.isArray(root?.profiles)
    ? root.profiles
    : Array.isArray(root?.ses)
      ? root.ses
      : []

  const mapped = eids.flatMap((eid, index) => {
    if (!eid || typeof eid !== 'object') return []
    const eidValue = scalarText(eid.eid).trim()
    const group = groups.find((item) => (
      item && typeof item === 'object'
      && eidValue
      && scalarText(item.eid).trim() === eidValue
    )) || (eids.length === 1 ? groups[0] : groups[index]) || {}
    const freeNvram = scalarText(eid.freeNvram).trim()
    const bytes = Number(eid.freeNvramBytes)
    const freeNvramBytes = Number.isFinite(bytes) ? bytes : null
    const aidHex = scalarText(
      group.aidHex || group.aid_hex || eid.aidHex || eid.aid_hex || eid.aid,
    ).trim()
    const sas = scalarText(
      eid.sasAccreditationNumber || eid.sas || group.sasAccreditationNumber || group.sas,
    ).trim()
    const segments = [`eSIM ${index + 1}`]
    if (freeNvram) segments.push(`可用 ${freeNvram}`)
    const cardLabel = euiccCardLabel(group)

    return [{
      cardLabel,
      index,
      eid: eidValue,
      aidHex,
      sas,
      firmware,
      manufacturer: scalarText(eid.manufacturer).trim(),
      freeNvram,
      freeNvramBytes,
      label: segments.join(' · '),
    }]
  })

  return decorateEuiccHardware(mapped)
}

export function normalizeEsimProfiles(payload) {
  const slots = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.profiles)
      ? [{ eid: '', profiles: payload.profiles }]
      : Array.isArray(payload?.items)
        ? payload.items
        : []

  return slots.flatMap((slot, slotIndex) =>
    (slot.profiles || []).map((profile) => {
      const active = esimProfileActive(profile)
      return {
        slotIndex,
        eid: slot.eid || profile.seEid || '',
        aidHex: String(slot.aidHex || slot.aid_hex || profile.aidHex || profile.aid_hex || ''),
        iccid: String(profile.iccid || ''),
        name: esimProfileName(profile),
        provider: esimProfileProvider(profile),
        active,
        stateText: String(profile.stateText || profile.state_text || (active ? '已启用' : '已禁用')),
        classText: String(profile.classText || profile.class_text || profile.profileClass || ''),
      }
    }),
  )
}

export function parseOnewifiEsimPayload(payload) {
  if (!payload || typeof payload !== 'object') return []
  if (payload.chip && typeof payload.chip === 'object' && Array.isArray(payload.chip.profiles)) {
    return normalizeEsimProfiles(payload.chip)
  }
  if (Array.isArray(payload.ses) && payload.ses.some((se) => (se?.profiles || []).length)) {
    return normalizeEsimProfiles(payload.ses)
  }
  if (Array.isArray(payload.profiles) && payload.profiles.length) {
    return normalizeEsimProfiles(payload)
  }
  if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.profiles)) {
    return parseOnewifiEsimPayload(payload.data)
  }
  if (Array.isArray(payload.ses)) return normalizeEsimProfiles(payload.ses)
  return normalizeEsimProfiles(payload)
}

/** 后端 ses[].error 仍会 200；空列表时要把真原因露出来，不要糊成「没配置」。 */
export function onewifiEsimError(payload) {
  if (!payload || typeof payload !== 'object') return ''
  if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data) && payload.data !== payload) {
    const nested = onewifiEsimError(payload.data)
    if (nested) return nested
  }
  const ses = Array.isArray(payload.ses) ? payload.ses : []
  const envelope = payload.error
  const envelopeText = envelope && typeof envelope === 'object'
    ? (envelope.message || envelope.code || '')
    : envelope
  const raw = ses.map((se) => se?.error).find(Boolean)
    || envelopeText
    || payload.detail
    || payload.message
    || ''
  return String(raw || '').trim()
}

function esimPayloadCachedFalse(payload) {
  if (!payload || typeof payload !== 'object') return false
  if (payload.cached === false) return true
  return payload.data && typeof payload.data === 'object' && payload.data.cached === false
}

export function onewifiEsimHint(payload, list = []) {
  if (list.length) return ''
  const err = onewifiEsimError(payload)
  if (/no usable AT port|at_port_unavailable/i.test(err)) {
    return '这台模组现在没有可用的 AT 口，读不了芯片。'
  }
  if (/esim_uim_busy|holding UIM/i.test(err)) {
    return 'VoWiFi 正在占用芯片。点「读芯片」会短暂停 IMS 再读列表，读完会自动连回来。'
  }
  if (/esim_qmi_unavailable|qmi-proxy|QMI UIM transport/i.test(err)) {
    return '芯片通道没打开（QMI 被占用或没有 qmi-proxy），还不能断定是普通 SIM。点「读芯片」再试；一直失败就先停 VoWiFi 再读。'
  }
  if (/lpac binary not found|not found at .*\/lpac/i.test(err)) {
    return '这台机没有装 lpac，切不了 eSIM。和卡里有没有配置无关。'
  }
  if (/does not appear to be an eUICC|Ordinary USIM|not_euicc/i.test(err)) {
    return '没读到 eSIM 应用。点「读芯片」再试一次；仍没有才是普通 SIM。'
  }
  if (/reader_unavailable|reader is not ready|80100017/i.test(err)) {
    return '读卡器还没就绪。等一两秒再点「读芯片」；一直失败就把 DOT 拔插一次。'
  }
  if (/reader_hub_busy|hub is busy|in backoff|isolate:/i.test(err)) {
    return '读卡器 HUB 正忙（另一台 DOT 占用口）。等几秒再切卡或读芯片，不要两台一起开 VoWiFi。'
  }
  if (/esim_status|error status word|SW=6900|eUICC rejected the chip-read/i.test(err)) {
    return '芯片拒绝了这次读取。ESTKme 再点「读芯片」；7eSim 在读卡器上会回 6900，换到模组上读或换 ESTKme 芯片。'
  }
  if (/card_absent|no card is inserted/i.test(err)) {
    return '读卡器没有检测到卡。ESTKme-DOT 的芯片应在设备里；可拔插一次后再点「读芯片」。'
  }
  if (/the device operation failed/i.test(err)) {
    return '读芯片失败。确认 DOT 已插卡后再点一次「读芯片」。'
  }
  if (err) return err
  if (esimPayloadCachedFalse(payload)) {
    return '芯片缓存为空。「读芯片」会短暂停 VoWiFi 再读列表。'
  }
  return '这张卡上还没有 eSIM 配置'
}

export function esimProfileTail(iccid) {
  return String(iccid || '').replace(/\D/g, '').slice(-4)
}

export function canDeleteEsimProfile(profile) {
  return Boolean(String(profile?.iccid || '').replace(/\D/g, '')) && !profile?.locked && !profile?.active
}

export function esimDeleteConfirmMessage(profile) {
  const name = String(profile?.name || '未命名').trim() || '未命名'
  const tail = esimProfileTail(profile?.iccid)
  if (tail) return `删除「${name}」（尾号 ${tail}）？芯片上的这张配置会清掉，本机无法恢复。`
  return `删除「${name}」？芯片上的这张配置会清掉，本机无法恢复。`
}

export function esimDeleteActionLabel(profile) {
  if (profile?.locked) return '物理卡不能从芯片删除'
  if (profile?.active) return '当前启用的卡不能删，先切到别的卡'
  return `删除「${String(profile?.name || 'eSIM').trim() || 'eSIM'}」`
}

/** 普通 USIM 没有 eSIM 列表时，用当前在位 SIM 填满切卡卡槽，避免整块空白。 */
export function currentSimAsProfile(overview = {}, device = {}) {
  const iccid = String(overview?.iccid || device?.sim?.iccid_masked || '').trim()
  if (!iccid || iccid === '—') return null
  const operator = String(overview?.operator || device?.sim?.name || device?.sim?.carrier?.name || '').trim()
  return {
    iccid,
    name: operator || '当前 SIM',
    provider: operator || '物理卡',
    active: true,
    locked: true,
    stateText: '当前',
  }
}

export const ESIM_SWITCH_STEPS = [
  { key: 'stop', label: '停网' },
  { key: 'flight', label: '飞行' },
  { key: 'write', label: '写卡' },
  { key: 'check', label: '校验' },
  { key: 'back', label: '恢复' },
]

export function idleEsimSwitchStages() {
  return ESIM_SWITCH_STEPS.map((step) => ({ ...step, ready: false, pending: false, failed: false }))
}

export function normalizeEsimSwitchProgress(raw = {}) {
  const source = raw && typeof raw === 'object' && (raw.steps || raw.active != null || raw.step != null)
    ? raw
    : {}
  const incoming = Array.isArray(source.steps) ? source.steps : []
  const byKey = new Map(incoming.map((step) => [String(step?.key || ''), step]))
  const stages = ESIM_SWITCH_STEPS.map((def, index) => {
    const hit = byKey.get(def.key) || incoming[index] || {}
    return {
      key: def.key,
      label: def.label,
      ready: Boolean(hit.ready),
      pending: Boolean(hit.pending),
      failed: Boolean(hit.failed),
    }
  })
  const phases = Array.isArray(source.phases) ? source.phases : []
  return {
    active: Boolean(source.active),
    step: Number(source.step) || 0,
    status: String(source.status || ''),
    phase: String(source.phase || ''),
    phases,
    recoverable: source.recoverable !== false,
    failReason: String(source.fail_reason || source.failReason || ''),
    stages,
  }
}
