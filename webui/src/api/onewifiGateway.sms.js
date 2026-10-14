import { onewifiFetch } from './onewifi'

export async function fetchOnewifiSmsThreads(instanceId) {
  const query = instanceId && instanceId !== 'all' ? `?device_id=${encodeURIComponent(instanceId)}` : ''
  const contacts = await onewifiFetch(`/api/sms/contacts${query}`, { trackLoading: false })
  const list = Array.isArray(contacts) ? contacts : (contacts?.items || [])
  return {
    threads: list.map((item) => ({
      peer: item.peer,
      iccid: item.iccid || '',
      imsi: item.imsi || '',
      local_phone: item.local_phone || '',
      last_body: item.last_content || item.last_message || item.last_body || '',
      last_ts: item.last_timestamp || item.last_ts,
      unread_count: item.unread_count || 0,
      n: item.message_count,
    })),
  }
}

export async function fetchOnewifiSmsMessages(instanceId, peer, options = {}) {
  const params = new URLSearchParams()
  if (instanceId && instanceId !== 'all') params.set('device_id', instanceId)
  params.set('peer', peer)
  if (options.iccid) params.set('iccid', options.iccid)
  if (options.imsi) params.set('imsi', options.imsi)
  if (options.before_id) params.set('before_id', options.before_id)
  const payload = await onewifiFetch(`/api/sms/thread?${params}`, { trackLoading: false })
  const messages = Array.isArray(payload) ? payload : (payload?.messages || payload?.items || [])
  return { messages }
}

export async function sendOnewifiSms(deviceId, peerOrBody, text) {
  const phone = typeof peerOrBody === 'string'
    ? peerOrBody
    : (peerOrBody?.peer || peerOrBody?.phone || peerOrBody?.to)
  const message = typeof text === 'string'
    ? text
    : (peerOrBody?.body || peerOrBody?.message || peerOrBody?.text)
  return onewifiFetch('/api/sms/send', {
    method: 'POST',
    body: {
      device_id: deviceId,
      phone,
      message,
    },
  })
}

export function deleteOnewifiSmsThread(deviceId, peer, options = {}) {
  const params = new URLSearchParams()
  if (deviceId && deviceId !== 'all') params.set('device_id', deviceId)
  params.set('peer', peer)
  if (options.iccid) params.set('iccid', options.iccid)
  if (options.imsi) params.set('imsi', options.imsi)
  return onewifiFetch(`/api/sms/thread?${params}`, { method: 'DELETE' })
}

export function deleteOnewifiSmsMessage(id) {
  return onewifiFetch(`/api/sms/messages/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function downloadOnewifiSmsExport(deviceId) {
  const query = deviceId && deviceId !== 'all' ? `?device_id=${encodeURIComponent(deviceId)}` : ''
  const response = await onewifiFetch(`/api/sms/export${query}`, { asResponse: true, trackLoading: true })
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'sms-export.json'
  link.click()
  URL.revokeObjectURL(url)
}
