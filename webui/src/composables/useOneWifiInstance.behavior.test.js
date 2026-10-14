import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { reactive, ref, computed } from 'vue'
import * as model from '../utils/onewifiModel.js'

// Exercise the production composable with real Vue/model code; only external
// services and component lifecycle registration are replaced (no mounted UI).
const source = readFileSync(new URL('./useOneWifiInstance.runtime.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?from\s+'[^']+'\s*;?/gm, '')
  .replace('export function useOneWifiInstance', 'function useOneWifiInstance')
const deferred = () => {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}
const overview = (iccid) => ({ vowifi_runtime: { iccid }, modem: { iccid } })
const profiles = (iccid) => ({ profiles: ['1001', '1002'].map((id) => ({ iccid: id, name: id, active: id === iccid })) })
function setup(overrides = {}) {
  const instance = reactive({ id: 'instance', host: 'mock.invalid', token: 'mock' })
  const current = { a: '1001', b: '1001' }
  const deps = {
    ...model, reactive, ref, computed, watch: () => {}, onUnmounted: () => {},
    isOnewifiSameOrigin: () => false, buildOneWifiUpstream: (host) => `http://${host}`,
    getHealth: async () => ({}), getDevices: async () => [{ id: 'a', present: true }, { id: 'b', present: true }],
    fetchEgressStatus: async () => ({}), refreshDeviceInfo: async () => {}, getEsimOverview: async () => ({}),
    getDeviceOverview: async (id) => overview(current[id]), getEsimProfiles: async (id) => profiles(current[id]),
    getCardPolicy: async () => ({}), switchEsimProfile: async (id, { iccid }) => { current[id] = iccid },
    proxyLabelForCountry: () => '', resolveDeviceCountryCode: () => '',
    reportInstanceFleet: () => {}, instanceFleetScope: () => '', ...overrides,
  }
  const create = new Function(...Object.keys(deps), `${source}\nreturn useOneWifiInstance;`)(...Object.values(deps))
  return { vm: create(instance), instance, current, deps }
}

test('pre-switch delayed hydration cannot roll back a successful switch, while other devices refresh', async () => {
  const pending = deferred(); const entered = deferred()
  let calls = 0
  const { vm } = setup({ getDeviceOverview: async (id) => {
    if (id === 'b') return overview('1002')
    if (++calls === 2) { entered.resolve(); return pending.promise }
    return overview(calls === 1 ? '1001' : '1002')
  } })
  await vm.refresh({ silent: true })
  const old = vm.refresh({ silent: true }); await entered.promise
  assert.equal(await vm.switchEsim('1002'), true)
  assert.equal(vm.selectedOverview.value.iccid, '1002')
  pending.resolve(overview('1001')); await old
  assert.equal(vm.selectedOverview.value.iccid, '1002')
  assert.equal(vm.overviews.value.b.iccid, '1002')
  assert.equal(vm.esimProfiles.value.find((p) => p.active).iccid, '1002')
  await vm.refresh({ silent: true })
  assert.equal(vm.selectedOverview.value.iccid, '1002')
})

for (const change of ['host', 'token', 'stop']) {
  test(`late switch response does not repaint after ${change}`, async () => {
    const pending = deferred(); const entered = deferred()
    let calls = 0
    const { vm, instance } = setup({ getDeviceOverview: async (id) => {
      if (id === 'a' && ++calls === 2) { entered.resolve(); return pending.promise }
      return overview('1001')
    } })
    await vm.refresh({ silent: true })
    const switching = vm.switchEsim('1002'); await entered.promise
    if (change === 'stop') vm.stop()
    else instance[change] = 'changed'
    pending.resolve(overview('1002'))
    assert.equal(await switching, true, 'successful hardware operation remains successful; obsolete UI response is discarded')
    assert.equal(vm.selectedOverview.value.iccid, '1001')
    assert.equal(vm.deviceIsSwitching('a'), false)
  })
}

test('different devices switch concurrently without cross-selection profiles', async () => {
  const a = deferred(); const b = deferred()
  const { vm, current } = setup({ switchEsimProfile: async (id, { iccid }) => {
    await (id === 'a' ? a.promise : b.promise); current[id] = iccid
  } })
  await vm.refresh({ silent: true })
  const first = vm.switchEsim('1002')
  vm.selectDevice('b')
  const second = vm.switchEsim('1002')
  a.resolve(); assert.equal(await first, true)
  assert.equal(vm.selectedId.value, 'b')
  assert.equal(vm.overviews.value.a.iccid, '1002')
  assert.equal(vm.selectedOverview.value.iccid, '1001')
  b.resolve(); assert.equal(await second, true)
  assert.equal(vm.selectedOverview.value.iccid, '1002')
  assert.equal(vm.deviceIsSwitching('a'), false)
  assert.equal(vm.deviceIsSwitching('b'), false)
})

test('failed switch never paints the requested card and releases busy state', async () => {
  const { vm } = setup({ switchEsimProfile: async () => { throw new Error('rejected') } })
  await vm.refresh({ silent: true })
  assert.equal(await vm.switchEsim('1002'), false)
  assert.equal(vm.selectedOverview.value.iccid, '1001')
  assert.equal(vm.deviceIsSwitching('a'), false)
  await vm.refresh({ silent: true })
  assert.equal(vm.selectedOverview.value.iccid, '1001')
})

for (const outcome of ['success', 'failure']) {
  test(`device A switch ${outcome} cannot clear or replace the selected device B error`, async () => {
    const pending = deferred()
    const { vm, current } = setup({ switchEsimProfile: async (id, { iccid }) => {
      if (id === 'b') throw new Error('device-b-error')
      await pending.promise
      if (outcome === 'failure') throw new Error('device-a-error')
      current[id] = iccid
    } })
    await vm.refresh({ silent: true })
    const first = vm.switchEsim('1002')
    vm.selectDevice('b')
    assert.equal(await vm.switchEsim('1002'), false)
    assert.equal(vm.meta.lastError, 'device-b-error')
    pending.resolve()
    assert.equal(await first, outcome === 'success')
    assert.equal(vm.selectedId.value, 'b')
    assert.equal(vm.meta.lastError, 'device-b-error')
  })
}

test('a delayed device list keeps the mutated device snapshot but updates unrelated devices', async () => {
  const pending = deferred(); const entered = deferred()
  let calls = 0
  const { vm } = setup({ getDevices: async () => {
    if (++calls === 2) { entered.resolve(); return pending.promise }
    return [{ id: 'a', name: 'stable-a', present: true }, { id: 'b', name: 'old-b', present: true }]
  } })
  await vm.refresh({ silent: true })
  const old = vm.refresh({ silent: true }); await entered.promise
  await vm.switchEsim('1002')
  pending.resolve([{ id: 'a', name: 'stale-a', present: true }, { id: 'b', name: 'fresh-b', present: true }])
  await old
  assert.equal(vm.devices.value.find((d) => d.id === 'a').name, 'stable-a')
  assert.equal(vm.devices.value.find((d) => d.id === 'b').name, 'fresh-b')
  assert.equal(vm.selectedOverview.value.iccid, '1002')
})

test('pre-switch profile response cannot replace post-switch profile metadata', async () => {
  const pending = deferred(); const entered = deferred()
  let calls = 0
  const { vm } = setup({ getEsimProfiles: async () => {
    if (++calls === 2) { entered.resolve(); return pending.promise }
    return profiles(calls === 1 ? '1001' : '1002')
  } })
  await vm.refresh({ silent: true })
  const old = vm.refresh({ silent: true }); await entered.promise
  await vm.switchEsim('1002')
  pending.resolve({ profiles: [{ iccid: '1001', name: 'stale-only', active: true }] }); await old
  assert.equal(vm.esimProfiles.value.find((p) => p.active).iccid, '1002')
  assert.equal(vm.esimProfiles.value.length, 2)
})

test('pre-switch card policy response cannot become the new card policy', async () => {
  const pending = deferred(); const entered = deferred()
  let calls = 0
  const { vm } = setup({ getDevices: async () => [{ id: 'a', present: true, apn: 'old-device-apn' }], getCardPolicy: async () => {
    if (++calls === 2) { entered.resolve(); return pending.promise }
    return { apn: calls === 1 ? 'initial' : 'new-card-apn' }
  } })
  await vm.refresh({ silent: true })
  const old = vm.refresh({ silent: true }); await entered.promise
  await vm.switchEsim('1002')
  pending.resolve({ apn: 'stale' }); await old
  assert.equal(vm.policyIccid.value, '1002')
  assert.notEqual(vm.cardPolicy.value?.apn, 'stale')
  assert.equal(vm.cardPolicy.value, null, 'a new card must await its own policy rather than inherit the previous card fallback')
  assert.equal(vm.policyLoading.value, false)
  await vm.refresh({ silent: true })
  assert.equal(vm.cardPolicy.value.apn, 'new-card-apn')
})

test('a poll launched during hardware switching cannot overwrite the convergence refresh', async () => {
  const switching = deferred(); const pending = deferred(); const entered = deferred()
  let calls = 0
  const { vm } = setup({
    switchEsimProfile: async () => switching.promise,
    getDeviceOverview: async (id) => {
      if (id !== 'a') return overview('1001')
      if (++calls === 2) { entered.resolve(); return pending.promise }
      return overview(calls === 1 ? '1001' : '1002')
    },
  })
  await vm.refresh({ silent: true })
  const mutation = vm.switchEsim('1002')
  const old = vm.refresh({ silent: true }); await entered.promise
  switching.resolve(); await mutation
  pending.resolve(overview('1001')); await old
  assert.equal(vm.selectedOverview.value.iccid, '1002')
})

test('selection roundtrip rejects the earlier selected extras response', async () => {
  const pending = deferred(); const entered = deferred()
  let calls = 0
  const { vm } = setup({ getEsimProfiles: async (id) => {
    if (id === 'a' && ++calls === 2) { entered.resolve(); return pending.promise }
    return profiles('1001')
  } })
  await vm.refresh({ silent: true })
  const old = vm.refresh({ silent: true }); await entered.promise
  vm.selectDevice('b'); vm.selectDevice('a')
  pending.resolve({ profiles: [{ iccid: '1001', name: 'stale', active: true }] }); await old
  assert.equal(vm.selectedId.value, 'a')
  assert.notEqual(vm.esimProfiles.value[0]?.name, 'stale')
})

for (const outcome of ['success', 'failure']) {
  test(`policy read started during switch ${outcome} releases its loading flag without another request`, async () => {
    const mutation = deferred(); const policy = deferred(); const entered = deferred()
    let calls = 0
    const { vm, current } = setup({
      switchEsimProfile: async (id, { iccid }) => {
        await mutation.promise
        if (outcome === 'failure') throw new Error('switch failed')
        current[id] = iccid
      },
      getCardPolicy: async () => {
        if (++calls === 2) { entered.resolve(); return policy.promise }
        return { apn: 'initial' }
      },
    })
    await vm.refresh({ silent: true })
    const switching = vm.switchEsim('1002')
    const polling = vm.refresh({ silent: true }); await entered.promise
    assert.equal(vm.policyLoading.value, true)
    mutation.resolve(); assert.equal(await switching, outcome === 'success')
    policy.resolve({ apn: 'obsolete' }); await polling
    assert.equal(vm.policyLoading.value, false, 'settled obsolete request must release its own loading flag')
  })
}

test('obsolete device A policy cleanup does not clear device B current loading', async () => {
  const a = deferred(); const b = deferred(); const enteredA = deferred(); const enteredB = deferred()
  let calls = 0
  const { vm } = setup({ getCardPolicy: async () => {
    calls += 1
    if (calls === 2) { enteredA.resolve(); return a.promise }
    if (calls === 3) { enteredB.resolve(); return b.promise }
    return {}
  } })
  await vm.refresh({ silent: true })
  const old = vm.refresh({ silent: true }); await enteredA.promise
  vm.selectDevice('b'); await enteredB.promise
  a.resolve({ apn: 'old-a' }); await old
  assert.equal(vm.policyLoading.value, true)
  assert.notEqual(vm.cardPolicy.value?.apn, 'old-a')
  b.resolve({ apn: 'current-b' })
  await new Promise(setImmediate)
  assert.equal(vm.policyLoading.value, false)
  assert.equal(vm.cardPolicy.value.apn, 'current-b')
})

for (const changed of ['token', 'host']) {
  test(`hydrate releases its own busy flags after ${changed} changes while discarding old data`, async () => {
    const pending = deferred(); const entered = deferred()
    const { vm, instance } = setup({ getDevices: async () => { entered.resolve(); return pending.promise } })
    const hydration = vm.refresh(); await entered.promise
    assert.equal(vm.loading.value, true)
    assert.equal(vm.meta.hydrating, true)
    instance[changed] = changed === 'token' ? '' : 'replacement.invalid'
    pending.resolve([{ id: 'obsolete', present: true }]); await hydration
    assert.equal(vm.devices.value.length, 0)
    assert.equal(vm.loading.value, false)
    assert.equal(vm.meta.hydrating, false)
  })
}

test('older hydrate cleanup cannot release the newer hydrate busy flags', async () => {
  const first = deferred(); const second = deferred(); const entered = deferred()
  let calls = 0
  const { vm } = setup({ getDevices: async () => {
    if (++calls === 1) return first.promise
    entered.resolve(); return second.promise
  } })
  const old = vm.refresh()
  const current = vm.refresh(); await entered.promise
  first.resolve([]); await old
  assert.equal(vm.loading.value, true)
  assert.equal(vm.meta.hydrating, true)
  second.resolve([]); await current
  assert.equal(vm.loading.value, false)
  assert.equal(vm.meta.hydrating, false)
})
