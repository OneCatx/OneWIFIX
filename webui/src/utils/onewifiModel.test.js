import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeDevice,
  normalizeDeviceList,
  lineActionId,
  lineActionBlockReason,
  normalizeDeviceOverview,
  parseOnewifiEsimPayload,
  applyLiveIccidToProfiles,
  retainEsimProfileName,
  mergeOverviewKeepingEsimName,
  normalizeEsimSwitchProgress,
  idleEsimSwitchStages,
  ESIM_SWITCH_STEPS,
  onewifiEsimHint,
  normalizeEuiccHardware,
  normalizeCardPolicy,
  cardPolicyToPayload,
  currentSimAsProfile,
  policyFromDeviceRow,
  canDeleteEsimProfile,
  esimDeleteConfirmMessage,
  esimDeleteActionLabel,
  normalizeSmsMessage,
  normalizeSmsContact,
  displaySmsBody,
  smsTimeMs,
  normalizeSmsStorage,
  smsStorageAreaFull,
  smsStorageWarning,
} from './onewifiModel.js'

const liveBaiwang = {
  id: 'quectel-0125-2-1-2',
  name: 'Baiwang',
  physical_present: true,
  control_online: false,
  healthy: false,
  running: true,
  flight_mode: false,
  network_enabled: false,
  vowifi_enabled: true,
  vowifi_active: false,
  local_phone: '',
  public_ip: '',
  modem: {
    operator: '',
    imei: '',
    iccid: '',
    imsi: null,
    firmware: null,
    sim_inserted: false,
    phone_number: '',
    model: 'Baiwang',
  },
  vowifi_runtime: {
    phase: 'failed',
    sim_ready: false,
    access_ready: false,
    tunnel_ready: false,
    ims_ready: false,
    last_reason: 'enable_failed',
    last_error_class: 'access_ready',
    iccid: '',
    imsi: '',
  },
}

describe('physical device and bound line ids', () => {
  it('keeps the physical id and targets the bound instance for line actions', () => {
    const bound = normalizeDevice({ id: 'phys-a', instance_id: 'line-b', present: true })
    const other = normalizeDevice({ id: 'phys-c', instance_id: 'line-c', present: true })
    const unbound = normalizeDevice({ id: 'phys-d', instance_id: null, present: true })
    const legacy = normalizeDevice({ id: 'same-id', present: true })

    assert.equal(bound.id, 'phys-a')
    assert.equal(bound.physicalId, 'phys-a')
    assert.equal(lineActionId(bound), 'line-b')
    assert.equal(lineActionId({ id: 'phys-a', instance_id: 'line-b' }), 'line-b')
    assert.equal(lineActionId(other), 'line-c')
    assert.notEqual(lineActionId(bound), other.id)
    assert.equal(lineActionId(unbound), '')
    assert.equal(unbound.lineBound, false)
    assert.equal(lineActionBlockReason(unbound), '未绑定线路，线路操作已禁用')
    assert.equal(lineActionId(legacy), 'same-id')
    assert.equal(lineActionBlockReason(legacy), '')
  })
})

describe('normalizeDevice OneWIFI list', () => {
  it('treats physically present modem as online even when control_online is false', () => {
    const device = normalizeDevice(liveBaiwang)
    assert.equal(device.online, true)
    assert.equal(device.healthy, false)
    assert.equal(device.statusText, '在位')
  })

  it('unwraps { devices: [...] } list payload', () => {
    const list = normalizeDeviceList({ device_limit: 8, devices: [liveBaiwang] })
    assert.equal(list.length, 1)
    assert.equal(list[0].id, 'quectel-0125-2-1-2')
    assert.equal(list[0].online, true)
  })

  it('exposes operator, publicIp and country for device-card fields', () => {
    const device = normalizeDevice({
      ...liveBaiwang,
      public_ip: '203.0.113.9',
      modem: { ...liveBaiwang.modem, operator: 'CMHK' },
      sim: { country: 'HK' },
    })
    assert.equal(device.publicIp, '203.0.113.9')
    assert.equal(device.operator, 'CMHK')
    assert.equal(device.country, 'HK')
  })
})

