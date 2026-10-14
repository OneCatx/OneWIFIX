/**
 * JsSIP WebRTC phone bound to MDD voice engine (P0).
 * Used by OneBoard Calls page as the primary call path.
 */
import JsSIP from 'jssip'
import {
  dialLine,
  fetchSoftphone,
  hangupLine,
  loginVoice,
  setVoiceOrigin,
  softphoneWsUrl,
} from '../api/mddVoice.js'

export function registrationReady(ua, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => finish(new Error('语音注册超时')), timeoutMs)
    function finish(err) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (err) reject(err)
      else resolve()
    }
    ua.on('registered', () => finish())
    ua.on('registrationFailed', (event) => finish(new Error(event?.cause || '语音注册失败')))
  })
}

export async function initMddVoice({ origin, username, password }) {
  setVoiceOrigin(origin)
  return loginVoice(username, password)
}

export function createMddWebPhone({ lineId, audioEl, onEvent }) {
  let ua = null
  let session = null
  let localStream = null

  const emit = (type, data) => {
    try {
      onEvent?.(type, data)
    } catch {
      /* ignore */
    }
  }

  function ensureAudio() {
    if (audioEl) return audioEl
    const el = new Audio()
    el.autoplay = true
    el.setAttribute('playsinline', '')
    el.style.display = 'none'
    document.body.appendChild(el)
    return el
  }

  async function unlockAudio() {
    const el = ensureAudio()
    try {
      el.muted = true
      await el.play()
      el.muted = false
    } catch {
      /* autoplay policy */
    }
  }

  async function localMedia() {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      return localStream
    } catch (err) {
      emit('media-fail', err?.name || 'media')
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const dest = ctx.createMediaStreamDestination()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      gain.gain.value = 0
      osc.connect(gain).connect(dest)
      osc.start()
      localStream = dest.stream
      return localStream
    }
  }

  function bindSession(sess) {
    session = sess
    sess.on('peerconnection', (e) => {
      e.peerconnection.ontrack = (ev) => {
        const el = ensureAudio()
        el.srcObject = ev.streams[0] || new MediaStream([ev.track])
        el.play?.().catch(() => {})
      }
    })
    sess.on('accepted', () => emit('accepted', {}))
    sess.on('ended', () => {
      session = null
      emit('ended', {})
    })
    sess.on('failed', (e) => {
      session = null
      emit('failed', { cause: e?.cause || 'failed' })
    })
  }

  return {
    get session() {
      return session
    },
    async register() {
      await unlockAudio()
      const prov = await fetchSoftphone(lineId)
      const username = prov?.username || 'webrtc'
      const host = prov?.host || 'onewifi.local'
      const uri = prov?.uri || prov?.sip_uri || `sip:${username}@${host}`
      const socket = new JsSIP.WebSocketInterface(softphoneWsUrl(lineId))
      ua = new JsSIP.UA({
        sockets: [socket],
        uri,
        password: prov?.password || '',
        display_name: prov?.display_name || 'OneBoard',
        register: true,
        session_timers: false,
      })
      ua.on('registered', () => emit('registered', { uri }))
      ua.on('registrationFailed', (e) => emit('registrationFailed', e))
      ua.on('newRTCSession', (e) => {
        bindSession(e.session)
        if (e.originator === 'remote') emit('incoming', { session: e.session })
      })
      const ready = registrationReady(ua)
      ua.start()
      await ready
      return prov
    },
    /** Control-plane dial (engine originates); WebRTC session comes via newRTCSession. */
    async dial(number) {
      await unlockAudio()
      await localMedia()
      return dialLine(lineId, number)
    },
    /** Local WebRTC dial via JsSIP (engine must expose SIP-WS). */
    async dialWebRTC(number) {
      if (!ua) throw new Error('voice not registered')
      await unlockAudio()
      await localMedia()
      const sess = ua.call(number, {
        mediaConstraints: { audio: true, video: false },
        pcConfig: { iceServers: [] },
      })
      bindSession(sess)
      return sess
    },
    answer() {
      if (!session) throw new Error('no incoming session')
      session.answer({ mediaConstraints: { audio: true, video: false } })
    },
    async hangup() {
      try {
        session?.terminate()
      } catch {
        /* ignore */
      }
      session = null
      try {
        await hangupLine(lineId)
      } catch {
        /* ignore */
      }
    },
    stop() {
      try {
        session?.terminate()
      } catch {
        /* ignore */
      }
      try {
        ua?.stop()
      } catch {
        /* ignore */
      }
      ua = null
      session = null
      localStream?.getTracks?.().forEach((t) => t.stop())
    },
  }
}
