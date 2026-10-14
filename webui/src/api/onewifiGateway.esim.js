import { onewifiFetch } from './onewifi'
import { readSseJson } from './sse'
import { parseLpaActivationCode } from '../utils/lpaCode'

function deviceApi(deviceId, suffix = '') {
  const id = encodeURIComponent(String(deviceId || '').trim())
  if (!id) throw new Error('缺少设备')
  return `/api/devices/${id}${suffix}`
}

export function fetchOnewifiEsimChip(deviceId) {
  return onewifiFetch(`${deviceApi(deviceId, '/esim/profiles')}?refresh=1`, { trackLoading: false })
}

export function fetchOnewifiEsimChipCached(deviceId) {
  return onewifiFetch(deviceApi(deviceId, '/esim/profiles'), { trackLoading: false })
}

export function enableOnewifiEsimProfile(iccid, deviceId) {
  return onewifiFetch(deviceApi(deviceId, '/esim/actions/switch'), {
    method: 'POST',
    body: { iccid },
  })
}

export function disableOnewifiEsimProfile(iccid, deviceId) {
  return onewifiFetch(deviceApi(deviceId, '/esim/actions/disable'), {
    method: 'POST',
    body: { iccid },
  })
}

export async function downloadOnewifiEsim({
  reader,
  activation_code: code,
  deviceId,
  signal,
  onProgress,
} = {}) {
  const id = deviceId || reader
  const { smdp, matchingId, confirmationCode } = parseLpaActivationCode(code)
  if (!smdp) throw new Error('激活码缺少 SM-DP+ 地址')
  const response = await onewifiFetch(deviceApi(id, '/esim/actions/download'), {
    method: 'POST',
    body: {
      smdp,
      ...(matchingId ? { matching_id: matchingId } : {}),
      ...(confirmationCode ? { confirmation_code: confirmationCode } : {}),
    },
    trackLoading: true,
    signal,
    asResponse: true,
    headers: { Accept: 'text/event-stream' },
  })
  if (!response.body) throw new Error('下载连接未返回进度流')

  let completed = null
  await readSseJson(response, (progress) => {
    onProgress?.(progress)
    if (progress.step === 'error') {
      throw new Error(progress.msg || 'eSIM 下载失败')
    }
    if (progress.step === 'done') completed = progress
  })
  if (!completed) throw new Error('下载连接意外结束')
  return completed
}
