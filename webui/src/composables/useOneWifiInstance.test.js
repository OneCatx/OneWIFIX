import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'url'

const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, 'useOneWifiInstance.js'), 'utf8')
  + '\n'
  + readFileSync(join(here, 'useOneWifiInstance.runtime.js'), 'utf8')

describe('useOneWifiInstance device switch', () => {
  it('paints cached overview and esim before any network refetch', () => {
    assert.match(src, /function paintSelection\(id\)/)
    assert.match(src, /esimMemory\.get\(id\) \|\| extractEsim\(device\)/)
    assert.match(src, /skipOverview: Boolean\(state\.overviews\[id\]\)/)
    assert.match(src, /if \(!id \|\| state\.selectedId === id\) return/)
    assert.match(src, /if \(!isHydrateCurrent\(generation\) \|\| state\.selectedId !== id\) return/)
  })

  it('does not block clicks on getDeviceOverview fallback chain', () => {
    assert.match(src, /if \(!skipOverview\)/)
    assert.doesNotMatch(
      src,
      /function selectDevice\(id\) \{\s*state\.selectedId = id\s*void reloadSelection\(\)/,
    )
  })

  it('invalidates stale hydrate writes and cleanup before selection or esim switch', () => {
    assert.match(src, /function beginHydrationGeneration\(\{ clearLoading = false \} = \{\}\)/)
    assert.match(src, /if \(!isHydrateCurrent\(generation\)\) return[\s\S]{0,500}list\.forEach/)
    assert.match(src, /await loadSelectedExtras\(\{ refreshEsim: !silent, generation \}\)/)
    assert.match(src, /if \(generation === hydrateGeneration\) \{\s*meta\.hydrating = false\s*loading\.value = false/)
    assert.match(src, /beginHydrationGeneration\(\{ clearLoading: true \}\)\s*state\.selectedId = id/)
    assert.match(src, /esimSwitchingByDevice\[deviceId\] = true/)
  })

  it('lets a second device switch while another card is changing', () => {
    const start = src.indexOf('async function switchEsim(')
    const end = src.indexOf('async function reconnectVowifi(')
    assert.ok(start >= 0 && end > start, 'switchEsim is followed by reconnectVowifi')
    const switchFn = src.slice(start, end)
    assert.match(switchFn, /esimSwitchingByDevice\[deviceId\] = true/)
    assert.match(switchFn, /if \(deviceIsSwitching\(deviceId\)\)/)
    assert.match(switchFn, /await refreshAfterEsimSwitch\(deviceId\)/)
    assert.doesNotMatch(switchFn, /if \(!deviceId \|\| !iccid \|\| esimSwitchingId/)
    assert.doesNotMatch(switchFn, /beginHydrationGeneration/)
    assert.doesNotMatch(switchFn, /generation \+ 1/)
    assert.doesNotMatch(switchFn, /refresh\(\{ silent: true, allowDuringEsimSwitch: true \}\)/)
  })

  it('runs the post-switch convergence refresh while polling remains blocked', () => {
    assert.match(src, /list\.filter\(\(d\) => !deviceIsSwitching\(d\.id\)\)\.map\(\(d\) => refreshDeviceInfo/)
    assert.match(src, /Promise\.allSettled\(list\.map\(\(d\) => getDeviceOverview/)
    assert.match(src, /async function refreshAfterEsimSwitch\(deviceId\)/)
    assert.match(src, /SWITCH_POLL_INTERVAL_MS = 500/)
    assert.match(src, /armPoll\(busy \? SWITCH_POLL_INTERVAL_MS : POLL_INTERVAL_MS\)/)
    assert.doesNotMatch(src, /if \(deviceIsSwitching\(state\.selectedId\) && !allowDuringEsimSwitch\) return/)
  })

  it('keeps device-operation status and late results scoped to their originating device', () => {
    assert.match(src, /const deviceActions = reactive\(\{\}\)/)
    assert.match(src, /const selectedAction = computed\(\(\) => deviceActions\[state\.selectedId\] \|\| ''\)/)
    assert.match(src, /function isCurrentSelection\(generation, deviceId\)/)
    assert.match(src, /if \(!isCurrentSelection\(generation, deviceId\)\) return false/)
    assert.match(src, /deviceActions\[deviceId\] = 'vowifi-reconnect'/)
    assert.match(src, /delete deviceActions\[deviceId\]/)
    assert.match(src, /const policySavingByDevice = reactive\(\{\}\)/)
    assert.match(src, /const selectedPolicySaving = computed\(\(\) => Boolean\(policySavingByDevice\[state\.selectedId\]\)\)/)
    assert.match(src, /async function setDeveloperMode\(enabled\)/)
    assert.match(src, /apiSetDeveloperMode\(Boolean\(enabled\), ctx\(\)\)/)
    assert.match(src, /upstream: local \? '' : upstream\.value/)
    assert.match(src, /token: local \? '' : token\.value/)
    assert.match(src, /function setPollSuspended\(on\)/)
    assert.match(src, /if \(pollSuspended\.value\) return/)
  })
  it('publishes per-instance counts into the page-level fleet overview', () => {
    assert.match(src, /reportInstanceFleet/)
    assert.match(src, /clearInstanceFleet/)
    assert.match(src, /instanceFleetScope/)
  })

  it('repaints the 切卡 list from the live VoWiFi ICCID, not the stale cache flag', () => {
    assert.match(src, /applyLiveIccidToProfiles/)
  })

  it('does not stamp 当前 eSIM back to a dash while the switch is converging', () => {
    assert.match(src, /mergeOverviewKeepingEsimName/)
    assert.match(src, /retainEsimProfileName/)
    assert.match(src, /function paintOverview\(id, incoming\)/)
    assert.match(src, /if \(nextName === state\.overviews\[id\]\.esimProfile\) return/)
    assert.doesNotMatch(src, /esimProfile: active\?\.name \|\| '—'/)
    assert.match(src, /nextOverviews\[device\.id\] = paintOverview\(/)
    assert.match(src, /\[deviceId\]: paintOverview\(deviceId, normalizeDeviceOverview/)
  })

  it('stamps each device with the short upstream proxy name, not the address', () => {
    assert.match(src, /fetchEgressStatus\(ctx\(\)\)/)
    assert.doesNotMatch(src, /fetchOnewifiEgressStatus/)
    assert.match(src, /proxyLabelForCountry/)
    assert.match(src, /resolveDeviceCountryCode/)
    assert.match(src, /proxyLabel/)
    assert.match(src, /radioLabel: overview\?\.radioLabel/)
  })

  it('writes card policy, rename and delete through the instance adapter context', () => {
    assert.match(src, /patchDeviceCapabilities\(deviceId, capabilities, ctx\(\)\)/)
    assert.match(src, /apiRenameDevice\(deviceId, name, ctx\(\)\)/)
    assert.match(src, /apiDeleteDevice\(id, ctx\(\)\)/)
    assert.doesNotMatch(src, /patchOnewifiDeviceCapabilities/)
    assert.doesNotMatch(src, /from '\.\.\/api\/onewifiDevices'/)
  })

  it('keeps chip reading and cached profiles without the retired force-refresh operation', () => {
    assert.match(src, /async function readChip\(/)
    assert.match(src, /loadSelectedExtras\(\{ refreshEsim: true, generation \}\)/)
    assert.doesNotMatch(src, /forceRefreshChip|forceEsim/)
    const extras = src.slice(src.indexOf('async function loadSelectedExtras'), src.indexOf('async function hydrate('))
    assert.match(extras, /getEsimProfiles\(id, \{ refresh: refreshEsim, \.\.\.ctx\(\) \}\)/)
    assert.match(extras, /onewifiEsimHint\(\{/)
    assert.match(extras, /esimMemory\.get\(id\) \|\| extractEsim\(device\)/)
  })

  it('clears the occupying chip cache when a device is deleted so add-again starts empty', () => {
    const start = src.indexOf('async function deleteSelectedDevice(')
    const end = src.indexOf('async function persistEndpoint(')
    assert.ok(start >= 0 && end > start, 'deleteSelectedDevice is followed by persistEndpoint')
    const fn = src.slice(start, end)
    assert.match(fn, /forgetEsimCache\(/)
    assert.match(src, /function forgetEsimCache\(/)
    assert.match(src, /esimMemory\.delete\(/)
    assert.match(src, /esimHardwareByDevice/)
  })

  it('loads cached eUICC hardware for every device and retains the last good value', () => {
    assert.match(src, /getEsimOverview/)
    assert.match(src, /normalizeEuiccHardware/)
    assert.match(src, /esimHardwareByDevice/)
    assert.match(src, /Promise\.allSettled\(list\.map\(\(d\) => getEsimOverview/)
    assert.match(src, /if \(hardware\.length\) nextEsimHardware\[device\.id\] = hardware/)
    assert.match(src, /const nextEsimHardware = \{ \.\.\.state\.esimHardwareByDevice \}/)
  })

  it('pauses the instance poll while the document is hidden', () => {
    assert.match(src, /visibilitychange/)
    assert.match(src, /visibilityState === 'hidden'/)
    assert.match(src, /document\.addEventListener\('visibilitychange'/)
  })
})
