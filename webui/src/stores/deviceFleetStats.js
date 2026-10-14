import { computed, reactive } from 'vue'

/** Per-instance device counts. Keys are OneWifi instance ids. */
export const fleetByInstance = reactive({})

export function instanceFleetScope(host) {
  const h = String(host || '').trim().toLowerCase()
  if (!h) return 'lan'
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]') return 'lan'
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return 'lan'
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return 'lan'
  const m = h.match(/^172\.(\d{1,2})\.\d{1,3}\.\d{1,3}$/)
  if (m) {
    const second = Number(m[1])
    if (second >= 16 && second <= 31) return 'lan'
  }
  return 'wan'
}

export function reportInstanceFleet(id, stats = {}) {
  const key = String(id || '').trim()
  if (!key) return
  const total = Math.max(0, Number(stats.total) || 0)
  const online = Math.max(0, Number(stats.online) || 0)
  fleetByInstance[key] = {
    total,
    online,
    offline: Math.max(0, Number(stats.offline) || Math.max(0, total - online)),
    lastUpdated: stats.lastUpdated ?? null,
    connected: Boolean(stats.connected),
    scope: stats.scope === 'wan' ? 'wan' : 'lan',
  }
}

export function clearInstanceFleet(id) {
  const key = String(id || '').trim()
  if (key) delete fleetByInstance[key]
}

export function resetFleetStats() {
  for (const key of Object.keys(fleetByInstance)) delete fleetByInstance[key]
}

export function aggregateFleet(rows = []) {
  let total = 0
  let online = 0
  let offline = 0
  let lanTotal = 0
  let wanTotal = 0
  let lastUpdated = null
  let anyConnected = false
  for (const row of rows) {
    const t = Number(row?.total) || 0
    const on = Number(row?.online) || 0
    const off = Number(row?.offline) || Math.max(0, t - on)
    total += t
    online += on
    offline += off
    if (row?.scope === 'wan') wanTotal += t
    else lanTotal += t
    if (row?.connected) anyConnected = true
    const stamp = row?.lastUpdated
    if (stamp != null && stamp !== '') {
      const n = typeof stamp === 'number' ? stamp : new Date(stamp).getTime()
      if (Number.isFinite(n) && (lastUpdated == null || n > lastUpdated)) lastUpdated = n
    }
  }
  return { total, online, offline, lanTotal, wanTotal, lastUpdated, anyConnected }
}

export const fleetOverview = computed(() => aggregateFleet(Object.values(fleetByInstance)))
