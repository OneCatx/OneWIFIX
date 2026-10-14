import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { composeProxyAddr, proxyIdFromAddr, uniqueProxyId, splitProxyAddr, proxyDisplayName, proxyLabelForCountry } from './upstreamProxy.js'

describe('composeProxyAddr', () => {
  it('joins host and port', () => {
    assert.equal(composeProxyAddr('192.168.1.99', '7891'), '192.168.1.99:7891')
  })

  it('wraps IPv6 hosts', () => {
    assert.equal(composeProxyAddr('::1', '1080'), '[::1]:1080')
  })

  it('rejects a missing host or bad port', () => {
    assert.throws(() => composeProxyAddr('', '1080'), /IP 或主机/)
    assert.throws(() => composeProxyAddr('127.0.0.1', '0'), /端口/)
    assert.throws(() => composeProxyAddr('127.0.0.1', 'abc'), /端口/)
  })
})

describe('proxyIdFromAddr', () => {
  it('keeps IPv4 dots and turns the port separator into a dash', () => {
    assert.equal(proxyIdFromAddr('192.168.1.99:7891'), '192.168.1.99-7891')
  })

  it('avoids colliding ids when the same address is added twice', () => {
    const first = uniqueProxyId('127.0.0.1:1080', [])
    const second = uniqueProxyId('127.0.0.1:1080', [{ id: first }])
    assert.equal(first, '127.0.0.1-1080')
    assert.equal(second, '127.0.0.1-1080-2')
  })
})

describe('proxyDisplayName', () => {
  it('prefers a short name over the address', () => {
    assert.equal(proxyDisplayName({ name: 'Mihomo', addr: '192.168.1.99:7891' }), 'Mihomo')
    assert.equal(proxyDisplayName({ addr: '192.168.1.99:7891' }), '192.168.1.99:7891')
  })
})

describe('proxyLabelForCountry', () => {
  const proxies = [{ id: 'Mihomo', name: '家宽', addr: '192.168.1.99:7891' }]
  const rules = [
    { country_code: 'DE', upstream_proxy_id: 'Mihomo', enabled: true },
    { country_code: 'GB', upstream_proxy_id: 'Mihomo', enabled: false },
  ]

  it('uses the proxy display name for a matching enabled country', () => {
    assert.equal(proxyLabelForCountry('DE', proxies, rules), '家宽')
    assert.equal(proxyLabelForCountry('UK', proxies, rules), '直连')
    assert.equal(proxyLabelForCountry('FR', proxies, rules), '直连')
  })
})

describe('splitProxyAddr', () => {
  it('splits host and port without printing secrets', () => {
    assert.deepEqual(splitProxyAddr('192.168.1.99:7891'), { host: '192.168.1.99', port: '7891' })
    assert.deepEqual(splitProxyAddr('[::1]:1080'), { host: '::1', port: '1080' })
  })
})
