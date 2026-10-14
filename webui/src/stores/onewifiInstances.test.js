import { afterEach, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  ensureLanOneWifiInstance,
  onewifiInstances,
} from './onewifiInstances.js'

const originalLocation = globalThis.location
const originalLocalStorage = globalThis.localStorage

function memoryStorage() {
  const memory = new Map()
  return {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key),
  }
}

describe('ensureLanOneWifiInstance', () => {
  beforeEach(() => {
    globalThis.localStorage = memoryStorage()
    globalThis.location = {
      origin: 'http://192.168.1.88:6699',
      hostname: '192.168.1.88',
      port: '6699',
      protocol: 'http:',
    }
  })

  afterEach(() => {
    onewifiInstances.splice(0, onewifiInstances.length)
    if (originalLocation === undefined) delete globalThis.location
    else globalThis.location = originalLocation
    if (originalLocalStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = originalLocalStorage
  })

  it('rewrites a saved https:// board URL back to the live HTTP page', () => {
    onewifiInstances.splice(0, onewifiInstances.length, {
      id: 'ow_https',
      label: 'OneWIFI',
      host: 'https://192.168.1.88:6699',
      port: 6699,
      token: '',
      username: '',
      collapsed: false,
    })
    const inst = ensureLanOneWifiInstance()
    assert.equal(inst.host, '192.168.1.88')
    assert.equal(inst.port, 6699)
    assert.equal(onewifiInstances.length, 1)
  })

  it('keeps a real remote container and still adds the local board', () => {
    onewifiInstances.splice(0, onewifiInstances.length, {
      id: 'ow_remote',
      label: '远端',
      host: '10.0.0.8',
      port: 6699,
      token: 'tok',
      username: 'admin',
      collapsed: false,
    })
    const inst = ensureLanOneWifiInstance()
    assert.equal(inst.host, '192.168.1.88')
    assert.equal(inst.port, 6699)
    assert.equal(onewifiInstances.length, 2)
    assert.equal(onewifiInstances.some((item) => item.id === 'ow_remote'), true)
  })

  it('rewrites a same-host card that defaulted to port 6688', () => {
    onewifiInstances.splice(0, onewifiInstances.length, {
      id: 'ow_default',
      label: 'OneWIFI',
      host: '192.168.1.88',
      port: null,
      token: '',
      username: '',
      collapsed: false,
    })
    const inst = ensureLanOneWifiInstance()
    assert.equal(inst.id, 'ow_default')
    assert.equal(inst.host, '192.168.1.88')
    assert.equal(inst.port, 6699)
    assert.equal(onewifiInstances.length, 1)
  })

  it('drops extra clones of this board', () => {
    onewifiInstances.splice(0, onewifiInstances.length,
      {
        id: 'ow_http',
        label: 'OneWIFI',
        host: '192.168.1.88',
        port: 6699,
        token: '',
        username: '',
        collapsed: false,
      },
      {
        id: 'ow_https',
        label: '容器 2',
        host: 'https://192.168.1.88:6699',
        port: 6699,
        token: 'stale',
        username: 'admin',
        collapsed: true,
      },
    )
    const inst = ensureLanOneWifiInstance()
    assert.equal(inst.id, 'ow_http')
    assert.equal(onewifiInstances.length, 1)
    assert.equal(onewifiInstances[0].id, 'ow_http')
  })
})
