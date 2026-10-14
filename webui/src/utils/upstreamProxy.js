export function composeProxyAddr(host, port) {
  const hostname = String(host || '').trim().replace(/^\[|\]$/g, '')
  const portText = String(port || '').trim()
  if (!hostname) throw new Error('先填 IP 或主机')
  const portNumber = Number(portText)
  if (!/^\d+$/.test(portText) || portNumber < 1 || portNumber > 65535) {
    throw new Error('端口要在 1–65535')
  }
  if (hostname.includes(':')) return `[${hostname}]:${portText}`
  return `${hostname}:${portText}`
}

export function proxyIdFromAddr(addr) {
  const slug = String(addr || '')
    .replace(/^\[|\]$/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  if (!slug) return 'proxy'
  if (!/^[a-zA-Z0-9]/.test(slug)) return `p-${slug}`.slice(0, 64)
  return slug
}

export function uniqueProxyId(addr, existing = []) {
  const base = proxyIdFromAddr(addr)
  const taken = new Set((existing || []).map((item) => String(item?.id || '').trim()).filter(Boolean))
  if (!taken.has(base)) return base
  for (let index = 2; index < 100; index += 1) {
    const next = `${base.slice(0, 61)}-${index}`.slice(0, 64)
    if (!taken.has(next)) return next
  }
  return `${base.slice(0, 50)}-${Date.now()}`.slice(0, 64)
}

export function proxyDisplayName(item) {
  const name = String(item?.name || '').trim()
  if (name) return name
  return String(item?.addr || item?.id || '').trim()
}

export function matchCountryRule(code, rules = []) {
  const raw = String(code || '').trim().toUpperCase()
  if (!raw || raw === 'GLOBAL') return null
  const aliases = new Set(raw === 'UK' || raw === 'GB' ? ['UK', 'GB'] : [raw])
  return (rules || []).find((rule) => {
    const key = String(rule.country_code || rule.country || rule.id || '').toUpperCase()
    return aliases.has(key)
  }) || null
}

export function proxyLabelForCountry(countryCode, proxies = [], rules = []) {
  const rule = matchCountryRule(countryCode, rules)
  if (!rule || rule.enabled === false || !rule.upstream_proxy_id) return '直连'
  const proxy = (proxies || []).find((item) => String(item?.id || '') === String(rule.upstream_proxy_id))
  return proxyDisplayName(proxy || { id: rule.upstream_proxy_id })
}

export function splitProxyAddr(addr) {
  const text = String(addr || '').trim()
  const ipv6 = text.match(/^\[([^\]]+)\]:(\d+)$/)
  if (ipv6) return { host: ipv6[1], port: ipv6[2] }
  const index = text.lastIndexOf(':')
  if (index <= 0) return { host: text, port: '' }
  return { host: text.slice(0, index), port: text.slice(index + 1) }
}
