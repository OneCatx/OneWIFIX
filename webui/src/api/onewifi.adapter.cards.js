/**
 * OneWifi API Adapter · cards — eSIM 档案 / 卡策略。
 * 只从 ./onewifi.adapter.core.js 取 helper；禁止 import ./onewifi.adapter.js（桶文件）。
 */
import {
  buildQuery,
  cardPolicyPath,
  devicePath,
  onewifiAdapterRequest,
} from './onewifi.adapter.core.js'

export function getEsimProfiles(deviceId, options = {}) {
  const { refresh = false, ...ctx } = options
  const path = `${devicePath(deviceId, '/esim/profiles')}${buildQuery({
    refresh: refresh ? '1' : '',
  })}`
  return onewifiAdapterRequest(path, { trackLoading: false, ...ctx })
}

/** eSIM tab contract: cached eUICC identity, available NVRAM, and profiles. */
export function getEsimOverview(deviceId, options = {}) {
  const { refresh = false, ...ctx } = options
  const path = `${devicePath(deviceId, '/esim')}${buildQuery({
    refresh: refresh ? '1' : '',
  })}`
  return onewifiAdapterRequest(path, { trackLoading: false, ...ctx })
}

export function switchEsimProfile(deviceId, body, ctx = {}) {
  return onewifiAdapterRequest(devicePath(deviceId, '/esim/actions/switch'), {
    method: 'POST',
    body,
    trackLoading: true,
    ...ctx,
  })
}

// ── 卡策略 / 配置 ──

export function getCardPolicy(iccid, ctx = {}) {
  return onewifiAdapterRequest(cardPolicyPath(iccid), { trackLoading: false, ...ctx })
}

export function putCardPolicy(iccid, body, ctx = {}) {
  return onewifiAdapterRequest(cardPolicyPath(iccid), {
    method: 'PUT',
    body,
    trackLoading: true,
    ...ctx,
  })
}
