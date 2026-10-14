/**
 * Auto-answer helper for incoming IMS calls.
 * Carriers (e.g. ATT) CANCEL quickly after 180; the web must answer in one tick.
 */
export function createAutoAnswer({ enabled, answer, onStatus } = {}) {
  let timer = null
  let lastKey = ''
  let active = false

  function clear() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  return {
    get active() {
      return active
    },
    setEnabled(value) {
      active = Boolean(value)
      if (!active) clear()
    },
    /** Call whenever the live call list changes. */
    consider(call, deviceId) {
      if (!active || !call?.id || !deviceId) return
      const key = `${deviceId}:${call.id}`
      if (key === lastKey) return
      lastKey = key
      clear()
      const delayMs = 0
      timer = setTimeout(async () => {
        try {
          onStatus?.('正在自动接听…')
          await answer(deviceId, call.id)
          onStatus?.('已自动接听')
        } catch (err) {
          onStatus?.(err?.message || '自动接听失败，请手动接听')
        }
      }, delayMs)
    },
    dispose() {
      clear()
      lastKey = ''
    },
  }
}

export function loadAutoAnswerPreference(storage = globalThis?.localStorage) {
  try {
    return storage?.getItem('onewifi.autoAnswer') !== '0'
  } catch {
    return true
  }
}

export function saveAutoAnswerPreference(enabled, storage = globalThis?.localStorage) {
  try {
    storage?.setItem('onewifi.autoAnswer', enabled ? '1' : '0')
  } catch {
    /* ignore */
  }
}
