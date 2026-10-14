import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareNotificationSettings, destinationSummary } from '../src/notificationDestinations.js'

const settings = {
  webhook: { enabled: false, url: 'https://legacy.example/hook' },
  wecom: { enabled: true, urls: ['********', '********'], events: { incoming_sms: true } },
  bark: { enabled: false, urls: ['********'] },
  apns: { enabled: true, auth_key_path: '********' },
}

test('unchanged masked destinations and APNs key survive unrelated settings save', () => {
  const result = prepareNotificationSettings(settings, {})
  assert.deepEqual(result.wecom.urls, ['********', '********'])
  assert.equal(result.apns.auth_key_path, '********')
  assert.deepEqual(result.webhook, settings.webhook)
})

test('replacement supplies the complete explicit URL list, not partial masks', () => {
  const result = prepareNotificationSettings(settings, {
    wecom: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=one\nhttps://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=two',
  })
  assert.equal(result.wecom.urls.length, 2)
  assert.deepEqual(settings.wecom.urls, ['********', '********'])
  assert.equal(result.wecom.events.incoming_sms, true)
})

test('rejects mixed mask edits and an enabled channel with no destination', () => {
  assert.throws(() => prepareNotificationSettings(settings, { wecom: '********\nhttps://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=two' }), /re-enter/i)
  assert.throws(() => prepareNotificationSettings(settings, { wecom: '' }), /destination/i)
  assert.deepEqual(prepareNotificationSettings({ ...settings, bark: { enabled: false, urls: ['********'] } }, { bark: '' }).bark.urls, [])
})

test('summary reveals count but never echoes saved destinations', () => {
  assert.equal(destinationSummary(['********', '********']), '2')
  assert.equal(destinationSummary([]), '0')
})
