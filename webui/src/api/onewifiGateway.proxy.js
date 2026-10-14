import { onewifiFetch } from './onewifi'
import { COUNTRY_DEFS, REGISTRY } from '../utils/countryRegistry.js'
import { splitProxyAddr } from '../utils/upstreamProxy.js'

const PROFILE_ID = /^[A-Za-z0-9_.-]{1,80}$/

let writeQueue = Promise.resolve()

function countryKey(code) {
  const key = String(code || '').trim().toLowerCase()
  if (key === 'uk') return 'gb'
  if (!/^[a-z]{2}$/.test(key)) throw new Error('国家代码无效')
  return key
}

function storedCountryKey(code) {
  try {
    return countryKey(code)
  } catch {
    return ''
  }
}

function countryLabel(code) {
  const iso = String(code || '').trim().toUpperCase()
  return REGISTRY[iso]?.zh || iso
}

function profileAddr(profile = {}) {
  const type = String(profile.type || '')
  if (type === 'socks5') {
    const host = String(profile.server || '').trim()
    const port = String(profile.port || '').trim()
    if (!host || !port) return ''
    return host.includes(':') ? `[${host}]:${port}` : `${host}:${port}`
  }
  if (type === 'node') return '节点'
  if (type === 'subscription') return '订阅'
  if (type === 'existing') return String(profile.outbound_tag || '').trim() || '已有出口'
  return ''
}

function viewProfile(id, profile = {}) {
  return {
    id,
    name: String(profile.name || id),
    type: String(profile.type || ''),
    addr: profileAddr(profile),
    server: profile.server || '',
    port: profile.port ?? '',
    username: profile.username || '',
    password: profile.password || '',
    enabled: profile.enabled !== false,
    value: profile.value || '',
    url: profile.url || '',
  }
}

function libraryFromSettings(settings = {}) {
  const proxy = settings.proxy && typeof settings.proxy === 'object' ? settings.proxy : {}
  const profiles = proxy.profiles && typeof proxy.profiles === 'object' ? proxy.profiles : {}
  const exits = proxy.exits && typeof proxy.exits === 'object' ? proxy.exits : {}
  const proxies = Object.entries(profiles)
    .filter(([, profile]) => profile && typeof profile === 'object')
    .map(([id, profile]) => viewProfile(id, profile))
  const rules = Object.entries(exits)
    .filter(([, exitCfg]) => exitCfg && typeof exitCfg === 'object')
    .map(([country, exitCfg]) => {
      const key = storedCountryKey(country)
      if (!key) return null
      const countryCode = key.toUpperCase()
      return {
        country_code: countryCode,
        country_name: countryLabel(countryCode),
        upstream_proxy_id: String(exitCfg.profile_id || ''),
        enabled: exitCfg.enabled !== false,
      }
    })
    .filter(Boolean)
  return { proxy, proxies, rules, enabled: Boolean(proxy.enabled) }
}

export function projectProxyLibrary(settings = {}, live = {}, statusError = '') {
  const library = libraryFromSettings(settings)
  const liveExits = live?.exits && typeof live.exits === 'object' ? live.exits : {}
  const exits = {}
  for (const rule of library.rules) {
    const key = rule.country_code.toLowerCase()
    const row = liveExits[key] || liveExits[rule.country_code] || {}
    exits[rule.country_code] = {
      ready: row.ready === true,
      node: row.node || '',
      error: row.error || statusError || '',
    }
  }
  return {
    proxies: library.proxies,
    rules: library.rules,
    exits,
    enabled: library.enabled,
    statusError,
  }
}

function editableProxy(proxy = {}) {
  const profiles = proxy.profiles && typeof proxy.profiles === 'object' ? proxy.profiles : {}
  const exits = proxy.exits && typeof proxy.exits === 'object' ? proxy.exits : {}
  return {
    ...proxy,
    schema_version: proxy.schema_version || 2,
    profiles: Object.fromEntries(Object.entries(profiles).map(([id, profile]) => [id, { ...profile }])),
    exits: Object.fromEntries(Object.entries(exits).map(([country, exitCfg]) => [country, { ...exitCfg }])),
  }
}

async function readSettings() {
  const settings = await onewifiFetch('/api/settings', { trackLoading: false })
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error('无法读取代理')
  }
  return settings
}

async function writeProxy(proxy) {
  await onewifiFetch('/api/settings', {
    method: 'PUT',
    trackLoading: false,
    body: { proxy },
  })
}

function mutateProxy(change) {
  const run = writeQueue.then(async () => {
    const settings = await readSettings()
    const next = editableProxy(libraryFromSettings(settings).proxy)
    change(next)
    await writeProxy(next)
    return next
  })
  writeQueue = run.then(() => {}, () => {})
  return run
}

function requireProfileId(id) {
  const value = String(id || '').trim()
  if (!PROFILE_ID.test(value)) throw new Error('代理 ID 无效')
  return value
}

function applySocks(profile, source) {
  const addr = source.addr || ''
  if (!addr && source.server && source.port) {
    profile.server = String(source.server).trim()
    profile.port = Number(source.port)
  } else {
    const parts = splitProxyAddr(addr || source.server || '')
    if (!parts.host || !parts.port) throw new Error('地址无效')
    profile.server = parts.host
    profile.port = Number(parts.port)
  }
  profile.username = source.username ?? profile.username ?? ''
  profile.password = source.password ?? profile.password ?? ''
}

