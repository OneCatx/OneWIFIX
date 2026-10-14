import { onewifiFetch } from './onewifi'
import { readUiLanguage } from '../utils/uiLanguage'
import { NOTIFY_URL_MASK, notificationUrls } from '../views/settingsNotifyModel'

function urlList(channel = {}) {
  const urls = notificationUrls(channel)
  const masked = urls.some((item) => item === NOTIFY_URL_MASK)
  const plain = urls.some((item) => item !== NOTIFY_URL_MASK)
  if (masked && plain) {
    throw new Error('掩码地址不能和明文地址一起保存，请一次填入全部地址')
  }
  return urls
}

export async function fetchOnewifiSettings() {
  const [prefs, info, notifications, settings] = await Promise.all([
    onewifiFetch('/api/settings/preferences', { trackLoading: false }).catch(() => ({})),
    onewifiFetch('/api/system/info', { trackLoading: false }).catch(() => ({})),
    onewifiFetch('/api/settings/notifications', { trackLoading: false }).catch(() => ({})),
    onewifiFetch('/api/settings', { trackLoading: false }),
  ])
  const webhook = notifications?.webhook || {}
  return {
    timezone: 'UTC',
    language: readUiLanguage(prefs) || 'zh',
    version: info?.version || 'OneWIFI',
    build_time: info?.build_time || '',
    developer: Boolean(info?.developer),
    device_defaults: {
      cellular_enabled: true,
      vowifi_enabled: true,
      flight_mode: false,
    },
    backups: [],
    webhook: { ...webhook, url: notificationUrls(webhook)[0] || '', urls: notificationUrls(webhook) },
    telegram: notifications?.telegram || {},
    pushplus: notifications?.pushplus || {},
    email: notifications?.email || {},
    bark: notifications?.bark || {},
    wecom: notifications?.wecom || {},
    onetools: notifications?.onetools || {},
    proxy: settings?.proxy && typeof settings.proxy === 'object'
      ? settings.proxy
      : { enabled: false, profiles: {}, exits: {} },
  }
}

export async function saveOnewifiSettings(body = {}) {
  if (body.language) {
    await onewifiFetch('/api/settings/preferences', {
      method: 'PUT',
      body: { language: body.language },
    })
  }
  const channels = ['webhook', 'telegram', 'pushplus', 'email', 'bark', 'wecom', 'onetools']
  const notif = {}
  for (const name of channels) {
    if (!body[name]) continue
    const channel = { ...body[name] }
    if (name === 'webhook' || name === 'bark' || name === 'wecom') {
      channel.urls = urlList(channel)
      delete channel.url
    }
    if (name === 'email' && typeof channel.to_addresses === 'string') {
      channel.to_addresses = channel.to_addresses.split(/[,;\s]+/).filter(Boolean)
    }
    notif[name] = channel
  }
  if (Object.keys(notif).length) {
    await onewifiFetch('/api/settings/notifications', {
      method: 'PUT',
      body: notif,
    })
  }
  return fetchOnewifiSettings()
}

export async function fetchOnewifiNotificationDeliveries() {
  const payload = await onewifiFetch('/api/notifications/deliveries', { trackLoading: false })
  const history = payload?.history || payload?.deliveries || []
  return { deliveries: Array.isArray(history) ? history : [], pending: payload?.pending || [] }
}

export async function clearOnewifiNotificationDeliveries() {
  await onewifiFetch('/api/notifications/deliveries', { method: 'DELETE' })
  return { deliveries: [] }
}

export async function testOnewifiWebhook(channel = {}) {
  const timeout = Number(channel.timeout_ms)
  return onewifiFetch('/api/settings/notifications/webhook/test', {
    method: 'POST',
    body: {
      enabled: true,
      urls: urlList(channel),
      secret: channel.secret ?? '',
      timeout_ms: Number.isFinite(timeout) && timeout > 0 ? timeout : 5000,
    },
  })
}

export function testOnewifiTelegram(channel = {}) {
  return onewifiFetch('/api/settings/notifications/telegram/test', {
    method: 'POST',
    body: {
      enabled: true,
      bot_token: channel.bot_token || '',
      chat_id: channel.chat_id || '',
    },
  })
}

export function testOnewifiPushPlus() {
  return Promise.reject(new Error('PushPlus 不支持连通测试'))
}

