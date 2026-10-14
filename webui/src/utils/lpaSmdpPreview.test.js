import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatProfileBytes,
  formatSmdpPreview,
  lookupSmdpPreview,
  previewLpaActivation,
} from './lpaSmdpPreview.js'

const fixture = {
  hosts: {
    'rsp.example.com': {
      c: ['JP'],
      o: ['Example Mobile'],
      r: 40960,
      n: 40960,
      x: 40960,
      e: { 89049032: 41175, 89033023: 36086 },
    },
    'wholesale.example.com': {
      c: ['JP', 'KR', 'US', 'GB'],
      o: ['Alpha', 'Beta'],
      k: 12,
      r: 50000,
      n: 20000,
      x: 90000,
      e: { 89049032: 52000 },
    },
  },
}

describe('lpaSmdpPreview', () => {
  it('does not invent a country from an empty or host-less activation code', () => {
    assert.equal(previewLpaActivation(''), null)
    assert.equal(previewLpaActivation('LPA:1$'), null)
  })

  it('looks up country and EUM-specific size from the SM-DP+ host before download', () => {
    const preview = previewLpaActivation(
      'LPA:1$rsp.example.com$MATCH-1',
      { eid: '89049032000000000000000000000002' },
      fixture,
    )
    assert.equal(preview.known, true)
    assert.equal(preview.countries[0].name, '日本')
    assert.equal(preview.countries[0].flag, '🇯🇵')
    assert.equal(preview.operators[0], 'Example Mobile')
    assert.equal(preview.sizeBytes, 41175)
    assert.equal(preview.matchedEum, '89049032')
    assert.equal(preview.sizeRanged, false)
    assert.equal(formatSmdpPreview(preview).size, '约 40.2 KB')
  })

  it('falls back to a size range on a shared wholesale SM-DP+', () => {
    const preview = lookupSmdpPreview('wholesale.example.com', { eid: 'unknown' }, fixture)
    assert.equal(preview.sizeRanged, true)
    assert.equal(preview.countries.length, 4)
    const text = formatSmdpPreview(preview)
    assert.match(text.title, /等 4 地/)
    assert.match(text.detail, /12 家/)
    assert.match(text.size, /19\.5 KB–87\.9 KB/)
  })

  it('warns when the estimate is larger than free NVRAM', () => {
    const preview = lookupSmdpPreview(
      'rsp.example.com',
      { eid: '8903302300000001', freeNvramBytes: 10000 },
      fixture,
    )
    assert.equal(preview.sizeBytes, 36086)
    assert.equal(preview.spaceWarning, true)
    assert.match(formatSmdpPreview(preview).warning, /可用空间/)
  })

  it('marks an unknown SM-DP+ instead of guessing a country', () => {
    const preview = previewLpaActivation('1$no-such-smdp.invalid$abc', {}, fixture)
    assert.deepEqual(preview, { known: false, host: 'no-such-smdp.invalid' })
    assert.match(formatSmdpPreview(preview).title, /未收录/)
  })

  it('recognizes a real Nekoko sample host from the compact community table', () => {
    const preview = previewLpaActivation('LPA:1$sm-v4-018-gra-gtm.pr.go-esim.com$abc', {
      eid: '8904903200000002',
    })
    assert.equal(preview.known, true)
    assert.equal(preview.countries[0].iso, 'GR')
    assert.equal(preview.countries[0].name, '希腊')
    assert.equal(preview.operators[0], 'Vodafone GR')
    assert.equal(preview.sizeBytes, 60352)
    assert.equal(formatProfileBytes(preview.sizeBytes), '58.9 KB')
  })
})
