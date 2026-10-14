/**
 * OneWifi API Adapter · sms — 短信联系人 / 会话 / 发送 / 删除。
 * 只从 ./onewifi.adapter.core.js 取 helper；禁止 import ./onewifi.adapter.js（桶文件）。
 */
import { buildQuery, onewifiAdapterRequest } from './onewifi.adapter.core.js'

// ── 短信 ──

export function getSmsContacts(options = {}) {
  const { deviceId, limit = 200, ...ctx } = options
  const path = `/sms/contacts${buildQuery({
    limit,
    device_id: deviceId && deviceId !== 'all' ? deviceId : '',
  })}`
  return onewifiAdapterRequest(path, { trackLoading: false, ...ctx })
}

export function getSmsThread(params = {}, ctx = {}) {
  const path = `/sms/thread${buildQuery({
    peer: params.peer,
    imsi: params.imsi,
    device_id: params.deviceId ?? params.device_id,
    limit: params.limit ?? 80,
    before_ts: params.beforeTs ?? params.before_ts,
    before_id: params.beforeId ?? params.before_id,
  })}`
  return onewifiAdapterRequest(path, { trackLoading: false, ...ctx })
}

export function sendSms(body, ctx = {}) {
  return onewifiAdapterRequest('/sms/send', {
    method: 'POST',
    body,
    trackLoading: true,
    ...ctx,
  })
}

export function deleteSmsMessage(messageId, ctx = {}) {
  const id = encodeURIComponent(String(messageId || '').trim())
  if (!id) throw new Error('缺少短信 ID')
  return onewifiAdapterRequest(`/sms/messages/${id}`, {
    method: 'DELETE',
    trackLoading: true,
    ...ctx,
  })
}
