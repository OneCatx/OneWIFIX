/**
 * Runs before ES modules load. Keep in sync with src/utils/storageKeys.js
 */
(function () {
  var FLAG = 'oneboard:storage-migrated-v1'
  var REPAIR_FLAG = 'oneboard:storage-repaired-clash-v1'
  var KEY_MAP = {
    'onebord-theme-mode': 'oneboard-theme-mode',
    'onebord-auth-token': 'oneboard-auth-token',
    'onebord-auth-user': 'oneboard-auth-user',
    'onebord-clash-backend': 'oneboard-clash-backend',
    'onebord-rules-editor': 'oneboard-rules-editor',
    'onebord-wifi-state': 'oneboard-wifi-state',
    'onebord:config-yaml': 'oneboard:config-yaml',
  }
  var PREFIX_MAP = {
    'onebord-remote-yaml:': 'oneboard-remote-yaml:',
  }

  function clashHasData(raw) {
    try {
      var p = JSON.parse(raw)
      return Boolean(String(p.host || '').trim() || String(p.secret || '').trim())
    } catch (e) {
      return false
    }
  }

  function clashIsEmpty(raw) {
    if (!raw) return true
    try {
      var p = JSON.parse(raw)
      return !String(p.host || '').trim() && !String(p.secret || '').trim()
    } catch (e) {
      return true
    }
  }

  function copyKey(legacyKey, nextKey, forceIfNextEmpty) {
    var legacy = localStorage.getItem(legacyKey)
    if (!legacy) return
    var next = localStorage.getItem(nextKey)
    if (!next || (forceIfNextEmpty && clashIsEmpty(next) && clashHasData(legacy))) {
      localStorage.setItem(nextKey, legacy)
    }
  }

  try {
    if (!localStorage.getItem(FLAG)) {
      for (var legacyKey in KEY_MAP) {
        if (!Object.prototype.hasOwnProperty.call(KEY_MAP, legacyKey)) continue
        copyKey(legacyKey, KEY_MAP[legacyKey], false)
      }

      var keys = []
      for (var i = 0; i < localStorage.length; i += 1) {
        var k = localStorage.key(i)
        if (k) keys.push(k)
      }
      for (var j = 0; j < keys.length; j += 1) {
        var key = keys[j]
        for (var legacyPrefix in PREFIX_MAP) {
          if (!Object.prototype.hasOwnProperty.call(PREFIX_MAP, legacyPrefix)) continue
          if (key.indexOf(legacyPrefix) !== 0) continue
          var nextPrefix = PREFIX_MAP[legacyPrefix]
          var migratedKey = nextPrefix + key.slice(legacyPrefix.length)
          if (!localStorage.getItem(migratedKey)) {
            localStorage.setItem(migratedKey, localStorage.getItem(key))
          }
        }
      }

      localStorage.setItem(FLAG, '1')
    }

    if (!localStorage.getItem(REPAIR_FLAG)) {
      copyKey('onebord-clash-backend', 'oneboard-clash-backend', true)
      localStorage.setItem(REPAIR_FLAG, '1')
    }
  } catch (e) {
    /* private mode / quota */
  }
})()