describe('normalizeDeviceOverview OneWIFI overview', () => {
  const connectedRuntime = {
    phase: 'ready',
    iccid: '8986000000000001002',
    sim_ready: true,
    access_ready: true,
    tunnel_ready: true,
    ims_ready: true,
    sms_ready: true,
  }

  for (const deviceType of ['modem', 'usb_sim_reader']) {
    it(`uses fresh overview runtime to repaint the current card and WiFi Call for ${deviceType}`, () => {
      const device = {
        device_type: deviceType,
        vowifi_runtime: { ...connectedRuntime, iccid: '8986000000000001001', sms_ready: false },
      }
      const overview = normalizeDeviceOverview({ vowifi_runtime: connectedRuntime }, device)
      assert.equal(overview.iccid, connectedRuntime.iccid)
      assert.equal(overview.wificallReady, true)
      assert.equal(overview.wificallLabel, 'WiFi-Calling · 全部就绪')
      assert.deepEqual(overview.stages.map((stage) => stage.ready), [true, true, true, true, true])
      assert.equal(overview.runningMode, deviceType === 'usb_sim_reader' ? 'PC/SC' : 'QMI')
      const profiles = applyLiveIccidToProfiles([
        { iccid: device.vowifi_runtime.iccid, active: true },
        { iccid: connectedRuntime.iccid, active: false },
      ], overview.iccid)
      assert.deepEqual(profiles.map((profile) => profile.active), [false, true])
    })
  }

  it('uses explicit failed and false overview values instead of a previously connected runtime', () => {
    const overview = normalizeDeviceOverview({
      vowifi_runtime: {
        phase: 'failed',
        sim_ready: false,
        access_ready: false,
        tunnel_ready: false,
        ims_ready: false,
        sms_ready: false,
        last_reason: 'enable_failed',
        last_error_class: 'access_ready',
      },
    }, { vowifi_runtime: connectedRuntime })
    assert.equal(overview.wificallReady, false)
    assert.equal(overview.wificallLabel, 'VoWiFi 未就绪')
    assert.deepEqual(overview.stages.map((stage) => stage.ready), [false, false, false, false, false])
    assert.equal(overview.lastReason, 'enable_failed')
    assert.equal(overview.errorCategory, 'access_ready')
  })

  it('does not merge missing overview runtime fields from a previously connected runtime', () => {
    const overview = normalizeDeviceOverview({
      vowifi_runtime: { phase: 'failed', iccid: '8986000000000001003' },
    }, { vowifi_runtime: connectedRuntime })
    assert.equal(overview.iccid, '8986000000000001003')
    assert.equal(overview.wificallReady, false)
    assert.equal(overview.wificallLabel, 'VoWiFi 未就绪')
    assert.deepEqual(overview.stages.map((stage) => stage.ready), [false, false, false, false, false])
  })

  it('keeps an explicit empty overview runtime instead of restoring stale readiness', () => {
    const overview = normalizeDeviceOverview({ vowifi_runtime: {} }, { vowifi_runtime: connectedRuntime })
    assert.equal(overview.wificallReady, false)
    assert.equal(overview.iccid, '—')
    assert.deepEqual(overview.stages.map((stage) => stage.ready), [false, false, false, false, false])
  })

  it('falls back to the device runtime when overview runtime is unavailable', () => {
    for (const raw of [{}, { vowifi_runtime: undefined }, { vowifi_runtime: null }]) {
      const overview = normalizeDeviceOverview(raw, { vowifi_runtime: connectedRuntime })
      assert.equal(overview.iccid, connectedRuntime.iccid)
      assert.equal(overview.wificallReady, true)
    }
    assert.equal(normalizeDeviceOverview().wificallReady, false)
  })

  it('prefers fresh runtime after unwrapping overview and data payloads', () => {
    const fresh = { vowifi_runtime: connectedRuntime }
    for (const raw of [{ overview: fresh }, { data: fresh }, { data: { overview: fresh } }, { devices: [fresh] }, { data: { devices: [fresh] } }]) {
      const overview = normalizeDeviceOverview(raw, {
        vowifi_runtime: { ...connectedRuntime, iccid: '8986000000000001001', sms_ready: false },
      })
      assert.equal(overview.iccid, connectedRuntime.iccid)
      assert.equal(overview.wificallReady, true)
    }
  })

  it('maps vowifi_runtime stages and enable_failed reason', () => {
    const overview = normalizeDeviceOverview(liveBaiwang, liveBaiwang)
    assert.equal(overview.wificallReady, false)
    assert.match(overview.wificallLabel, /未就绪|enable_failed|VoWiFi/)
    assert.equal(overview.stages.find((s) => s.key === 'sim').ready, false)
    assert.equal(overview.stages.find((s) => s.key === 'access').ready, false)
    assert.equal(overview.lastReason, 'enable_failed')
    assert.equal(overview.flightMode, false)
    assert.equal(overview.vowifiActive, true)
    assert.equal(overview.dataEnabled, false)
    assert.equal(overview.imei, '—')
  })

  it('keeps tail-able secrets when modem snapshot is present', () => {
    const raw = {
      ...liveBaiwang,
      modem: {
        ...liveBaiwang.modem,
        imei: '490154203237518',
        iccid: '8986001234567890123',
        imsi: '460001234567890',
        sim_inserted: true,
        operator: 'CMCC',
        firmware: 'EC25AFAR',
        phone_number: '13800138000',
      },
    }
    const overview = normalizeDeviceOverview(raw, raw)
    assert.equal(overview.imei, '490154203237518')
    assert.equal(overview.iccid, '8986001234567890123')
    assert.equal(overview.imsi, '460001234567890')
    assert.equal(overview.phone, '13800138000')
    assert.equal(overview.operator, 'CMCC')
    assert.equal(overview.firmware, 'EC25AFAR')
  })

  it('surfaces a camped cellular cell without lighting VoWiFi Access', () => {
    const raw = {
      id: 'quectel-0125-2-1-2',
      radio_registered: true,
      flight_mode: false,
      network_enabled: true,
      vowifi_enabled: false,
      modem: {
        operator: 'China Mobile',
        native_spn: 'ASDA Mobile',
        network_mode: 'LTE',
        radio_band: 'B40',
        reg_status: 5,
        reg_status_text: 'registered (roaming)',
        signal_rsrp: -81,
        signal_dbm: -54,
      },
      vowifi_runtime: {
        phase: 'idle',
        sim_ready: false,
        access_ready: false,
        tunnel_ready: false,
        ims_ready: false,
        sms_ready: false,
      },
    }
    const overview = normalizeDeviceOverview(raw, raw)
    assert.equal(overview.operator, 'ASDA Mobile')
    assert.equal(overview.servingOperator, 'China Mobile')
    assert.equal(overview.radioRegistered, true)
    assert.equal(overview.radioStatus, '漫游驻留')
    assert.equal(overview.radioMode, 'LTE B40')
    assert.equal(overview.radioSignal, '-81 dBm')
    assert.equal(overview.radioLabel, 'China Mobile · LTE B40 · 漫游驻留')
    assert.equal(overview.wificallReady, false)
    assert.equal(overview.stages.find((stage) => stage.key === 'access').ready, false)
  })

  it('shows the enabled reader profile as 原运营商 and 当前 eSIM when VoWiFi is idle', () => {
    const raw = {
      id: 'Dot-48EF35663137',
      device_type: 'usb_sim_reader',
      modem: {
        operator: 'Eskimo',
        native_spn: 'Eskimo',
        home_carrier_name: 'Eskimo',
        sim_inserted: true,
        iccid: '8900000000000000352',
        imei: '350000000005390',
        imsi: '',
      },
      vowifi_runtime: {
        phase: 'idle',
        sim_ready: false,
        iccid: '',
        imsi: '',
      },
    }
    const overview = normalizeDeviceOverview(raw, raw)
    assert.equal(overview.operator, 'Eskimo')
    assert.equal(overview.esimProfile, 'Eskimo')
    assert.equal(overview.iccid, '8900000000000000352')
    assert.equal(overview.imei, '350000000005390')
    assert.notEqual(overview.operator, '未插 SIM')
  })

  it('shows the USB reader home carrier instead of 未插 SIM when only VoWiFi identity is live', () => {
    const raw = {
      id: 'Dot-490276A83230',
      device_type: 'usb_sim_reader',
      modem: {
        operator: '',
        native_spn: '',
        home_carrier_name: 'Vodafone',
        sim_inserted: false,
        iccid: '',
        imsi: '',
      },
      vowifi_runtime: {
        phase: 'sms_ready',
        sim_ready: true,
        iccid: '8900000000000003094',
        imsi: '001010000000001',
      },
    }
    const overview = normalizeDeviceOverview(raw, raw)
    assert.equal(overview.operator, 'Vodafone')
    assert.equal(overview.iccid, '8900000000000003094')
    assert.equal(overview.imsi, '001010000000001')
  })

  it('does not paint 未插 SIM for a reader whose snapshot is empty but the SIM is in VoWiFi', () => {
    const raw = {
      id: 'Dot-48EF35663137',
      device_type: 'usb_sim_reader',
      modem: {
        operator: '',
        native_spn: '',
        home_carrier_name: '',
        sim_inserted: false,
        iccid: '',
        imsi: '',
      },
      vowifi_runtime: {
        phase: 'access_ready',
        sim_ready: true,
        iccid: '8900000000000004688',
        imsi: '001010000000002',
      },
    }
    const overview = normalizeDeviceOverview(raw, raw)
    assert.notEqual(overview.operator, '未插 SIM')
    assert.equal(overview.iccid, '8900000000000004688')
  })

  it('treats CEREG 5 as camped even when radio_registered is omitted', () => {
    const raw = {
      id: 'quectel-0125-2-1-2',
      modem: {
        operator: 'China Mobile',
        network_mode: 'LTE',
        radio_band: 'B40',
        reg_status: 5,
        signal_rsrp: -81,
      },
    }
    const device = normalizeDevice(raw)
    assert.equal(device.radio_registered, true)
    const overview = normalizeDeviceOverview(raw, raw)
    assert.equal(overview.radioRegistered, true)
    assert.equal(overview.radioLabel, 'China Mobile · LTE B40 · 漫游驻留')
  })
})

