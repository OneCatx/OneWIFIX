/** OneWifi 上游地址解析 — 支持 LAN / 公网 / HTTPS 反代 / 可选端口 */

export const DEFAULT_ONEWIFI_PORT = 6688

const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/
const IPV6_RE = /^\[[\da-f:]+\]$|^[\da-f:]+:[\da-f:]*[\da-f]$/i

function trimInput(value) {
  return String(value ?? '').trim()
}

function isIpAddress(host) {
  const h = trimInput(host).replace(/^\[/, '').replace(/\]$/, '')
  return IPV4_RE.test(h) || IPV6_RE.test(h) || h === 'localhost'
}

function isLikelyDomain(host) {
  const h = trimInput(host).split('/')[0].split(':')[0]
  if (!h || isIpAddress(h)) return false
  return h.includes('.') || /^[a-z0-9-]+$/i.test(h)
}

/** @returns {'http'|'https'} */
export function detectOneWifiProtocol(host, explicitPort = null) {
  const raw = trimInput(host)
  if (/^https:\/\//i.test(raw)) return 'https'
  if (/^http:\/\//i.test(raw)) return 'http'

  const bare = raw.replace(/^https?:\/\//i, '').split('/')[0].split(':')[0]
  if (isLikelyDomain(bare) && (explicitPort == null || explicitPort === '')) return 'https'
  return 'http'
}

function formatHostForUrl(hostname) {
  const h = trimInput(hostname)
  if (IPV6_RE.test(h) && !h.startsWith('[')) return `[${h}]`
  return h
}

function buildOrigin(protocol, hostname, port) {
  const host = formatHostForUrl(hostname)
  const p = port == null || port === '' ? null : Number(port)
  if (p != null && Number.isFinite(p) && p > 0) {
    const isDefault = (protocol === 'https' && p === 443) || (protocol === 'http' && p === 80)
    if (!isDefault) return `${protocol}://${host}:${p}`
  }
  return `${protocol}://${host}`
}

function resolveImplicitPort(protocol, hostname, explicitPort) {
  if (explicitPort != null && explicitPort !== '') {
    const n = Number(explicitPort)
    if (Number.isFinite(n) && n > 0) return n
  }
  const bare = trimInput(hostname).replace(/^\[/, '').replace(/\]$/, '')
  if (protocol === 'https') return null
  if (isIpAddress(bare) || bare === 'localhost') return DEFAULT_ONEWIFI_PORT
  if (isLikelyDomain(bare)) return null
  return DEFAULT_ONEWIFI_PORT
}

/**
 * @param {{ host?: string, port?: string|number|null }} input
 * @returns {{
 *   host: string,
 *   port: number|null,
 *   protocol: 'http'|'https',
 *   origin: string,
 *   baseUrl: string,
 *   displayHost: string,
 * }}
 */
export function normalizeOneWifiEndpoint(input = {}) {
  let hostField = trimInput(input.host)
  let explicitPort = input.port
  if (explicitPort === '' || explicitPort === undefined) explicitPort = null
  else if (explicitPort != null) {
    const n = Number(explicitPort)
    explicitPort = Number.isFinite(n) && n > 0 ? n : null
  }

  if (!hostField) {
    return {
      host: '',
      port: null,
      protocol: 'http',
      origin: '',
      baseUrl: '',
      displayHost: '',
    }
  }

  if (/^https?:\/\//i.test(hostField)) {
    try {
      const url = new URL(hostField.includes('://') ? hostField : `http://${hostField}`)
      const protocol = url.protocol.replace(':', '')
      const hostname = url.hostname
      const urlPort = url.port ? Number(url.port) : null
      const port = explicitPort ?? urlPort
      const path = url.pathname.replace(/\/api\/?$/i, '').replace(/\/+$/, '')
      let origin = buildOrigin(protocol, hostname, port)
      if (path && path !== '/') origin += path
      origin = origin.replace(/\/+$/, '')
      return {
        host: hostField.replace(/\/+$/, ''),
        port,
        protocol,
        origin,
        baseUrl: `${origin.replace(/\/api$/i, '')}/api`,
        displayHost: hostField.replace(/\/+$/, ''),
      }
    } catch {
      return {
        host: hostField,
        port: explicitPort,
        protocol: detectOneWifiProtocol(hostField, explicitPort),
        origin: '',
        baseUrl: '',
        displayHost: hostField,
      }
    }
  }

  let hostname = hostField
  let embeddedPort = null
  const hostPortMatch = hostField.match(/^(\[[\da-f:]+\]|[^:/]+):(\d+)$/i)
  if (hostPortMatch) {
    hostname = hostPortMatch[1]
    embeddedPort = Number(hostPortMatch[2])
  }

  const protocol = detectOneWifiProtocol(hostname, explicitPort ?? embeddedPort)
  const port = explicitPort ?? embeddedPort ?? resolveImplicitPort(protocol, hostname, null)
  const origin = buildOrigin(protocol, hostname, port)

  return {
    host: hostField,
    port: port ?? null,
    protocol,
    origin,
    baseUrl: `${origin}/api`,
    displayHost: hostField,
  }
}

/** 去掉末尾 /api，避免拼出 /api/api/... */
export function normalizeOneWifiOrigin(host = '') {
  const norm = normalizeOneWifiEndpoint({ host })
  return norm.origin || trimInput(host).replace(/\/api\/?$/i, '').replace(/\/+$/, '')
}

/** @deprecated 使用 normalizeOneWifiEndpoint */
export function buildOneWifiBaseUrl(origin = '') {
  const base = normalizeOneWifiOrigin(origin)
  return base ? `${base}/api` : ''
}

export function buildOneWifiUpstreamOrigin(input = {}) {
  return normalizeOneWifiEndpoint(input).origin
}

function urlDefaultPort(protocol) {
  if (protocol === 'https:' || protocol === 'https') return '443'
  if (protocol === 'http:' || protocol === 'http') return '80'
  return ''
}

function effectiveUrlPort(url) {
  if (url?.port) return String(url.port)
  return urlDefaultPort(url?.protocol)
}

function pageLocation(loc) {
  if (!loc) return null
  try {
    if (loc.origin) return new URL(loc.origin)
    return new URL(`${loc.protocol}//${loc.hostname}${loc.port ? `:${loc.port}` : ''}`)
  } catch {
    return null
  }
}

function hostFieldHasExplicitPort(hostField) {
  const raw = trimInput(hostField)
  if (!raw) return false
  if (/^https?:\/\//i.test(raw)) {
    try {
      return Boolean(new URL(raw).port)
    } catch {
      return false
    }
  }
  return /^(\[[\da-f:]+\]|[^:/]+):(\d+)$/i.test(raw)
}

/** True when origin is this page's host+port, even if http/https differ. */
export function onewifiOriginMatchesPage(origin, loc = typeof location === 'undefined' ? null : location) {
  const raw = String(origin || '').trim().replace(/\/+$/, '')
  if (!raw || !loc) return false
  try {
    const target = new URL(raw.includes('://') ? raw : `http://${raw}`)
    const page = pageLocation(loc)
    if (!page) return false
    if (target.origin === page.origin) return true
    return target.hostname === page.hostname && effectiveUrlPort(target) === effectiveUrlPort(page)
  } catch {
    return false
  }
}

/**
 * Saved board cards often omit the port, which becomes DEFAULT_ONEWIFI_PORT (6688)
 * while this page may be :6699. Same hostname + implicit default still means this box.
 */
export function onewifiEndpointIsThisBoard(input = {}, loc = typeof location === 'undefined' ? null : location) {
  const hostField = trimInput(input.host)
  if (!hostField || !loc) return false
  const norm = normalizeOneWifiEndpoint(input)
  if (onewifiOriginMatchesPage(norm.origin, loc)) return true
  try {
    const target = new URL(norm.origin.includes('://') ? norm.origin : `http://${norm.origin}`)
    const page = pageLocation(loc)
    if (!page || target.hostname !== page.hostname) return false
    const explicitPort = input.port != null && input.port !== ''
    if (explicitPort || hostFieldHasExplicitPort(hostField)) return false
    return Number(effectiveUrlPort(target)) === DEFAULT_ONEWIFI_PORT
  } catch {
    return false
  }
}

/**
 * @param {string} host
 * @param {string|number|null} [port]
 * @returns {{ ok: true, value: ReturnType<typeof normalizeOneWifiEndpoint> } | { ok: false, error: string }}
 */
export function parseOneWifiEndpointInput(host, port = null) {
  const hostField = trimInput(host)
  if (!hostField) {
    return { ok: false, error: '请填写主机或 URL' }
  }

  if (/^https?:\/\//i.test(hostField)) {
    try {
      // eslint-disable-next-line no-new
      new URL(hostField)
    } catch {
      return { ok: false, error: 'URL 格式无效，请检查协议与地址' }
    }
  } else if (/^[\w.-]+:\/\//.test(hostField)) {
    return { ok: false, error: '仅支持 http:// 或 https:// 协议' }
  }

  const norm = normalizeOneWifiEndpoint({ host: hostField, port })
  if (!norm.origin) {
    return { ok: false, error: '无法解析 OneWifi 地址，请检查主机或 URL' }
  }

  return { ok: true, value: norm }
}
