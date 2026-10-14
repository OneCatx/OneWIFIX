import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildOneWifiUpstreamOrigin,
  DEFAULT_ONEWIFI_PORT,
  onewifiEndpointIsThisBoard,
  onewifiOriginMatchesPage,
} from '../../src/utils/onewifiEndpoint.js'

test('局域网 OneWifi 默认口与网关一致，拼成 http://192.168.1.88:6688', () => {
  assert.equal(DEFAULT_ONEWIFI_PORT, 6688)
  assert.equal(
    buildOneWifiUpstreamOrigin({ host: '192.168.1.88' }),
    'http://192.168.1.88:6688',
  )
  assert.equal(
    buildOneWifiUpstreamOrigin({ host: '192.168.1.88', port: 6688 }),
    'http://192.168.1.88:6688',
  )
})

test('https://same-host:port is this board even when the page is HTTP', () => {
  const page = {
    origin: 'http://192.168.1.88:6699',
    hostname: '192.168.1.88',
    port: '6699',
    protocol: 'http:',
  }
  assert.equal(onewifiOriginMatchesPage('https://192.168.1.88:6699', page), true)
  assert.equal(onewifiOriginMatchesPage('http://192.168.1.88:6699', page), true)
  assert.equal(onewifiOriginMatchesPage('https://192.168.1.88:443', page), false)
  assert.equal(onewifiOriginMatchesPage('http://10.0.0.8:6699', page), false)
})

test('same hostname with implicit default port 6688 is still this board', () => {
  const page = {
    origin: 'http://192.168.1.88:6699',
    hostname: '192.168.1.88',
    port: '6699',
    protocol: 'http:',
  }
  assert.equal(onewifiEndpointIsThisBoard({ host: '192.168.1.88' }, page), true)
  assert.equal(onewifiEndpointIsThisBoard({ host: '192.168.1.88', port: 6688 }, page), false)
  assert.equal(onewifiEndpointIsThisBoard({ host: '10.0.0.8' }, page), false)
})
