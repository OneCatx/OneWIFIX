import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readUiLanguage } from './uiLanguage.js'

describe('readUiLanguage', () => {
  it('reads zh and en from a flat or wrapped payload', () => {
    assert.equal(readUiLanguage({ language: 'zh' }), 'zh')
    assert.equal(readUiLanguage({ language: 'en' }), 'en')
    assert.equal(readUiLanguage({ language: 'en-US' }), 'en')
    assert.equal(readUiLanguage({ language: 'zh-CN' }), 'zh')
    assert.equal(readUiLanguage({ data: { language: 'en' } }), 'en')
    assert.equal(readUiLanguage({}), '')
  })
})