describe('eSIM payload', () => {
  it('keeps a 9eSIM card label when the model catalog has no fingerprint', () => {
    const hardware = normalizeEuiccHardware({
      chipInfo: { eids: [{ eid: '8900000011111111', manufacturer: 'Kigen' }] },
      profiles: [{ name: '9ESIM B1', iccid: '8900000000000000001' }],
    })
    assert.equal(hardware[0].nameplate, '9ESIM B1')
    assert.equal(hardware[0].cardLabel, undefined)
  })

  it('reads physical eUICC manufacturer and available capacity from the chipInfo contract', () => {
    const hardware = normalizeEuiccHardware({
      chipInfo: {
        eids: [{
          eid: '89033023',
          manufacturer: 'Thales DIS France SAS',
          freeNvram: '634.55 KB',
          freeNvramBytes: 649779,
        }],
      },
      profiles: [{ serviceProviderName: 'RedPocket' }],
    })
    assert.deepEqual(hardware, [{
      index: 0,
      eid: '89033023',
      aidHex: '',
      sas: '',
      firmware: '',
      manufacturer: 'Thales DIS France SAS',
      freeNvram: '634.55 KB',
      freeNvramBytes: 649779,
      label: 'eSIM 1 · 可用 634.55 KB',
      chipMaker: 'Thales DIS France SAS',
      brand: '',
      sku: '',
      nameplate: 'Nekoko联名',
      dualEuicc: false,
      expectedEuiccCount: 1,
    }])
  })

  it('keeps both eUICC entries on an ESTKme Max and matches their AIDs by EID or index', () => {
    assert.deepEqual(normalizeEuiccHardware({
      chipInfo: {
        eids: [
          { eid: '8903302300000001', aid: 'A06573746B6D65FFFF4953442D522030', manufacturer: 'Thales DIS France SAS', freeNvram: '634.55 KB', freeNvramBytes: 649784 },
          { eid: '8903302300000002', aid: 'A06573746B6D65FFFF4953442D522031', manufacturer: 'Thales DIS France SAS', freeNvram: '684.87 KB', freeNvramBytes: 701304 },
        ],
      },
      profiles: [
        { eid: '8903302300000001', aidHex: 'A06573746B6D65FFFF4953442D522030', profiles: [{ iccid: '8900000000000000001' }] },
        { eid: '8903302300000002', aidHex: 'A06573746B6D65FFFF4953442D522031', profiles: [{ iccid: '8900000000000000002' }] },
      ],
    }), [
      {
        index: 0,
        eid: '8903302300000001',
        aidHex: 'A06573746B6D65FFFF4953442D522030',
        sas: '',
        firmware: '',
        manufacturer: 'Thales DIS France SAS',
        freeNvram: '634.55 KB',
        freeNvramBytes: 649784,
        label: 'eSIM 1 · 可用 634.55 KB',
        chipMaker: 'Thales DIS France SAS',
        brand: 'ESTK.me',
        sku: 'Max',
        nameplate: 'ESTK.me Max',
        dualEuicc: true,
        expectedEuiccCount: 2,
      },
      {
        index: 1,
        eid: '8903302300000002',
        aidHex: 'A06573746B6D65FFFF4953442D522031',
        sas: '',
        firmware: '',
        manufacturer: 'Thales DIS France SAS',
        freeNvram: '684.87 KB',
        freeNvramBytes: 701304,
        label: 'eSIM 2 · 可用 684.87 KB',
        chipMaker: 'Thales DIS France SAS',
        brand: 'ESTK.me',
        sku: 'Max',
        nameplate: 'ESTK.me Max',
        dualEuicc: true,
        expectedEuiccCount: 2,
      },
    ])
  })

  it('never mistakes a Profile operator for the physical eUICC manufacturer', () => {
    assert.deepEqual(normalizeEuiccHardware({
      chipInfo: null,
      profiles: [{ serviceProviderName: 'Vodafone', name: 'Travel' }],
    }), [])
  })

  it('keeps the upstream capacity when manufacturer metadata is unavailable', () => {
    assert.deepEqual(normalizeEuiccHardware({
      data: { chipInfo: { eids: [{ freeNvram: '256.20 KB' }] } },
    }), [{
      index: 0,
      eid: '',
      aidHex: '',
      sas: '',
      firmware: '',
      manufacturer: '',
      freeNvram: '256.20 KB',
      freeNvramBytes: null,
      label: 'eSIM 1 · 可用 256.20 KB',
      chipMaker: '',
      brand: '',
      sku: '',
      nameplate: 'Nekoko联名',
      dualEuicc: false,
      expectedEuiccCount: 1,
    }])
  })

  it('labels the lab DJ-1 / DJ-2 chipInfo fingerprints as Estk.me C beta and G+D天联', () => {
    const cBeta = normalizeEuiccHardware({
      chipInfo: {
        firmware: '32.33.0',
        eids: [{
          eid: '89049032000000000000000000000001',
          aid: 'A06573746B6D65FFFF4953442D522030',
          freeNvram: '256.23 KB',
          freeNvramBytes: 262384,
        }],
      },
    })
    assert.equal(cBeta[0].nameplate, 'Estk.me C beta')
    assert.equal(cBeta[0].sku, 'C beta')
    assert.equal(cBeta[0].sas, '')

    const dg = normalizeEuiccHardware({
      chipInfo: {
        eids: [{
          eid: '89049032000000000000000000000002',
          aid: 'A0000005591010FFFFFFFF8900000100',
          sasAccreditationNumber: 'GD-NG-UP-1227',
          freeNvram: '400.34 KB',
          freeNvramBytes: 409948,
        }],
      },
    })
    assert.equal(dg[0].nameplate, 'G+D天联')
    assert.equal(dg[0].brand, 'G+D天联')
    assert.equal(dg[0].sas, 'GD-NG-UP-1227')
    assert.equal(dg[0].chipMaker, 'G+D Mobile Security GmbH')
  })

  it('round-trips backend IP version names without collapsing IPV4V6 to IPv4', () => {
    assert.equal(normalizeCardPolicy({ ip_version: 'IP' }).ipVersion, 'v4')
    assert.equal(normalizeCardPolicy({ ip_version: 'IPV6' }).ipVersion, 'v6')
    assert.equal(normalizeCardPolicy({ ip_version: 'IPV4V6' }).ipVersion, 'v4v6')
    assert.equal(cardPolicyToPayload({ ipVersion: 'v4' }).ip_version, 'IP')
    assert.equal(cardPolicyToPayload({ ipVersion: 'v6' }).ip_version, 'IPV6')
    assert.equal(cardPolicyToPayload({ ipVersion: 'v4v6' }).ip_version, 'IPV4V6')
    assert.equal(normalizeCardPolicy({ mbn_profile: 'OpenMkt-Commercial-CU' }).mbnProfile, 'OpenMkt-Commercial-CU')
    assert.equal(cardPolicyToPayload({ mbnProfile: 'OpenMkt-Commercial-CU' }).mbn_profile, 'OpenMkt-Commercial-CU')
    assert.equal(Object.hasOwn(cardPolicyToPayload({}), 'mbn_profile'), false)
    assert.equal(normalizeCardPolicy({}).voicePath, 'vowifi')
    assert.equal(normalizeCardPolicy({ voice_path: 'cellular' }).voicePath, 'cellular')
    assert.equal(cardPolicyToPayload({ voicePath: 'cellular' }).voice_path, 'cellular')
  })

  it('reads OneWIFI groups { eid, profiles }', () => {
    const list = parseOnewifiEsimPayload([
      {
        eid: '89033023',
        aidHex: 'A0000005591010FFFFFFFF8900000177',
        profiles: [
          { iccid: '89860001', name: 'Home', stateText: '已启用', state: 'enabled' },
        ],
      },
    ])
    assert.equal(list.length, 1)
    assert.equal(list[0].iccid, '89860001')
    assert.equal(list[0].aidHex, 'A0000005591010FFFFFFFF8900000177')
    assert.equal(list[0].stateText, '已启用')
    assert.equal(list[0].active, true)
  })

  it('keeps a single current profile when two dual-eUICC rows are both enabled on chip', () => {
    const list = parseOnewifiEsimPayload([
      {
        eid: '8903302300000001',
        aidHex: 'A06573746B6D65FFFF4953442D522030',
        profiles: [{ iccid: '89000000000000065517', name: 'Vodafone DE-1', state: 1 }],
      },
      {
        eid: '8903302300000002',
        aidHex: 'A06573746B6D65FFFF4953442D522031',
        profiles: [{ iccid: '89000000000000085280', name: 'ASDA', state: 1 }],
      },
    ])
    const next = applyLiveIccidToProfiles(list, '89000000000000065517')
    assert.equal(next.filter((profile) => profile.active).length, 1)
    assert.equal(next.find((profile) => profile.active)?.iccid, '89000000000000065517')
    assert.equal(next.find((profile) => profile.iccid === '89000000000000085280')?.active, false)
  })

  it('repaints stale enabled rows from the live VoWiFi ICCID', () => {
    const stale = [
      { iccid: '8986000000000000001', name: 'stale', active: true, stateText: '已启用' },
      { iccid: '8986000000000000002', name: 'live', active: false, stateText: '已禁用' },
    ]
    const next = applyLiveIccidToProfiles(stale, '8986000000000000002')
    assert.equal(next[0].active, false)
    assert.equal(next[1].active, true)
    assert.equal(stale[0].active, true)
  })

  it('keeps the last real eSIM name instead of flashing ICCID or dash', () => {
    assert.equal(retainEsimProfileName('Vodafone eSIM', 'ICCID 2624', ''), 'Vodafone eSIM')
    assert.equal(retainEsimProfileName('Vodafone eSIM', '—', ''), 'Vodafone eSIM')
    assert.equal(retainEsimProfileName('Vodafone eSIM', 'ICCID 9001', 'EE eSIM'), 'EE eSIM')
    assert.equal(retainEsimProfileName('', 'ICCID 2624', ''), 'ICCID 2624')
    const merged = mergeOverviewKeepingEsimName(
      { esimProfile: 'Vodafone eSIM', iccid: '89860001' },
      { esimProfile: 'ICCID 2624', iccid: '89860002' },
      '',
    )
    assert.equal(merged.esimProfile, 'Vodafone eSIM')
    assert.equal(merged.iccid, '89860002')
  })

  it('treats the API string state "1" as enabled', () => {
    const [profile] = parseOnewifiEsimPayload({
      profiles: [{ iccid: '89860002', name: 'Current', state: '1' }],
    })
    assert.equal(profile.active, true)
    assert.equal(profile.stateText, '已启用')
  })

  it('surfaces not_euicc instead of empty-cache copy', () => {
    const hint = onewifiEsimHint({
      error: { code: 'not_euicc', message: 'card does not appear to be an eUICC' },
    }, [])
    assert.match(hint, /读芯片|普通 SIM|eSIM|eUICC/i)
  })

  it('surfaces AT port 503 instead of empty-cache copy', () => {
    const hint = onewifiEsimHint({
      error: { code: 'at_port_unavailable', message: 'device has no usable AT port' },
    }, [])
    assert.match(hint, /AT|at port|口/i)
  })

  it('does not call QMI transport failure an ordinary SIM', () => {
    const hint = onewifiEsimHint({
      error: {
        code: 'esim_qmi_unavailable',
        message: 'eSIM QMI UIM is unavailable; the card was not proven to be an ordinary SIM',
      },
    }, [])
    assert.match(hint, /QMI|读芯片|VoWiFi/i)
    assert.doesNotMatch(hint, /没读到 eSIM 应用/)
  })

  it('surfaces card_absent instead of the generic device-operation blob', () => {
    const hint = onewifiEsimHint({
      error: { code: 'card_absent', message: 'no card is inserted' },
    }, [])
    assert.match(hint, /读卡器|未检测|读芯片/)
    assert.doesNotMatch(hint, /the device operation failed/)
  })

  it('surfaces a busy DOT hub instead of the generic device-operation blob', () => {
    const hint = onewifiEsimHint({
      error: { code: 'reader_hub_busy', message: 'usb reader hub is busy' },
    }, [])
    assert.match(hint, /HUB|DOT|切卡|读芯片/)
    assert.doesNotMatch(hint, /the device operation failed/)
  })

  it('surfaces reader_unavailable instead of a missing-card hint', () => {
    const hint = onewifiEsimHint({
      error: { code: 'reader_unavailable', message: 'the smart card reader is not ready' },
    }, [])
    assert.match(hint, /就绪|读芯片/)
    assert.doesNotMatch(hint, /没有检测到卡/)
  })

  it('tells the operator a 6900 chip is not a missing card', () => {
    const hint = onewifiEsimHint({
      error: { code: 'esim_status', message: 'the eUICC rejected the chip-read command' },
    }, [])
    assert.match(hint, /7eSim|ESTKme|读芯片/)
    assert.doesNotMatch(hint, /没有检测到卡/)
  })

  it('asks to read the chip when the inventory cache is empty', () => {
    const hint = onewifiEsimHint({ cached: false, ses: [] }, [])
    assert.match(hint, /读芯片/)
    assert.match(hint, /短暂停|停 VoWiFi/)
    assert.doesNotMatch(hint, /强制刷新/)
  })

  it('does not call VoWiFi UIM occupancy an ordinary SIM', () => {
    const hint = onewifiEsimHint({
      data: {
        error: { code: 'esim_uim_busy', message: 'VoWiFi is holding UIM' },
        ses: [],
      },
    }, [])
    assert.match(hint, /读芯片|短暂停/)
    assert.doesNotMatch(hint, /没读到 eSIM 应用/)
  })
})

