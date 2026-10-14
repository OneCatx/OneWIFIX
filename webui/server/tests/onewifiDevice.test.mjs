import test from 'node:test'
import assert from 'node:assert/strict'
import { displaySecret } from '../../src/utils/onewifiModel.device.js'
import {
  boardModems,
  boardOverviewFromDevice,
  canRetryVowifi,
  carrierLabel,
  deviceCapability,
  deviceTitle,
  engineLines,
  esimReaderOf,
  mergeLiveLineStatus,
  overviewCounts,
  policyFromOnewifiDevice,
  policyPatchToCapabilities,
  smsCapableDevices,
  supportsCellular,
} from '../../src/utils/onewifiDevice.js'

test('canRetryVowifi 只在意图为开且实际不健康时出现', () => {
  assert.equal(canRetryVowifi({
    present: true,
    capabilities: { vowifi: { desired: true, actual: 'error' } },
  }), true)
  assert.equal(canRetryVowifi({
    present: true,
    capabilities: { vowifi: { desired: true, actual: 'on' } },
  }), false)
  assert.equal(canRetryVowifi({
    present: true,
    capabilities: { vowifi: { desired: false, actual: 'off' } },
  }), false)
  assert.equal(canRetryVowifi({ present: false, capabilities: { vowifi: { desired: true, actual: 'error' } } }), false)
  assert.equal(canRetryVowifi({ capabilities: { vowifi: { desired: true, actual: 'error' } } }), false)
})

test('deviceCapability 读 desired/actual', () => {
  const cap = deviceCapability({
    capabilities: { cellular: { desired: true, actual: 'starting', reason: 'wait' } },
  }, 'cellular')
  assert.equal(cap.desired, true)
  assert.equal(cap.actual, 'starting')
  assert.equal(cap.reason, 'wait')
})

test('读卡器不算蜂窝设备', () => {
  assert.equal(supportsCellular({ device_type: 'reader', capabilities: { cellular: { actual: 'unsupported' } } }), false)
})

test('deviceTitle 回落', () => {
  assert.equal(deviceTitle({ name: 'Quectel' }), 'Quectel')
  assert.equal(deviceTitle({}, 2), '设备 3')
})

test('carrierLabel 离线与未插 SIM', () => {
  assert.equal(carrierLabel({ present: false }), '设备未连接')
  assert.equal(carrierLabel({ present: true, sim: { present: false } }), '未插 SIM')
  assert.equal(carrierLabel({ sim: { carrier: { name: 'EE' } } }), 'EE')
})

test('overviewCounts 统计 4G / VoWiFi / 需关注', () => {
  const counts = overviewCounts([
    { capabilities: { cellular: { actual: 'on' }, vowifi: { actual: 'on' } } },
    { capabilities: { cellular: { actual: 'error' }, vowifi: { actual: 'off' } } },
  ])
  assert.equal(counts.devices, 2)
  assert.equal(counts.cellular, 1)
  assert.equal(counts.vowifi, 1)
  assert.equal(counts.attention, 1)
})

test('smsCapableDevices 列出在位模组，不要求 instance_id', () => {
  const listed = smsCapableDevices([
    { id: 'm1', present: true, device_type: 'modem' },
    { id: 'm2', present: false, device_type: 'modem', instance_id: '9' },
    { id: 'r1', present: true, device_type: 'reader' },
  ])
  assert.equal(listed.length, 1)
  assert.equal(listed[0].id, 'm1')
})

test('esimReaderOf 优先 reader 字段', () => {
  assert.equal(esimReaderOf({ reader: 'VPCD 0', name: 'EC25' }), 'VPCD 0')
  assert.equal(
    esimReaderOf({ id: '2c7c-0125-3-1', name: 'DJI/Quectel EC25', device_type: 'modem' }),
    'VoWiFi Modem 2c7c-0125-3-1 00 00',
  )
  assert.equal(esimReaderOf({ id: '2c7c-0125-3-1' }), 'VoWiFi Modem 2c7c-0125-3-1 00 00')
  assert.equal(esimReaderOf({ device_type: 'reader', name: 'USB Reader', id: 'reader-ab' }), 'USB Reader')
})

test('engineLines 只要已开通的线路', () => {
  assert.equal(engineLines([
    { id: 'a', present: true, instance_id: '1' },
    { id: 'b', present: true },
  ]).length, 1)
})

test('mergeLiveLineStatus 把 WS status 写进 vowifi.actual', () => {
  const next = mergeLiveLineStatus(
    { capabilities: { vowifi: { desired: true, actual: 'starting' } } },
    { state: 'OK', label: 'Registered' },
  )
  assert.equal(next.capabilities.vowifi.actual, 'on')
  assert.equal(next.vowifi.ims, 'Registered')
})

