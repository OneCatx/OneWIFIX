import {
  LEGACY_STORAGE_KEY_MAP,
  LEGACY_STORAGE_PREFIX_MAP,
  STORAGE_KEYS,
} from './storageKeys.js'

/** Migrate legacy Board localStorage keys (idempotent). */

const REPAIR_FLAG = 'oneboard:storage-repaired-clash-v1'

function clashConfigHasData(raw) {
  try {
    const parsed = JSON.parse(raw)
    return Boolean(String(parsed?.host || '').trim() || String(parsed?.secret || '').trim())
  } catch {
    return false
  }
}

function clashConfigIsEmpty(raw) {
  if (!raw) return true
  try {
    const parsed = JSON.parse(raw)
    return !String(parsed?.host || '').trim() && !String(parsed?.secret || '').trim()
  } catch {
    return true
  }
}

function copyLegacyKey(legacyKey, nextKey, { forceIfNextEmpty = false } = {}) {
  const legacy = localStorage.getItem(legacyKey)
  if (!legacy) return
  const next = localStorage.getItem(nextKey)
  if (!next) {
    localStorage.setItem(nextKey, legacy)
    return
  }
  if (forceIfNextEmpty && clashConfigIsEmpty(next) && clashConfigHasData(legacy)) {
    localStorage.setItem(nextKey, legacy)
  }
}

function repairClashBackendFromLegacy() {
  if (localStorage.getItem(REPAIR_FLAG)) return
  copyLegacyKey('onebord-clash-backend', STORAGE_KEYS.clashBackend, { forceIfNextEmpty: true })
  localStorage.setItem(REPAIR_FLAG, '1')
}

export function migrateLegacyStorage() {
  try {
    if (!localStorage.getItem(STORAGE_KEYS.migrationFlag)) {
      for (const [legacyKey, nextKey] of Object.entries(LEGACY_STORAGE_KEY_MAP)) {
        copyLegacyKey(legacyKey, nextKey)
      }

      const keys = []
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i)
        if (key) keys.push(key)
      }

      for (const key of keys) {
        for (const [legacyPrefix, nextPrefix] of Object.entries(LEGACY_STORAGE_PREFIX_MAP)) {
          if (!key.startsWith(legacyPrefix)) continue
          const nextKey = `${nextPrefix}${key.slice(legacyPrefix.length)}`
          if (!localStorage.getItem(nextKey)) {
            localStorage.setItem(nextKey, localStorage.getItem(key))
          }
        }
      }

      localStorage.setItem(STORAGE_KEYS.migrationFlag, '1')
    }

    repairClashBackendFromLegacy()
  } catch {
    /* private mode / quota */
  }
}
