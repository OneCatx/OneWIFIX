import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  countryCodeFromChineseLabel,
  formatNodeDisplayName,
  guessCountryCode,
  resolveNodeCountryCode,
} from './countryNodes.js'

describe('guessCountryCode', () => {
  it('maps Chinese long labels to TW/MO/HK', () => {
    assert.equal(guessCountryCode('中国台湾'), 'TW')
    assert.equal(guessCountryCode('中国澳门'), 'MO')
    assert.equal(guessCountryCode('中国香港'), 'HK')
    assert.equal(guessCountryCode('中国'), 'CN')
  })

  it('does not treat device ids or UK hostnames as countries', () => {
    assert.equal(guessCountryCode('Module-ID-2'), 'GLOBAL')
    assert.equal(guessCountryCode('device-id-1'), 'GLOBAL')
    assert.equal(guessCountryCode('node.co.uk'), 'GLOBAL')
  })

  it('still reads explicit country tokens', () => {
    assert.equal(guessCountryCode('HK-WIFI'), 'HK')
    assert.equal(guessCountryCode('US-01'), 'US')
    assert.equal(guessCountryCode('HK | 香港'), 'HK')
  })
})

describe('countryCodeFromChineseLabel', () => {
  it('reads pipe suffixes with long labels first', () => {
    assert.equal(countryCodeFromChineseLabel('TAG | 中国台湾'), 'TW')
    assert.equal(countryCodeFromChineseLabel('TAG | 中国澳门'), 'MO')
  })
})

describe('formatNodeDisplayName', () => {
  it('strips decorative flags/earth/rocket but keeps business text', () => {
    assert.equal(formatNodeDisplayName('🇭🇰 HK TAG | 香港'), 'HK | 香港')
    assert.equal(formatNodeDisplayName('🚀 香港中继'), '香港中继')
    assert.equal(formatNodeDisplayName('🌍 GLOBAL'), 'GLOBAL')
    assert.equal(formatNodeDisplayName('Premium 🇭🇰 HK'), 'Premium HK')
  })
})

describe('resolveNodeCountryCode', () => {
  it('does not bucket a UK hostname as Colombia', () => {
    assert.equal(resolveNodeCountryCode({ name: 'relay', server: 'node.co.uk' }), 'GLOBAL')
  })

  it('keeps an existing ISO-2 on the node', () => {
    assert.equal(resolveNodeCountryCode({ name: '中国', region: 'TW' }), 'TW')
  })
})