export async function fetchOnewifiEgressStatus() {
  const settings = await readSettings()
  let live = {}
  let statusError = ''
  try {
    live = await onewifiFetch('/api/egress/status', { trackLoading: false }) || {}
  } catch (err) {
    statusError = err?.message || '无法读取出口状态'
  }
  return projectProxyLibrary(settings, live, statusError)
}

export async function refreshOnewifiEgress() {
  await onewifiFetch('/api/egress/refresh', { method: 'POST', trackLoading: false, body: {} })
  return fetchOnewifiEgressStatus()
}

export function testOnewifiEgress(country) {
  const key = countryKey(country)
  return onewifiFetch(`/api/egress/${encodeURIComponent(key)}/test`, {
    method: 'POST',
    trackLoading: false,
    body: {},
  })
}

export function testOnewifiProxyProfile(id) {
  const profileId = requireProfileId(id)
  return onewifiFetch(`/api/egress/profile/${encodeURIComponent(profileId)}/test`, {
    method: 'POST',
    trackLoading: false,
    body: {},
  })
}

export function probeOnewifiUpstreamDraft(proxy = {}) {
  const profileId = requireProfileId(proxy.id || 'draft')
  const profile = {
    name: String(proxy.name || profileId),
    type: 'socks5',
  }
  applySocks(profile, proxy)
  return onewifiFetch(`/api/egress/profile/${encodeURIComponent(profileId)}/test`, {
    method: 'POST',
    trackLoading: false,
    body: profile,
  })
}

export async function saveOnewifiUpstreamProxy(proxy = {}, { create = false } = {}) {
  const id = requireProfileId(proxy.id)
  const name = String(proxy.name || '').trim()
  if (!name) throw new Error('先填名称')
  return mutateProxy((doc) => {
    const existing = doc.profiles[id]
    if (create && existing) throw new Error('代理 ID 已存在')
    if (!create && !existing) throw new Error('没有这个代理')
    const next = { ...(existing || {}), name, type: existing?.type || 'socks5' }
    if (next.type === 'socks5') applySocks(next, proxy)
    if (proxy.enabled === false) next.enabled = false
    else if (proxy.enabled === true) next.enabled = true
    doc.profiles[id] = next
  })
}

export function deleteOnewifiUpstreamProxy(id) {
  const profileId = requireProfileId(id)
  return mutateProxy((doc) => {
    delete doc.profiles[profileId]
    for (const [country, exitCfg] of Object.entries(doc.exits)) {
      if (String(exitCfg?.profile_id || '') === profileId) delete doc.exits[country]
    }
  })
}

export function patchOnewifiUpstreamProxy(id, body = {}) {
  return saveOnewifiUpstreamProxy({ ...body, id }, { create: false })
}

export async function fetchOnewifiProxyBindings() {
  const { rules } = await fetchOnewifiEgressStatus()
  return rules.map((rule) => ({
    country_code: rule.country_code,
    upstream_proxy_id: rule.upstream_proxy_id,
    enabled: rule.enabled,
  }))
}

export function saveOnewifiProxyBindings(upstreamProxyId, bindings = []) {
  const profileId = requireProfileId(upstreamProxyId)
  const rows = Array.isArray(bindings) ? bindings : []
  if (!rows.length) throw new Error('没有要绑定的国家')
  if (rows.some((item) => /^\d{6,}$/.test(String(item || '')))) {
    throw new Error('当前代理库按国家出口绑定，没有卡号绑定')
  }
  return mutateProxy((doc) => {
    if (!doc.profiles[profileId]) throw new Error('没有这个代理')
    for (const row of rows) {
      const key = countryKey(typeof row === 'string' ? row : row?.country_code || row?.country)
      doc.exits[key] = { ...(doc.exits[key] || {}), profile_id: profileId, enabled: true }
    }
  })
}

export function deleteOnewifiProxyBindings(upstreamProxyId, keys = []) {
  const profileId = requireProfileId(upstreamProxyId)
  const list = Array.isArray(keys) ? keys : []
  if (list.some((item) => /^\d{6,}$/.test(String(item || '')))) {
    throw new Error('当前代理库按国家出口绑定，没有卡号绑定')
  }
  return mutateProxy((doc) => {
    for (const item of list) {
      const key = countryKey(item)
      const exitCfg = doc.exits[key]
      if (exitCfg && String(exitCfg.profile_id || '') === profileId) delete doc.exits[key]
    }
  })
}

export function fetchOnewifiProxyCountries() {
  return COUNTRY_DEFS.map((country) => ({
    country_code: country.iso,
    country_name: country.zh,
    mccs: [],
  }))
}

export async function fetchOnewifiCountryRules() {
  const { rules } = await fetchOnewifiEgressStatus()
  return rules
}

export function saveOnewifiCountryRule(countryCode, body = {}) {
  const key = countryKey(countryCode)
  const profileId = String(body.upstream_proxy_id || body.profile_id || '').trim()
  if (profileId && !PROFILE_ID.test(profileId)) throw new Error('代理 ID 无效')
  return mutateProxy((doc) => {
    if (profileId && !doc.profiles[profileId]) throw new Error('没有这个代理')
    const current = doc.exits[key] || doc.exits[key.toUpperCase()] || {}
    delete doc.exits[key.toUpperCase()]
    doc.exits[key] = {
      ...current,
      profile_id: profileId,
      enabled: body.enabled !== false,
    }
  })
}

export function deleteOnewifiCountryRule(countryCode) {
  const key = countryKey(countryCode)
  return mutateProxy((doc) => {
    delete doc.exits[key]
    delete doc.exits[key.toUpperCase()]
  })
}
