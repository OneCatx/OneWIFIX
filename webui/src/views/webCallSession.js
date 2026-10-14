import { createCallEngine } from './callEngine.js'

let engine = null
let lineId = ''
let ready = false
let incoming = null
let live = []
let lastError = ''
let generation = 0
const listeners = new Set()

function snapshot() {
  return { ready, lineId, incoming, live, lastError, mode: engine?.mode || 'none' }
}

function emit() {
  const snap = snapshot()
  for (const fn of listeners) {
    try {
      fn(snap)
    } catch {
      /* a listener cannot break the session */
    }
  }
}

export function subscribeWebCall(fn) {
  listeners.add(fn)
  try {
    fn(snapshot())
  } catch {
    /* ignore */
  }
  return () => listeners.delete(fn)
}

export function stopWebCall() {
  generation += 1
  try {
    engine?.stop()
  } catch {
    /* ignore */
  }
  engine = null
  ready = false
  lineId = ''
  incoming = null
  live = []
  lastError = ''
  emit()
}

export async function bindWebCallLine(line, origin) {
  const next = String(line || '').trim()
  if (!next) {
    stopWebCall()
    lastError = '未绑定线路，线路操作已禁用'
    ready = false
    emit()
    return snapshot()
  }
  if (engine && ready && next === lineId) return snapshot()
  const gen = ++generation
  ready = false
  try {
    engine?.stop()
  } catch {
    /* ignore */
  }
  engine = createCallEngine({
    onEvent(type, data) {
      if (gen !== generation) return
      if (type === 'engine') {
        ready = data?.mode === 'mdd'
        lineId = data?.lineId || lineId
        if (ready) lastError = ''
        else if (!lastError) lastError = '语音引擎不可用'
        if (!ready) incoming = null
        emit()
      } else if (type === 'engine-failed') {
        ready = false
        incoming = null
        lastError = data?.message || '语音引擎不可用'
        emit()
      } else if (type === 'mdd:incoming') {
        incoming = { id: 'webrtc', number: '' }
        live = [{
          id: 'webrtc-incoming',
          number: '',
          direction: 'incoming',
          state: 'ringing',
          started_at: new Date().toISOString(),
        }, ...live.filter((item) => item.id !== 'webrtc-incoming' && item.state !== 'ended' && item.state !== 'failed')]
        emit()
      } else if (type === 'mdd:accepted') {
        incoming = null
        live = live.map((item) => (
          item.state === 'dialing' || item.state === 'ringing' ? { ...item, state: 'active' } : item
        ))
        emit()
      } else if (type === 'mdd:ended' || type === 'mdd:failed') {
        incoming = null
        const state = type === 'mdd:failed' ? 'failed' : 'ended'
        live = live.map((item) => (
          item.state === 'ended' || item.state === 'failed' ? item : { ...item, state }
        ))
        emit()
      } else if (type === 'mdd:registrationFailed') {
        ready = false
        lastError = '语音注册失败'
        emit()
      }
    },
  })
  incoming = null
  live = []
  const pageOrigin = origin || (globalThis.location?.origin || '')
  const result = await engine.bootstrap({ origin: pageOrigin, line: next })
  ready = result?.mode === 'mdd'
  lineId = result?.lineId || ''
  if (!ready) lastError = lastError || '语音引擎不可用'
  emit()
  return snapshot()
}

export async function dialWebCall(number) {
  if (!engine || !ready) throw new Error(lastError || '语音引擎不可用')
  const row = {
    id: `webrtc-${Date.now()}`,
    number: String(number || ''),
    direction: 'outgoing',
    state: 'dialing',
    started_at: new Date().toISOString(),
  }
  live = [...live.filter((item) => item.state !== 'ended' && item.state !== 'failed'), row]
  emit()
  try {
    return await engine.dial(number)
  } catch (err) {
    live = live.map((item) => (item.id === row.id ? { ...item, state: 'failed' } : item))
    emit()
    throw err
  }
}

export async function answerWebCall() {
  if (!engine || !ready) throw new Error(lastError || '语音引擎不可用')
  return engine.answer()
}

export async function hangupWebCall() {
  if (!engine || !ready) throw new Error(lastError || '语音引擎不可用')
  incoming = null
  live = live.map((item) => (
    item.state === 'ended' || item.state === 'failed' ? item : { ...item, state: 'ended' }
  ))
  emit()
  return engine.hangup()
}
