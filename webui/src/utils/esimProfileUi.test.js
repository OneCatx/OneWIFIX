import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  esimBadgeClass,
  esimStateLabel,
  fallbackEsimProfiles,
  liveIccidFromDevice,
  profilesFromDevicePayload,
} from './esimProfileUi.js'

describe('esim profile UI helpers', () => {
  it('marks the live ICCID as the current profile', () => {
    const device = { vowifi_runtime: { iccid: '89000000000000001234' } }
    const list = profilesFromDevicePayload({
      profiles: [
        { iccid: '89000000000000001234', name: '主卡', stateText: '已启用' },
        { iccid: '89000000000000005678', name: '副卡', stateText: '已禁用' },
      ],
    }, device)
    assert.equal(liveIccidFromDevice(device), '89000000000000001234')
    assert.equal(list[0].active, true)
    assert.equal(list[1].active, false)
    assert.equal(esimStateLabel(list[0]), '已启用')
    assert.equal(esimBadgeClass(list[0]), 'current')
  })

  it('falls back to device-embedded profiles', () => {
    const list = fallbackEsimProfiles({
      esim_profiles: { profiles: [{ iccid: '8901', name: '缓存卡', active: true }] },
    })
    assert.equal(list.length, 1)
    assert.equal(list[0].name, '缓存卡')
  })
})
