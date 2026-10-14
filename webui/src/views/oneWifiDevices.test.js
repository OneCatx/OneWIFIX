import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const page = readFileSync(join(here, 'OneWifiDevices.vue'), 'utf8')

describe('OneWifiDevices instance container', () => {
  it('keeps instance creation separate from device registration', () => {
    assert.match(page, /addInstance/)
    assert.match(page, /class="onewifi-add-btn"/)
    assert.match(page, />增加设备</)
    assert.match(page, /@click="onAdd"/)
    assert.match(page, /host: ''/)
    assert.doesNotMatch(page, /seed\?\.host/)
    assert.doesNotMatch(page, /LAN_ONEWIFI_HOST/)
  })

  it('never deletes the same-origin board container', () => {
    assert.match(page, /isLocalBoardInstance/)
    assert.match(page, /onewifiEndpointIsThisBoard/)
  })

  it('renders a page-level intranet+public fleet overview outside instance cards', () => {
    assert.match(page, /DeviceFleetOverview/)
    assert.match(page, /<DeviceFleetOverview \/>/)
    const order = page.indexOf('<DeviceFleetOverview')
    const cards = page.indexOf('<OneWifiInstanceCard')
    assert.ok(order >= 0 && cards > order, 'fleet overview must sit above instance cards')
  })
})
