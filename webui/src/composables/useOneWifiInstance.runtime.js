/**
 * 单个 OneWifi 容器实例的状态 / 轮询 / 操作。
 * 与全局 sync layer 无关：每个实例用自己的 upstream + token 独立请求，互不冲突。
 */
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import {
  isOnewifiSameOrigin,
  getDevices,
  getDeviceOverview,
  getEsimOverview,
  getEsimProfiles,
  getCardPolicy,
  getHealth,
  isOneWifiMissingApiError,
  login as apiLogin,
  rebootDevice,
  reconnectVowifi as apiReconnectVowifi,
  refreshDeviceInfo,
  sendAtCommand as apiSendAtCommand,
  switchEsimProfile,
  patchDeviceCapabilities,
  renameDevice as apiRenameDevice,
  deleteDevice as apiDeleteDevice,
  fetchEgressStatus,
  setDeveloperMode as apiSetDeveloperMode,
} from '../api/onewifi.adapter'
import { activateOneWifiInstance } from '../stores/onewifiInstanceHub'
import { buildOneWifiUpstream } from '../stores/onewifiConnection'
import { parseOneWifiEndpointInput } from '../utils/onewifiEndpoint'
import { updateInstance } from '../stores/onewifiInstances'
import {
  normalizeDeviceList,
  normalizeDeviceOverview,
  normalizeEuiccHardware,
  parseOnewifiEsimPayload,
  applyLiveIccidToProfiles,
  mergeOverviewKeepingEsimName,
  retainEsimProfileName,
  onewifiEsimHint,
  normalizeCardPolicy,
  policyFromDeviceRow,
  resolveActiveIccid,
  lineActionBlockReason,
  lineActionId,
} from '../utils/onewifiModel'
import { policyPatchToCapabilities } from '../utils/onewifiDevice'
import { resolveDeviceCountryCode } from '../utils/onewifiDeviceVisual'
import { proxyLabelForCountry } from '../utils/upstreamProxy'
import {
  clearInstanceFleet,
  instanceFleetScope,
  reportInstanceFleet,
} from '../stores/deviceFleetStats'

const POLL_INTERVAL_MS = 15000
const SWITCH_POLL_INTERVAL_MS = 500

