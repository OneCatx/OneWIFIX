import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

function json(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { get: () => '' },
    text: async () => JSON.stringify(body),
    json: async () => body,
  }
}

const saved = {
  webhook: {
    enabled: true,
    urls: ['********', '********'],
    secret: '********',
    timeout_ms: 8000,
  },
  bark: { enabled: true, urls: ['********', '********'], group: 'ops' },
  wecom: { enabled: false, urls: [] },
}

describe('notification settings client', { concurrency: false }, () => {
  globalThis.window = { setTimeout, clearTimeout, dispatchEvent() {}, CustomEvent: class {} }

  it('saves both webhook targets and posts the draft secret and timeout', async () => {
    const calls = []
    globalThis.fetch = async (url, init = {}) => {
      calls.push({ url: String(url), method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null })
      const path = String(url)
      if (path.endsWith('/api/settings/notifications') && init.method === 'PUT') return json({ ok: true })
      if (path.endsWith('/api/settings/notifications')) return json(saved)
      if (path.endsWith('/api/settings/preferences')) return json({ language: 'zh' })
      if (path.endsWith('/api/system/info')) return json({ version: '1.14.0' })
      if (path.endsWith('/api/settings')) return json({ proxy: { profiles: {}, exits: {} } })
      if (path.endsWith('/webhook/test') || path.endsWith('/bark/test')) return json({ ok: true })
      throw new Error(path)
    }
    const { saveOnewifiSettings, testOnewifiWebhook, testOnewifiBark } = await import('./onewifiGateway.settings.js')
    const draft = {
      webhook: {
        enabled: true,
        url: '********',
        urls: ['********', '********'],
        secret: '********',
        timeout_ms: 8000,
      },
      bark: { enabled: true, url: 'https://bark.example/one', urls: ['https://old.example/one', 'https://bark.example/two'], group: 'ops' },
    }
    await saveOnewifiSettings(draft)
    const put = calls.find((call) => call.method === 'PUT')
    assert.deepEqual(put.body.webhook.urls, ['********', '********'])
    assert.equal(put.body.webhook.secret, '********')
    assert.equal(put.body.webhook.timeout_ms, 8000)
    assert.equal(put.body.webhook.url, undefined)
    assert.deepEqual(put.body.bark.urls, ['https://bark.example/one', 'https://bark.example/two'])

    calls.length = 0
    await testOnewifiWebhook({
      url: 'https://edited.example/hook',
      urls: ['https://old.example/hook', 'https://two.example/hook'],
      secret: 'hmac-secret',
      timeout_ms: 2500,
    })
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0].body, {
      enabled: true,
      urls: ['https://edited.example/hook', 'https://two.example/hook'],
      secret: 'hmac-secret',
      timeout_ms: 2500,
    })

    calls.length = 0
    await testOnewifiBark(draft.bark)
    assert.deepEqual(calls[0].body.urls, ['https://bark.example/one', 'https://bark.example/two'])
    assert.equal(calls[0].body.url, undefined)
  })

  it('refuses a list that mixes a mask with a real address', async () => {
    let called = false
    globalThis.fetch = async () => {
      called = true
      return json({})
    }
    const { saveOnewifiSettings, testOnewifiWebhook } = await import('./onewifiGateway.settings.js')
    const mixed = { webhook: { enabled: true, urls: ['https://new.example/hook', '********'], secret: '********', timeout_ms: 5000 } }
    await assert.rejects(saveOnewifiSettings(mixed), /掩码地址/)
    await assert.rejects(testOnewifiWebhook(mixed.webhook), /掩码地址/)
    assert.equal(called, false)
  })
})
