import './smsTestDom.js'
import { describe, it, before, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'url'
import { createApp, defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, 'useOneWifiSms.js'), 'utf8')

function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => '' },
    text: async () => JSON.stringify(body),
  }
}

function installFetchMock() {
  const pending = []
  globalThis.fetch = (url) => new Promise((resolve) => {
    pending.push({ url: String(url), resolve })
  })
  return pending
}

function resolveMatching(pending, pattern, body) {
  const hit = pending.find((entry) => !entry.done && pattern.test(entry.url))
  assert.ok(hit, `expected a pending fetch matching ${pattern}`)
  hit.done = true
  hit.resolve(jsonResponse(body))
  return hit
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

describe('useOneWifiSms follows OneWIFI SMS mapping', () => {
  it('uses ISO Date parsing instead of Number(ts)', () => {
    assert.match(src, /normalizeSmsMessage/)
    assert.match(src, /smsTimeMs/)
    assert.doesNotMatch(src, /function unixMs/)
    assert.doesNotMatch(src, /raw\.ts/)
    assert.doesNotMatch(src, /Number\(value\)/)
  })

  it('keeps delayed device and contact responses inside the selection that started them', () => {
    assert.match(src, /let contactsRequestId = 0/)
    assert.match(src, /let threadRequestId = 0/)
    assert.match(src, /const requestDeviceId = selectedDeviceId\.value/)
    assert.match(src, /requestId !== contactsRequestId \|\| selectedDeviceId\.value !== requestDeviceId/)
    assert.match(src, /const requestContactKey = contact\.key/)
    assert.match(src, /requestId !== threadRequestId \|\| selectedContactKey\.value !== requestContactKey/)
  })

  it('does not clear a newly selected conversation after an older send or delete completes', () => {
    assert.match(src, /if \(selectedContactKey\.value === contactKey\)/)
    assert.match(src, /return \{ ok: true, outcome:/)
    assert.match(src, /if \(selectedContactKey\.value === contact\.key\) \{/)
  })
})

const devicesPayload = {
  data: {
    devices: [
      { id: 'dev-a', present: true, physical_present: true, device_type: 'pcie_ec20_ec25' },
      { id: 'dev-b', present: true, physical_present: true, device_type: 'pcie_ec20_ec25' },
    ],
  },
}
const contactsPayload = {
  data: [
    {
      peer: '+15551212',
      last_content: 'ping',
      last_timestamp: '2026-01-01T00:00:00.000Z',
      message_count: 1,
    },
  ],
}

describe('SMS mount race with startOnewifiHub', { concurrency: false }, () => {
  let hub
  let refreshOnewifiDevices
  let startOnewifiHub
  let stopOnewifiHub
  let applyAuthStatus
  let useOneWifiSms

  before(async () => {
    ;({ hub, refreshOnewifiDevices, startOnewifiHub, stopOnewifiHub } = await import('../stores/onewifiHub.js'))
    ;({ applyAuthStatus } = await import('../stores/auth.js'))
    ;({ useOneWifiSms } = await import('./useOneWifiSms.js'))
  })

  beforeEach(() => {
    document.visibilityState = 'visible'
    stopOnewifiHub()
    hub.devices = []
    hub.discovering = false
    hub.system = null
    hub.loading = false
    hub.error = ''
    hub.started = false
    applyAuthStatus({ configured: true, authenticated: true, csrf: 'test-csrf' })
  })

  afterEach(() => {
    stopOnewifiHub()
  })

  it('does not treat an in-flight refresh as failure when startOnewifiHub races it', async () => {
    const pending = installFetchMock()
    const childRefresh = refreshOnewifiDevices()
    assert.equal(pending.filter((entry) => /\/api\/devices$/.test(entry.url)).length, 1)
    startOnewifiHub()
    const deviceCalls = pending.filter((entry) => /\/api\/devices$/.test(entry.url))
    for (const call of deviceCalls) {
      if (!call.done) {
        call.done = true
        call.resolve(jsonResponse(devicesPayload))
      }
    }
    for (const call of pending) {
      if (!call.done && /\/api\/(system\/info|dashboard\/host)/.test(call.url)) {
        call.done = true
        call.resolve(jsonResponse({ data: {} }))
      }
    }
    assert.equal(await childRefresh, true)
    await flush()
    assert.equal(hub.devices.length, 2)
  })

  it('fills contacts when the SMS view refreshes while the parent hub is starting', async () => {
    const pending = installFetchMock()
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/sms', component: { template: '<div />' } }],
    })
    await router.push('/sms')
    let sms
    const app = createApp(defineComponent({
      setup() {
        sms = useOneWifiSms()
        return () => null
      },
    }))
    app.use(router)
    app.mount(document.createElement('div'))
    await flush()
    startOnewifiHub()
    await flush()
    resolveMatching(pending, /\/api\/devices$/, devicesPayload)
    await flush()
    const contactCalls = pending.filter((entry) => !entry.done && /\/api\/sms\/contacts/.test(entry.url))
    assert.ok(contactCalls.length > 0, 'contacts are requested after devices arrive')
    for (const call of contactCalls) {
      call.done = true
      call.resolve(jsonResponse(contactsPayload))
    }
    for (const call of pending) {
      if (!call.done && /\/api\/(system\/info|dashboard\/host)/.test(call.url)) {
        call.done = true
        call.resolve(jsonResponse({ data: {} }))
      }
    }
    await flush()
    await flush()
    assert.ok(sms.contacts.value.length >= 1, 'contacts eventually fill after the hub race')
    app.unmount()
  })

  it('initializes delete and export as separate inbox actions', async () => {
    const calls = []
    globalThis.URL.createObjectURL = () => 'blob:sms-export'
    globalThis.URL.revokeObjectURL = () => {}
    const createElement = document.createElement.bind(document)
    document.createElement = (tag) => {
      const el = createElement(tag)
      el.click = () => {}
      return el
    }
    globalThis.fetch = async (url, options = {}) => {
      const method = options.method || 'GET'
      calls.push({ url: String(url), method })
      if (/\/api\/sms\/export/.test(url)) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => '' },
          blob: async () => ({ size: 4 }),
          text: async () => '',
        }
      }
      if (/\/api\/devices$/.test(url)) return jsonResponse(devicesPayload)
      if (/\/api\/sms\/contacts/.test(url)) return jsonResponse(contactsPayload)
      return jsonResponse({ data: {} })
    }
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/sms', component: { template: '<div />' } }],
    })
    await router.push('/sms')
    let sms
    const app = createApp(defineComponent({
      setup() {
        sms = useOneWifiSms()
        return () => null
      },
    }))
    app.use(router)
    app.mount(document.createElement('div'))
    await flush()
    assert.equal(typeof sms.exportInbox, 'function')
    assert.equal(typeof sms.removeMessage, 'function')
    calls.length = 0
    const removed = await sms.removeMessage({ id: 42 })
    await sms.exportInbox()
    assert.deepEqual(removed, { ok: true })
    assert.equal(sms.error.value, '')
    assert.equal(calls.filter((call) => call.method === 'DELETE' && /\/api\/sms\/messages\/42$/.test(call.url)).length, 1)
    assert.equal(calls.filter((call) => call.method === 'GET' && /\/api\/sms\/export/.test(call.url)).length, 1)
    assert.equal(calls.filter((call) => call.method === 'DELETE' && /\/api\/sms\/export/.test(call.url)).length, 0)
    app.unmount()
  })

  it('loads and sends SMS on the bound line, and blocks an unbound modem', async () => {
    const calls = []
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url: String(url), method: options.method || 'GET', body: options.body })
      if (/\/api\/devices$/.test(url)) {
        return jsonResponse({
          devices: [
            { id: 'phys-a', instance_id: 'line-b', present: true, physical_present: true, device_type: 'modem' },
            { id: 'phys-c', instance_id: 'line-c', present: true, physical_present: true, device_type: 'modem' },
            { id: 'phys-d', instance_id: null, present: true, physical_present: true, device_type: 'modem' },
          ],
        })
      }
      if (/\/api\/sms\/contacts/.test(url)) return jsonResponse(contactsPayload)
      if (/\/api\/sms\/send/.test(url)) return jsonResponse({ outcome: 'accepted' })
      return jsonResponse({ data: {} })
    }
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/sms', component: { template: '<div />' } }],
    })
    await router.push('/sms')
    let sms
    const app = createApp(defineComponent({
      setup() {
        sms = useOneWifiSms()
        return () => null
      },
    }))
    app.use(router)
    app.mount(document.createElement('div'))
    await flush()
    await flush()
    const initialUrls = calls.filter((call) => /\/api\/sms\/contacts/.test(call.url)).map((call) => call.url)
    assert.ok(initialUrls.some((url) => url.includes('device_id=line-b')))
    assert.ok(initialUrls.some((url) => url.includes('device_id=line-c')))
    assert.equal(initialUrls.some((url) => /device_id=phys-/.test(url)), false)
    calls.length = 0
    await sms.selectDevice('phys-a')
    await flush()
    const selectedUrls = calls.filter((call) => /\/api\/sms\/contacts/.test(call.url)).map((call) => call.url)
    assert.ok(selectedUrls.some((url) => url.includes('device_id=line-b')))
    assert.equal(selectedUrls.some((url) => url.includes('device_id=line-c') || /device_id=phys-/.test(url)), false)
    calls.length = 0
    await sms.selectDevice('phys-d')
    await flush()
    assert.match(sms.error.value, /未绑定线路/)
    assert.equal(calls.some((call) => /\/api\/sms\//.test(call.url) && /phys-d|line-c/.test(call.url)), false)
    app.unmount()
  })
})
