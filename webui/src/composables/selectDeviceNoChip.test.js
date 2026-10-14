import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const instance = readFileSync(join(here, 'useOneWifiInstance.js'), 'utf8')
  + '\n'
  + readFileSync(join(here, 'useOneWifiInstance.runtime.js'), 'utf8')
const syncLayer = readFileSync(join(here, '../stores/onewifiSyncLayer.js'), 'utf8')
const card = readFileSync(join(here, '../components/OneWifiInstanceCard.vue'), 'utf8')

describe('selectDevice does not read the eSIM chip', () => {
  it('keeps refresh: true off the instance select/reload path', () => {
    const reload = instance.slice(instance.indexOf('async function reloadSelection'))
    const reloadBody = reload.slice(0, reload.indexOf('async function patchCardPolicy'))
    assert.doesNotMatch(reloadBody, /refresh:\s*true/)
    assert.match(reloadBody, /refreshEsim:\s*false/)
    assert.match(instance, /void hydrate\(\{\s*silent:\s*true\s*\}\)/)
  })

  it('keeps refresh: true off the dashboard sync select path', () => {
    const reload = syncLayer.slice(syncLayer.indexOf('export async function reloadOneWifiSelection'))
    const reloadBody = reload.slice(0, reload.indexOf('export async function patchOneWifiCardPolicy'))
    assert.doesNotMatch(reloadBody, /refresh:\s*true/)
    assert.match(reloadBody, /refreshEsim:\s*false/)
    assert.match(syncLayer, /return reason === 'login' \|\| reason === 'manual'/)
  })

  it('rejects late profile and policy responses from the previously selected device', () => {
    assert.match(syncLayer, /let selectionGeneration = 0/)
    assert.match(syncLayer, /function isSelectionCurrent\(generation, id\)/)
    assert.match(syncLayer, /function isSelectionLoadCurrent\(requestId, generation, id\)/)
    assert.match(syncLayer, /if \(!isSelectionLoadCurrent\(requestId, generation, id\)\) return false/)
    assert.match(syncLayer, /selectionGeneration \+= 1\s*onewifiSyncState\.selectedId = id/)
    assert.match(syncLayer, /onewifiSyncState\.selectedId === selectedId && onewifiSyncState\.policyIccid === iccid/)
  })

  it('paints overview as soon as a device is selected', () => {
    assert.match(card, /v-if="selectedDevice"/)
    assert.doesNotMatch(card, /selectedDevice && selectedOverview/)
  })
})
