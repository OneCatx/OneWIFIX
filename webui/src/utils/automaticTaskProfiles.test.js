import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildAutomaticTaskProfileOptions,
  currentDeviceICCID,
  esimGroupsFromPayload,
  isUsbSimReader,
  selectAutomaticTaskProfileOption,
} from './automaticTaskProfiles.js'

describe('automatic task profile options', () => {
  it('masks ICCID in labels and keeps full value for the API', () => {
    const options = buildAutomaticTaskProfileOptions({
      ses: [{
        aidHex: 'A0000005591010FFFFFFFF8900000100',
        profiles: [
          { iccid: '89443012345678901234', name: 'CTExcel', serviceProviderName: 'EE' },
        ],
      }],
    })
    assert.equal(options.length, 1)
    assert.equal(options[0].iccid, '89443012345678901234')
    assert.equal(options[0].aidHex, 'A0000005591010FFFFFFFF8900000100')
    assert.equal(options[0].label, 'CTExcel · ****1234')
    assert.equal(options[0].label.includes('89443012345678901234'), false)
  })

  it('adds the current SIM when it is missing from the chip list', () => {
    const options = buildAutomaticTaskProfileOptions({ profiles: [] }, '89033011223344556677')
    assert.equal(options.length, 1)
    assert.equal(options[0].label, '当前 SIM · ****6677')
  })

  it('unwraps a raw group array the same way as /esim/profiles', () => {
    const groups = esimGroupsFromPayload([
      { aidHex: 'AA', profiles: [{ iccid: '89860000123456789012', name: 'Home' }] },
    ])
    assert.equal(groups.length, 1)
    const options = buildAutomaticTaskProfileOptions(groups)
    assert.equal(options[0].label, 'Home · ****9012')
    assert.equal(selectAutomaticTaskProfileOption(options, '89860000123456789012')?.aidHex, 'AA')
  })

  it('treats usb_sim_reader as a reader and reads current ICCID from modem', () => {
    assert.equal(isUsbSimReader({ device_type: 'usb_sim_reader' }), true)
    assert.equal(isUsbSimReader({ device_type: 'pcie_ec20_ec25' }), false)
    assert.equal(currentDeviceICCID({ modem: { iccid: '8944ABCD' } }), '8944ABCD')
  })
})