describe('currentSimAsProfile', () => {
  it('fills a locked current-SIM row from overview', () => {
    const row = currentSimAsProfile({ iccid: '****2624', operator: 'EE' }, {})
    assert.equal(row.iccid, '****2624')
    assert.equal(row.name, 'EE')
    assert.equal(row.locked, true)
    assert.equal(row.active, true)
  })

  it('returns null without ICCID', () => {
    assert.equal(currentSimAsProfile({ operator: 'EE' }, {}), null)
  })
})

describe('esim delete copy', () => {
  it('names the card by tail 4 and refuses the enabled profile', () => {
    const disabled = { iccid: '894430000000002624', name: 'CTExcel eSIM', active: false }
    const enabled = { ...disabled, active: true }
    const locked = { iccid: '****2624', name: 'EE', active: true, locked: true }
    const message = esimDeleteConfirmMessage(disabled)
    assert.match(message, /CTExcel eSIM/)
    assert.match(message, /尾号 2624/)
    assert.doesNotMatch(message, /894430000000002624/)
    assert.equal(canDeleteEsimProfile(disabled), true)
    assert.equal(canDeleteEsimProfile(enabled), false)
    assert.equal(canDeleteEsimProfile(locked), false)
    assert.match(esimDeleteActionLabel(enabled), /当前启用/)
    assert.match(esimDeleteActionLabel(locked), /物理卡/)
  })
})