export function useOneWifiInstance(instance) {
  const state = reactive({
    devices: [],
    overviews: {},
    esimHardwareByDevice: {},
    esimProfiles: [],
    cardPolicy: null,
    policyIccid: '',
    selectedId: '',
  })
  const meta = reactive({
    hydrating: false,
    lastError: null,
    streamWarning: null,
    lastHydrateAt: null,
    healthOk: false,
    esimHint: '',
  })

  const loading = ref(false)
  const loggingIn = ref(false)
  const deviceActions = reactive({})
  const esimSwitchingByDevice = reactive({})
  const esimSwitchingIccidByDevice = reactive({})
  const atSendingByDevice = reactive({})
  const policyLoading = ref(false)
  const policySavingByDevice = reactive({})
  const developerSaving = ref(false)

  let pollTimer = null
  let pollPausedHidden = false
  let visibilityBound = false
  let activeUpstream = ''
  let hydrateGeneration = 0
  let hydrateContext = null
  let contextEpoch = 0
  let policyRequestId = 0
  const deviceRevisions = new Map()
  const esimMemory = new Map()

  function deviceBySelection(selectionId) {
    return state.devices.find((item) => item.id === selectionId) || null
  }

  function lineIdFor(selectionId) {
    return lineActionId(deviceBySelection(selectionId) || {})
  }

  const upstream = computed(() => buildOneWifiUpstream(instance.host, instance.port))
  const token = computed(() => instance.token || '')
  const hostConfigured = computed(() => Boolean(String(instance.host || '').trim()))
  const sameOrigin = computed(() => isOnewifiSameOrigin(upstream.value))
  const configured = computed(() => hostConfigured.value && (Boolean(token.value) || sameOrigin.value))
  const connected = computed(
    () => configured.value
      && Boolean(meta.lastHydrateAt && (meta.healthOk || state.devices.length)),
  )

  function ctx() {
    const local = sameOrigin.value
    return {
      upstream: local ? '' : upstream.value,
      token: local ? '' : token.value,
      onUnauthorized: () => updateInstance(instance.id, { token: '' }),
    }
  }

  const requestCtx = computed(() => ctx())

  const devices = computed(() => state.devices)
  const overviews = computed(() => state.overviews)
  const esimHardware = computed(() => state.esimHardwareByDevice)
  const esimProfiles = computed(() => state.esimProfiles)
  const cardPolicy = computed(() => state.cardPolicy)
  const policyIccid = computed(() => state.policyIccid)
  const selectedAction = computed(() => deviceActions[state.selectedId] || '')
  const selectedEsimSwitching = computed(
    () => esimSwitchingIccidByDevice[state.selectedId] || '',
  )

  function deviceIsSwitching(deviceId) {
    return Boolean(esimSwitchingByDevice[deviceId])
  }
  const selectedAtSending = computed(() => Boolean(atSendingByDevice[state.selectedId]))
  const selectedPolicySaving = computed(() => Boolean(policySavingByDevice[state.selectedId]))
  const onlineCount = computed(() => state.devices.filter((d) => d.online).length)
  const offlineCount = computed(() => state.devices.length - onlineCount.value)

  const selectedId = computed({
    get: () => state.selectedId,
    set: (id) => selectDevice(id),
  })
  const selectedDevice = computed(
    () => state.devices.find((d) => d.id === state.selectedId) || state.devices[0] || null,
  )
  const selectedOverview = computed(() => {
    const device = selectedDevice.value
    if (!device) return null
    return state.overviews[device.id] || normalizeDeviceOverview(device, device)
  })
  const lastUpdated = computed(() => (meta.lastHydrateAt ? new Date(meta.lastHydrateAt) : null))

  function clearRuntime() {
    contextEpoch += 1
    state.devices = []
    state.overviews = {}
    state.esimHardwareByDevice = {}
    state.esimProfiles = []
    state.cardPolicy = null
    state.policyIccid = ''
    state.selectedId = ''
    esimMemory.clear()
  }

  function liveIccidFor(id, device) {
    const overview = state.overviews[id]
    return overview?.iccid || device?.vowifi_runtime?.iccid || device?.iccid || ''
  }

  function adoptEsimProfiles(id, device, parsed) {
    return applyLiveIccidToProfiles(parsed, liveIccidFor(id, device))
  }

  function extractEsim(device) {
    if (!device) return []
    return adoptEsimProfiles(
      device.id,
      device,
      parseOnewifiEsimPayload(
        device.esim_profiles || device.esimProfiles || device.esim || device.profiles || [],
      ),
    )
  }

  function activeEsimNameFor(id) {
    const profiles = id === state.selectedId ? state.esimProfiles : (esimMemory.get(id) || [])
    return String(profiles.find((profile) => profile.active)?.name || '').trim()
  }

  function paintOverview(id, incoming) {
    return mergeOverviewKeepingEsimName(state.overviews[id], incoming, activeEsimNameFor(id))
  }

  function stampEsimOnOverview() {
    const id = state.selectedId
    if (!id || !state.overviews[id]) return
    const nextName = retainEsimProfileName(
      state.overviews[id].esimProfile,
      state.overviews[id].esimProfile,
      activeEsimNameFor(id),
    )
    if (nextName === state.overviews[id].esimProfile) return
    state.overviews[id] = {
      ...state.overviews[id],
      esimProfile: nextName,
    }
  }

  function beginHydrationGeneration({ clearLoading = false } = {}) {
    hydrateGeneration += 1
    hydrateContext = { upstream: upstream.value, token: token.value }
    if (clearLoading) {
      meta.hydrating = false
      loading.value = false
      policyLoading.value = false
    }
    return hydrateGeneration
  }

  function isHydrateCurrent(generation) {
    return generation === hydrateGeneration
      && hydrateContext?.upstream === upstream.value && hydrateContext?.token === token.value
  }

  function deviceRevision(id) {
    return deviceRevisions.get(id) || 0
  }

  function advanceDeviceRevision(id) {
    deviceRevisions.set(id, deviceRevision(id) + 1)
  }

  function captureDeviceRequest(id) {
    return { revision: deviceRevision(id), epoch: contextEpoch, upstream: upstream.value, token: token.value }
  }

  function isDeviceRequestCurrent(id, request) {
    return request.revision === deviceRevision(id) && request.epoch === contextEpoch
      && request.upstream === upstream.value && request.token === token.value
  }

  function isCurrentSelection(generation, deviceId) {
    return isHydrateCurrent(generation) && state.selectedId === deviceId
  }

  async function loadCardPolicy(generation = hydrateGeneration) {
    if (!isHydrateCurrent(generation)) return
    const id = state.selectedId
    const request = captureDeviceRequest(id)
    const current = () => isCurrentSelection(generation, id) && isDeviceRequestCurrent(id, request)
    const overview = selectedOverview.value
    const device = selectedDevice.value
    const iccid = resolveActiveIccid(overview, state.esimProfiles)
    state.policyIccid = iccid
    const fallback = policyFromDeviceRow(device || {})
    if (!iccid) {
      state.cardPolicy = fallback
      return
    }
    policyLoading.value = true
    const requestId = ++policyRequestId
    try {
      const payload = await getCardPolicy(iccid, ctx())
      if (current()) state.cardPolicy = normalizeCardPolicy(payload)
    } catch {
      if (current()) state.cardPolicy = fallback
    } finally {
      // Busy state belongs to the latest request, even when its data is obsolete.
      if (requestId === policyRequestId) policyLoading.value = false
    }
  }

  async function loadSelectedExtras({ refreshEsim = false, generation = hydrateGeneration } = {}) {
    if (!isHydrateCurrent(generation)) return
    const id = state.selectedId
    const request = captureDeviceRequest(id)
    if (!id) {
      state.esimProfiles = []
      state.cardPolicy = null
      state.policyIccid = ''
      meta.esimHint = ''
      return
    }
    const device = state.devices.find((d) => d.id === id)
    try {
      const lineId = lineIdFor(id)
      if (!lineId) {
        meta.esimHint = lineActionBlockReason(device || {})
        state.esimProfiles = []
        return
      }
      const esimPayload = await getEsimProfiles(lineId, { refresh: refreshEsim, ...ctx() })
      if (!isHydrateCurrent(generation) || state.selectedId !== id) return
      if (!isDeviceRequestCurrent(id, request)) return
      const parsed = adoptEsimProfiles(id, device, parseOnewifiEsimPayload(esimPayload))
      if (parsed.length) {
        esimMemory.set(id, parsed)
        state.esimProfiles = parsed
      } else {
        state.esimProfiles = esimMemory.get(id) || []
      }
      meta.esimHint = onewifiEsimHint(esimPayload, parsed)
    } catch (err) {
      if (!isHydrateCurrent(generation) || state.selectedId !== id) return
      if (!isDeviceRequestCurrent(id, request)) return
      const fallback = esimMemory.get(id) || extractEsim(device)
      if (fallback.length) {
        esimMemory.set(id, fallback)
        state.esimProfiles = fallback
      } else {
        state.esimProfiles = []
      }
      meta.esimHint = onewifiEsimHint({
        error: { message: err?.message, code: err?.code },
      }, [])
    }
    if (!isHydrateCurrent(generation) || state.selectedId !== id) return
    if (!isDeviceRequestCurrent(id, request)) return
    await loadCardPolicy(generation)
    if (!isHydrateCurrent(generation) || state.selectedId !== id) return
    if (!isDeviceRequestCurrent(id, request)) return
    stampEsimOnOverview()
  }

  async function hydrate({
    silent = true,
    refreshRuntime = false,
  } = {}) {
    const generation = beginHydrationGeneration()
    const target = upstream.value
    if (activeUpstream && activeUpstream !== target) clearRuntime()
    activeUpstream = target

    if (!hostConfigured.value) {
      clearRuntime()
      meta.lastError = null
      meta.healthOk = false
      meta.lastHydrateAt = null
      return
    }

    if (!configured.value) {
      clearRuntime()
      meta.lastError = null
      meta.healthOk = false
      meta.lastHydrateAt = null
      return
    }

    if (!silent) loading.value = true
    meta.hydrating = true
    // The list and its follow-up reads belong to the same pre-mutation snapshot.
    const revisions = new Map(deviceRevisions)
    const unchanged = (id) => (revisions.get(id) || 0) === deviceRevision(id)
    try {
      const [healthOk, devicesPayload, egress] = await Promise.all([
        getHealth(ctx()).then(() => true).catch(() => false),
        getDevices(ctx()),
        fetchEgressStatus(ctx()).catch(() => ({ proxies: [], rules: [] })),
      ])
      if (!isHydrateCurrent(generation)) return

      const rawList = normalizeDeviceList(devicesPayload)
      const list = rawList
      meta.healthOk = healthOk || list.length > 0
      meta.streamWarning = null

      if (refreshRuntime && list.length) {
        await Promise.allSettled(
          list.filter((d) => !deviceIsSwitching(d.id)).map((d) => refreshDeviceInfo(d.id, ctx())),
        )
        if (!isHydrateCurrent(generation)) return
      }

      const [results, esimHardwareResults] = await Promise.all([
        Promise.allSettled(list.map((d) => {
          const lineId = lineActionId(d)
          return lineId ? getDeviceOverview(lineId, ctx()) : Promise.resolve(null)
        })),
        Promise.allSettled(list.map((d) => {
          const lineId = lineActionId(d)
          return lineId ? getEsimOverview(lineId, ctx()) : Promise.resolve(null)
        })),
      ])
      if (!isHydrateCurrent(generation)) return
      // Copy after awaiting: a different device may have finished switching meanwhile.
      const nextOverviews = { ...state.overviews }
      const nextEsimHardware = { ...state.esimHardwareByDevice }
      const visibleIds = new Set(list.map((device) => device.id))
      Object.keys(nextEsimHardware).forEach((id) => {
        if (!visibleIds.has(id) && unchanged(id)) delete nextEsimHardware[id]
      })
      list.forEach((device, index) => {
        if (!unchanged(device.id)) return
        const payload = results[index].status === 'fulfilled' ? results[index].value : null
        nextOverviews[device.id] = paintOverview(
          device.id,
          normalizeDeviceOverview(payload || device, device),
        )
        if (esimHardwareResults[index].status === 'fulfilled') {
          const hardware = normalizeEuiccHardware(esimHardwareResults[index].value)
          if (hardware.length) nextEsimHardware[device.id] = hardware
          else delete nextEsimHardware[device.id]
        }
      })
      state.overviews = nextOverviews
      state.esimHardwareByDevice = nextEsimHardware

      state.devices = list.map((device) => {
        if (!unchanged(device.id)) return state.devices.find((row) => row.id === device.id) || device
        const overview = nextOverviews[device.id]
        const ipRow = overview?.networkRows?.find((row) => row.label === '公网 IP')
        const publicIp = device.publicIp && device.publicIp !== '—' ? device.publicIp : ipRow?.value
        const proxyLabel = proxyLabelForCountry(
          resolveDeviceCountryCode(device),
          egress.proxies,
          egress.rules,
        )
        const next = {
          ...device,
          proxyLabel,
          radio_registered: Boolean(device.radio_registered || overview?.radioRegistered),
          radioLabel: overview?.radioLabel || device.radioLabel || '',
        }
        return publicIp && publicIp !== '—' ? { ...next, publicIp } : next
      }).concat(state.devices.filter((device) => !visibleIds.has(device.id) && !unchanged(device.id)))

      if (!state.selectedId || !state.devices.some((d) => d.id === state.selectedId)) {
        state.selectedId = state.devices[0]?.id || ''
      }

      if (unchanged(state.selectedId)) await loadSelectedExtras({ refreshEsim: !silent, generation })
      if (!isHydrateCurrent(generation)) return

      if (!deviceIsSwitching(state.selectedId)) meta.lastError = null
      meta.lastHydrateAt = Date.now()
    } catch (err) {
      if (!isHydrateCurrent(generation)) return
      meta.healthOk = false
      if (isOneWifiMissingApiError(err)) {
        meta.streamWarning = '网关地址或路径错误：请检查主机与端口（勿带 /api 后缀）'
        meta.lastError = null
      } else {
        meta.lastError = err?.message || '网关连接失败'
      }
    } finally {
      // Context freshness gates data, not cleanup of this generation's own flags.
      if (generation === hydrateGeneration) {
        meta.hydrating = false
        loading.value = false
      }
    }
  }

  async function refresh({ silent = false } = {}) {
    await hydrate({ silent, refreshRuntime: true })
  }

  function paintSelection(id) {
    const device = state.devices.find((d) => d.id === id)
    if (!device) return
    if (!state.overviews[id]) {
      state.overviews = {
        ...state.overviews,
        [id]: normalizeDeviceOverview(device, device),
      }
    }
    state.esimProfiles = adoptEsimProfiles(id, device, esimMemory.get(id) || extractEsim(device))
    state.policyIccid = resolveActiveIccid(state.overviews[id], state.esimProfiles)
    state.cardPolicy = policyFromDeviceRow(device)
  }

  function selectDevice(id) {
    if (!id || state.selectedId === id) return
    const generation = beginHydrationGeneration({ clearLoading: true })
    state.selectedId = id
    paintSelection(id)
    void reloadSelection({
      skipOverview: Boolean(state.overviews[id]),
      generation,
    })
  }

  async function reloadSelection({
    skipOverview = false,
    generation = hydrateGeneration,
  } = {}) {
    if (!isHydrateCurrent(generation)) return
    const id = state.selectedId
    const request = captureDeviceRequest(id)
    if (!id) {
      state.esimProfiles = []
      state.cardPolicy = null
      state.policyIccid = ''
      return
    }
    const device = state.devices.find((d) => d.id === id)
    if (device && !state.overviews[id]) {
      state.overviews = {
        ...state.overviews,
        [id]: normalizeDeviceOverview(device, device),
      }
    }
    try {
      const lineId = lineIdFor(id)
      if (!lineId) {
        if (isCurrentSelection(generation, id)) meta.lastError = lineActionBlockReason(device || {})
      } else if (!skipOverview) {
        const overviewPayload = await getDeviceOverview(lineId, ctx())
        if (overviewPayload && isCurrentSelection(generation, id) && isDeviceRequestCurrent(id, request)) {
          state.overviews = {
            ...state.overviews,
            [id]: paintOverview(id, normalizeDeviceOverview(overviewPayload, device)),
          }
        }
      }
      if (!isHydrateCurrent(generation) || state.selectedId !== id) return
      if (!isDeviceRequestCurrent(id, request)) return
      await loadSelectedExtras({ refreshEsim: false, generation })
    } catch {
      if (isCurrentSelection(generation, id) && isDeviceRequestCurrent(id, request)) {
        await loadSelectedExtras({ refreshEsim: false, generation })
      }
    }
  }

  async function setDeveloperMode(enabled) {
    if (developerSaving.value) return false
    developerSaving.value = true
    try {
      const data = await apiSetDeveloperMode(Boolean(enabled), ctx())
      const on = Boolean(data?.enabled)
      state.devices = state.devices.map((device) => ({ ...device, developer_enabled: on }))
      meta.lastError = null
      return true
    } catch (err) {
      meta.lastError = err?.message || '开发者模式切换失败'
      return false
    } finally {
      developerSaving.value = false
    }
  }

  async function patchCardPolicy(patch) {
    const deviceId = selectedDevice.value?.id
    const lineId = lineActionId(selectedDevice.value || {})
    if (!deviceId || !lineId || !state.cardPolicy || policySavingByDevice[deviceId]) {
      if (deviceId && !lineId) meta.lastError = lineActionBlockReason(selectedDevice.value || {})
      return false
    }
    const capabilities = policyPatchToCapabilities(patch)
    if (!Object.keys(capabilities).length) return false
    const generation = beginHydrationGeneration({ clearLoading: true })
    const next = { ...state.cardPolicy, ...patch }
    policySavingByDevice[deviceId] = true
    try {
      await patchDeviceCapabilities(lineId, capabilities, ctx())
      if (!isCurrentSelection(generation, deviceId)) return false
      state.cardPolicy = next
      await refresh({ silent: true })
      if (!isCurrentSelection(generation + 1, deviceId)) return false
      meta.lastError = null
      return true
    } catch (err) {
      if (isCurrentSelection(generation, deviceId)) {
        meta.lastError = err?.message || '卡策略保存失败'
      }
      return false
    } finally {
      delete policySavingByDevice[deviceId]
    }
  }

  async function renameSelectedDevice(deviceId, name) {
    await apiRenameDevice(deviceId, name, ctx())
    await refresh({ silent: true })
  }

  async function deleteSelectedDevice(deviceId) {
    const id = String(deviceId || '').trim()
    await apiDeleteDevice(id, ctx())
    forgetEsimCache(id)
    if (state.selectedId === id) {
      state.selectedId = ''
    }
    await refresh({ silent: true })
  }

  async function persistEndpoint({ host, port } = {}) {
    const parsed = parseOneWifiEndpointInput(host ?? instance.host, port ?? instance.port)
    if (!parsed.ok) {
      meta.lastError = parsed.error
      return false
    }
    updateInstance(instance.id, {
      host: parsed.value.displayHost,
      port: parsed.value.port,
    })
    return true
  }

  async function loginInstance(username, password) {
    const user = String(username || '').trim()
    if (!hostConfigured.value && !String(instance.host || '').trim()) {
      meta.lastError = '请先填写网关主机或 URL'
      return false
    }
    if (!user || !password || loggingIn.value) return false
    beginHydrationGeneration({ clearLoading: true })
    loggingIn.value = true
    try {
      const endpointOk = await persistEndpoint({
        host: instance.host,
        port: instance.port,
      })
      if (!endpointOk) return false

      const result = await apiLogin(user, password, { upstream: upstream.value })
      updateInstance(instance.id, { token: result.token, username: result.username || user })
      meta.lastError = null
      clearRuntime()
      await activateOneWifiInstance(instance.id, { reason: 'login' })
      await hydrate({ silent: false, refreshRuntime: true })
      return true
    } catch (err) {
      meta.lastError = err?.message || '登录失败'
      return false
    } finally {
      loggingIn.value = false
    }
  }

  async function applyConfig({ host, port } = {}) {
    const parsed = parseOneWifiEndpointInput(host ?? instance.host, port ?? instance.port)
    if (!parsed.ok) {
      meta.lastError = parsed.error
      return false
    }
    updateInstance(instance.id, {
      host: parsed.value.displayHost,
      port: parsed.value.port,
    })
    beginHydrationGeneration({ clearLoading: true })
    clearRuntime()
    meta.lastHydrateAt = null
    if (instance.token) {
      await activateOneWifiInstance(instance.id, { reason: 'settings' })
    }
    await hydrate({ silent: false, refreshRuntime: true })
    return true
  }

  function forgetEsimCache(deviceId) {
    const id = String(deviceId || '').trim()
    if (!id) return
    esimMemory.delete(id)
    const nextHardware = { ...state.esimHardwareByDevice }
    delete nextHardware[id]
    state.esimHardwareByDevice = nextHardware
    if (state.selectedId === id) state.esimProfiles = []
  }

  async function readChip() {
    if (deviceIsSwitching(state.selectedId)) return false
    const generation = beginHydrationGeneration({ clearLoading: true })
    await loadSelectedExtras({ refreshEsim: true, generation })
    if (!isHydrateCurrent(generation)) return false
    const hardwareLineId = lineIdFor(state.selectedId)
    const hardwarePayload = hardwareLineId
      ? await getEsimOverview(hardwareLineId, ctx()).catch(() => null)
      : null
    if (!isHydrateCurrent(generation)) return false
    const hardware = normalizeEuiccHardware(hardwarePayload)
    if (hardware.length) {
      state.esimHardwareByDevice = {
        ...state.esimHardwareByDevice,
        [state.selectedId]: hardware,
      }
    }
    return isHydrateCurrent(generation)
  }

  async function refreshAfterEsimSwitch(deviceId) {
    const request = captureDeviceRequest(deviceId)
    const device = state.devices.find((row) => row.id === deviceId)
    try {
      const lineId = lineIdFor(deviceId)
      const [overviewPayload, esimPayload] = await Promise.all([
        lineId ? getDeviceOverview(lineId, ctx()).catch(() => null) : null,
        lineId ? getEsimProfiles(lineId, { refresh: false, ...ctx() }).catch(() => null) : null,
      ])
      if (!isDeviceRequestCurrent(deviceId, request)) return
      if (overviewPayload) {
        state.overviews = {
          ...state.overviews,
          [deviceId]: paintOverview(deviceId, normalizeDeviceOverview(overviewPayload, device)),
        }
        if (state.selectedId === deviceId) {
          const iccid = resolveActiveIccid(state.overviews[deviceId], state.esimProfiles)
          if (iccid !== state.policyIccid) {
            state.policyIccid = iccid
            state.cardPolicy = null
          }
        }
      }
      if (!esimPayload) return
      const parsed = adoptEsimProfiles(deviceId, device, parseOnewifiEsimPayload(esimPayload))
      if (!parsed.length) return
      esimMemory.set(deviceId, parsed)
      if (state.selectedId === deviceId) {
        state.esimProfiles = parsed
        meta.esimHint = onewifiEsimHint(esimPayload, parsed)
        stampEsimOnOverview()
      }
    } catch {
      // Keep the last painted snapshot; the next poll will catch up.
    }
  }

  async function switchEsim(iccid) {
    const device = selectedDevice.value
    const deviceId = device?.id
    const lineId = lineActionId(device || {})
    if (!deviceId || !lineId || !iccid) {
      if (deviceId && !lineId) meta.lastError = lineActionBlockReason(device || {})
      return false
    }
    if (deviceIsSwitching(deviceId)) {
      meta.lastError = '这台正在切卡'
      return false
    }
    esimSwitchingByDevice[deviceId] = true
    esimSwitchingIccidByDevice[deviceId] = iccid
    advanceDeviceRevision(deviceId)
    let request = captureDeviceRequest(deviceId)
    policyLoading.value = false
    try {
      await switchEsimProfile(lineId, { iccid: String(iccid).trim() }, ctx())
      if (!isDeviceRequestCurrent(deviceId, request)) return false
      // The authoritative post-mutation reads supersede polls started during switching.
      advanceDeviceRevision(deviceId)
      request = captureDeviceRequest(deviceId)
      await refreshAfterEsimSwitch(deviceId)
      if (isDeviceRequestCurrent(deviceId, request) && state.selectedId === deviceId) meta.lastError = null
      return true
    } catch (err) {
      if (isDeviceRequestCurrent(deviceId, request) && state.selectedId === deviceId) meta.lastError = err?.message || '切卡失败'
      return false
    } finally {
      // Also reject reads launched while the hardware mutation was in flight.
      advanceDeviceRevision(deviceId)
      delete esimSwitchingByDevice[deviceId]
      delete esimSwitchingIccidByDevice[deviceId]
    }
  }

  async function reconnectVowifi() {
    const deviceId = selectedDevice.value?.id
    const lineId = lineActionId(selectedDevice.value || {})
    if (!deviceId || !lineId || deviceActions[deviceId]) {
      if (deviceId && !lineId) meta.lastError = lineActionBlockReason(selectedDevice.value || {})
      return false
    }
    const generation = beginHydrationGeneration({ clearLoading: true })
    deviceActions[deviceId] = 'vowifi-reconnect'
    try {
      await apiReconnectVowifi(lineId, ctx())
      if (!isCurrentSelection(generation, deviceId)) return false
      await refresh({ silent: true })
      if (!isCurrentSelection(generation + 1, deviceId)) return false
      meta.lastError = null
      return true
    } catch (err) {
      if (isCurrentSelection(generation, deviceId)) meta.lastError = err?.message || '重连 VoWiFi 失败'
      return false
    } finally {
      delete deviceActions[deviceId]
    }
  }

  async function rebootModule() {
    const deviceId = selectedDevice.value?.id
    const lineId = lineActionId(selectedDevice.value || {})
    if (!deviceId || !lineId || deviceActions[deviceId]) {
      if (deviceId && !lineId) meta.lastError = lineActionBlockReason(selectedDevice.value || {})
      return false
    }
    const generation = beginHydrationGeneration({ clearLoading: true })
    deviceActions[deviceId] = 'reboot'
    try {
      await rebootDevice(lineId, ctx())
      if (!isCurrentSelection(generation, deviceId)) return false
      await refresh({ silent: true })
      if (!isCurrentSelection(generation + 1, deviceId)) return false
      meta.lastError = null
      return true
    } catch (err) {
      if (isCurrentSelection(generation, deviceId)) meta.lastError = err?.message || '重启模组失败'
      return false
    } finally {
      delete deviceActions[deviceId]
    }
  }

  async function sendAtCommand(command) {
    const deviceId = selectedDevice.value?.id
    const text = String(command || '').trim()
    if (!deviceId || !text || atSendingByDevice[deviceId]) return false
    const generation = beginHydrationGeneration({ clearLoading: true })
    atSendingByDevice[deviceId] = true
    try {
      await apiSendAtCommand(deviceId, { cmd: text, timeout_ms: 10000 }, ctx())
      if (!isCurrentSelection(generation, deviceId)) return false
      await refresh({ silent: true })
      if (!isCurrentSelection(generation + 1, deviceId)) return false
      meta.lastError = null
      return true
    } catch (err) {
      if (isCurrentSelection(generation, deviceId)) meta.lastError = err?.message || 'AT 指令发送失败'
      return false
    } finally {
      delete atSendingByDevice[deviceId]
    }
  }

  function anyDeviceSwitching() {
    return Object.values(esimSwitchingByDevice).some(Boolean)
  }

  const pollSuspended = ref(false)

  function pollTick() {
    if (pollSuspended.value) return
    if (configured.value && !meta.hydrating) void hydrate({ silent: true })
  }

  function setPollSuspended(on) {
    pollSuspended.value = Boolean(on)
  }

  function pageVisible() {
    return typeof document === 'undefined' || document.visibilityState !== 'hidden'
  }

  function armPoll(ms) {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = window.setInterval(pollTick, ms)
  }

  function startPolling() {
    if (pollTimer) return
    if (!pageVisible()) {
      pollPausedHidden = true
      return
    }
    armPoll(anyDeviceSwitching() ? SWITCH_POLL_INTERVAL_MS : POLL_INTERVAL_MS)
  }

  function onInstanceVisibilityChange() {
    if (typeof document === 'undefined') return
    if (document.visibilityState === 'hidden') {
      pollPausedHidden = true
      if (pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
      }
      return
    }
    pollPausedHidden = false
    startPolling()
    if (configured.value) void hydrate({ silent: true })
  }

  function bindInstanceVisibility() {
    if (typeof document === 'undefined' || visibilityBound) return
    document.addEventListener('visibilitychange', onInstanceVisibilityChange)
    visibilityBound = true
  }

  function unbindInstanceVisibility() {
    if (typeof document === 'undefined' || !visibilityBound) return
    document.removeEventListener('visibilitychange', onInstanceVisibilityChange)
    visibilityBound = false
  }

  function stop() {
    contextEpoch += 1
    beginHydrationGeneration({ clearLoading: true })
    pollPausedHidden = false
    unbindInstanceVisibility()
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  watch(anyDeviceSwitching, (busy) => {
    if (!pollTimer) return
    armPoll(busy ? SWITCH_POLL_INTERVAL_MS : POLL_INTERVAL_MS)
  })

  function start() {
    bindInstanceVisibility()
    if (configured.value) void hydrate({ silent: true })
    startPolling()
  }

  watch(
    () => ({
      id: instance.id,
      host: instance.host,
      total: state.devices.length,
      online: state.devices.filter((d) => d.online).length,
      lastHydrateAt: meta.lastHydrateAt,
      healthOk: meta.healthOk,
    }),
    (snap) => {
      if (!snap.id) return
      const configuredHost = Boolean(String(snap.host || '').trim())
      reportInstanceFleet(snap.id, {
        total: snap.total,
        online: snap.online,
        offline: Math.max(0, snap.total - snap.online),
        lastUpdated: snap.lastHydrateAt,
        connected: configuredHost && Boolean(snap.lastHydrateAt && (snap.healthOk || snap.total)),
        scope: instanceFleetScope(snap.host),
      })
    },
    { immediate: true },
  )

  onUnmounted(() => {
    stop()
    clearInstanceFleet(instance.id)
  })

  return {
    upstream,
    sameOrigin,
    configured,
    connected,
    meta,
    loading,
    loggingIn,
    deviceAction: selectedAction,
    esimSwitching: selectedEsimSwitching,
    atSending: selectedAtSending,
    devices,
    overviews,
    esimHardware,
    esimProfiles,
    cardPolicy,
    policyIccid,
    policyLoading,
    policySaving: selectedPolicySaving,
    onlineCount,
    offlineCount,
    selectedId,
    selectedDevice,
    selectedOverview,
    deviceIsSwitching,
    lastUpdated,
    start,
    stop,
    setPollSuspended,
    refresh,
    selectDevice,
    loginInstance,
    applyConfig,
    readChip,
    switchEsim,
    reconnectVowifi,
    rebootModule,
    sendAtCommand,
    patchCardPolicy,
    setDeveloperMode,
    developerSaving,
    renameSelectedDevice,
    deleteSelectedDevice,
    requestCtx,
  }
}
