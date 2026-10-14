import { afterEach, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { AUTH_EXPIRED_EVENT, onewifiFetch, resolveOnewifiURL, restoreSessionToken, setSessionToken } from './onewifi.js'

const originalFetch = globalThis.fetch

beforeEach(() => {
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
})

afterEach(() => {
  globalThis.fetch = originalFetch
  setSessionToken('')
})

describe('resolveOnewifiURL', () => {
  it('keeps relative paths when base is empty', () => {
    assert.equal(resolveOnewifiURL('/api/health', ''), '/api/health')
  })

  it('prefixes a host without a double slash', () => {
    assert.equal(
      resolveOnewifiURL('/api/devices', 'http://192.168.1.88:6699/'),
      'http://192.168.1.88:6699/api/devices',
    )
  })

  it('leaves already-absolute URLs alone', () => {
    assert.equal(
      resolveOnewifiURL('http://127.0.0.1:6688/api/health', 'http://example'),
      'http://127.0.0.1:6688/api/health',
    )
  })
})

describe('onewifiFetch signal', () => {
  it('forwards AbortSignal to fetch', async () => {
    const ac = new AbortController()
    let seen
    globalThis.fetch = async (_url, opts = {}) => {
      seen = opts.signal
      return new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    await onewifiFetch('/api/health', { signal: ac.signal, trackLoading: false })
    assert.equal(seen, ac.signal)
  })

  it('returns the raw Response when asResponse is true', async () => {
    globalThis.fetch = async () => new Response('event: progress\ndata: {}\n\n', {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    })
    const res = await onewifiFetch('/api/devices/dev1/esim/actions/download?smdp=x', {
      asResponse: true,
      trackLoading: false,
      headers: { Accept: 'text/event-stream' },
    })
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('Content-Type'), 'text/event-stream')
    assert.equal(await res.text(), 'event: progress\ndata: {}\n\n')
  })

  it('does not treat an anonymous session probe as an expired login', async () => {
    const events = []
    globalThis.window.dispatchEvent = (event) => events.push(event.type)
    globalThis.fetch = async () => new Response(
      JSON.stringify({ error: { code: 'unauthorized', message: 'authentication is required' } }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    )
    await assert.rejects(
      () => onewifiFetch('/api/auth/status', { trackLoading: false }),
      (err) => err.status === 401,
    )
    assert.deepEqual(events, [])
  })

  it('still expires the session when an authenticated request is rejected', async () => {
    const events = []
    globalThis.window.dispatchEvent = (event) => events.push(event.type)
    globalThis.fetch = async () => new Response('{}', {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
    await assert.rejects(
      () => onewifiFetch('/api/devices', { trackLoading: false }),
      (err) => err.status === 401,
    )
    assert.deepEqual(events, [AUTH_EXPIRED_EVENT])
  })

  it('sends an in-memory Bearer token when set', async () => {
    let seen
    globalThis.fetch = async (_url, opts = {}) => {
      seen = opts.headers
      return new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    setSessionToken('sess-1')
    await onewifiFetch('/api/health', { trackLoading: false })
    assert.equal(seen.Authorization, 'Bearer sess-1')
  })

  it('restores the Bearer token from sessionStorage after a reload', async () => {
    const memory = new Map()
    const previous = globalThis.sessionStorage
    globalThis.sessionStorage = {
      getItem: (key) => (memory.has(key) ? memory.get(key) : null),
      setItem: (key, value) => memory.set(key, String(value)),
      removeItem: (key) => memory.delete(key),
    }
    try {
      let seen
      globalThis.fetch = async (_url, opts = {}) => {
        seen = opts.headers
        return new Response(JSON.stringify({ data: { ok: true } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      setSessionToken('sess-reload')
      setSessionToken('')
      memory.set('oneboard-session-bearer', 'sess-reload')
      restoreSessionToken()
      await onewifiFetch('/api/health', { trackLoading: false })
      assert.equal(seen.Authorization, 'Bearer sess-reload')
    } finally {
      if (previous === undefined) delete globalThis.sessionStorage
      else globalThis.sessionStorage = previous
    }
  })
})