describe('esim switch progress', () => {
  it('paints five 切卡 steps from the overview wire', () => {
    const progress = normalizeEsimSwitchProgress({
      active: true,
      step: 3,
      status: 'running',
      steps: [
        { key: 'stop', ready: true },
        { key: 'flight', ready: true },
        { key: 'write', pending: true },
        { key: 'check' },
        { key: 'back' },
      ],
    })
    assert.deepEqual(progress.stages.map((s) => s.label), ['停网', '飞行', '写卡', '校验', '恢复'])
    assert.equal(progress.stages[0].ready, true)
    assert.equal(progress.stages[2].pending, true)
    assert.equal(progress.stages[4].ready, false)
    const phased = normalizeEsimSwitchProgress({
      phase: 'failed_internal',
      recoverable: false,
      fail_reason: 'write_rejected',
      phases: Array.from({ length: 11 }, (_, index) => ({ key: String(index) })),
      steps: [{ key: 'write', failed: true }],
    })
    assert.equal(phased.phase, 'failed_internal')
    assert.equal(phased.recoverable, false)
    assert.equal(phased.failReason, 'write_rejected')
    assert.equal(phased.phases.length, 11)
    assert.deepEqual(phased.stages.map((stage) => stage.label), ['停网', '飞行', '写卡', '校验', '恢复'])
    const overview = normalizeDeviceOverview({
      esim_switch: { active: true, step: 1, status: 'running', steps: [{ key: 'stop', pending: true }] },
    })
    assert.equal(overview.switchProgress.stages[0].pending, true)
    assert.equal(idleEsimSwitchStages().length, ESIM_SWITCH_STEPS.length)
  })
})

