import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { pairingQrDataUrl, pairingQrSvg } from '../utils/pairingQr.js'

describe('pairing QR', () => {
  it('encodes the pairing URI locally instead of calling a QR API', () => {
    const uri = 'onetools://onewifi?u=https%3A%2F%2Fwifi.example&t=secret-token'
    const svg = pairingQrSvg(uri)
    assert.match(svg, /<svg /)
    assert.match(svg, /<path /)
    assert.doesNotMatch(svg, /api\.qrserver/)
    assert.doesNotMatch(svg, /chart\.googleapis/)
    const url = pairingQrDataUrl(uri)
    assert.match(url, /^data:image\/svg\+xml/)
    assert.equal(pairingQrSvg(''), '')
  })
})