export function testOnewifiEmail(channel = {}) {
  return onewifiFetch('/api/settings/notifications/email/test', {
    method: 'POST',
    body: { ...channel, enabled: true },
  })
}

export async function testOnewifiBark(channel = {}) {
  const draft = { ...channel, enabled: true, urls: urlList(channel) }
  delete draft.url
  return onewifiFetch('/api/settings/notifications/bark/test', {
    method: 'POST',
    body: draft,
  })
}

export async function testOnewifiWecom(channel = {}) {
  const draft = { ...channel, enabled: true, urls: urlList(channel) }
  delete draft.url
  return onewifiFetch('/api/settings/notifications/wecom/test', {
    method: 'POST',
    body: draft,
  })
}

export function fetchOnewifiSecurity() {
  return onewifiFetch('/api/settings/security', { trackLoading: false })
}

export function saveOnewifiSecurity(body) {
  return onewifiFetch('/api/settings/security', { method: 'PUT', body })
}

export function fetchOnewifiHttpsSettings() {
  return onewifiFetch('/api/settings/https', { trackLoading: false })
}

export function saveOnewifiHttpsSettings(enabled) {
  return onewifiFetch('/api/settings/https', { method: 'PUT', body: { enabled: Boolean(enabled) } })
}

export function fetchOnewifiVowifiSettings() {
  return onewifiFetch('/api/settings/vowifi', { trackLoading: false })
}

export function saveOnewifiVowifiSettings(mtuCompatibility) {
  return onewifiFetch('/api/settings/vowifi', {
    method: 'PUT',
    body: { mtu_compatibility: Boolean(mtuCompatibility) },
  })
}

export function fetchOnewifiImeiPool() {
  return onewifiFetch('/api/settings/imei-pool', { trackLoading: false })
}

export function saveOnewifiImeiPool(entries) {
  return onewifiFetch('/api/settings/imei-pool', {
    method: 'PUT',
    body: { entries },
  })
}

export function bindOnewifiImeiPool(deviceId) {
  return onewifiFetch('/api/settings/imei-pool/bind', {
    method: 'POST',
    body: { device_id: deviceId },
  })
}

export function fetchOnewifiSmsSettings() {
  return onewifiFetch('/api/settings/sms', { trackLoading: false })
}

export function saveOnewifiSmsSettings(autoClearModemStorage) {
  return onewifiFetch('/api/settings/sms', {
    method: 'PUT',
    body: { auto_clear_modem_storage: Boolean(autoClearModemStorage) },
  })
}

export function fetchOnewifiDeveloperSettings() {
  return onewifiFetch('/api/settings/developer', { trackLoading: false })
}

export function saveOnewifiDeveloperSettings(body) {
  return onewifiFetch('/api/settings/developer', { method: 'PUT', body })
}

export function fetchOnewifiDeveloperMode() {
  return onewifiFetch('/api/settings/developer-mode', { trackLoading: false })
}

export function saveOnewifiDeveloperMode(enabled) {
  return onewifiFetch('/api/settings/developer-mode', { method: 'PUT', body: { enabled: Boolean(enabled) } })
}

export function fetchOnewifiOneToolsPairing() {
  return onewifiFetch('/api/settings/notifications/onetools/pairing', { trackLoading: false })
}

export function rotateOnewifiOneToolsPairing() {
  return onewifiFetch('/api/settings/notifications/onetools/pairing', {
    method: 'POST',
    body: { rotate: true },
  })
}

export function fetchOnewifiLicense() {
  return onewifiFetch('/api/license', { trackLoading: false })
}

export function activateOnewifiLicense(code) {
  return onewifiFetch('/api/license', { method: 'POST', body: { code } })
}

export function exportCardBackup() {
  return onewifiFetch('/api/settings/card-backup', { trackLoading: false })
}

export function validateCardBackup(document) {
  return onewifiFetch('/api/settings/card-backup/validate', {
    method: 'POST',
    body: document,
  })
}

export function restoreCardBackup(document, deviceImei = '') {
  const imei = String(deviceImei || '').trim()
  const query = imei ? `?device_imei=${encodeURIComponent(imei)}` : ''
  return onewifiFetch(`/api/settings/card-backup/restore${query}`, {
    method: 'POST',
    body: document,
  })
}
