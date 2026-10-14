import { afterEach, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as deviceEditAdapter from './deviceEdit.adapter.js'
import {
  buildApnWriteBody,
  createCardApn,
  deleteCardApn,
  deleteDeviceEditProfile,
  saveDeviceCardPolicy,
  downloadDeviceEditProfile,
  downloadEsimProfileSSE,
  loadCardApns,
  loadDeviceEdit,
  loadDeviceEditSnapshot,
  loadEsimNotifications,
  pickLiveIccid,
  renameDeviceEditProfile,
  retryEsimNotification,
  sanitizeApnRead,
  toggleDeviceEditProfile,
  updateCardApn,
} from './deviceEdit.adapter.js'

const originalFetch = globalThis.fetch
let calls

function jsonOk(data) {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  calls = []
  globalThis.window = {
    setTimeout,
    clearTimeout,
    dispatchEvent() {},
    CustomEvent: class CustomEvent {
      constructor(type) {
        this.type = type
      }
    },
  }
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET', opts })
    return jsonOk({})
  }
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('pickLiveIccid', () => {
  it('prefers live modem ICCID over vowifi runtime', () => {
    assert.equal(pickLiveIccid({
      modem: { iccid: '8900000000000000001' },
      vowifi: { iccid: '8900000000000000002' },
    }, [{ profiles: [{ iccid: '8900000000000000003', state: 1 }] }]), '8900000000000000001')
  })

  it('falls back to the enabled eSIM profile', () => {
    assert.equal(pickLiveIccid({
      modem: { iccid: '' },
      vowifi: { iccid: '****0002' },
    }, [{ profiles: [{ iccid: '8900000000000000003', state: 1 }] }]), '8900000000000000003')
  })

  it('rejects masked or short ICCIDs', () => {
    assert.equal(pickLiveIccid({ modem: { iccid: '****0123' } }, []), '')
  })
})

describe('APN write / read sanitizers', () => {
  it('omits empty password and only sends explicit clear_password', () => {
    const body = buildApnWriteBody({ apn: 'fast.t-mobile.com', password: '', clear_password: false })
    assert.equal(body.apn, 'fast.t-mobile.com')
    assert.equal('password' in body, false)
    assert.equal('clear_password' in body, false)
  })

  it('sends clear_password only when true', () => {
    const body = buildApnWriteBody({ apn: 'x', clear_password: true })
    assert.equal(body.clear_password, true)
    assert.equal('password' in body, false)
  })

  it('strips plaintext password from list items', () => {
    const item = sanitizeApnRead({ id: 3, iccid: '8900000000000000001', apn: 'x', password: 'secret', has_password: true })
    assert.equal(item.has_password, true)
    assert.equal('password' in item, false)
    assert.equal(JSON.stringify(item).includes('secret'), false)
  })
})

describe('loadDeviceEditSnapshot', () => {
  it('loads status, profiles, and card policy by live ICCID', async () => {
    globalThis.fetch = async (url, opts = {}) => {
      calls.push({ url: String(url), method: opts.method || 'GET' })
      if (String(url).includes('/overview')) {
        return jsonOk({ id: 'dev-1', modem: { iccid: '8900000000000000001' }, vowifi: {} })
      }
      if (String(url).endsWith('/esim')) {
        return jsonOk({
          chipInfo: { eids: [{ eid: 'E', aid: 'A', freeNvram: '640 KB' }] },
          profiles: [{ eid: 'E', aidHex: 'A', profiles: [{ iccid: '8900000000000000001', state: 1 }] }],
        })
      }
      if (String(url).includes('/cards/')) {
        return jsonOk({ iccid: '8900000000000000001', apn: 'internet', vowifi_enabled: true })
      }
      return jsonOk({})
    }
    const snap = await loadDeviceEditSnapshot('dev-1')
    assert.equal(snap.deviceId, 'dev-1')
    assert.equal(snap.liveIccid, '8900000000000000001')
    assert.equal(snap.policy.apn, 'internet')
    assert.ok(calls.some((c) => c.url === '/api/devices/dev-1/overview'))
    assert.ok(calls.some((c) => c.url === '/api/devices/dev-1/esim'))
    assert.ok(calls.some((c) => c.url === '/api/cards/8900000000000000001/policy'))
    assert.ok(!calls.some((c) => c.url.includes('/network/apns')))
  })

  it('sends remote-container eSIM reads to that origin with a Bearer token', async () => {
    globalThis.fetch = async (url, opts = {}) => {
      calls.push({
        url: String(url),
        method: opts.method || 'GET',
        headers: opts.headers || {},
        credentials: opts.credentials || '',
      })
      if (String(url).includes('/overview')) {
        return jsonOk({ id: 'dj-1', physical_present: true, modem: { iccid: '8900000000000000001' } })
      }
      return jsonOk({ profiles: [] })
    }
    await loadDeviceEditSnapshot('dj-1', {
      includePolicy: false,
      ctx: { upstream: 'http://10.0.0.8:6699', token: 'session-token' },
    })
    assert.ok(calls.some((c) => c.url === 'http://10.0.0.8:6699/api/devices/dj-1/esim'))
    assert.ok(calls.some((c) => c.url === 'http://10.0.0.8:6699/api/devices/dj-1/overview'))
    assert.equal(calls[0].headers.Authorization, 'Bearer session-token')
    assert.equal(calls[0].credentials, 'omit')
  })

  it('can skip the redundant current-card policy request when every profile policy is loaded separately', async () => {
    globalThis.fetch = async (url, opts = {}) => {
      calls.push({ url: String(url), method: opts.method || 'GET' })
      if (String(url).includes('/overview')) {
        return jsonOk({ id: 'dev-1', physical_present: true, modem: { iccid: '8900000000000000001' } })
      }
      if (String(url).endsWith('/esim')) {
        return jsonOk({ profiles: [{ profiles: [{ iccid: '8900000000000000001', state: 1 }] }] })
      }
      return jsonOk({ iccid: '8900000000000000001' })
    }

    const snap = await loadDeviceEditSnapshot('dev-1', { includePolicy: false })

    assert.equal(snap.policy, null)
    assert.equal(snap.deviceOnline, true)
    assert.ok(!calls.some((call) => call.url.includes('/api/cards/')))
  })

  it('keeps deviceId and ICCID in separate namespaces', async () => {
    await assert.rejects(() => loadDeviceEditSnapshot(''), /缺少设备/)
    await assert.rejects(() => loadCardApns('dev-1'), /ICCID/)
    await assert.rejects(() => loadCardApns('****0123'), /ICCID/)
  })

  it('requests a live eSIM inventory when refresh is explicit', async () => {
    globalThis.fetch = async (url) => {
      calls.push({ url: String(url), method: 'GET' })
      if (String(url).includes('/overview')) {
        return jsonOk({ id: 'dev-1', modem: { iccid: '' } })
      }
      return jsonOk([])
    }
    await loadDeviceEditSnapshot('dev-1', { refresh: true })
    assert.ok(calls.some((c) => c.url === '/api/devices/dev-1/esim?refresh=1'))
  })

  it('still returns profiles when there is no live ICCID and skips card policy', async () => {
    globalThis.fetch = async (url) => {
      calls.push({ url: String(url), method: 'GET' })
      if (String(url).includes('/overview')) {
        return jsonOk({ id: 'dev-1', name: '模组A', modem: { iccid: '', imei: '490154203237518' } })
      }
      if (String(url).endsWith('/esim')) {
        return jsonOk({
          chipInfo: { eids: [{ eid: 'E', aid: 'A0000005591010FFFFFFFF8900000177', freeNvram: '640 KB' }] },
          profiles: [{
            eid: 'E',
            aidHex: 'A0000005591010FFFFFFFF8900000177',
            profiles: [{ iccid: '8900000000000000003', name: 'Parked', state: 0 }],
          }],
        })
      }
      return jsonOk({})
    }
    const snap = await loadDeviceEditSnapshot('dev-1')
    assert.equal(snap.deviceId, 'dev-1')
    assert.equal(snap.liveIccid, '')
    assert.equal(snap.policy, null)
    assert.equal(snap.profileGroups[0].profiles[0].iccid, '8900000000000000003')
    assert.ok(!calls.some((c) => String(c.url).includes('/cards/')))

    const view = await loadDeviceEdit('dev-1')
    assert.equal(view.scope.deviceId, 'dev-1')
    assert.equal(view.scope.iccid, '')
    assert.equal(view.identity.imei, '490154203237518')
    assert.equal(view.identity.imeiMasked, '****7518')
    assert.equal(view.policy.available, false)
    assert.equal(view.profiles.length, 1)
    assert.equal(view.profiles[0].aidHex, 'A0000005591010FFFFFFFF8900000177')
    assert.equal(view.euiccs[0].aidHex, 'A0000005591010FFFFFFFF8900000177')
  })

  it('marks only the live ICCID as current when two eUICCs both report enabled', async () => {
    globalThis.fetch = async (url) => {
      if (String(url).includes('/overview')) {
        return jsonOk({
          id: 'dj-3',
          modem: { iccid: '89000000000000065517' },
          vowifi_runtime: { iccid: '89000000000000065517' },
        })
      }
      if (String(url).endsWith('/esim')) {
        return jsonOk({
          chipInfo: {
            eids: [
              { eid: '8903302300000001', aid: 'A06573746B6D65FFFF4953442D522030' },
              { eid: '8903302300000002', aid: 'A06573746B6D65FFFF4953442D522031' },
            ],
          },
          profiles: [
            {
              eid: '8903302300000001',
              aidHex: 'A06573746B6D65FFFF4953442D522030',
              profiles: [
                { iccid: '89000000000000065517', name: 'Vodafone DE-1', state: 1, stateText: '已启用' },
              ],
            },
            {
              eid: '8903302300000002',
              aidHex: 'A06573746B6D65FFFF4953442D522031',
              profiles: [
                { iccid: '89000000000000085280', name: 'ASDA Mobile UK eSIM', state: 1, stateText: '已启用' },
              ],
            },
          ],
        })
      }
      if (String(url).includes('/cards/')) {
        return jsonOk({ iccid: '89000000000000065517' })
      }
      return jsonOk({})
    }
    const view = await loadDeviceEdit('dj-3')
    assert.equal(view.profiles.length, 2)
    const live = view.profiles.find((profile) => profile.iccid === '89000000000000065517')
    const leftover = view.profiles.find((profile) => profile.iccid === '89000000000000085280')
    assert.equal(live?.active, true)
    assert.equal(live?.stateText, '已启用')
    assert.equal(leftover?.active, false)
    assert.equal(leftover?.stateText, '已禁用')
  })
})

describe('eSIM profile mutations', () => {
  it('sends aidHex on switch/disable and rename/delete follow backend contracts', async () => {
    const profile = { iccid: '8900000000000000001', active: false, aidHex: 'A0000005591010FFFFFFFF8900000177' }
    await toggleDeviceEditProfile({ deviceId: 'dev-1', iccid: '' }, profile)
    await renameDeviceEditProfile({ deviceId: 'dev-1' }, { ...profile, name: 'Travel' })
    await deleteDeviceEditProfile({ deviceId: 'dev-1' }, profile)
    assert.equal(calls[0].method, 'POST')
    assert.equal(calls[0].url, '/api/devices/dev-1/esim/actions/switch')
    assert.deepEqual(JSON.parse(calls[0].opts.body), {
      iccid: '8900000000000000001',
      aidHex: 'A0000005591010FFFFFFFF8900000177',
      aid_hex: 'A0000005591010FFFFFFFF8900000177',
    })
    assert.equal(calls[1].method, 'PATCH')
    assert.equal(calls[1].url, '/api/devices/dev-1/esim/profiles/8900000000000000001')
    assert.deepEqual(JSON.parse(calls[1].opts.body), {
      name: 'Travel',
      aidHex: 'A0000005591010FFFFFFFF8900000177',
      aid_hex: 'A0000005591010FFFFFFFF8900000177',
    })
    assert.equal(calls[2].method, 'DELETE')
    assert.equal(calls[2].url, '/api/devices/dev-1/esim/profiles/8900000000000000001?aid_hex=A0000005591010FFFFFFFF8900000177')
  })

  it('lists and retries eSIM notifications on the device path', async () => {
    globalThis.fetch = async (url, opts = {}) => {
      calls.push({ url: String(url), method: opts.method || 'GET' })
      if (String(url).includes('/notifications') && !String(url).includes('/retry')) {
        return jsonOk({ items: [{ seq: 12, iccid: '8900000000000000001' }] })
      }
      return jsonOk({ status: 'sent' })
    }
    const items = await loadEsimNotifications('dev-1')
    await retryEsimNotification('dev-1', 12, 'A000')
    assert.equal(items[0].seq, 12)
    assert.equal(calls[0].url, '/api/devices/dev-1/esim/notifications')
    assert.equal(calls[1].method, 'POST')
    assert.equal(calls[1].url, '/api/devices/dev-1/esim/notifications/12/actions/retry?aid_hex=A000')
  })
})

describe('card APN adapters', () => {
  it('lists APNs under /api/cards/{iccid}/apns and drops secrets', async () => {
    globalThis.fetch = async (url) => {
      calls.push({ url: String(url) })
      return jsonOk({ items: [{ id: 1, iccid: '8900000000000000001', apn: 'x', password: 'leak', has_password: true }] })
    }
    const items = await loadCardApns('8900000000000000001')
    assert.equal(calls[0].url, '/api/cards/8900000000000000001/apns')
    assert.equal(items[0].has_password, true)
    assert.equal('password' in items[0], false)
  })

  it('does not send empty password on PATCH', async () => {
    globalThis.fetch = async (url, opts = {}) => {
      calls.push({ url: String(url), method: opts.method, body: opts.body })
      return jsonOk({ id: 9, apn: 'x', has_password: true })
    }
    await updateCardApn('8900000000000000001', 9, { apn: 'x', password: '', ip_version: 'IPV4V6' })
    const body = JSON.parse(calls[0].body)
    assert.equal(calls[0].method, 'PATCH')
    assert.equal(calls[0].url, '/api/cards/8900000000000000001/apns/9')
    assert.equal('password' in body, false)
  })

  it('create and delete stay on the card ICCID path', async () => {
    await createCardApn('8900000000000000001', { apn: 'internet', password: 'p@ss' })
    await deleteCardApn('8900000000000000001', 4)
    assert.equal(calls[0].method, 'POST')
    assert.equal(JSON.parse(calls[0].opts.body).password, 'p@ss')
    assert.equal(calls[1].method, 'DELETE')
    assert.equal(calls[1].url, '/api/cards/8900000000000000001/apns/4')
  })
})

describe('card policy adapter', () => {
  it('writes the live ICCID policy with backend field names', async () => {
    await saveDeviceCardPolicy({ deviceId: 'dev-1', iccid: '8900000000000000001' }, { apn: 'internet', ipVersion: 'IPV4V6' })
    assert.equal(calls[0].method, 'PUT')
    assert.equal(calls[0].url, '/api/cards/8900000000000000001/policy')
    assert.deepEqual(JSON.parse(calls[0].opts.body), { apn: 'internet', ip_version: 'IPV4V6' })
  })

  it('reads and writes each profile policy by the ICCID passed by that profile', async () => {
    assert.equal(typeof deviceEditAdapter.loadDeviceCardPolicy, 'function')
    globalThis.fetch = async (url, opts = {}) => {
      calls.push({ url: String(url), method: opts.method || 'GET', opts })
      const iccid = String(url).split('/cards/')[1]?.split('/')[0]
      return jsonOk({ iccid, network_enabled: iccid?.endsWith('1'), vowifi_enabled: false, airplane_enabled: false, ip_version: 'IPV4V6' })
    }
    const first = await deviceEditAdapter.loadDeviceCardPolicy('8900000000000000001')
    const second = await deviceEditAdapter.loadDeviceCardPolicy('8900000000000000002')
    await saveDeviceCardPolicy(
      { iccid: '8900000000000000002' },
      { networkEnabled: false, vowifiEnabled: true, airplaneEnabled: true, apn: 'ims', ipVersion: 'v4v6' },
    )
    assert.equal(first.network_enabled, true)
    assert.equal(second.network_enabled, false)
    assert.equal(calls[0].url, '/api/cards/8900000000000000001/policy')
    assert.equal(calls[1].url, '/api/cards/8900000000000000002/policy')
    assert.equal(calls[2].url, '/api/cards/8900000000000000002/policy')
    assert.deepEqual(JSON.parse(calls[2].opts.body), {
      network_enabled: false,
      vowifi_enabled: true,
      airplane_enabled: true,
      apn: 'ims',
      ip_version: 'IPV4V6',
    })
  })

  it('applies a capability immediately only for the active online ICCID', async () => {
    assert.equal(typeof deviceEditAdapter.applyDeviceEditCardPolicy, 'function')
    globalThis.fetch = async (url, opts = {}) => {
      calls.push({ url: String(url), method: opts.method || 'GET', opts })
      if ((opts.method || 'GET') === 'GET') {
        return jsonOk({
          iccid: '8900000000000000001',
          network_enabled: true,
          vowifi_enabled: true,
          airplane_enabled: true,
          ip_version: 'IPV4V6',
        })
      }
      return jsonOk({ ok: true })
    }

    const saved = await deviceEditAdapter.applyDeviceEditCardPolicy(
      { deviceId: 'dev-1', deviceOnline: true, iccid: '8900000000000000001' },
      { iccid: '8900000000000000001', active: true },
      { networkEnabled: true, vowifiEnabled: false, airplaneEnabled: false, apn: '', ipVersion: 'v4v6' },
      { vowifiEnabled: true },
    )

    assert.equal(calls[0].url, '/api/devices/dev-1/vowifi')
    assert.equal(calls[0].method, 'PATCH')
    assert.deepEqual(JSON.parse(calls[0].opts.body), { enabled: true })
    assert.equal(calls[1].url, '/api/cards/8900000000000000001/policy')
    assert.equal(calls[1].method, 'GET')
    assert.equal(saved.vowifi_enabled, true)
  })

  it('stores an inactive profile policy only under that profile ICCID', async () => {
    assert.equal(typeof deviceEditAdapter.applyDeviceEditCardPolicy, 'function')
    await deviceEditAdapter.applyDeviceEditCardPolicy(
      { deviceId: 'dev-1', deviceOnline: true, iccid: '8900000000000000001' },
      { iccid: '8900000000000000002', active: false },
      { networkEnabled: true, vowifiEnabled: false, airplaneEnabled: false, apn: '', ipVersion: 'v4v6' },
      { airplaneEnabled: true },
    )

    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, '/api/cards/8900000000000000002/policy')
    assert.equal(calls[0].method, 'PUT')
    assert.deepEqual(JSON.parse(calls[0].opts.body), {
      network_enabled: true,
      vowifi_enabled: false,
      airplane_enabled: true,
      apn: '',
      ip_version: 'IPV4V6',
    })
  })
})

