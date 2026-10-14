import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const sms = readFileSync(join(here, 'OneWifiSms.vue'), 'utf8')
  + '\n'
  + readFileSync(join(here, '../components/SmsComposeDialog.vue'), 'utf8')
const head = readFileSync(join(here, '../components/OwPageHead.vue'), 'utf8')

describe('sms page layout', () => {
  it('follows the device lab shell instead of the old detection header', () => {
    assert.match(sms, /onewifi-lab-shell/)
    assert.match(sms, /metric-row/)
    assert.match(sms, /device-card glass-frame glass-frame--selectable/)
    assert.match(sms, /overview-grid overview-grid--pair/)
    assert.match(sms, /esim-item glass-frame/)
    assert.match(sms, /sms-contact-list/)
    assert.match(sms, /发送测试短信/)
    assert.match(sms, /maskTail4/)
    assert.match(sms, /message\.body/)
    assert.match(sms, /group\.date/)
    assert.match(sms, /sms-msg__bubble/)
    assert.doesNotMatch(sms, /sms-thread esim-list/)
    assert.doesNotMatch(sms, /esim-item__name mono/)
    assert.doesNotMatch(sms, /OwPageHead/)
    assert.doesNotMatch(sms, /sms-layout/)
    assert.doesNotMatch(sms, /chip=/)
    assert.doesNotMatch(sms, /信令/)
  })
})

describe('page head', () => {
  it('does not render the leftover signaling-style chip', () => {
    assert.doesNotMatch(head, /onewifi-head__chip/)
    assert.doesNotMatch(head, /chip/)
  })
})
