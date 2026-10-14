const SCHEME_PREFIX = /^[a-zA-Z][a-zA-Z0-9+.-]*:/

export function normalizePairingOrigin(raw) {
  const text = String(raw || '').trim()
  if (!text) return ''
  const candidate = SCHEME_PREFIX.test(text) ? text : `http://${text}`
  let parsed
  try {
    parsed = new URL(candidate)
  } catch {
    return ''
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
  if (!parsed.hostname) return ''
  return `${parsed.protocol}//${parsed.host}`
}

export function rewritePairingPayload({ uri = '', json = '', origin = '' } = {}) {
  const nextOrigin = normalizePairingOrigin(origin)
  if (!nextOrigin) return { uri: '', json: '' }
  const token = pairingTokenOf(uri, json)
  const nextUri = token ? pairingUriFor(nextOrigin, token) : ''
  let nextJson = ''
  if (json) {
    try {
      const payload = JSON.parse(json)
      if (payload && typeof payload === 'object') {
        payload.u = nextOrigin
        nextJson = JSON.stringify(payload)
      }
    } catch {
      nextJson = ''
    }
  }
  return { uri: nextUri, json: nextJson }
}

function pairingTokenOf(uri, json) {
  const query = queryOf(uri)
  const fromUri = query.get('t') || query.get('token')
  if (fromUri) return fromUri
  try {
    const payload = JSON.parse(json)
    const token = payload?.t || payload?.token
    return token ? String(token) : ''
  } catch {
    return ''
  }
}

function queryOf(uri) {
  const text = String(uri || '')
  const index = text.indexOf('?')
  if (index < 0) return new URLSearchParams()
  return new URLSearchParams(text.slice(index + 1))
}

function pairingUriFor(origin, token) {
  const query = new URLSearchParams()
  query.set('t', token)
  query.set('u', origin)
  return `onetools://onewifi?${query.toString()}`
}
