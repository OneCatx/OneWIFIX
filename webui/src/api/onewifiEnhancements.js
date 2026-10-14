import { startLoading, stopLoading } from '../stores/globalLoading.js'
import { onewifiErrorMessage, parseOnewifiDetail } from './onewifiDetail.js'
import { getCsrf, getSessionToken, restoreSessionToken } from './onewifi.js'

async function request(path, options = {}) {
  startLoading()
  try {
    const headers = {
      Accept: 'application/json',
      ...(options.headers || {}),
    }
    const session = getSessionToken() || restoreSessionToken()
    if (session) headers.Authorization = `Bearer ${session}`
    const csrf = getCsrf()
    if (csrf && (options.method || 'GET') !== 'GET') headers['X-OneWIFI-CSRF-Token'] = csrf
    const res = await fetch(path, { credentials: 'include', ...options, headers })
    const text = await res.text()
    let payload = null
    try {
      payload = text ? JSON.parse(text) : null
    } catch {
      payload = parseOnewifiDetail(text)
    }
    if (!res.ok) {
      throw new Error(onewifiErrorMessage(payload) || `HTTP ${res.status}`)
    }
    return payload
  } finally {
    stopLoading()
  }
}

export function fetchAddressBook() {
  return request('/api/contacts')
}

export function saveAddressContact(body) {
  return request('/api/contacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function importAddressVCard(vcard) {
  return request('/api/contacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vcard }),
  })
}

export function deleteAddressContact(id) {
  return request(`/api/contacts/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function fetchMMS(deviceId = 'all') {
  const q = deviceId && deviceId !== 'all' ? `?device_id=${encodeURIComponent(deviceId)}` : ''
  return request(`/api/mms${q}`)
}

export function sendMMS(payload) {
  return request('/api/mms/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function fileToMMSAttachment(file) {
  const dataBase64 = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      resolve(result.includes(',') ? result.slice(result.indexOf(',') + 1) : result)
    }
    reader.onerror = () => reject(reader.error || new Error('read file failed'))
    reader.readAsDataURL(file)
  })
  return {
    name: file.name,
    content_type: file.type || undefined,
    data_base64: dataBase64,
  }
}
