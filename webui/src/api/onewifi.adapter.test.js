import { afterEach, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getEsimOverview } from './onewifi.adapter.js'

const originalFetch = globalThis.fetch
let calls

beforeEach(() => {
  calls = []
  globalThis.window = {
    setTimeout,
    clearTimeout,
    dispatchEvent() {},
    CustomEvent: class CustomEvent {},
  }
  globalThis.fetch = async (url, options = {}) => {
    calls.push({
      url: String(url),
      method: options.method || 'GET',
      headers: options.headers || {},
      credentials: options.credentials || '',
    })
    return new Response(JSON.stringify({
      data: {
        chipInfo: {
          eids: [{ manufacturer: 'Thales DIS France SAS', freeNvram: '634.55 KB' }],
        },
        profiles: [],
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})

afterEach(() => {
  globalThis.fetch = originalFetch
  delete globalThis.location
})

describe('getEsimOverview', () => {
  it('reuses the cached /esim contract without requesting a chip refresh', async () => {
    const payload = await getEsimOverview('device / 1')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, '/api/devices/device%20%2F%201/esim')
    assert.equal(calls[0].method, 'GET')
    assert.doesNotMatch(calls[0].url, /refresh=/)
    assert.equal(payload.chipInfo.eids[0].manufacturer, 'Thales DIS France SAS')
    assert.equal(payload.chipInfo.eids[0].freeNvram, '634.55 KB')
  })

  it('preserves ordinary chip refresh without sending the retired force parameter', async () => {
    const { getEsimOverview, getEsimProfiles } = await import('./onewifi.adapter.js')
    await getEsimOverview('dev-1', { refresh: true, force: true })
    await getEsimProfiles('dev-1', { refresh: true, force: true })
    assert.deepEqual(calls.map((call) => call.url), [
      '/api/devices/dev-1/esim?refresh=1',
      '/api/devices/dev-1/esim/profiles?refresh=1',
    ])
  })
})

describe('OneWifi adapter path denylist', () => {
  it('rejects paths outside the allowlist and does not mint /onewifi HTTP prefixes', async () => {
    const { assertOneWifiEndpointAllowed } = await import('./onewifi.adapter.js')
    assert.throws(() => assertOneWifiEndpointAllowed('/legacy-gateway/devices'), /未注册/)
    assert.throws(() => assertOneWifiEndpointAllowed('/api/legacy-gateway/health'), /未注册/)
    assert.equal(assertOneWifiEndpointAllowed('/devices'), '/devices')
  })
})

describe('same-origin vs remote OneWIFI containers', () => {
  it('treats empty upstream as not same-origin so a new IP+port card can be filled', async () => {
    const { isOnewifiSameOrigin } = await import('./onewifi.adapter.js')
    assert.equal(isOnewifiSameOrigin(''), false)
    assert.equal(isOnewifiSameOrigin('http://192.168.1.10:6699'), false)
  })

  it('matches the page origin as the local board container', async () => {
    const { isOnewifiSameOrigin } = await import('./onewifi.adapter.js')
    globalThis.location = { origin: 'http://192.168.1.88:6699' }
    assert.equal(isOnewifiSameOrigin('http://192.168.1.88:6699'), true)
    assert.equal(isOnewifiSameOrigin('http://192.168.1.88:6699/'), true)
    assert.equal(isOnewifiSameOrigin('http://10.0.0.8:6699'), false)
    delete globalThis.location
  })

  it('treats https://same-host:port as this board when the page is HTTP', async () => {
    const { isOnewifiSameOrigin, getEsimOverview } = await import('./onewifi.adapter.js')
    globalThis.location = {
      origin: 'http://192.168.1.88:6699',
      hostname: '192.168.1.88',
      port: '6699',
      protocol: 'http:',
    }
    assert.equal(isOnewifiSameOrigin('https://192.168.1.88:6699'), true)
    assert.equal(isOnewifiSameOrigin('https://192.168.1.88:6699/'), true)
    await getEsimOverview('dj-1', {
      upstream: 'https://192.168.1.88:6699',
      token: 'stale-https-token',
    })
    assert.equal(calls.at(-1).url, '/api/devices/dj-1/esim')
    assert.equal(calls.at(-1).credentials, 'include')
    assert.equal(isOnewifiSameOrigin('https://192.168.1.88:443'), false)
  })

  it('sends remote container traffic to that origin with a Bearer session token', async () => {
    const { getEsimOverview } = await import('./onewifi.adapter.js')
    await getEsimOverview('dj-1', {
      upstream: 'http://10.0.0.8:6699',
      token: 'session-token',
    })
    assert.equal(calls.at(-1).url, 'http://10.0.0.8:6699/api/devices/dj-1/esim')
    assert.equal(calls.at(-1).headers.Authorization, 'Bearer session-token')
    assert.equal(calls.at(-1).credentials, 'omit')
  })

  it('reads remote egress rules from that origin instead of the Board /api', async () => {
    const { fetchEgressStatus } = await import('./onewifi.adapter.js')
    globalThis.fetch = async (url, options = {}) => {
      calls.push({
        url: String(url),
        method: options.method || 'GET',
        headers: options.headers || {},
        credentials: options.credentials || '',
      })
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    await fetchEgressStatus({
      upstream: 'http://10.0.0.8:6699',
      token: 'session-token',
    })
    assert.ok(calls.some((c) => c.url === 'http://10.0.0.8:6699/api/settings'))
    assert.ok(calls.some((c) => c.url === 'http://10.0.0.8:6699/api/egress/status'))
    assert.equal(calls.some((c) => String(c.url).includes('upstream-prox')), false)
    assert.equal(calls[0].headers.Authorization, 'Bearer session-token')
    assert.equal(calls[0].credentials, 'omit')
  })
})

describe('getDeviceOverview fallback', () => {
  it('does not GET /devices/{id} after overview fails; uses /status then the list', async () => {
    const { getDeviceOverview } = await import('./onewifi.adapter.js')
    globalThis.fetch = async (url, options = {}) => {
      calls.push({
        url: String(url),
        method: options.method || 'GET',
        headers: options.headers || {},
        credentials: options.credentials || '',
      })
      if (String(url).endsWith('/overview')) {
        return new Response(JSON.stringify({ error: { code: 'unavailable' } }), { status: 503 })
      }
      if (String(url).endsWith('/status')) {
        return new Response(JSON.stringify({ data: { id: 'dj-1', name: 'DJ-1' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ data: { devices: [] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const payload = await getDeviceOverview('dj-1')
    assert.equal(payload.id, 'dj-1')
    assert.ok(calls.some((c) => c.url === '/api/devices/dj-1/overview'))
    assert.ok(calls.some((c) => c.url === '/api/devices/dj-1/status'))
    assert.ok(!calls.some((c) => c.url === '/api/devices/dj-1' && (c.method || 'GET') === 'GET'))
  })
})

describe('adapter exact allow vs settings denylist', () => {
  it('allows POST /settings/password and still blocks other /settings paths', async () => {
    const { assertOneWifiEndpointAllowed } = await import('./onewifi.adapter.js')
    assert.equal(assertOneWifiEndpointAllowed('/settings/password'), '/settings/password')
    assert.equal(assertOneWifiEndpointAllowed('/settings/developer-mode'), '/settings/developer-mode')
    assert.throws(() => assertOneWifiEndpointAllowed('/settings/logging'), /已禁用/)
    assert.throws(() => assertOneWifiEndpointAllowed('/settings/notifications'), /已禁用/)
  })
})
