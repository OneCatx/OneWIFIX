/**
 * Browser call engine. Audio stays on the current MDD softphone.
 */
import { createMddWebPhone, initMddVoice } from './mddWebPhone.js'
import { fetchLineStatus, setVoiceOrigin, softphoneWsUrl } from '../api/mddVoice.js'

export function createCallEngine({ audioEl, onEvent } = {}) {
  let mode = 'none'
  let mddPhone = null
  let lineId = ''
  let mddReady = false

  const emit = (type, data) => {
    try {
      onEvent?.(type, data)
    } catch {
      /* ignore */
    }
  }

  return {
    get mode() {
      return mode
    },
    get mddReady() {
      return mddReady
    },
    get lineId() {
      return lineId
    },

    async bootstrap({ origin, username, password, line } = {}) {
      const pageOrigin = origin || (globalThis.location?.origin || '')
      if (!pageOrigin) throw new Error('缺少语音地址')
      setVoiceOrigin(pageOrigin)
      try {
        if (username && password) {
          await initMddVoice({ origin: pageOrigin, username, password })
        }
        lineId = String(line || '').trim()
        if (!lineId) throw new Error('未选择线路')
        mddPhone = createMddWebPhone({
          lineId,
          audioEl,
          onEvent: (type, data) => emit(`mdd:${type}`, data),
        })
        await mddPhone.register()
        mode = 'mdd'
        mddReady = true
        emit('engine', { mode: 'mdd', lineId })
        return { mode, lineId }
      } catch (err) {
        mode = 'none'
        mddReady = false
        mddPhone = null
        emit('engine-failed', { message: err?.message || String(err) })
        emit('engine', { mode: 'none' })
        return { mode: 'none', lineId: '' }
      }
    },

    async dial(number) {
      if (mode === 'mdd' && mddPhone) {
        const result = await mddPhone.dial(number)
        emit('dialing', { number, mode: 'mdd' })
        return result
      }
      throw new Error('call engine not ready')
    },

    answer() {
      if (mode === 'mdd' && mddPhone) return mddPhone.answer()
      throw new Error('call engine not ready')
    },

    async hangup() {
      if (mode === 'mdd' && mddPhone) return mddPhone.hangup()
      throw new Error('语音引擎不可用')
    },

    async status() {
      if (mode === 'mdd' && lineId) {
        return fetchLineStatus(lineId)
      }
      return null
    },

    stop() {
      try {
        mddPhone?.stop()
      } catch {
        /* ignore */
      }
      mddPhone = null
      mode = 'none'
      mddReady = false
    },
  }
}

export { softphoneWsUrl, setVoiceOrigin }