test('mergeLiveLineStatus 把 EAP-AKA 失败显示为异常而不是连接中', () => {
  const failed = mergeLiveLineStatus(
    { capabilities: { vowifi: { desired: true, actual: 'starting' } } },
    { state: 'ERROR', reason_code: 'tunnel_sim_auth', reason: 'SIM authentication (EAP-AKA) was rejected.', label: 'Failed' },
  )
  assert.equal(failed.capabilities.vowifi.actual, 'error')
  const unauthorized = mergeLiveLineStatus(
    { capabilities: { vowifi: { desired: true, actual: 'starting' } } },
    { state: 'TUNNEL_DOWN', reason_code: 'tunnel_not_authorized', label: 'Establishing VoWiFi tunnel' },
  )
  assert.equal(unauthorized.capabilities.vowifi.actual, 'error')
})

test('mergeLiveLineStatus 引擎已停不再显示连接中', () => {
  const stopped = mergeLiveLineStatus(
    { capabilities: { vowifi: { desired: true, actual: 'starting' } } },
    { state: 'STOPPED', reason_code: 'stopped', label: 'Stopped' },
  )
  assert.equal(stopped.capabilities.vowifi.actual, 'degraded')
})

test('mergeLiveLineStatus ePDG 已通 IMS 未注册显示降级而不是连接中', () => {
  const waiting = mergeLiveLineStatus(
    { capabilities: { vowifi: { desired: true, actual: 'starting' } } },
    {
      state: 'REGISTERING',
      reason_code: 'registering',
      reason: 'VoWiFi tunnel is up — registering to the carrier\'s IMS…',
      detail: { pcscf: '10.0.0.1' },
    },
  )
  assert.equal(waiting.capabilities.vowifi.actual, 'degraded')
})

test('boardModems 排除读卡器但保留离线模组', () => {
  const listed = boardModems([
    { id: 'm1', present: true, device_type: 'modem' },
    { id: 'm2', present: false, device_type: 'modem' },
    { id: 'r1', present: true, device_type: 'reader' },
  ])
  assert.equal(listed.map((d) => d.id).join(','), 'm1,m2')
})

test('boardOverviewFromDevice 徽章用能力态中文，运营商不是 [object Object]', () => {
  const overview = boardOverviewFromDevice({
    id: '2c7c-0125-3-2',
    device_type: 'modem',
    present: true,
    firmware: 'EC25EFAR06A06M4G',
    imei: '860123456789012',
    imei_masked: '****9012',
    status: { state: 'STOPPED', label: 'Stopped', reason: 'Stopped.', reason_code: 'stopped' },
    sim: {
      present: true,
      iccid: '8985200123456789012',
      iccid_masked: '****9012',
      imsi: '454001234567890',
      number: '447700900123',
      carrier: { name: 'O2', home_network: 'O2 - UK', plmn: '234-10' },
    },
    cellular: { ip: '10.8.1.20', interface: 'wwan0', apn: 'mobile' },
    capabilities: {
      vowifi: { desired: true, actual: 'off', reason: 'Stopped.' },
      cellular: { desired: true, actual: 'on' },
      flight: { desired: false, actual: 'off' },
    },
  })
  assert.equal(overview.wificallLabel, '关闭')
  assert.equal(overview.wificallReady, false)
  assert.equal(overview.operator, 'O2 · O2 - UK')
  assert.equal(overview.networkRows.find((row) => row.label === '公网 IP')?.value, '10.8.1.20')
  assert.equal(overview.networkRows.find((row) => row.label === '运营商')?.value, 'O2 · O2 - UK')
  assert.doesNotMatch(overview.operator, /object Object/i)
  assert.doesNotMatch(overview.wificallLabel, /Stopped|Failed/i)
  assert.equal(overview.dataPlane, 'wwan0')
  assert.equal(overview.imei, '860123456789012')
  assert.equal(displaySecret(overview.imei), '****9012')
  assert.equal(displaySecret(overview.imei, true), '860123456789012')
})

test('boardOverviewFromDevice 异常徽章不是 Failed 英文', () => {
  const overview = boardOverviewFromDevice({
    status: { state: 'ERROR', label: 'Failed', reason_code: 'tunnel_sim_auth' },
    sim: { present: true, iccid: '89', carrier: { name: 'EE' } },
    capabilities: { vowifi: { desired: true, actual: 'error', reason: 'SIM authentication was rejected.' } },
  })
  assert.equal(overview.wificallLabel, '异常')
  assert.equal(overview.operator, 'EE')
  assert.equal(overview.errorCategory, 'tunnel_sim_auth')
})

test('policyFromOnewifiDevice / policyPatchToCapabilities 只映射三个能力开关', () => {
  const policy = policyFromOnewifiDevice({
    cellular: { apn: 'three.co.uk' },
    capabilities: {
      cellular: { desired: true, actual: 'on' },
      vowifi: { desired: false, actual: 'off' },
      flight: { desired: true, actual: 'on' },
    },
  })
  assert.equal(policy.apn, 'three.co.uk')
  assert.equal(policy.networkEnabled, true)
  assert.equal(policy.vowifiEnabled, false)
  assert.equal(policy.airplaneEnabled, true)
  assert.deepEqual(
    policyPatchToCapabilities({ networkEnabled: false, vowifiEnabled: true, airplaneEnabled: false, apn: 'x', ipVersion: 'v6' }),
    { cellular_enabled: false, vowifi_enabled: true, flight_mode: false },
  )
  assert.deepEqual(policyPatchToCapabilities({ apn: 'x' }), {})
})
