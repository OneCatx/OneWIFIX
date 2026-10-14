import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { addDeviceDefaults, addDeviceRegisterConfig, discoveredDeviceLabel, discoveredRosterLabel } from './addDeviceCard.js'

const here = dirname(fileURLToPath(import.meta.url))
const addCard = readFileSync(join(here, 'AddDeviceCard.vue'), 'utf8')
const addHelpers = readFileSync(join(here, 'addDeviceCard.js'), 'utf8')

describe('AddDeviceCard reader registration', () => {
  it('defaults the device id to the stable discovery key so PC/SC names with spaces stay valid', () => {
    const defaults = addDeviceDefaults({
      discovery_key: 'reader-ab12cd34',
      reader_name: 'Alcor Micro AU9560 00 00',
      driver_name: 'AU9560',
      device_type: 'usb_sim_reader',
    })
    assert.equal(defaults.deviceId, 'reader-ab12cd34')
    assert.equal(defaults.name, 'Alcor Micro AU9560 00 00')
    assert.equal(defaults.deviceType, 'usb_sim_reader')
  })

  it('defaults a DOT reader id to Dot-<serial> and Baiwang/DJI to DJ-<IMEI>', () => {
    assert.equal(addDeviceDefaults({
      discovery_key: 'reader-76b3d8890e99086f',
      reader_name: 'Generic Smart Card Reader Interface (490276A83230) 00 00',
      driver_name: 'ESTKme-DOT',
      device_type: 'usb_sim_reader',
    }).deviceId, 'Dot-490276A83230')
    assert.equal(addDeviceDefaults({
      discovery_key: 'quectel-0125-2-1',
      device_type: 'pcie_ec20_ec25',
      name: 'DotKing',
      driver_name: 'Baiwang',
      imei: '866069053528699',
    }).deviceId, 'DJ-866069053528699')
  })

  it('posts discovery_key and reader identity so registration can match a PC/SC reader without AT/QMI nodes', () => {
    const config = addDeviceRegisterConfig(
      {
        discovery_key: 'reader-ab12cd34',
        reader_name: 'Alcor Micro AU9560 00 00',
        usb_path: '1-4',
        control_path: '',
        at_port: '',
        imei: '',
        net_interface: '',
        mode: 'pcsc',
      },
      { id: 'reader-ab12cd34', name: '读卡器 1', deviceType: 'usb_sim_reader' },
    )
    assert.equal(config.discovery_key, 'reader-ab12cd34')
    assert.equal(config.control_device, 'Alcor Micro AU9560 00 00')
    assert.equal(config.usb_path, '1-4')
    assert.equal(config.device_type, 'usb_sim_reader')
  })

  it('distinguishes two readers that share a product name', () => {
    assert.equal(discoveredDeviceLabel({
      reader_name: 'AU9540',
      usb_path: '1-4',
    }), 'AU9540 · 1-4')
  })

  it('prefers the USB product over the generic PC/SC CCID name', () => {
    const device = {
      reader_name: 'Generic Smart Card Reader Interface (48EF35663137) 00 00',
      driver_name: 'ESTKme-DOT',
      usb_path: '1-1.4',
    }
    assert.equal(discoveredDeviceLabel(device), 'ESTKme-DOT · 48EF35663137')
    assert.equal(addDeviceDefaults(device).name, 'ESTKme-DOT')
  })

  it('wires the extracted helpers into the add-device dialog', () => {
    assert.match(addCard, /addDeviceDefaults/)
    assert.match(addCard, /addDeviceRegisterConfig/)
    assert.match(addCard, /discoveredRosterLabel/)
    assert.match(addCard, /discovery_issue/)
    assert.match(addCard, /v-for="device in devices"/)
    assert.match(addCard, /device\.configured/)
    assert.match(addHelpers, /已登记/)
  })

  it('keeps a visible name on the add roster even after a device was deleted', () => {
    assert.equal(discoveredRosterLabel({
      configured: false,
      reader_name: 'Generic Smart Card Reader Interface (48EF35663137) 00 00',
      driver_name: 'ESTKme-DOT',
      usb_path: '1-1.4',
    }), 'ESTKme-DOT · 48EF35663137')
    assert.equal(discoveredRosterLabel({
      configured: true,
      reader_name: 'Generic Smart Card Reader Interface (48EF35663137) 00 00',
      driver_name: 'ESTKme-DOT',
      usb_path: '1-1.4',
    }), 'ESTKme-DOT · 48EF35663137（已登记）')
    assert.equal(discoveredRosterLabel({
      discovery_key: 'reader-ab12cd34',
    }), 'reader-ab12cd34')
  })
})
