import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  GLOBAL_FLAG_PATH,
  getFlagAssetPath,
  hasFlagAsset,
  isIsoCountryCode,
  matchLongestCountryLabel,
  normalizeCountryCode,
} from './countryRegistry.js'

describe('matchLongestCountryLabel', () => {
  it('prefers longer Chinese labels over 中国', () => {
    assert.equal(matchLongestCountryLabel('中国台湾'), 'TW')
    assert.equal(matchLongestCountryLabel('中国澳门'), 'MO')
    assert.equal(matchLongestCountryLabel('中国香港'), 'HK')
    assert.equal(matchLongestCountryLabel('中国'), 'CN')
    assert.equal(matchLongestCountryLabel('台湾'), 'TW')
    assert.equal(matchLongestCountryLabel('澳门'), 'MO')
  })

  it('keeps 印度尼西亚 from collapsing to 印度', () => {
    assert.equal(matchLongestCountryLabel('印度尼西亚'), 'ID')
    assert.equal(matchLongestCountryLabel('印度'), 'IN')
  })
})

describe('normalizeCountryCode', () => {
  it('keeps unknown ISO-2 instead of rewriting to GLOBAL', () => {
    assert.equal(normalizeCountryCode('MO'), 'MO')
    assert.equal(normalizeCountryCode('QA'), 'QA')
    assert.equal(normalizeCountryCode('uk'), 'GB')
    assert.equal(normalizeCountryCode(''), 'GLOBAL')
  })
})

describe('hasFlagAsset', () => {
  it('does not claim a missing Macao SVG', () => {
    assert.equal(hasFlagAsset('TW'), true)
    assert.equal(hasFlagAsset('HK'), true)
    assert.equal(hasFlagAsset('MO'), false)
    assert.equal(hasFlagAsset('QA'), false)
    assert.equal(getFlagAssetPath('MO'), GLOBAL_FLAG_PATH)
  })
})

describe('isIsoCountryCode', () => {
  it('accepts aliases and rejects free text', () => {
    assert.equal(isIsoCountryCode('MO'), true)
    assert.equal(isIsoCountryCode('UK'), true)
    assert.equal(isIsoCountryCode('中国澳门'), false)
    assert.equal(isIsoCountryCode('Module-ID-2'), false)
  })
})
