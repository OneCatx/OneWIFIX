export const MAX_RUNTIME_LOGS = 1000

export function logFieldsText(fields) {
  if (fields == null) return ''
  return typeof fields === 'string' ? fields : JSON.stringify(fields)
}

export function formatLogTime(time) {
  if (!time) return ''
  const date = new Date(time)
  if (Number.isNaN(date.getTime())) return String(time)
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function formatLogReminder(entry = {}) {
  const message = String(entry?.message || '').trim()
  const count = Number(entry?.count) || 1
  if (!message) return count > 1 ? `已提醒 ${count} 次` : ''
  return count > 1 ? `${message} · 已提醒 ${count} 次` : message
}

export function formatLogLine(entry = {}) {
  const fields = logFieldsText(entry.fields)
  return [
    `[${formatLogTime(entry.time)}]`,
    String(entry.level || '').toUpperCase().padEnd(5),
    entry.caller || '',
    formatLogReminder(entry),
    fields,
  ].filter(Boolean).join(' ')
}

function fieldDeviceId(fields) {
  if (!fields || typeof fields !== 'object') return ''
  return String(fields.device_id || fields.deviceId || '').trim()
}

export function logReminderKey(entry = {}) {
  return [
    String(entry.level || '').toLowerCase(),
    String(entry.message || '').trim(),
    fieldDeviceId(entry.fields),
  ].join('|')
}

const ACCESS_NOISE_MESSAGE = /^(http request|request)$/i
const PROBLEM_LEVEL = /^(error|err|fatal|warn|warning)$/i
const PROBLEM_TEXT = /fail|error|warn|retry|timeout|超时|失败|异常|拒绝|中断|panic|fatal|denied/i

export function isAccessNoiseLog(entry) {
  return ACCESS_NOISE_MESSAGE.test(String(entry?.message || '').trim())
}

export function isProblemLog(entry) {
  if (!entry || isAccessNoiseLog(entry)) return false
  if (PROBLEM_LEVEL.test(String(entry.level || ''))) return true
  return PROBLEM_TEXT.test(String(entry.message || ''))
}

export function filterRuntimeLogs(logs, {
  level = 'all',
  search = '',
  messageOnly = false,
  problemsOnly = false,
  includeAccess = false,
} = {}) {
  const query = String(search || '').trim().toLowerCase()
  const wanted = String(level || 'all').toLowerCase()
  return (Array.isArray(logs) ? logs : []).filter((entry) => {
    if (!includeAccess && isAccessNoiseLog(entry)) return false
    if (problemsOnly && !isProblemLog(entry)) return false
    if (wanted !== 'all' && String(entry?.level || '').toLowerCase() !== wanted) return false
    if (!query) return true
    if (messageOnly) return String(entry?.message || '').toLowerCase().includes(query)
    return [entry?.message, entry?.caller, logFieldsText(entry?.fields)]
      .join(' ')
      .toLowerCase()
      .includes(query)
  })
}

export function logTone(level) {
  const v = String(level || '').toLowerCase()
  if (v === 'error' || v === 'err' || v === 'fatal') return 'error'
  if (v === 'warn' || v === 'warning') return 'warning'
  if (v === 'debug' || v === 'trace') return 'debug'
  return 'success'
}

export function logToneLabel(tone) {
  if (tone === 'error') return 'ERROR'
  if (tone === 'warning') return 'WARNING'
  if (tone === 'debug') return 'DEBUG'
  return 'SUCCESS'
}

export function logToneIcon(tone) {
  if (tone === 'error') return 'error'
  if (tone === 'warning') return 'warning'
  return 'check_circle'
}

export function appendRuntimeLog(logs, entry, max = MAX_RUNTIME_LOGS) {
  if (!entry || typeof entry !== 'object') {
    const next = Array.isArray(logs) ? logs : []
    return next.length > max ? next.slice(-max) : next
  }
  const list = Array.isArray(logs) ? [...logs] : []
  const key = logReminderKey(entry)
  const index = list.findIndex((row) => logReminderKey(row) === key)
  if (index >= 0) {
    const prev = list[index]
    list.splice(index, 1)
    list.push({
      ...prev,
      ...entry,
      count: (Number(prev.count) || 1) + 1,
      firstTime: prev.firstTime || prev.time,
      time: entry.time || prev.time,
    })
  } else {
    list.push({
      ...entry,
      count: Number(entry.count) || 1,
      firstTime: entry.firstTime || entry.time,
    })
  }
  return list.length > max ? list.slice(-max) : list
}

export function coalesceRuntimeLogs(logs, max = MAX_RUNTIME_LOGS) {
  return (Array.isArray(logs) ? logs : []).reduce(
    (acc, entry) => appendRuntimeLog(acc, entry, max),
    [],
  )
}

export function parseLogStreamFrame(data) {
  if (!data || data === '{}') return null
  try {
    const parsed = JSON.parse(data)
    if (!parsed || typeof parsed !== 'object') return null
    if (!parsed.message && !parsed.level) return null
    return parsed
  } catch {
    return null
  }
}

export function proxyProbeSummary(result) {
  if (result?.message) return String(result.message)
  const probe = result?.probe || result || {}
  if (probe.udp_exchange_ok) return 'SOCKS5 认证与真实 UDP 往返探测通过'
  if (probe.error || probe.diagnosis) return probe.error || probe.diagnosis
  return '探测已完成'
}

export function proxyProbeRows(result) {
  const probe = result?.probe || result || {}
  return [
    { key: 'tcp', label: 'TCP', ok: Boolean(probe.reachable) },
    { key: 'socks', label: 'SOCKS5', ok: Boolean(probe.handshake_ok) },
    { key: 'udp', label: 'UDP', ok: Boolean(probe.udp_associate_ok) },
    { key: 'dns', label: 'UDP DNS', ok: Boolean(probe.udp_exchange_ok) },
  ]
}
