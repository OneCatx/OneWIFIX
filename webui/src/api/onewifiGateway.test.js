import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseLpaActivationCode } from '../utils/lpaCode.js'

describe('parseLpaActivationCode', () => {
  it('parses LPA:1$smdp$matching', () => {
    const parsed = parseLpaActivationCode('LPA:1$rsp.example.com$abc-1')
    assert.equal(parsed.smdp, 'rsp.example.com')
    assert.equal(parsed.matchingId, 'abc-1')
    assert.equal(parsed.confirmationCode, '')
  })

  it('parses GSMA AC without the LPA: URI prefix', () => {
    const parsed = parseLpaActivationCode('1$rsp.example.com$abc-1')
    assert.equal(parsed.smdp, 'rsp.example.com')
    assert.equal(parsed.matchingId, 'abc-1')
    assert.equal(parsed.confirmationCode, '')
  })

  it('parses LPA:1$smdp$matching$confirmation', () => {
    const parsed = parseLpaActivationCode('LPA:1$rsp.example.com$abc-1$confirm-9')
    assert.equal(parsed.smdp, 'rsp.example.com')
    assert.equal(parsed.matchingId, 'abc-1')
    assert.equal(parsed.confirmationCode, 'confirm-9')
  })

  it('parses 1$smdp$matching$confirmation with whitespace', () => {
    const parsed = parseLpaActivationCode('1$ rsp.example.com $\nabc-1$confirm-9')
    assert.equal(parsed.smdp, 'rsp.example.com')
    assert.equal(parsed.matchingId, 'abc-1')
    assert.equal(parsed.confirmationCode, 'confirm-9')
  })

  it('strips https:// from the SM-DP+ field', () => {
    const parsed = parseLpaActivationCode('LPA:1$https://rsp.example.com$abc-1')
    assert.equal(parsed.smdp, 'rsp.example.com')
    assert.equal(parsed.matchingId, 'abc-1')
  })

  it('accepts a bare SM-DP host', () => {
    const parsed = parseLpaActivationCode('smdp.carrier.test')
    assert.equal(parsed.smdp, 'smdp.carrier.test')
    assert.equal(parsed.matchingId, '')
  })

  it('returns empty for blank input', () => {
    const parsed = parseLpaActivationCode('  ')
    assert.equal(parsed.smdp, '')
    assert.equal(parsed.matchingId, '')
  })

  it('does not treat a GSMA format prefix as the SM-DP+ host', () => {
    assert.notEqual(parseLpaActivationCode('1$rsp.example.com$abc-1').smdp, '1')
  })
})

describe('downloadOnewifiEsim', () => {
  it('forwards confirmation_code from the activation code', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('./onewifiGateway.esim.js', import.meta.url), 'utf8')
    assert.match(src, /confirmation_code: confirmationCode/)
  })
})
