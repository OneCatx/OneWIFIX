import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { boardOverviewFromDevice, boardModems, deviceIdentityLine, mapOnewifiDevice, maskTail4, presentModems } from './onewifiDevice.js'
import { displaySecret } from './onewifiModel.device.js'

describe('maskTail4', () => {
  it('keeps empty and dash', () => {
    assert.equal(maskTail4(''), '—')
    assert.equal(maskTail4('—'), '—')
  })

  it('shows only last 4 for long secrets', () => {
    assert.equal(maskTail4('8986001234567890123'), '****0123')
    assert.equal(maskTail4('490154203237518'), '****7518')
  })

  it('does not pad short values', () => {
    assert.equal(maskTail4('1234'), '1234')
  })
})

describe('displaySecret', () => {
  it('masks by default and shows the full value when revealed', () => {
    assert.equal(displaySecret('8986001234567890123', false), '****0123')
    assert.equal(displaySecret('8986001234567890123', true), '8986001234567890123')
    assert.equal(displaySecret('', true), '—')
  })
})

describe('mapOnewifiDevice', () => {
  const raw = {
    id: 'modem-1',
    name: 'EC25',
    physical_present: true,
    healthy: true,
    running: true,
    control_online: true,
    network_enabled: false,
    vowifi_enabled: true,
    vowifi_active: true,
    flight_mode: false,
    modem: {
      operator: 'CMCC',
      imei: '490154203237518',
      iccid: '8986001234567890123',
      imsi: '460001234567890',
      sim_inserted: true,
      firmware: 'EC25AFAR',
    },
    vowifi_runtime: {
      sim_ready: true,
      access_ready: true,
      tunnel_ready: true,
      ims_ready: true,
      sms_ready: true,
      iccid: '8986001234567890123',
      local_phone: '13800138000',
    },
  }

  it('keeps full IMEI/ICCID for reveal and still exposes tail-4', () => {
    const mapped = mapOnewifiDevice(raw)
    assert.equal(mapped.modem.imei, '490154203237518')
    assert.equal(mapped.modem.iccid, '8986001234567890123')
    assert.equal(mapped.imei_masked, '****7518')
    assert.equal(mapped.sim.iccid, '8986001234567890123')
    assert.equal(mapped.sim.iccid_masked, '****0123')
    assert.equal(mapped.sim.number, '13800138000')
    assert.equal(mapped.sim.number_masked, '****8000')
    assert.equal(mapped.local_phone, '13800138000')
    assert.equal(mapped.vowifi_runtime.iccid, '8986001234567890123')
  })

  it('counts a physically present modem even when control_online is false', () => {
    const mapped = mapOnewifiDevice({
      id: 'usb',
      physical_present: true,
      healthy: false,
      running: true,
      control_online: false,
      modem: {},
      vowifi_runtime: {},
    })
    assert.equal(mapped.present, true)
    assert.equal(presentModems([mapped]).length, 1)
  })

  it('keeps offline configured modems in the board list', () => {
    const mapped = mapOnewifiDevice({
      id: 'offline',
      physical_present: false,
      healthy: false,
      running: false,
      control_online: false,
      modem: {},
      vowifi_runtime: {},
    })
    assert.equal(mapped.present, false)
    assert.equal(presentModems([mapped]).length, 0)
    assert.equal(boardModems([mapped]).length, 1)
  })

  it('feeds board overview stages from vowifi_runtime', () => {
    const overview = boardOverviewFromDevice(mapOnewifiDevice(raw))
    assert.equal(overview.operator, 'CMCC')
    assert.equal(overview.iccid, '8986001234567890123')
    assert.equal(overview.imei, '490154203237518')
    assert.deepEqual(overview.stages.map((s) => s.ready), [true, true, true, true, true])
    assert.equal(overview.wificallReady, true)
  })

  it('exposes backend country fields on the consumable sim model', () => {
    const mapped = mapOnewifiDevice({
      ...raw,
      modem: {
        ...raw.modem,
        operator_country_code: 'CN',
        home_carrier_country_code: 'MO',
        card_country: '中国澳门',
      },
    })
    assert.equal(mapped.sim.operator_country_code, 'CN')
    assert.equal(mapped.sim.home_carrier_country_code, 'MO')
    assert.equal(mapped.sim.card_country, '中国澳门')
    assert.equal(mapped.sim.country, 'MO')
  })

  it('shows a USB reader as 读卡器 with the enabled profile when VoWiFi is idle', () => {
    const mapped = mapOnewifiDevice({
      id: 'Dot-48EF35663137',
      name: 'ESTKme-DOT-1',
      device_type: 'usb_sim_reader',
      physical_present: true,
      modem: {
        operator: 'Eskimo',
        native_spn: 'Eskimo',
        home_carrier_name: 'Eskimo',
        sim_inserted: true,
        iccid: '8965012411180720352',
        imei: '353837385595390',
      },
      vowifi_runtime: { phase: 'idle', sim_ready: false },
    })
    assert.equal(mapped.modem.operator, 'Eskimo')
    assert.equal(deviceIdentityLine(mapped), '读卡器 · ****5390')
    const overview = boardOverviewFromDevice(mapped)
    assert.equal(overview.operator, 'Eskimo')
    assert.equal(overview.runningMode, 'PC/SC')
  })

  it('does not light VoWiFi Access from a camped cellular radio', () => {
    const mapped = mapOnewifiDevice({
      id: 'dj-3',
      radio_registered: true,
      flight_mode: false,
      modem: { operator: 'China Mobile', sim_inserted: true },
      vowifi_runtime: { sim_ready: false, access_ready: false, tunnel_ready: false, ims_ready: false },
    })
    assert.equal(mapped.vowifi_runtime.access_ready, false)
  })
})
