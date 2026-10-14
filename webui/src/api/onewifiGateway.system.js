import { onewifiFetch } from './onewifi'

function parseUptimeSeconds(text) {
  const raw = String(text || '')
  const hours = raw.match(/(\d+)\s*h/i)
  const minutes = raw.match(/(\d+)\s*m/i)
  const days = raw.match(/(\d+)\s*d/i)
  return (Number(days?.[1] || 0) * 86400)
    + (Number(hours?.[1] || 0) * 3600)
    + (Number(minutes?.[1] || 0) * 60)
}

function bytesToMb(bytes) {
  const n = Number(bytes) || 0
  return n ? Math.round(n / 1024 / 1024) : 0
}

export async function fetchOnewifiSystemStatus() {
  const [info, dash] = await Promise.all([
    onewifiFetch('/api/system/info', { trackLoading: false }).catch(() => ({})),
    onewifiFetch('/api/dashboard/host', { trackLoading: false }).catch(() => ({})),
  ])
  const perf = dash?.perf || {}
  const staticHost = dash?.host || {}
  const model = staticHost.board_model
    || staticHost.cpu_model
    || [info?.os, info?.architecture].filter(Boolean).join('/')
    || 'OneWIFI'
  return {
    system_name: 'OneWIFI',
    version: info?.version || '',
    host: {
      model,
      cpu_model: staticHost.cpu_model || '',
      cpu_percent: Number(perf.cpu_percent) || 0,
      uptime_seconds: parseUptimeSeconds(info?.uptime),
      memory: {
        used_percent: Number(perf.memory_percent) || 0,
        total_mb: bytesToMb(perf.memory_total_bytes),
        used_mb: bytesToMb(perf.memory_used_bytes),
      },
      disk: {
        used_percent: Number(perf.disk_percent) || 0,
      },
      load: {
        '1m': Number(perf.cpu_percent) || 0,
        cores: 1,
      },
    },
  }
}


export async function createOnewifiBackup() {
  throw new Error('OneWIFI 开源后端不提供 MDD 备份接口')
}

export async function deleteOnewifiBackup() {
  throw new Error('OneWIFI 开源后端不提供 MDD 备份接口')
}

export async function runOnewifiMaintenance() {
  throw new Error('请在主机上维护 OneWIFI 进程，控制面不再代理重启')
}

export async function fetchOnewifiLogHistory({ lines = 500, level = '', search = '' } = {}) {
  const params = new URLSearchParams({ lines: String(lines) })
  if (level && level !== 'all') params.set('level', level)
  if (search) params.set('search', search)
  const payload = await onewifiFetch(`/api/logs/history?${params}`, { trackLoading: false })
  return Array.isArray(payload) ? payload : (payload?.logs || payload?.entries || payload?.items || [])
}

export async function fetchOnewifiLoggingSettings() {
  return onewifiFetch('/api/settings/logging', { trackLoading: false })
}

export function saveOnewifiLoggingSettings(body) {
  return onewifiFetch('/api/settings/logging', { method: 'PUT', body })
}

export async function fetchOnewifiInstanceLogs(_instanceId, lines = 300) {
  const entries = await fetchOnewifiLogHistory({ lines })
  const text = entries.map((entry) => {
    if (typeof entry === 'string') return entry
    return [entry.time, entry.level, entry.message].filter(Boolean).join(' ')
  }).join('\n')
  return { engine: text, charon: '', diagnostics: text }
}

export async function downloadOnewifiSupportBundle() {
  throw new Error('请用系统日志页查看 /api/logs/history，不再打包 MDD 支持包')
}

export function checkOnewifiUpdate() {
  return onewifiFetch('/api/system/update/check', { trackLoading: true })
}

export async function clearOnewifiHostAlerts() {
  return { host_alerts: [] }
}
