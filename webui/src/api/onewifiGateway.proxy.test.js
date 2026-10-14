import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, 'onewifiGateway.proxy.js'), 'utf8')
const page = readFileSync(join(here, '../views/Proxy.vue'), 'utf8')

const library = {
  proxy: {
    schema_version: 2,
    enabled: true,
    missing_policy: 'error',
    subscription_url: '',
    profiles: {
      home: {
        name: '家宽',
        type: 'socks5',
        server: '192.168.1.99',
        port: 7891,
        username: 'u',
        password: 'secret',
      },
      node1: { name: '机场节点', type: 'node', value: 'vless://secret' },
      sub1: { name: '订阅', type: 'subscription', url: 'https://example.test/sub' },
    },
    exits: {
      de: { profile_id: 'home', enabled: true, pinned_node: 'keep-me' },
      GB: { profile_id: 'node1', enabled: false },
    },
  },
}

function json(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { get: () => '' },
    text: async () => JSON.stringify(body),
    json: async () => body,
  }
}

describe('proxy library client', { concurrency: false }, () => {
  it('does not call the removed upstream proxy routes', () => {
    assert.doesNotMatch(source, /upstream-prox/)
    assert.doesNotMatch(page, /upstream-prox/)
    assert.doesNotMatch(page, /\.catch\(\(\) => \[\]\)/)
    assert.match(page, /loadError/)
  })

  it('shows every saved profile and does not treat a read failure as an empty list', async () => {
    const { fetchOnewifiEgressStatus } = await import('./onewifiGateway.proxy.js')
    globalThis.fetch = async (url) => {
      const path = String(url)
      if (path.endsWith('/api/settings')) return json(library)
      if (path.endsWith('/api/egress/status')) {
        return json({ exits: { de: { ready: true, node: 'home-node' } } })
      }
      throw new Error(path)
    }
    const view = await fetchOnewifiEgressStatus()
    assert.deepEqual(view.proxies.map((item) => item.id), ['home', 'node1', 'sub1'])
    assert.equal(view.proxies.find((item) => item.id === 'node1').addr, '节点')
    assert.equal(view.proxies.find((item) => item.id === 'sub1').addr, '订阅')
    assert.equal(view.rules.find((rule) => rule.country_code === 'DE').upstream_proxy_id, 'home')
    assert.equal(view.rules.find((rule) => rule.country_code === 'GB').enabled, false)
    assert.equal(view.exits.DE.ready, true)
    assert.equal(view.exits.GB.ready, false)

    globalThis.fetch = async () => json({ detail: 'denied' }, 500)
    await assert.rejects(fetchOnewifiEgressStatus(), /denied/)
  })

  it('renames a socks proxy without dropping the node, subscription, or exit pin', async () => {
    const { saveOnewifiUpstreamProxy } = await import('./onewifiGateway.proxy.js')
    const calls = []
    globalThis.fetch = async (url, opts = {}) => {
      calls.push({ url: String(url), body: opts.body })
      if (String(url).endsWith('/api/settings') && (!opts.method || opts.method === 'GET')) return json(library)
      return json({ ok: true })
    }
    await saveOnewifiUpstreamProxy({
      id: 'home',
      name: '客厅',
      addr: '192.168.1.99:7891',
      username: 'u',
      password: 'secret',
      enabled: true,
    }, { create: false })
    const saved = JSON.parse(calls.at(-1).body).proxy
    assert.equal(saved.profiles.home.name, '客厅')
    assert.equal(saved.profiles.home.password, 'secret')
    assert.equal(saved.profiles.node1.value, 'vless://secret')
    assert.equal(saved.profiles.sub1.url, 'https://example.test/sub')
    assert.equal(saved.exits.de.pinned_node, 'keep-me')
    assert.equal(calls.at(-1).url.endsWith('/api/settings'), true)
  })

  it('binds a country exit and probes the saved profile', async () => {
    const { saveOnewifiCountryRule, testOnewifiProxyProfile, deleteOnewifiUpstreamProxy } = await import('./onewifiGateway.proxy.js')
    const calls = []
    globalThis.fetch = async (url, opts = {}) => {
      calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body })
      if (String(url).endsWith('/api/settings') && (!opts.method || opts.method === 'GET')) return json(library)
      return json({ ok: true })
    }
    await saveOnewifiCountryRule('FR', { upstream_proxy_id: 'home', enabled: true })
    const saved = JSON.parse(calls.at(-1).body).proxy
    assert.equal(saved.exits.fr.profile_id, 'home')
    assert.equal(saved.exits.fr.enabled, true)
    assert.equal(saved.exits.de.pinned_node, 'keep-me')

    await testOnewifiProxyProfile('home')
    assert.equal(calls.at(-1).url.endsWith('/api/egress/profile/home/test'), true)
    assert.equal(calls.at(-1).method, 'POST')

    await deleteOnewifiUpstreamProxy('home')
    const removed = JSON.parse(calls.at(-1).body).proxy
    assert.equal(removed.profiles.home, undefined)
    assert.equal(removed.exits.de, undefined)
    assert.equal(removed.profiles.node1.value, 'vless://secret')
  })
})
