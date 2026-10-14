/** OneWifi 短信归一化 */

export function normalizeSmsList(payload) {
  let list = []
  if (Array.isArray(payload)) list = payload
  else if (Array.isArray(payload?.messages)) list = payload.messages
  else if (Array.isArray(payload?.items)) list = payload.items

  return sortSmsMessagesAsc(
    list
      .map(normalizeSmsMessage)
      .filter((item) => item.body),
  )
}

function smsTimestamp(raw = {}) {
  return raw.created_at || raw.timestamp || raw.time || raw.ts || raw.received_at || raw.sent_at || raw.last_timestamp || ''
}

/** ISO timestamps: parse with Date, not Number(). */
export function smsTimeMs(value) {
  if (value == null || value === '') return 0
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value <= 0) return 0
    return value < 1e12 ? value * 1000 : value
  }
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

export function normalizeSmsContact(raw = {}) {
  const timeMs = smsTimeMs(raw.last_timestamp || raw.last_ts || smsTimestamp({ timestamp: raw.last_timestamp }))
  const date = timeMs ? new Date(timeMs) : null
  const imsi = String(raw.imsi || '').trim()
  const peer = String(raw.peer || '').trim()

  return {
    key: `${imsi}|${peer}`,
    imsi,
    iccid: String(raw.iccid || '').trim(),
    peer,
    deviceId: String(raw.device_id || raw.deviceId || '').trim(),
    deviceName: String(raw.device_name || raw.deviceName || '').trim(),
    localPhone: String(raw.local_phone || raw.localPhone || '').trim(),
    lastMessage: displaySmsBody(raw.last_content ?? raw.last_message ?? raw.last_body ?? raw.preview ?? '').slice(0, 120),
    lastSmsId: Number(raw.last_sms_id || raw.lastSmsId || 0) || 0,
    lastTs: timeMs,
    lastTimeLabel: formatSmsTime(date),
  }
}

export function normalizeSmsContacts(payload) {
  let list = []
  if (Array.isArray(payload)) list = payload
  else if (Array.isArray(payload?.contacts)) list = payload.contacts
  else if (Array.isArray(payload?.items)) list = payload.items

  return list
    .map(normalizeSmsContact)
    .filter((item) => item.peer)
    .sort((a, b) => b.lastTs - a.lastTs)
}

export function displaySmsBody(value) {
  const text = String(value ?? '').trim()
  if (looksLikeSmsHexDump(text)) return '收到一条系统短信'
  return text
}

function looksLikeSmsHexDump(text) {
  return text.length >= 16 && text.length % 2 === 0 && /^[0-9A-Fa-f]+$/.test(text)
}

export function normalizeSmsMessage(raw = {}) {
  const timeRaw = smsTimestamp(raw)
  const timeMs = smsTimeMs(timeRaw)
  const date = timeMs ? new Date(timeMs) : null
  const numericId = Number(raw.id ?? raw.message_id ?? raw.sms_id ?? 0) || 0
  const directionRaw = String(raw.direction || '').toLowerCase()
  const outbound = ['out', 'outbound', 'sent', 'send'].includes(directionRaw)

  return {
    id: String(raw.id || raw.message_id || raw.sms_id || `${raw.peer || raw.from || raw.sender}-${timeRaw || Math.random()}`),
    numericId,
    imsi: String(raw.imsi || '').trim(),
    peer: String(raw.peer || raw.from || raw.sender || '').trim(),
    deviceId: String(raw.device_id || raw.deviceId || '').trim(),
    deviceName: String(raw.device_name || raw.deviceName || '').trim(),
    sender: outbound ? '我' : String(raw.sender || raw.from_name || raw.from || raw.peer || raw.contact || '未知'),
    body: displaySmsBody(raw.content ?? raw.body ?? raw.text ?? raw.message ?? ''),
    direction: outbound ? 'out' : 'in',
    phone: String(raw.local_phone || raw.to || raw.phone || raw.recipient || raw.local_number || ''),
    timestamp: timeRaw ? String(timeRaw) : '',
    time: date ? date.toISOString() : '',
    dateKey: date ? smsDayKey(date) : '未知日期',
    timeLabel: formatSmsTime(date),
  }
}

function smsDayKey(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function sortSmsMessagesAsc(messages = []) {
  return [...messages].sort((a, b) => {
    const ta = a.time ? new Date(a.time).getTime() : 0
    const tb = b.time ? new Date(b.time).getTime() : 0
    if (ta !== tb) return ta - tb
    return (a.numericId || 0) - (b.numericId || 0)
  })
}

export function formatSmsTime(date) {
  if (!date) return '—'
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function groupSmsByDate(messages = []) {
  const groups = []
  for (const message of messages) {
    const last = groups[groups.length - 1]
    if (!last || last.date !== message.dateKey) {
      groups.push({ date: message.dateKey, items: [message] })
    } else {
      last.items.push(message)
    }
  }
  return groups
}
