import { ref, unref, watch } from 'vue'
import { getEsimProfiles, switchEsimProfile } from '../api/onewifi.adapter'
import {
  fallbackEsimProfiles,
  profilesFromDevicePayload,
} from '../utils/esimProfileUi'
import { onewifiEsimHint } from '../utils/onewifiModel'

export function useLineEsim(deviceIdRef, deviceRef) {
  const profiles = ref([])
  const hint = ref('')
  const switching = ref('')
  const lastError = ref('')
  const loading = ref(false)
  let loadRequestId = 0
  let switchRequestId = 0

  function isLoadCurrent(requestId, targetId) {
    return requestId === loadRequestId && unref(deviceIdRef) === targetId
  }

  function isSwitchCurrent(requestId, targetId) {
    return requestId === switchRequestId && unref(deviceIdRef) === targetId
  }

  watch(
    () => unref(deviceIdRef),
    () => {
      loadRequestId += 1
      switchRequestId += 1
      profiles.value = []
      hint.value = ''
      switching.value = ''
      lastError.value = ''
      loading.value = false
    },
  )

  async function load({ refresh = false } = {}) {
    const requestId = ++loadRequestId
    const targetId = unref(deviceIdRef)
    const targetDevice = unref(deviceRef)
    if (!targetId) {
      profiles.value = []
      hint.value = ''
      return false
    }
    loading.value = true
    try {
      const payload = await getEsimProfiles(targetId, { refresh })
      if (!isLoadCurrent(requestId, targetId)) return false
      const parsed = profilesFromDevicePayload(payload, targetDevice)
      profiles.value = parsed.length ? parsed : fallbackEsimProfiles(targetDevice)
      hint.value = onewifiEsimHint(payload, profiles.value)
      lastError.value = ''
      return true
    } catch (err) {
      if (!isLoadCurrent(requestId, targetId)) return false
      const fallback = fallbackEsimProfiles(targetDevice)
      profiles.value = fallback
      hint.value = err?.message || onewifiEsimHint({}, fallback)
      lastError.value = err?.message || '读卡失败'
      return Boolean(fallback.length)
    } finally {
      if (isLoadCurrent(requestId, targetId)) loading.value = false
    }
  }

  async function switchTo(iccid) {
    const requestId = ++switchRequestId
    const targetId = unref(deviceIdRef)
    const targetIccid = String(iccid || '').trim()
    if (!targetId || !targetIccid || switching.value) return false
    switching.value = targetIccid
    try {
      await switchEsimProfile(targetId, { iccid: targetIccid })
      if (!isSwitchCurrent(requestId, targetId)) return false
      const loaded = await load({ refresh: false })
      if (!isSwitchCurrent(requestId, targetId)) return false
      if (!loaded) return false
      lastError.value = ''
      return true
    } catch (err) {
      if (!isSwitchCurrent(requestId, targetId)) return false
      lastError.value = err?.message || '切卡失败'
      return false
    } finally {
      if (requestId === switchRequestId) switching.value = ''
    }
  }

  return { profiles, hint, switching, lastError, loading, load, switchTo }
}
