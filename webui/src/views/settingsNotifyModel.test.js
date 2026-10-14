import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { hydrateNotify, notificationUrls, urlsFromText } from './settingsNotifyModel.js'

describe('notification url list', () => {
  it('keeps every masked destination and the webhook secret', () => {
    const notify = hydrateNotify({
      webhook: {
        enabled: true,
        urls: ['********', '********'],
        secret: '********',
        timeout_ms: 8000,
      },
      bark: { urls: ['********', '********'] },
    })
    assert.deepEqual(notify.webhook.urls, ['********', '********'])
    assert.equal(notify.webhook.url, '********')
    assert.equal(notify.webhook.secret, '********')
    assert.equal(notify.webhook.timeout_ms, 8000)
    assert.deepEqual(notify.bark.urls, ['********', '********'])
  })

  it('lets an edited first address replace only that slot', () => {
    const urls = notificationUrls({
      url: 'https://edited.example/hook',
      urls: ['https://old.example/hook', 'https://two.example/hook'],
    })
    assert.deepEqual(urls, ['https://edited.example/hook', 'https://two.example/hook'])
    const hydrated = hydrateNotify({
      webhook: {
        url: 'https://edited.example/hook',
        urls: ['https://old.example/hook', 'https://two.example/hook'],
        secret: 'kept',
        timeout_ms: 2500,
      },
    })
    assert.deepEqual(hydrated.webhook.urls, urls)
    assert.equal(hydrated.webhook.secret, 'kept')
    assert.equal(hydrated.webhook.timeout_ms, 2500)
  })

  it('reads one address per line', () => {
    assert.deepEqual(urlsFromText('https://a.example/hook\nhttps://b.example/hook\n'), {
      url: 'https://a.example/hook',
      urls: ['https://a.example/hook', 'https://b.example/hook'],
    })
  })
})
