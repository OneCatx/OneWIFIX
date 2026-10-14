import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { normalizePairingOrigin, rewritePairingPayload } from './pairingOrigin.js'

describe('pairing origin', () => {
  it('normalizes host:port into an http origin', () => {
    assert.equal(normalizePairingOrigin('203.0.113.10:6699'), 'http://203.0.113.10:6699')
    assert.equal(normalizePairingOrigin('https://wifi.example:8443/extra?x=1'), 'https://wifi.example:8443')
    assert.equal(normalizePairingOrigin('ftp://wifi.example'), '')
    assert.equal(normalizePairingOrigin(''), '')
  })

  it('rewrites pairing u= without rotating the token', () => {
    const uri = 'onetools://onewifi?t=secret-token&u=http%3A%2F%2F192.168.1.88%3A6699'
    const json = '{"v":1,"u":"http://192.168.1.88:6699","t":"secret-token"}'
    const next = rewritePairingPayload({
      uri,
      json,
      origin: '203.0.113.10:6699',
    })
    assert.match(next.uri, /^onetools:\/\/onewifi\?/)
    assert.match(next.uri, /t=secret-token/)
    assert.match(next.uri, /u=http%3A%2F%2F203.0.113.10%3A6699/)
    assert.equal(next.json.includes('"t":"secret-token"'), true)
    assert.equal(next.json.includes('"u":"http://203.0.113.10:6699"'), true)
    assert.equal(next.json.includes('192.168.1.88'), false)
  })

  it('returns empty when public origin is missing', () => {
    const next = rewritePairingPayload({
      uri: 'onetools://onewifi?t=secret-token&u=http%3A%2F%2F192.168.1.88%3A6699',
      json: '{"v":1,"u":"http://192.168.1.88:6699","t":"secret-token"}',
      origin: '',
    })
    assert.equal(next.uri, '')
    assert.equal(next.json, '')
  })
})
