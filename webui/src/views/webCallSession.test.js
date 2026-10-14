import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const banner = readFileSync(join(here, '../components/GlobalCallBanner.vue'), 'utf8')
const phone = readFileSync(join(here, 'mddWebPhone.js'), 'utf8')

describe('web call session', () => {
  it('does not answer a global banner through the handset PCM API', () => {
    assert.match(banner, /answerWebCall/)
    assert.match(banner, /hangupWebCall/)
    assert.doesNotMatch(banner, /answerDeviceCall|hangupDeviceCall|streamCallEvents/)
  })

  it('keeps the softphone unavailable until SIP registration succeeds', () => {
    assert.match(phone, /registrationReady/)
    assert.match(phone, /await ready/)
    assert.match(phone, /sip:\$\{username\}@\$\{host\}/)
  })

  it('blocks an unbound line before any voice request', async () => {
    const { bindWebCallLine, stopWebCall } = await import('./webCallSession.js')
    stopWebCall()
    const calls = []
    globalThis.fetch = async (url) => {
      calls.push(String(url))
      return { ok: true, status: 200, text: async () => '{"instances":[]}' }
    }
    const snap = await bindWebCallLine('')
    assert.equal(snap.ready, false)
    assert.match(snap.lastError, /未绑定线路/)
    assert.equal(calls.length, 0)
  })
})

describe('SIP registration gate', () => {
  it('resolves only after registered and rejects a registration failure', async () => {
    const { registrationReady } = await import('./mddWebPhone.js')
    const ua = fakeUa()
    const pending = registrationReady(ua, 50)
    ua.emit('registered')
    await pending
    const failed = registrationReady(fakeUa(), 50)
    const broken = fakeUa()
    const rejected = registrationReady(broken, 50)
    broken.emit('registrationFailed', { cause: 'Rejected' })
    await assert.rejects(rejected, /Rejected/)
    await assert.rejects(failed, /语音注册超时/)
  })
})

function fakeUa() {
  const handlers = {}
  return {
    on(name, fn) {
      handlers[name] = handlers[name] || []
      handlers[name].push(fn)
    },
    emit(name, data) {
      for (const fn of handlers[name] || []) fn(data)
    },
  }
}