describe('downloadEsimProfileSSE', () => {
  it('reports each progress event before the SSE connection closes', async () => {
    const encoder = new TextEncoder()
    let releaseStream
    const waitForRelease = new Promise((resolve) => { releaseStream = resolve })
    let firstProgress
    const progressSeen = new Promise((resolve) => { firstProgress = resolve })

    globalThis.fetch = async (url, opts = {}) => {
      calls.push({ url: String(url), method: opts.method || 'GET', opts })
      let sentFirstFrame = false
      return new Response(new ReadableStream({
        async pull(controller) {
          if (sentFirstFrame) return
          sentFirstFrame = true
          controller.enqueue(encoder.encode('data: {"step":"download","msg":"receiving","pct":35}\n\n'))
          await waitForRelease
          controller.enqueue(encoder.encode('data: {"step":"done","msg":"ok","pct":100}\n\n'))
          controller.close()
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }

    const seen = []
    const download = downloadEsimProfileSSE('dev-1', { smdp: 'rsp.example.com' }, {
      onProgress(event) {
        seen.push(event.step)
        if (event.step === 'download') firstProgress()
      },
    })

    const streamedBeforeClose = await Promise.race([
      progressSeen.then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 100)),
    ])
    releaseStream()
    const done = await download

    assert.equal(streamedBeforeClose, true, 'the first progress frame was buffered until the response closed')
    assert.deepEqual(seen, ['download', 'done'])
    assert.equal(done.step, 'done')
  })

  it('uses POST + SSE and forwards AbortSignal', async () => {
    const ac = new AbortController()
    const events = []
    globalThis.fetch = async (url, opts = {}) => {
      calls.push({ url: String(url), method: opts.method || 'GET', signal: opts.signal, accept: opts.headers?.Accept, opts })
      assert.equal(opts.signal, ac.signal)
      const body = [
        'event: progress',
        'data: {"step":"preflight","msg":"check","pct":10}',
        '',
        'event: progress',
        'data: {"step":"done","msg":"ok","pct":100}',
        '',
      ].join('\n')
      return new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }
    const done = await downloadEsimProfileSSE('dev-1', { smdp: 'rsp.example.com', matching_id: 'abc' }, {
      signal: ac.signal,
      onProgress: (evt) => events.push(evt.step),
    })
    assert.equal(calls[0].method, 'POST')
    assert.equal(calls[0].url, '/api/devices/dev-1/esim/actions/download')
    assert.deepEqual(JSON.parse(calls[0].opts.body), { smdp: 'rsp.example.com', matching_id: 'abc' })
    assert.equal(calls[0].accept, 'text/event-stream')
    assert.deepEqual(events, ['preflight', 'done'])
    assert.equal(done.step, 'done')
  })

  it('rejects GET-shaped usage and missing SM-DP+', async () => {
    await assert.rejects(() => downloadEsimProfileSSE('dev-1', { smdp: '' }), /SM-DP/)
    await assert.rejects(() => downloadEsimProfileSSE('dev-1', { method: 'GET', smdp: 'x' }), /POST/)
  })

  it('forwards confirmation_code and aid_hex from an LPA activation code', async () => {
    globalThis.fetch = async (url, opts = {}) => {
      calls.push({ url: String(url), method: opts.method || 'GET', opts })
      return new Response('data: {"step":"done","msg":"ok","pct":100}\n\n', {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }
    await downloadDeviceEditProfile(
      { deviceId: 'dev-1' },
      'LPA:1$rsp.example.com$match-1$confirm-9',
      { aidHex: 'A0000005591010FFFFFFFF8900000177' },
    )
    const body = JSON.parse(calls[0].opts.body)
    assert.equal(body.confirmation_code, 'confirm-9')
    assert.equal(body.aid_hex, 'A0000005591010FFFFFFFF8900000177')
  })

  it('parses a GSMA 1$ activation code the same way as LPA:1$', async () => {
    globalThis.fetch = async (url, opts = {}) => {
      calls.push({ url: String(url), method: opts.method || 'GET', opts })
      return new Response('data: {"step":"done","msg":"ok","pct":100}\n\n', {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }
    await downloadDeviceEditProfile({ deviceId: 'dev-1' }, '1$rsp.example.com$match-1$confirm-9')
    const body = JSON.parse(calls[0].opts.body)
    assert.equal(body.smdp, 'rsp.example.com')
    assert.equal(body.matching_id, 'match-1')
    assert.equal(body.confirmation_code, 'confirm-9')
  })

  it('prefers a typed confirmation code over the one embedded in the activation code', async () => {
    globalThis.fetch = async (url, opts = {}) => {
      calls.push({ url: String(url), method: opts.method || 'GET', opts })
      return new Response('data: {"step":"done","msg":"ok","pct":100}\n\n', {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }
    await downloadDeviceEditProfile(
      { deviceId: 'dev-1' },
      '1$rsp.example.com$match-1$from-code',
      { confirmationCode: ' typed-code ' },
    )
    const body = JSON.parse(calls[0].opts.body)
    assert.equal(body.confirmation_code, 'typed-code')
  })
})
