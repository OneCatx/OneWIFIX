import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const calls = readFileSync(join(here, 'Calls.vue'), 'utf8')

describe('calls page layout', () => {
  it('uses the lab shell keypad trio instead of the leftover form page', () => {
    assert.match(calls, /onewifi-lab-shell/)
    assert.match(calls, /metric-row/)
    assert.match(calls, /device-card glass-frame glass-frame--selectable/)
    assert.match(calls, /overview-grid overview-grid--trio/)
    assert.match(calls, /overview-card--dial/)
    assert.match(calls, /ow-keypad calls-keypad/)
    assert.match(calls, /call-history-list/)
    assert.match(calls, /IMEI/)
    assert.match(calls, /dialWebCall/)
    assert.match(calls, /answerWebCall/)
    assert.match(calls, /hangupWebCall/)
    assert.match(calls, /bindWebCallLine/)
    assert.match(calls, /lineActionId/)
    assert.match(calls, /语音引擎不可用/)
    assert.doesNotMatch(calls, /dialDeviceCall|answerDeviceCall|hangupDeviceCall|deviceCallMediaSocketURL|startCallHandset|streamCallEvents/)
    assert.match(calls, /长按输入加号/)
    assert.match(calls, /maskTail4/)
    assert.doesNotMatch(calls, /OwPageHead/)
    assert.doesNotMatch(calls, /OwGlassPanel/)
    assert.doesNotMatch(calls, /ow-form-grid/)
    assert.doesNotMatch(calls, /placeholder="\+447700900123"/)
  })
})
