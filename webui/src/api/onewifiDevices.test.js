import { afterEach, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  fetchDiscoveredOnewifiDevices,
  registerOnewifiDevice,
  renameOnewifiDevice,
  saveOnewifiDeviceHardware,
} from './onewifiDevices.js'

const originalFetch = globalThis.fetch

beforeEach(() => {
  globalThis.window = { setTimeout, clearTimeout, dispatchEvent() {}, CustomEvent: class {} }
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('device registration adapters', () => {
  it('loads discovered hardware and posts config for registration', async () => {
    const calls = []
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url: String(url), options })
      return new Response(JSON.stringify({ data: { devices: [{ discovery_key: 'usb-1', configured: false }] } }), { status: 200 })
    }

    const discovered = await fetchDiscoveredOnewifiDevices()
    await registerOnewifiDevice({ id: 'modem-1', device_type: 'pcie_ec20_ec25' })

    assert.equal(discovered[0].discovery_key, 'usb-1')
    assert.equal(calls[0].url, '/api/devices/discovered')
    assert.equal(calls[1].url, '/api/devices')
    assert.equal(calls[1].options.method, 'POST')
    assert.deepEqual(JSON.parse(calls[1].options.body), {
      config: { id: 'modem-1', device_type: 'pcie_ec20_ec25' },
    })
  })
})

describe('renameOnewifiDevice', () => {
  it('PATCHes only the display name', async () => {
    const calls = []
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url: String(url), options })
      return new Response(JSON.stringify({ data: { status: 'renamed' } }), { status: 200 })
    }
    await renameOnewifiDevice('ec20', '  客厅网关  ')
    assert.equal(calls[0].url, '/api/devices/ec20')
    assert.equal(calls[0].options.method, 'PATCH')
    assert.deepEqual(JSON.parse(calls[0].options.body), { name: '客厅网关' })
  })

  it('rejects an empty name before calling the network', async () => {
    let called = false
    globalThis.fetch = async () => {
      called = true
      return new Response('{}', { status: 200 })
    }
    await assert.rejects(async () => {
      await renameOnewifiDevice('ec20', '   ')
    }, /设备名称/)
    assert.equal(called, false)
  })
})

describe('saveOnewifiDeviceHardware', () => {
  it('PATCHes only the supplied hardware field', async () => {
    const calls = []
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url: String(url), options })
      return new Response(JSON.stringify({ data: { status: 'saved' } }), { status: 200 })
    }

    await saveOnewifiDeviceHardware('ec20', { modem_imei: '123456789012345' })

    assert.equal(calls[0].url, '/api/devices/ec20')
    assert.equal(calls[0].options.method, 'PATCH')
    assert.deepEqual(JSON.parse(calls[0].options.body), { modem_imei: '123456789012345' })
  })
})