describe('policyFromDeviceRow', () => {
  it('builds toggles from device flags when ICCID is missing', () => {
    const policy = policyFromDeviceRow(normalizeDevice(liveBaiwang))
    assert.equal(policy.networkEnabled, false)
    assert.equal(policy.vowifiEnabled, true)
    assert.equal(policy.airplaneEnabled, false)
  })
})

describe('SMS modem storage', () => {
  it('normalizes ME/SM usage and warns at 90% or full', () => {
    assert.equal(normalizeSmsStorage(null), null)
    assert.deepEqual(normalizeSmsStorage({
      me: { used: 21, total: 23 },
      sm: { used: 0, total: 40 },
    }), {
      me: { used: 21, total: 23 },
      sm: { used: 0, total: 40 },
    })
    assert.equal(smsStorageAreaFull({ used: 20, total: 23 }), false)
    assert.equal(smsStorageAreaFull({ used: 21, total: 23 }), true)
    assert.equal(smsStorageAreaFull({ used: 23, total: 23 }), true)
    assert.equal(smsStorageWarning({ me: { used: 21, total: 23 } }), '模组短信存储已满，新短信可能无法接收')
    assert.equal(smsStorageWarning({ sm: { used: 36, total: 40 } }), 'SIM 短信存储已满，新短信可能无法接收')
    assert.equal(smsStorageWarning({
      me: { used: 23, total: 23 },
      sm: { used: 40, total: 40 },
    }), '模组和 SIM 短信存储已满，新短信可能无法接收')
    const overview = normalizeDeviceOverview({
      sms_storage: { me: { used: 21, total: 23 }, sm: { used: 2, total: 40 } },
    })
    assert.deepEqual(overview.smsStorage.me, { used: 21, total: 23 })
    assert.equal(overview.smsStorageWarning, '模组短信存储已满，新短信可能无法接收')
  })
})

