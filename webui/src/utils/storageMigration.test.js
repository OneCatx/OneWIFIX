import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { STORAGE_KEYS } from './storageKeys.js'
import { migrateLegacyStorage } from './storageMigration.js'

function memoryStorage() {
  const store = new Map()
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      store.set(String(key), String(value))
    },
    removeItem(key) {
      store.delete(key)
    },
    key(index) {
      return [...store.keys()][index] ?? null
    },
    get length() {
      return store.size
    },
  }
}

describe('onebord → oneboard localStorage rename', () => {
  const original = globalThis.localStorage

  afterEach(() => {
    if (original === undefined) delete globalThis.localStorage
    else globalThis.localStorage = original
  })

  it('copies onebord-* keys and prefixes onto oneboard-* keys, then sets the v1 flag', () => {
    const storage = memoryStorage()
    globalThis.localStorage = storage
    storage.setItem('onebord-theme-mode', 'dark')
    storage.setItem('onebord-auth-token', 'tok')
    storage.setItem('onebord:config-yaml', 'mixed-port: 7890')
    storage.setItem('onebord-remote-yaml:profile-a', 'proxies: []')

    migrateLegacyStorage()

    assert.equal(storage.getItem(STORAGE_KEYS.theme), 'dark')
    assert.equal(storage.getItem(STORAGE_KEYS.authToken), 'tok')
    assert.equal(storage.getItem(STORAGE_KEYS.configYaml), 'mixed-port: 7890')
    assert.equal(storage.getItem(`${STORAGE_KEYS.remoteYamlPrefix}:profile-a`), 'proxies: []')
    assert.equal(storage.getItem(STORAGE_KEYS.migrationFlag), '1')
  })

  it('does not overwrite a newer oneboard key', () => {
    const storage = memoryStorage()
    globalThis.localStorage = storage
    storage.setItem('onebord-auth-token', 'old')
    storage.setItem(STORAGE_KEYS.authToken, 'new')

    migrateLegacyStorage()

    assert.equal(storage.getItem(STORAGE_KEYS.authToken), 'new')
  })
})
