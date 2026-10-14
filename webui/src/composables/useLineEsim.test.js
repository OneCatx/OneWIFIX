import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'url'

const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, 'useLineEsim.js'), 'utf8')

describe('useLineEsim', () => {
  it('loads and switches profiles on the selected line', () => {
    assert.match(src, /getEsimProfiles/)
    assert.match(src, /switchEsimProfile/)
    assert.match(src, /profilesFromDevicePayload/)
    assert.match(src, /fallbackEsimProfiles/)
    assert.match(src, /getEsimProfiles\(targetId, \{ refresh \}\)/)
    assert.doesNotMatch(src, /useOneWifiInstance/)
  })

  it('invalidates profile reads and switches when the selected line changes', () => {
    assert.match(src, /watch\(\s*\(\) => unref\(deviceIdRef\)/)
    assert.match(src, /let loadRequestId = 0/)
    assert.match(src, /let switchRequestId = 0/)
    assert.match(src, /const targetId = unref\(deviceIdRef\)/)
    assert.match(src, /isLoadCurrent\(requestId, targetId\)/)
    assert.match(src, /isSwitchCurrent\(requestId, targetId\)/)
  })
})
