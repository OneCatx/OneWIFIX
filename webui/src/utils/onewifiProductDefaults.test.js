import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

describe('OneWifi leftover Board runtime strings', () => {
  it('uses same-origin /api, ow_ instance ids, and 6688 as the product default', () => {
    const connection = readFileSync(join(here, '../stores/onewifiConnection.js'), 'utf8')
    const instances = readFileSync(join(here, '../stores/onewifiInstances.js'), 'utf8')
    const endpoint = readFileSync(join(here, 'onewifiEndpoint.js'), 'utf8')

    assert.match(connection, /if \(shouldUseOneWifiProxy\(\)\) return '\/api'/)
    assert.match(instances, /return `ow_/)
    assert.doesNotMatch(instances, /vh_/)
    assert.match(endpoint, /export const DEFAULT_ONEWIFI_PORT = 6688/)
    assert.doesNotMatch(endpoint, /7575/)
  })
})
