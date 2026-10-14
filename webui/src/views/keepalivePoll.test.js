import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const keepalive = readFileSync(join(here, 'Keepalive.vue'), 'utf8')
const hub = readFileSync(join(here, '../stores/onewifiHub.js'), 'utf8')
const instance = readFileSync(join(here, '../composables/useOneWifiInstance.runtime.js'), 'utf8')

describe('keepalive and hub polling', () => {
  it('loads /api/system/info once instead of on every Keepalive poll', () => {
    assert.match(keepalive, /let systemInfoLoaded = false/)
    assert.match(keepalive, /if \(!systemInfoLoaded\)/)
    assert.match(keepalive, /onewifiFetch\('\/api\/system\/info'/)
    assert.match(keepalive, /systemInfoLoaded = true/)
  })

  it('pauses hub and instance intervals while the tab is hidden', () => {
    assert.match(hub, /visibilitychange/)
    assert.match(hub, /hubPageVisible/)
    assert.match(instance, /visibilitychange/)
    assert.match(instance, /visibilityState === 'hidden'/)
  })
})
