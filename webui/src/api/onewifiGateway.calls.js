import { getSessionToken, onewifiFetch, resolveOnewifiURL } from './onewifi'
import { readSseJson } from './sse'

export async function streamCallEvents({ signal, onEvent } = {}) {
  const response = await onewifiFetch('/api/calls/events', {
    trackLoading: false,
    signal,
    asResponse: true,
    headers: { Accept: 'text/event-stream' },
  })
  return readSseJson(response, onEvent, { collect: false })
}

export function fetchDeviceCalls(deviceId) {
  return onewifiFetch(`/api/devices/${encodeURIComponent(deviceId)}/calls`, { trackLoading: false })
}

export function fetchDeviceCallHistory(deviceId) {
  return onewifiFetch(`/api/devices/${encodeURIComponent(deviceId)}/calls/history`, { trackLoading: false })
}

export function exportDeviceCallHistoryURL(deviceId) {
  return resolveOnewifiURL(`/api/devices/${encodeURIComponent(deviceId)}/calls/history/export`)
}

export function dialDeviceCall(deviceId, number) {
  return onewifiFetch(`/api/devices/${encodeURIComponent(deviceId)}/calls/dial`, {
    method: 'POST',
    body: { number },
  })
}

export function answerDeviceCall(deviceId, id) {
  return onewifiFetch(`/api/devices/${encodeURIComponent(deviceId)}/calls/answer`, {
    method: 'POST',
    body: { id },
  })
}

export function hangupDeviceCall(deviceId, id) {
  return onewifiFetch(`/api/devices/${encodeURIComponent(deviceId)}/calls/hangup`, {
    method: 'POST',
    body: { id },
  })
}

export function deviceCallMediaSocketURL(deviceId, callId, origin, accessToken) {
  const path = `/api/devices/${encodeURIComponent(deviceId)}/calls/media?id=${encodeURIComponent(callId)}`
  const loc = origin || (typeof window !== 'undefined' ? window.location : { protocol: 'http:', host: 'localhost' })
  const httpURL = resolveOnewifiURL(path)
  const url = new URL(httpURL, `${loc.protocol}//${loc.host}`)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  const token = accessToken === undefined ? getSessionToken() : accessToken
  if (token) url.searchParams.set('access_token', token)
  return url.toString()
}
