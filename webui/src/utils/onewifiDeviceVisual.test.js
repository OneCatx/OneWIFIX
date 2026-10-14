import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mapOnewifiDevice } from './onewifiDevice.js'
import { resolveDeviceCountryCode } from './onewifiDeviceVisual.js'

describe('resolveDeviceCountryCode', () => {
  it('ignores device name and egress hostname', () => {
    assert.equal(resolveDeviceCountryCode({
      name: 'Module-ID-2',
      egress: { node: 'node.co.uk' },
    }), 'GLOBAL')
  })

  it('uses mapped backend country codes', () => {
    const mapped = mapOnewifiDevice({
      name: 'Module-ID-2',
      egress: { node: 'node.co.uk' },
      modem: {
        operator_country_code: 'CN',
        home_carrier_country_code: 'MO',
        card_country: '中国澳门',
      },
    })
    assert.equal(resolveDeviceCountryCode(mapped), 'MO')
  })

  it('accepts egress detected ISO without rewriting by name', () => {
    assert.equal(resolveDeviceCountryCode({
      name: '中国',
      egress: { detected_country: 'TW' },
    }), 'TW')
  })
})
