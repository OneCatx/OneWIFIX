export const NOTIFY_TABS = [
  { key: 'telegram', label: 'Telegram' },
  { key: 'bark', label: 'Bark' },
  { key: 'email', label: 'Email' },
  { key: 'pushplus', label: 'PushPlus' },
  { key: 'webhook', label: 'Webhook' },
  { key: 'wecom', label: '企业微信' },
  { key: 'onetools', label: 'OneTools' },
]

export function emptyNotify() {
  return {
    webhook: { enabled: false, url: '', secret: '', timeout_ms: 5000 },
    telegram: { enabled: false, bot_token: '', chat_id: '', admin_id: '', base_url: '', proxy: '' },
    pushplus: { enabled: false, token: '', topic: '', channel: '' },
    email: {
      enabled: false, smtp_host: '', smtp_port: 465, use_ssl: true,
      username: '', password: '', from_address: '', to_addresses: '',
    },
    bark: { enabled: false, url: '', group: '', icon: '', level: 'active' },
    wecom: { enabled: false, url: '', payload_template: '' },
    onetools: { enabled: false, public_base_url: '' },
  }
}

export const NOTIFY_URL_MASK = '********'

export function notificationUrls(channel = {}) {
  const listed = Array.isArray(channel.urls)
    ? channel.urls.map((item) => String(item ?? '').trim()).filter(Boolean)
    : []
  const edited = String(channel.url ?? '').trim()
  if (!listed.length) return edited ? [edited] : []
  if (!edited || edited === listed[0]) return listed
  return [edited, ...listed.slice(1)]
}

export function firstUrl(channel = {}) {
  return notificationUrls(channel)[0] || ''
}

export function urlLines(channel = {}) {
  return notificationUrls(channel).join('\n')
}

export function urlsFromText(text) {
  const urls = String(text ?? '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
  return { url: urls[0] || '', urls }
}

export function hydrateNotify(raw) {
  const next = emptyNotify()
  for (const key of Object.keys(next)) {
    const src = raw?.[key] && typeof raw[key] === 'object' ? raw[key] : {}
    next[key] = { ...next[key], ...src }
    if (key === 'webhook' || key === 'bark' || key === 'wecom') {
      const urls = notificationUrls(next[key])
      next[key].urls = urls
      next[key].url = urls[0] || ''
    }
    if (key === 'email' && Array.isArray(next[key].to_addresses)) {
      next[key].to_addresses = next[key].to_addresses.join(', ')
    }
  }
  return next
}