describe('SMS field mapping', () => {
  it('parses ISO timestamp like smsText.toTs and prefers content', () => {
    assert.equal(Number.isNaN(Number('2026-08-30T18:00:00Z')), true)
    assert.ok(smsTimeMs('2026-08-30T18:00:00Z') > 0)
    const message = normalizeSmsMessage({
      id: 9,
      timestamp: '2026-08-30T18:00:00Z',
      content: '你好 OneWIFI',
      direction: 'inbound',
      peer: '+447700900123',
    })
    assert.equal(message.body, '你好 OneWIFI')
    assert.equal(message.direction, 'in')
    assert.notEqual(message.dateKey, '未知日期')
    assert.notEqual(message.timeLabel, '—')
  })

  it('reads last_content / last_timestamp the way deriveThread does', () => {
    const contact = normalizeSmsContact({
      peer: '+447700900123',
      last_content: '预览正文',
      last_timestamp: '2026-08-30T18:00:00Z',
    })
    assert.equal(contact.lastMessage, '预览正文')
    assert.ok(contact.lastTs > 0)
    assert.notEqual(contact.lastTimeLabel, '—')
  })

  it('shows binary hex dumps as a normal inbox line', () => {
    const message = normalizeSmsMessage({
      id: 3,
      timestamp: '2026-08-30T18:08:40Z',
      body: '00281516001919020A1001FBDD7FB2EC',
      direction: 'inbound',
      peer: '0805',
    })
    assert.equal(message.body, '收到一条系统短信')
    const contact = normalizeSmsContact({
      peer: '0805',
      last_content: '00381516001919B00001E8464664FCEE',
    })
    assert.equal(contact.lastMessage, '收到一条系统短信')
    assert.equal(displaySmsBody('你好'), '你好')
  })
})
