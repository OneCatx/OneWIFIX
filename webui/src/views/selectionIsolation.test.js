import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// 原先这里还守着 mihomo/clash 引擎、订阅、规则、DNS 与旧 OneWifi Lab 页的隔离断言。
// 那些模块从未接入路由，已整层删除（源码归档在 .xj-cursor/死代码归档-20260902-013500），
// 对应断言随之移除；剩下的每条都对准仍在渲染链上的文件。
const here = dirname(fileURLToPath(import.meta.url))
const sms = readFileSync(join(here, '../composables/useOneWifiSms.js'), 'utf8')
const smsView = readFileSync(join(here, 'OneWifiSms.vue'), 'utf8')
  + '\n'
  + readFileSync(join(here, '../components/SmsComposeDialog.vue'), 'utf8')
const proxy = readFileSync(join(here, 'Proxy.vue'), 'utf8')
const keepalive = readFileSync(join(here, 'Keepalive.vue'), 'utf8')
const instanceState = readFileSync(join(here, '../composables/useOneWifiInstance.js'), 'utf8')
  + '\n'
  + readFileSync(join(here, '../composables/useOneWifiInstance.runtime.js'), 'utf8')
const instanceCard = readFileSync(join(here, '../components/OneWifiInstanceCard.vue'), 'utf8')
const addDevice = readFileSync(join(here, '../components/AddDeviceCard.vue'), 'utf8')
const onewifiHub = readFileSync(join(here, '../stores/onewifiHub.js'), 'utf8')
const onewifiSync = readFileSync(join(here, '../stores/onewifiSyncLayer.js'), 'utf8')

describe('selected-item async response isolation', () => {
  it('does not let a closed add-device dialog receive an earlier discovery response', () => {
    assert.match(addDevice, /let dialogRequestId = 0/)
    assert.match(addDevice, /const requestId = \+\+dialogRequestId/)
    assert.match(addDevice, /requestId !== dialogRequestId \|\| !open\.value/)
  })

  it('does not let an old compose send jump to or close a newer SMS compose session', () => {
    assert.doesNotMatch(sms, /selectedContactKey\.value = match\.key/)
    assert.match(sms, /contactKey: match\?\.key \|\| ''/)
    assert.match(smsView, /let composeSessionId = 0/)
    assert.match(smsView, /sessionId !== composeSessionId \|\| !composeOpen\.value/)
  })

  it('does not let an old message deletion repaint the newly selected SMS thread', () => {
    assert.match(sms, /const contactKey = selectedContactKey\.value/)
    assert.match(sms, /if \(selectedContactKey\.value === contactKey\) \{/)
  })

  it('does not surface an old device eSIM switch result on the newly selected device', () => {
    assert.match(instanceState, /if \(isDeviceRequestCurrent\(deviceId, request\) && state\.selectedId === deviceId\) meta\.lastError = null/)
    assert.match(instanceState, /if \(isDeviceRequestCurrent\(deviceId, request\) && state\.selectedId === deviceId\) meta\.lastError = err\?\.message \|\| '切卡失败'/)
    assert.match(instanceCard, /const targetDeviceId = selectedDevice\.value\?\.id/)
    assert.match(instanceCard, /if \(selectedDevice\.value\?\.id !== targetDeviceId\) return/)
  })

  it('tracks proxy country actions per country and ignores stale list loads', () => {
    assert.match(proxy, /let loadRequestId = 0/)
    assert.match(proxy, /const requestId = \+\+loadRequestId/)
    assert.match(proxy, /if \(requestId !== loadRequestId\) return/)
    assert.match(proxy, /const togglingByCountry = ref\(\{\}\)/)
    assert.match(proxy, /const assigningByCountry = ref\(\{\}\)/)
    assert.match(proxy, /const deletingByCountry = ref\(\{\}\)/)
    assert.match(proxy, /:busy="isCountryBusy\(rule\.country_code\)"/)
  })

  it('keeps automatic-task actions and editor sessions scoped to their task', () => {
    assert.match(keepalive, /const taskBusyById = ref\(\{\}\)/)
    assert.match(keepalive, /function setTaskBusy\(taskId, busy\)/)
    assert.match(keepalive, /:disabled="isTaskBusy\(task\.id\)"/)
    assert.match(keepalive, /let draftSessionId = 0/)
    assert.match(keepalive, /const sessionId = draftSessionId/)
    assert.match(keepalive, /if \(sessionId === draftSessionId\)/)
  })

  it('rejects stale automatic-task list and run-page responses', () => {
    assert.match(keepalive, /let loadRequestId = 0/)
    assert.match(keepalive, /let runsRequestId = 0/)
    assert.match(keepalive, /if \(requestId !== loadRequestId\) return false/)
    assert.match(keepalive, /if \(requestId !== runsRequestId\) return false/)
  })

  it('keeps legacy OneWifi refreshes and card-policy busy state scoped to the current target', () => {
    assert.match(onewifiSync, /let hydrateRequestId = 0/)
    assert.match(
      onewifiSync,
      /const requestId = \+\+hydrateRequestId\s*[\s\S]*?selectionLoadRequestId \+= 1\s*const upstream/,
    )
    assert.match(onewifiSync, /function isHydrateCurrent\(requestId\)/)
    assert.match(onewifiSync, /const policySavingKeys = new Set\(\)/)
    assert.match(onewifiSync, /function syncPolicySavingMeta\(\)/)
    assert.match(onewifiSync, /policySavingKeys\.has\(policyKey\)/)
  })

  it('invalidates old OneWIFI snapshots when the hub session restarts', () => {
    assert.match(onewifiHub, /let hubGeneration = 0/)
    assert.match(onewifiHub, /let systemRequestId = 0/)
    assert.match(onewifiHub, /if \(generation !== hubGeneration\) return false/)
  })
})
