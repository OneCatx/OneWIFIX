import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const engineSrc = readFileSync(join(here, 'callEngine.js'), 'utf8')
const mddVoice = readFileSync(join(here, '../api/mddVoice.js'), 'utf8')
const mddPhone = readFileSync(join(here, 'mddWebPhone.js'), 'utf8')
const plan = readFileSync(join(here, '../../docs/PLAN-MDD-ENHANCED.md'), 'utf8')

describe('MDD call engine facade', () => {
  it('exposes bootstrap/dial/answer/hangup', () => {
    for (const name of ['bootstrap', 'dial', 'answer', 'hangup', 'stop']) {
      assert.ok(engineSrc.includes(name), `callEngine must expose ${name}`)
    }
  })

  it('uses the MDD softphone only', () => {
    assert.match(engineSrc, /mode = 'mdd'/)
    assert.match(engineSrc, /createMddWebPhone/)
    assert.doesNotMatch(engineSrc, /voicePhone|legacy/)
  })

  it('mddVoice covers auth, lines, call, hangup, softphone', () => {
    for (const name of [
      'loginVoice',
      'fetchLines',
      'fetchLineStatus',
      'fetchSoftphone',
      'dialLine',
      'hangupLine',
      'fetchCallHistory',
      'softphoneWsUrl',
    ]) {
      assert.ok(mddVoice.includes(`export async function ${name}`) || mddVoice.includes(`export function ${name}`),
        `mddVoice must export ${name}`)
    }
  })

  it('web phone registers JsSIP against MDD softphone ws', () => {
    assert.match(mddPhone, /JsSIP/)
    assert.match(mddPhone, /softphoneWsUrl/)
    assert.match(mddPhone, /newRTCSession/)
  })

  it('plan freezes MDD as base runtime', () => {
    assert.match(plan, /MDD/)
    assert.match(plan, /不部署/)
    assert.match(plan, /P0/)
    assert.match(plan, /P4/)
  })
})
