import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const mddVoice = readFileSync(join(here, '../api/mddVoice.js'), 'utf8')
const plan = readFileSync(join(here, '../../docs/PLAN-MDD-ENHANCED.md'), 'utf8')
const apiMap = readFileSync(join(here, '../../docs/API-MDD-MAP.md'), 'utf8')

describe('gateway strengths surface', () => {
  it('plan covers P0-P4 phases', () => {
    for (const phase of ['P0', 'P1', 'P2', 'P3', 'P4']) {
      assert.ok(plan.includes(phase), `plan must include ${phase}`)
    }
  })

  it('api map lists call, sms, mms, readers', () => {
    for (const key of ['softphone', 'sms/send', 'mms', 'readers', 'instances']) {
      assert.ok(apiMap.toLowerCase().includes(key.toLowerCase()), `map must mention ${key}`)
    }
  })

  it('mddVoice has voice origin and the web csrf header', () => {
    assert.match(mddVoice, /X-OneWIFI-CSRF-Token/)
    assert.doesNotMatch(mddVoice, /x-mdd-csrf-token/)
    assert.match(mddVoice, /setVoiceOrigin/)
    assert.match(mddVoice, /fetchLines/)
    assert.match(mddVoice, /body: \{ to: number \}/)
  })
})

describe('mddVoice call request', () => {
  it('posts to on the page origin with the current web csrf token', async () => {
    const { dialLine, setVoiceOrigin, softphoneWsUrl } = await import('./mddVoice.js')
    const { setCsrf } = await import('./onewifi.js')
    const calls = []
    globalThis.fetch = async (url, opts = {}) => {
      calls.push({ url: String(url), headers: opts.headers, body: opts.body })
      return { ok: true, status: 200, text: async () => '{"ok":true}' }
    }
    setCsrf('csrf-1')
    setVoiceOrigin('https://board.example')
    await dialLine('line-b', '+15551212')
    assert.equal(calls[0].url, 'https://board.example/api/instances/line-b/call')
    assert.equal(calls[0].headers['X-OneWIFI-CSRF-Token'], 'csrf-1')
    assert.deepEqual(JSON.parse(calls[0].body), { to: '+15551212' })
    assert.equal(softphoneWsUrl('line-b'), 'wss://board.example/api/instances/line-b/softphone/ws')
    setVoiceOrigin('')
    globalThis.location = {
      origin: 'https://127.0.0.1',
      protocol: 'https:',
      host: '127.0.0.1',
    }
    assert.equal(softphoneWsUrl('line-c'), 'wss://127.0.0.1/api/instances/line-c/softphone/ws')
  })
})
