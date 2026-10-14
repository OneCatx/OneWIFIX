export const KEYPAD_KEYS = [
  { digit: '1', letters: '' },
  { digit: '2', letters: 'ABC' },
  { digit: '3', letters: 'DEF' },
  { digit: '4', letters: 'GHI' },
  { digit: '5', letters: 'JKL' },
  { digit: '6', letters: 'MNO' },
  { digit: '7', letters: 'PQRS' },
  { digit: '8', letters: 'TUV' },
  { digit: '9', letters: 'WXYZ' },
  { digit: '*', letters: '' },
  { digit: '0', letters: '+' },
  { digit: '#', letters: '' },
]

export function callStateLabel(state) {
  return ({
    ringing: '振铃',
    early_media: '回铃',
    dialing: '拨号中',
    active: '通话中',
    ended: '已结束',
    failed: '失败',
  })[state] || state || '—'
}

export function callDirectionLabel(direction) {
  return direction === 'incoming' ? '来电' : direction === 'outgoing' ? '去电' : (direction || '—')
}

export function isLiveCall(call) {
  const state = String(call?.state || '')
  return state !== 'ended' && state !== 'failed'
}

export function isRingingIncoming(call) {
  return call?.direction === 'incoming' && call?.state === 'ringing'
}

export function handsetCallFrom(list) {
  return (Array.isArray(list) ? list : []).find((call) => {
    if (!call?.id || !call.media_ready) return false
    return call.state === 'active' || call.state === 'ringing' || call.state === 'dialing' || call.state === 'early_media'
  }) || null
}

export function normalizeDialNumber(value) {
  return String(value || '').trim()
}

export function validDialNumber(value) {
  const number = normalizeDialNumber(value)
  if (number.length < 2 || number.length > 32) return false
  return /^\+?[0-9*#]+$/.test(number)
}

export function appendDialKey(current, key) {
  const digit = String(key || '')
  if (!digit || !/^[0-9*#+]$/.test(digit)) return normalizeDialNumber(current)
  const number = normalizeDialNumber(current)
  if (digit === '+' && number.length) return number
  const next = number + digit
  if (next.length > 32) return number
  if (!/^\+?[0-9*#]*$/.test(next)) return number
  return next
}

export function backspaceDial(current) {
  return normalizeDialNumber(current).slice(0, -1)
}

export function parseCallsPayload(payload) {
  if (Array.isArray(payload?.calls)) return payload.calls
  if (Array.isArray(payload)) return payload
  return []
}

export function parseCallEventsPayload(payload) {
  const devices = Array.isArray(payload?.devices) ? payload.devices : []
  return devices
    .filter((item) => item && typeof item.device_id === 'string' && item.device_id)
    .map((item) => ({
      deviceId: item.device_id,
      calls: parseCallsPayload(item.calls),
      ready: item.ready !== false,
    }))
}


export function pickPreferredCallDevice(list, selectedId = '') {
  const devices = Array.isArray(list) ? list : []
  if (devices.some((item) => item && item.id === selectedId)) return selectedId
  const imsReady = devices.find((item) => item?.vowifi_runtime?.ims_ready || item?.vowifi_active)
  if (imsReady?.id) return imsReady.id
  const radioReady = devices.find((item) => item?.radio_registered)
  if (radioReady?.id) return radioReady.id
  return devices[0]?.id || ''
}
export function findIncomingCallDevice(devices, selectedId = '', busy = false) {
  const list = Array.isArray(devices) ? devices : []
  const current = list.find((device) => device.deviceId === selectedId)
  // 当前会话优先，另一线路的来电不能抢走正在使用的听筒。
  if (busy || liveCallsFrom(current?.calls).length) return selectedId
  return list.find((device) => device.calls.some(isRingingIncoming))?.deviceId || selectedId
}

export function liveCallsFrom(list) {
  return (Array.isArray(list) ? list : []).filter(isLiveCall)
}

export function hangupTargetsOnLeave(owned, observed, deviceId) {
  const live = liveCallsFrom(observed)
  return (Array.isArray(owned) ? owned : []).filter((call) =>
    call?.deviceId === deviceId && Boolean(call.id && call.started_at) &&
    live.some((seen) => seen?.id === call.id && seen?.started_at === call.started_at),
  )
}

export function createCallPageOwnership({ fetchCalls, hangupCall }) {
  const owned = new Map()
  const hangupStates = new Map()
  let left = false

  function key(call) {
    return JSON.stringify([call.deviceId, call.id, call.started_at])
  }

  function stateFor(identityKey) {
    if (!hangupStates.has(identityKey)) {
      hangupStates.set(identityKey, { pending: null, cleanup: null, succeeded: false })
    }
    return hangupStates.get(identityKey)
  }

  function startHangup(call) {
    const identityKey = key(call)
    const state = stateFor(identityKey)
    if (state.succeeded) return Promise.resolve()
    if (state.pending) return state.pending
    const request = (async () => {
      try {
        await hangupCall(call.deviceId, call.id)
        state.succeeded = true
        owned.delete(identityKey)
      } finally {
        state.pending = null
      }
    })()
    state.pending = request
    return request
  }

  function cleanup(call) {
    const state = stateFor(key(call))
    if (state.succeeded) return Promise.resolve()
    if (state.cleanup) return state.cleanup
    const request = (async () => {
      try {
        while (!state.succeeded) {
          if (state.pending) {
            try { await state.pending } catch { /* Recheck before cleaning a failed manual hangup. */ }
            if (state.succeeded) return
          }
          const current = parseCallsPayload(await fetchCalls(call.deviceId))
          if (!hangupTargetsOnLeave([call], current, call.deviceId).length) return
          if (state.succeeded) return
          if (state.pending) continue
          await startHangup(call)
          return
        }
      } catch {
        // Leaving the page must not hang up a call whose identity cannot be verified.
      }
    })()
    state.cleanup = request
    void request.then(() => { if (state.cleanup === request) state.cleanup = null })
    return request
  }

  return {
    record(deviceId, call) {
      if (!deviceId || !call?.id || !call?.started_at || !isLiveCall(call)) return Promise.resolve()
      const identity = { deviceId, id: call.id, started_at: call.started_at }
      if (hangupStates.get(key(identity))?.succeeded) return Promise.resolve()
      if (left) return cleanup(identity)
      owned.set(key(identity), identity)
      return Promise.resolve()
    },
    hangup(deviceId, call) {
      if (!deviceId || !call?.id || !call?.started_at) return hangupCall(deviceId, call?.id)
      return startHangup({ deviceId, id: call.id, started_at: call.started_at })
    },
    async leave() {
      if (left) return
      left = true
      const targets = [...owned.values()]
      owned.clear()
      await Promise.all(targets.map(cleanup))
    },
  }
}

export function persistedCallsFromHistory(payload) {
  const rows = payload?.calls
  return Array.isArray(rows) ? rows : []
}

export function historyCallsFrom(list) {
  return (Array.isArray(list) ? list : [])
    .filter((call) => !isLiveCall(call))
    .slice()
    .reverse()
}

export function formatCallTime(value) {
  if (!value || String(value).startsWith('0001-')) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

export function imeiLooksBound(device) {
  const digits = String(device?.imei || device?.modem?.imei || '').replace(/\D/g, '')
  return digits.length === 15 || digits.length === 16
}
