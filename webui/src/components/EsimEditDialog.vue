<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import MIcon from './MIcon.vue'
import SoftLabelCard from './SoftLabelCard.vue'
import OneWifiOverviewPolicyCard from './OneWifiOverviewPolicyCard.vue'
import { useAppStore } from '../stores/app'
import {
  applyDeviceEditCardPolicy,
  deleteDeviceEditProfile,
  downloadDeviceEditProfile,
  loadDeviceCardPolicy,
  loadDeviceEdit,
  renameDeviceEditProfile,
  toggleDeviceEditProfile,
} from '../api/deviceEdit.adapter'
import {
  canDeleteEsimProfile,
  esimDeleteActionLabel,
  esimDeleteConfirmMessage,
  displaySecret,
  normalizeCardPolicy,
} from '../utils/onewifiModel'
import { createLatestRequestGuard } from '../utils/latestRequest'
import { formatSmdpPreview, previewLpaActivation } from '../utils/lpaSmdpPreview'

const props = defineProps({
  open: { type: Boolean, default: false },
  deviceId: { type: String, default: '' },
  capabilitiesOnly: { type: Boolean, default: true },
  apiCtx: { type: Object, default: () => ({}) },
  cachedProfiles: { type: Array, default: () => [] },
  cachedEuiccs: { type: Array, default: () => [] },
})

const emit = defineEmits(['close'])
const { showToast } = useAppStore()
const status = ref('idle')
const error = ref('')
const identity = ref(null)
const scope = ref(null)
const profiles = ref([])
const euiccs = ref([])
const renameDrafts = ref({})
const policiesByIccid = ref({})
const policyLoadingByIccid = ref({})
const policySavingByIccid = ref({})
const section = ref('profiles')
const revealSecrets = ref(false)
const activationCode = ref('')
const confirmationCode = ref('')
const targetAidHex = ref('')
const busy = ref('')
const downloadProgress = ref(null)
const downloadFeedback = ref(null)
const deviceLoadGuard = createLatestRequestGuard()
let loadController = null
let policyLoadController = null
let downloadController = null
let downloadRunId = 0
let profileActionRunId = 0
let dialogSessionId = 0

const currentProfile = computed(() => profiles.value.find((profile) => profile.active) || null)
const profileGroups = computed(() => {
  const hardware = euiccs.value.length
    ? euiccs.value
    : [...new Set(profiles.value.map((profile) => Number(profile.slotIndex) || 0))]
      .sort((left, right) => left - right)
      .map((index) => ({ index, eid: '', manufacturer: '', freeNvram: '' }))
  return hardware.map((euicc) => ({
    ...euicc,
    profiles: profiles.value.filter((profile) => {
      const profileEid = String(profile.eid || '').trim()
      const hardwareEid = String(euicc.eid || '').trim()
      return profileEid && hardwareEid
        ? profileEid === hardwareEid
        : Number(profile.slotIndex) === Number(euicc.index)
    }),
  }))
})
const isBusy = computed(() => Boolean(busy.value))
const downloadPercent = computed(() => {
  const value = Number(downloadProgress.value?.pct)
  if (!Number.isFinite(value) || value < 0) return null
  return Math.min(100, Math.max(0, Math.round(value)))
})
const downloadStateLabel = computed(() => {
  if (busy.value === 'download') return '下载中'
  if (downloadFeedback.value?.completed) return '下载成功'
  if (downloadFeedback.value?.tone === 'success') return '下载成功'
  if (downloadFeedback.value?.tone === 'warning') return '需注意'
  if (downloadFeedback.value?.tone === 'error') return '失败'
  return '待开始'
})
const selectedEuicc = computed(() => (
  euiccs.value.find((euicc) => euicc.aidHex === targetAidHex.value) || euiccs.value[0] || null
))
const lpaPreview = computed(() => previewLpaActivation(activationCode.value, {
  eid: selectedEuicc.value?.eid,
  freeNvramBytes: selectedEuicc.value?.freeNvramBytes,
}))
const lpaPreviewCopy = computed(() => formatSmdpPreview(lpaPreview.value))

function apiCtx() {
  return props.apiCtx && typeof props.apiCtx === 'object' ? props.apiCtx : {}
}

function close() {
  if (isBusy.value) return
  revealSecrets.value = false
  emit('close')
}

function onKeydown(event) {
  if (event.key === 'Escape') close()
}

function isDialogSessionCurrent(sessionId, deviceId) {
  return sessionId === dialogSessionId
    && props.open
    && String(props.deviceId || '').trim() === deviceId
}

function isProfileActionCurrent(runId, sessionId, deviceId) {
  return runId === profileActionRunId && isDialogSessionCurrent(sessionId, deviceId)
}

function policyEffectHint(profile) {
  const iccid = String(profile?.iccid || '').trim()
  const liveIccid = String(scope.value?.iccid || '').trim()
  if (iccid && iccid === liveIccid) {
    return scope.value?.deviceOnline
      ? '当前在线卡：改动立即生效'
      : '设备离线：改动已保存，上线后生效'
  }
  return '未激活卡：改动将在此卡激活后生效'
}

async function loadProfilePolicies(nextProfiles, request) {
  const uniqueIccids = [...new Set(nextProfiles.map((profile) => String(profile.iccid || '').trim()).filter(Boolean))]
  policyLoadController?.abort()
  const controller = new AbortController()
  policyLoadController = controller
  let timedOut = false
  let timeoutNotified = false
  const timeout = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, 10000)
  policyLoadingByIccid.value = uniqueIccids.reduce(
    (current, iccid) => ({ ...current, [iccid]: true }),
    { ...policyLoadingByIccid.value },
  )
  try {
    await Promise.allSettled(uniqueIccids.map(async (iccid) => {
      try {
        const raw = await loadDeviceCardPolicy(iccid, { signal: controller.signal, ctx: apiCtx() })
        if (!deviceLoadGuard.isCurrent(request, props.deviceId)) return
        policiesByIccid.value = {
          ...policiesByIccid.value,
          [iccid]: normalizeCardPolicy(raw),
        }
      } catch (caught) {
        if (!deviceLoadGuard.isCurrent(request, props.deviceId)) return
        if (timedOut) {
          if (!timeoutNotified) {
            timeoutNotified = true
            showToast('部分卡策略加载超时，请关闭后重新打开', 'error')
          }
        } else if (caught?.name !== 'AbortError') {
          showToast(caught?.message || `卡策略 ${iccid.slice(-4)} 加载失败`, 'error')
        }
      } finally {
        if (deviceLoadGuard.isCurrent(request, props.deviceId)) {
          policyLoadingByIccid.value = { ...policyLoadingByIccid.value, [iccid]: false }
        }
      }
    }))
  } finally {
    window.clearTimeout(timeout)
    if (policyLoadController === controller) policyLoadController = null
  }
}

function applyCachedPaint() {
  const seed = Array.isArray(props.cachedProfiles)
    ? props.cachedProfiles.filter((profile) => profile && String(profile.iccid || '').trim())
    : []
  if (!seed.length) return false
  profiles.value = seed.map((profile) => ({ ...profile }))
  euiccs.value = Array.isArray(props.cachedEuiccs)
    ? props.cachedEuiccs.map((item) => ({ ...item }))
    : []
  renameDrafts.value = Object.fromEntries(seed.map((profile) => [profile.iccid, profile.name || '']))
  status.value = 'ready'
  error.value = ''
  return true
}

async function load({ background = false, refresh = false } = {}) {
  const id = String(props.deviceId || '').trim()
  if (!id) return { ok: false, error: '缺少设备编号' }
  loadController?.abort()
  policyLoadController?.abort()
  policyLoadController = null
  policyLoadingByIccid.value = {}
  const controller = new AbortController()
  loadController = controller
  let timedOut = false
  const timeout = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, background ? 30000 : 12000)
  const request = deviceLoadGuard.begin(id)
  const seeded = profiles.value.length > 0
  if (!background) {
    status.value = 'loading'
    error.value = ''
  }
  try {
    const result = await loadDeviceEdit(id, { refresh, signal: controller.signal, includePolicy: false, ctx: apiCtx() })
    if (!deviceLoadGuard.isCurrent(request, props.deviceId)) return { ok: false, stale: true }
    identity.value = result.identity
    scope.value = result.scope
    if (result.profiles.length || !seeded) {
      profiles.value = result.profiles
      euiccs.value = result.euiccs || []
      renameDrafts.value = Object.fromEntries(result.profiles.map((profile) => [profile.iccid, profile.name || '']))
    } else if ((result.euiccs || []).length && !euiccs.value.length) {
      euiccs.value = result.euiccs
    }
    if (!euiccs.value.some((euicc) => euicc.aidHex === targetAidHex.value)) {
      targetAidHex.value = euiccs.value[0]?.aidHex || ''
    }
    status.value = 'ready'
    void loadProfilePolicies(profiles.value, request)
    return { ok: true }
  } catch (caught) {
    if (!deviceLoadGuard.isCurrent(request, props.deviceId)) return { ok: false, stale: true }
    const message = timedOut ? '读取 eSIM 数据超时，请关闭后重试' : (caught?.message || '无法读取 eSIM 编辑数据')
    if (!background) {
      error.value = message
      status.value = 'error'
    }
    return { ok: false, error: message }
  } finally {
    window.clearTimeout(timeout)
    if (loadController === controller) loadController = null
  }
}

function profileName(profile) {
  return String(renameDrafts.value[profile.iccid] ?? profile.name ?? '').trim()
}

async function runProfileAction(profile, action) {
  if (!scope.value?.deviceId || busy.value || !profile?.iccid) return
  if (action === 'delete') {
    if (!canDeleteEsimProfile(profile)) {
      showToast(esimDeleteActionLabel(profile), 'warning')
      return
    }
    if (!window.confirm(esimDeleteConfirmMessage(profile))) return
  }
  const runId = ++profileActionRunId
  const sessionId = dialogSessionId
  const deviceId = String(props.deviceId || '').trim()
  const actionScope = scope.value
  busy.value = `${action}:${profile.iccid}`
  try {
    if (action === 'rename') {
      await renameDeviceEditProfile(actionScope, { ...profile, name: profileName(profile) }, apiCtx())
      if (!isProfileActionCurrent(runId, sessionId, deviceId)) return
      showToast('eSIM 名称已更新', 'success')
    } else if (action === 'delete') {
      await deleteDeviceEditProfile(actionScope, profile, apiCtx())
      if (!isProfileActionCurrent(runId, sessionId, deviceId)) return
      showToast(`已删除「${profileName(profile) || profile.name}」`, 'success')
    } else {
      await toggleDeviceEditProfile(actionScope, profile, apiCtx())
      if (!isProfileActionCurrent(runId, sessionId, deviceId)) return
      showToast(profile.active ? 'eSIM 已禁用' : 'eSIM 已启用', 'success')
    }
    await load()
  } catch (caught) {
    if (!isProfileActionCurrent(runId, sessionId, deviceId)) return
    const failed = action === 'rename' ? '名称保存失败' : action === 'delete' ? '删除失败' : 'eSIM 状态更新失败'
    showToast(caught?.message || failed, 'error')
  } finally {
    if (isProfileActionCurrent(runId, sessionId, deviceId)) busy.value = ''
  }
}

async function onPatchPolicy(profile, patch) {
  const iccid = String(profile?.iccid || '').trim()
  const deviceId = String(props.deviceId || '').trim()
  const sessionId = dialogSessionId
  const current = policiesByIccid.value[iccid]
  if (!iccid || !current || policySavingByIccid.value[iccid]) return
  policySavingByIccid.value = { ...policySavingByIccid.value, [iccid]: true }
  try {
    const saved = await applyDeviceEditCardPolicy(scope.value, profile, current, patch, apiCtx())
    if (!isDialogSessionCurrent(sessionId, deviceId)) return
    policiesByIccid.value = {
      ...policiesByIccid.value,
      [iccid]: normalizeCardPolicy(saved || { ...current, ...patch }),
    }
    showToast(`卡策略 ${iccid.slice(-4)} 已保存`, 'success')
  } catch (caught) {
    if (!isDialogSessionCurrent(sessionId, deviceId)) return
    showToast(caught?.message || '卡策略保存失败', 'error')
  } finally {
    if (isDialogSessionCurrent(sessionId, deviceId)) {
      policySavingByIccid.value = { ...policySavingByIccid.value, [iccid]: false }
    }
  }
}

async function downloadProfile() {
  if (!scope.value?.deviceId || !activationCode.value.trim() || busy.value) return
  const runId = ++downloadRunId
  const controller = new AbortController()
  const downloadScope = scope.value
  const code = activationCode.value.trim()
  downloadController = controller
  busy.value = 'download'
  downloadFeedback.value = null
  downloadProgress.value = { msg: '正在连接下载服务…', pct: 0 }
  try {
    const result = await downloadDeviceEditProfile(downloadScope, code, {
      signal: controller.signal,
      onProgress: (next) => {
        if (runId === downloadRunId) downloadProgress.value = next
      },
      aidHex: targetAidHex.value,
      confirmationCode: confirmationCode.value,
      ctx: apiCtx(),
    })
    if (runId !== downloadRunId) return
    activationCode.value = ''
    confirmationCode.value = ''
    const refresh = await load({ background: true, refresh: true })
    if (runId !== downloadRunId) return
    if (result?.warning) {
      downloadFeedback.value = { tone: 'warning', completed: true, message: `下载成功，Profile 已写入 eUICC；${result.warning}` }
    } else if (!refresh.ok) {
      downloadFeedback.value = {
        tone: 'warning',
        completed: true,
        message: '下载成功，但卡片列表刷新失败。关闭后重新打开即可查看。',
      }
    } else {
      downloadFeedback.value = { tone: 'success', message: '下载成功，Profile 已写入 eUICC 并显示在卡片列表中。' }
    }
    showToast('eSIM Profile 下载成功', 'success')
  } catch (caught) {
    if (runId !== downloadRunId) return
    if (caught?.name === 'AbortError') {
      downloadFeedback.value = { tone: 'warning', message: '下载已取消，激活码仍保留，可直接重试。' }
      showToast('已取消 eSIM 下载', 'warning')
    } else {
      const message = String(caught?.message || 'eSIM 下载失败').trim()
      const detail = message.replace(/[。！？.!?]+$/, '')
      const needsCode = /confirmation code|确认码/i.test(message)
      downloadFeedback.value = {
        tone: 'error',
        message: needsCode
          ? `${detail}。请在确认码一栏填入运营商给的确认码后重试。`
          : `${detail}。请检查激活码或网络后重试。`,
      }
      showToast(message, 'error')
    }
  } finally {
    if (runId === downloadRunId) {
      busy.value = ''
      downloadProgress.value = null
      downloadController = null
    }
  }
}

function cancelDownload() {
  if (downloadProgress.value) {
    downloadProgress.value = { ...downloadProgress.value, msg: '正在取消下载…' }
  }
  downloadController?.abort()
}

function resetDownloadState() {
  dialogSessionId += 1
  profileActionRunId += 1
  deviceLoadGuard.invalidate()
  loadController?.abort()
  loadController = null
  policyLoadController?.abort()
  policyLoadController = null
  downloadRunId += 1
  downloadController?.abort()
  downloadController = null
  busy.value = ''
  activationCode.value = ''
  confirmationCode.value = ''
  targetAidHex.value = ''
  downloadProgress.value = null
  downloadFeedback.value = null
  euiccs.value = []
  policiesByIccid.value = {}
  policyLoadingByIccid.value = {}
  policySavingByIccid.value = {}
}

watch(
  () => [props.open, props.deviceId],
  ([open, deviceId], [wasOpen, previousDeviceId] = []) => {
    if (!open) {
      if (wasOpen) resetDownloadState()
      revealSecrets.value = false
      return
    }
    if (!wasOpen || deviceId !== previousDeviceId) resetDownloadState()
    section.value = 'profiles'
    const seeded = applyCachedPaint()
    void load({ background: seeded })
  },
  { immediate: true },
)

onBeforeUnmount(resetDownloadState)
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="open" class="esim-dialog-overlay" @click.self="close">
        <section
          class="esim-dialog glass-frame"
          role="dialog"
          aria-modal="true"
          aria-labelledby="esim-dialog-title"
          tabindex="-1"
          @keydown="onKeydown"
        >
          <header class="esim-dialog__head">
            <div>
              <p class="esim-dialog__eyebrow">设备 eSIM</p>
              <h2 id="esim-dialog-title">编辑 eSIM</h2>
              <p class="esim-dialog__sub">{{ identity?.name || '正在读取设备…' }} · 只编辑当前设备的卡数据</p>
            </div>
            <div class="esim-dialog__head-actions">
              <button
                type="button"
                class="esim-dialog__reveal"
                :class="{ 'is-on': revealSecrets }"
                :aria-pressed="revealSecrets"
                :aria-label="revealSecrets ? '隐藏完整号码' : '显示完整号码'"
                :title="revealSecrets ? '隐藏完整号码' : '显示完整号码'"
                @click="revealSecrets = !revealSecrets"
              >
                <MIcon :name="revealSecrets ? 'visibility' : 'visibility_off'" size="sm" />
              </button>
              <button type="button" class="esim-dialog__close" aria-label="关闭编辑 eSIM" @click="close">×</button>
            </div>
          </header>

          <div v-if="status === 'loading'" class="esim-dialog__state" role="status">正在读取 eSIM 数据…</div>
          <div v-else-if="status === 'error'" class="esim-dialog__state esim-dialog__state--error" role="alert">{{ error }}</div>
          <template v-else-if="status === 'ready'">
            <div class="esim-dialog__identity">
              <SoftLabelCard title="当前 Profile" :value="currentProfile?.name || '未启用 Profile'" />
              <SoftLabelCard title="ICCID" :value="displaySecret(identity.iccid || identity.iccidMasked, revealSecrets)" mono />
              <SoftLabelCard title="IMEI" :value="displaySecret(identity.imei || identity.imeiMasked, revealSecrets)" mono />
            </div>

            <nav class="esim-dialog__tabs" role="tablist" aria-label="eSIM 编辑区域">
              <button id="esim-profiles-tab" type="button" role="tab" aria-controls="esim-profiles-panel" :aria-selected="section === 'profiles'" :class="{ 'is-active': section === 'profiles' }" @click="section = 'profiles'">卡片管理</button>
              <button id="esim-download-tab" type="button" role="tab" aria-controls="esim-download-panel" :aria-selected="section === 'download'" :class="{ 'is-active': section === 'download' }" @click="section = 'download'">下载 Profile</button>
            </nav>

            <div v-if="section === 'profiles'" id="esim-profiles-panel" class="esim-dialog__section" role="tabpanel" aria-labelledby="esim-profiles-tab">
              <div class="esim-dialog__section-head">
                <div>
                  <h3>卡片管理</h3>
                  <p>编辑卡名字，启用、禁用或删除已有 Profile。网络 / VoWiFi / 飞行与设备页卡策略相同。</p>
                </div>
                <span class="esim-dialog__count">{{ profiles.length }} 张</span>
              </div>
              <div v-if="profileGroups.length" class="esim-euicc-groups">
                <section v-for="group in profileGroups" :key="group.aidHex || group.eid || group.index" class="esim-euicc-group">
                  <header class="esim-euicc-group__head">
                    <div>
                      <h4>eUICC {{ group.index + 1 }}</h4>
                      <p>{{ group.nameplate || group.chipMaker || group.manufacturer || '未知制造商' }}<span v-if="group.freeNvram"> · 可用 {{ group.freeNvram }}</span></p>
                    </div>
                    <span class="esim-dialog__count">{{ group.profiles.length }} 张</span>
                  </header>
                  <div v-if="group.profiles.length" class="esim-profile-grid">
                    <article v-for="profile in group.profiles" :key="`${group.index}:${profile.iccid}`" class="esim-profile-card glass-frame glass-frame--compact">
                      <div class="esim-profile-card__top">
                        <span class="esim-profile-card__icon"><MIcon name="sim_card" size="sm" /></span>
                        <span class="esim-profile-card__state" :class="{ 'is-active': profile.active }">{{ profile.active ? '当前启用' : profile.stateText }}</span>
                      </div>
                      <label class="esim-profile-card__name">
                        <span>卡名称</span>
                        <input v-model="renameDrafts[profile.iccid]" type="text" maxlength="64" autocomplete="off" :disabled="isBusy" />
                      </label>
                      <p class="esim-profile-card__provider">{{ profile.provider || '未知运营商' }}</p>
                      <p class="esim-profile-card__iccid mono">{{ displaySecret(profile.iccid, revealSecrets) }}</p>
                      <div class="esim-profile-card__actions">
                        <button type="button" class="runtime-action-btn glass-frame glass-frame--compact" :disabled="isBusy || !profileName(profile)" @click="runProfileAction(profile, 'rename')">保存名称</button>
                        <button type="button" class="runtime-action-btn" :disabled="isBusy" @click="runProfileAction(profile, 'toggle')">{{ profile.active ? '禁用' : '启用' }}</button>
                        <button
                          type="button"
                          class="runtime-action-btn esim-profile-card__delete"
                          :disabled="isBusy || !canDeleteEsimProfile(profile)"
                          :aria-label="esimDeleteActionLabel(profile)"
                          :title="esimDeleteActionLabel(profile)"
                          @click="runProfileAction(profile, 'delete')"
                        >
                          删除
                        </button>
                      </div>
                      <OneWifiOverviewPolicyCard
                        compact
                        :policy="policiesByIccid[profile.iccid]"
                        :loading="policyLoadingByIccid[profile.iccid]"
                        :saving="policySavingByIccid[profile.iccid] || isBusy"
                        :capabilities-only="capabilitiesOnly"
                        @patch="onPatchPolicy(profile, $event)"
                      />
                      <p class="esim-profile-card__policy-hint">{{ policyEffectHint(profile) }}</p>
                    </article>
                  </div>
                  <div v-else class="esim-euicc-group__empty">此 eUICC 暂无 Profile</div>
                </section>
              </div>
              <div v-else class="esim-dialog__state">暂无可编辑 Profile</div>
            </div>

            <div v-else id="esim-download-panel" class="esim-dialog__section esim-dialog__section--download" role="tabpanel" aria-labelledby="esim-download-tab">
              <article class="esim-download-card glass-frame glass-frame--compact" :aria-busy="busy === 'download'">
                <header class="esim-download-card__head">
                  <span class="esim-download-card__icon" aria-hidden="true"><MIcon name="cloud_download" size="md" /></span>
                  <div class="esim-download-card__title">
                    <h3>下载 eSIM Profile</h3>
                    <p id="esim-download-help">粘贴运营商提供的完整 LPA 激活码。需要确认码时填在下面，没有就留空。写卡期间请勿拔卡或断电。</p>
                  </div>
                  <span class="esim-download-card__state" :class="`is-${downloadFeedback?.tone || (busy === 'download' ? 'running' : 'idle')}`">{{ downloadStateLabel }}</span>
                </header>

                <label class="esim-policy-field esim-download-card__field">
                  <span>激活码</span>
                  <input
                    v-model="activationCode"
                    type="text"
                    autocomplete="off"
                    autocapitalize="none"
                    spellcheck="false"
                    :disabled="isBusy"
                    :aria-invalid="downloadFeedback?.tone === 'error' ? 'true' : undefined"
                    :aria-describedby="downloadFeedback ? 'esim-download-help esim-download-feedback' : 'esim-download-help'"
                    placeholder="LPA:1$SM-DP+$MatchingID"
                    @keydown.enter.prevent="downloadProfile"
                  />
                </label>

                <label class="esim-policy-field esim-download-card__field">
                  <span>确认码</span>
                  <input
                    v-model="confirmationCode"
                    type="text"
                    autocomplete="off"
                    autocapitalize="none"
                    spellcheck="false"
                    :disabled="isBusy"
                    aria-label="确认码"
                    placeholder="运营商确认码，没有就不填"
                    @keydown.enter.prevent="downloadProfile"
                  />
                </label>

                <aside
                  v-if="lpaPreviewCopy"
                  class="esim-download-preview"
                  :class="{ 'is-unknown': !lpaPreview?.known, 'is-warn': Boolean(lpaPreviewCopy.warning) }"
                  aria-live="polite"
                >
                  <div class="esim-download-preview__row">
                    <strong>{{ lpaPreviewCopy.title }}</strong>
                    <span v-if="lpaPreviewCopy.size">{{ lpaPreviewCopy.size }}</span>
                  </div>
                  <p>{{ lpaPreviewCopy.detail }}</p>
                  <p v-if="lpaPreviewCopy.warning" class="esim-download-preview__warn">{{ lpaPreviewCopy.warning }}</p>
                </aside>

                <label v-if="euiccs.length" class="esim-policy-field esim-download-card__field">
                  <span>目标 eUICC</span>
                  <select v-model="targetAidHex" :disabled="isBusy" aria-label="目标 eUICC">
                    <option
                      v-for="euicc in euiccs"
                      :key="euicc.aidHex || euicc.eid || euicc.index"
                      :value="euicc.aidHex"
                    >eUICC {{ euicc.index + 1 }} · {{ euicc.nameplate || euicc.chipMaker || euicc.manufacturer || '未知制造商' }} · 可用 {{ euicc.freeNvram || '未知' }}</option>
                  </select>
                </label>

                <div v-if="downloadProgress" class="esim-download-card__progress" role="status" aria-live="polite" aria-atomic="true">
                  <div class="esim-download-card__progress-copy">
                    <span>{{ downloadProgress.msg || '正在下载 Profile…' }}</span>
                    <strong v-if="downloadPercent !== null">{{ downloadPercent }}%</strong>
                  </div>
                  <div
                    class="esim-download-card__track"
                    role="progressbar"
                    aria-label="eSIM Profile 下载进度"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    :aria-valuenow="downloadPercent ?? undefined"
                    :aria-valuetext="downloadProgress.msg || '正在下载 Profile'"
                  >
                    <span class="esim-download-card__fill" :style="{ transform: `scaleX(${(downloadPercent ?? 8) / 100})` }" />
                  </div>
                </div>

                <p
                  v-else-if="downloadFeedback"
                  id="esim-download-feedback"
                  class="esim-download-card__feedback"
                  :class="`is-${downloadFeedback.tone}`"
                  :role="downloadFeedback.tone === 'error' ? 'alert' : 'status'"
                >
                  <MIcon :name="downloadFeedback.tone === 'error' ? 'error' : downloadFeedback.tone === 'success' ? 'check_circle' : 'warning'" size="sm" aria-hidden="true" />
                  <span>{{ downloadFeedback.message }}</span>
                </p>

                <footer class="esim-download-card__actions">
                  <button type="button" class="runtime-action-btn esim-download-card__primary" :disabled="isBusy || !activationCode.trim() || (euiccs.length > 1 && !targetAidHex)" @click="downloadProfile">{{ busy === 'download' ? '正在下载…' : '开始下载' }}</button>
                  <button v-if="busy === 'download'" type="button" class="runtime-action-btn glass-frame glass-frame--compact" @click="cancelDownload">取消下载</button>
                  <span v-else class="esim-download-card__format">支持 LPA:1$… 与 1$… 格式</span>
                </footer>
              </article>
            </div>
          </template>

          <footer class="esim-dialog__bottom"><button type="button" class="runtime-action-btn glass-frame glass-frame--compact" :disabled="isBusy" @click="close">完成</button></footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.esim-dialog-overlay { position: fixed; inset: 0; z-index: 1200; display: grid; place-items: center; padding: 24px; background: rgba(3, 5, 12, 0.78); }
.esim-dialog { width: min(860px, 100%); max-height: min(760px, calc(100vh - 48px)); box-sizing: border-box; overflow-x: hidden; overflow-y: auto !important; overscroll-behavior: contain; touch-action: pan-y; -webkit-overflow-scrolling: touch; scrollbar-width: thin; scrollbar-color: var(--border-strong, rgba(148, 163, 184, .34)) transparent; padding: 22px; border-radius: 22px; color: var(--text-primary, #f8fafc); background: #12151c; border: 1px solid rgba(148, 163, 184, .18); box-shadow: 0 24px 64px rgba(0, 0, 0, .45); backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
.esim-dialog :deep(.glass-frame) { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
:global([data-theme='dark'] .esim-dialog-overlay .glass-frame),
:global([data-theme='dark'] .esim-dialog-overlay .glass-frame.glass-frame--compact),
:global([data-theme='light'] .esim-dialog-overlay .glass-frame),
:global([data-theme='light'] .esim-dialog-overlay .glass-frame.glass-frame--compact) { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
.esim-dialog::-webkit-scrollbar { width: 8px; }
.esim-dialog::-webkit-scrollbar-track { background: transparent; }
.esim-dialog::-webkit-scrollbar-thumb { border: 2px solid transparent; border-radius: 999px; background: var(--border-strong, rgba(148, 163, 184, .34)); background-clip: padding-box; }
.esim-dialog__head, .esim-dialog__section-head, .esim-dialog__footer, .esim-dialog__bottom { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
.esim-dialog__head-actions { display: flex; align-items: center; gap: 8px; }
.esim-dialog__reveal { width: 32px; height: 32px; display: grid; place-items: center; border: 0; border-radius: 10px; background: var(--bg-input, rgba(255, 255, 255, .06)); color: inherit; cursor: pointer; }
.esim-dialog__reveal.is-on { color: var(--green, #81c995); }
.esim-dialog__eyebrow { margin: 0 0 4px; color: var(--green, #81c995); font-size: 11px; letter-spacing: .12em; text-transform: uppercase; }
.esim-dialog h2, .esim-dialog h3 { margin: 0; }
.esim-dialog h2 { font-size: 22px; }
.esim-dialog h3 { font-size: 16px; }
.esim-dialog__sub, .esim-dialog__section-head p { margin: 5px 0 0; color: var(--text-muted, rgba(203, 213, 225, .66)); font-size: 12px; }
.esim-dialog__close { width: 32px; height: 32px; border: 0; border-radius: 10px; background: var(--bg-input, rgba(255, 255, 255, .06)); color: inherit; font-size: 24px; cursor: pointer; }
.esim-dialog__identity { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 20px 0 16px; }
.esim-dialog__tabs { display: flex; gap: 8px; margin-bottom: 18px; border-bottom: 1px solid var(--border-glass, rgba(148, 163, 184, .14)); }
.esim-dialog__tabs button { padding: 9px 12px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--text-muted, rgba(203, 213, 225, .62)); cursor: pointer; font: inherit; font-size: 13px; }
.esim-dialog__tabs button.is-active { border-bottom-color: var(--green, #81c995); color: var(--green, #81c995); }
.esim-dialog__section { min-height: 260px; }
.esim-dialog__section--download { min-height: 0; }
.esim-download-card { padding: 20px; border-radius: 16px; }
.esim-download-card__head { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: start; gap: 12px; }
.esim-download-card__icon { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; background: var(--green-soft, rgba(129, 201, 149, .12)); color: var(--green, #81c995); }
.esim-download-card__title { min-width: 0; }
.esim-download-card__title h3 { color: var(--text-primary, #f8fafc); }
.esim-download-card__title p { max-width: 560px; margin: 5px 0 0; color: var(--text-muted, rgba(203, 213, 225, .66)); font-size: 12px; line-height: 1.55; }
.esim-download-card__state { align-self: center; padding: 5px 9px; border-radius: 999px; background: var(--bg-input, rgba(255, 255, 255, .04)); color: var(--text-muted, rgba(203, 213, 225, .62)); font-size: 11px; line-height: 1; white-space: nowrap; }
.esim-download-card__state.is-running { background: var(--green-soft, rgba(129, 201, 149, .12)); color: var(--green, #81c995); }
.esim-download-card__state.is-success { background: var(--green-soft, rgba(129, 201, 149, .12)); color: var(--green, #81c995); }
.esim-download-card__state.is-warning { background: rgba(253, 214, 99, .12); color: var(--warning, #fdd663); }
.esim-download-card__state.is-error { background: rgba(242, 139, 130, .12); color: var(--danger, #f28b82); }
.esim-download-card__field { margin-top: 20px; color: var(--text-secondary, rgba(255, 255, 255, .82)); }
.esim-download-card .esim-download-card__field input { min-height: 44px; padding: 11px 12px; border-color: var(--border-glass, rgba(255, 255, 255, .1)); background: var(--bg-input, rgba(255, 255, 255, .04)); color: var(--text-primary, #f8fafc); }
.esim-download-card .esim-download-card__field input::placeholder { color: var(--text-muted, rgba(255, 255, 255, .62)); opacity: .72; }
.esim-download-card .esim-download-card__field input:focus-visible { border-color: var(--green, #81c995); box-shadow: 0 0 0 3px var(--green-soft, rgba(129, 201, 149, .12)); outline: none; }
.esim-download-card .esim-download-card__field input[aria-invalid='true'] { border-color: var(--danger, #f28b82); }
.esim-download-preview { margin-top: 12px; padding: 11px 12px; border: 1px solid var(--border-glass, rgba(255, 255, 255, .1)); border-radius: 12px; background: var(--bg-input, rgba(255, 255, 255, .04)); color: var(--text-secondary, rgba(255, 255, 255, .82)); }
.esim-download-preview__row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.esim-download-preview__row strong { min-width: 0; color: var(--text-primary, #f8fafc); font-size: 13px; font-weight: 650; }
.esim-download-preview__row span { flex: 0 0 auto; color: var(--green, #81c995); font-size: 12px; font-variant-numeric: tabular-nums; }
.esim-download-preview p { margin: 6px 0 0; color: var(--text-muted, rgba(203, 213, 225, .66)); font-size: 11px; line-height: 1.5; }
.esim-download-preview__warn { color: var(--warning, #fdd663) !important; }
.esim-download-preview.is-unknown .esim-download-preview__row strong { color: var(--text-muted, rgba(203, 213, 225, .72)); font-weight: 550; }
.esim-download-preview.is-warn { border-color: color-mix(in srgb, var(--warning, #fdd663) 32%, transparent); }
.esim-download-card__progress { margin-top: 16px; padding: 12px; border: 1px solid var(--border-glass, rgba(255, 255, 255, .1)); border-radius: 12px; background: var(--bg-input, rgba(255, 255, 255, .04)); }
.esim-download-card__progress-copy { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--text-secondary, rgba(255, 255, 255, .82)); font-size: 12px; }
.esim-download-card__progress-copy span { min-width: 0; overflow-wrap: anywhere; }
.esim-download-card__progress-copy strong { color: var(--green, #81c995); font-variant-numeric: tabular-nums; }
.esim-download-card__track { height: 6px; margin-top: 10px; overflow: hidden; border-radius: 999px; background: var(--border-glass, rgba(255, 255, 255, .1)); }
.esim-download-card__fill { display: block; width: 100%; height: 100%; border-radius: inherit; background: var(--green, #81c995); transform: scaleX(0); transform-origin: left center; transition: transform 180ms ease-out; }
.esim-download-card__feedback { display: flex; align-items: flex-start; gap: 8px; margin: 16px 0 0; padding: 11px 12px; border: 1px solid var(--border-glass, rgba(255, 255, 255, .1)); border-radius: 12px; background: var(--bg-input, rgba(255, 255, 255, .04)); color: var(--text-secondary, rgba(255, 255, 255, .82)); font-size: 12px; line-height: 1.5; }
.esim-download-card__feedback .m-icon { flex: 0 0 auto; margin-top: 1px; }
.esim-download-card__feedback.is-success { border-color: color-mix(in srgb, var(--green, #81c995) 32%, transparent); color: var(--green, #81c995); }
.esim-download-card__feedback.is-warning { border-color: color-mix(in srgb, var(--warning, #fdd663) 32%, transparent); color: var(--warning, #fdd663); }
.esim-download-card__feedback.is-error { border-color: color-mix(in srgb, var(--danger, #f28b82) 32%, transparent); color: var(--danger, #f28b82); }
.esim-download-card__actions { display: flex; align-items: center; gap: 10px; margin-top: 16px; }
.esim-download-card__actions button { min-height: 44px; justify-content: center; }
.esim-download-card__primary { min-width: 120px; border-color: color-mix(in srgb, var(--green, #81c995) 38%, transparent); background: var(--green-soft, rgba(129, 201, 149, .12)); color: var(--green, #81c995); }
.esim-download-card__format { margin-left: auto; color: var(--text-muted, rgba(255, 255, 255, .62)); font-size: 11px; }
.esim-dialog__count { padding: 4px 9px; border-radius: 999px; background: var(--bg-input, rgba(148, 163, 184, .1)); color: var(--text-muted, rgba(226, 232, 240, .68)); font-size: 11px; }
.esim-euicc-groups { display: grid; gap: 18px; margin-top: 18px; }
.esim-euicc-group { padding: 14px; border: 1px solid var(--border-glass, rgba(148, 163, 184, .14)); border-radius: 18px; background: var(--bg-input, rgba(0, 0, 0, .08)); }
.esim-euicc-group__head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.esim-euicc-group__head h4 { margin: 0; color: var(--text-primary, #f8fafc); font-size: 14px; }
.esim-euicc-group__head p { margin: 4px 0 0; color: var(--text-muted, rgba(203, 213, 225, .62)); font-size: 11px; }
.esim-euicc-group__empty { padding: 18px 4px 4px; color: var(--text-muted, rgba(203, 213, 225, .62)); font-size: 12px; }
.esim-profile-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 12px; margin-top: 12px; }
.esim-profile-card { padding: 14px; border-radius: 16px; }
.esim-profile-card__top { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 14px; }
.esim-profile-card__icon { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 9px; color: var(--accent, #8ab4f8); background: var(--accent-soft, rgba(59, 130, 246, .12)); }
.esim-profile-card__state { color: var(--text-muted, rgba(203, 213, 225, .58)); font-size: 11px; }
.esim-profile-card__state.is-active { color: var(--green, #81c995); }
.esim-profile-card__name, .esim-policy-field { display: flex; flex-direction: column; gap: 6px; color: var(--text-muted, rgba(203, 213, 225, .62)); font-size: 11px; }
.esim-profile-card__name input, .esim-policy-field input, .esim-policy-field select { width: 100%; box-sizing: border-box; padding: 9px 10px; border: 1px solid var(--border-glass, rgba(148, 163, 184, .2)); border-radius: 9px; background: var(--bg-input, rgba(0, 0, 0, .16)); color: var(--text-primary, inherit); font: inherit; font-size: 13px; outline: none; }
.esim-profile-card__name input:focus, .esim-policy-field input:focus, .esim-policy-field select:focus { border-color: var(--green, #81c995); }
.esim-profile-card__provider, .esim-profile-card__iccid { margin: 10px 0 0; color: var(--text-muted, rgba(203, 213, 225, .62)); font-size: 12px; }
.esim-profile-card__iccid { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; }
.esim-profile-card__actions { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
.esim-profile-card__actions button { flex: 1; justify-content: center; min-width: 72px; }
.esim-profile-card__delete { color: var(--danger, #f28b82); }
.esim-profile-card__policy-hint { margin: 8px 0 0; color: var(--warning, #fdd663); font-size: 10px; line-height: 1.45; }
.esim-dialog__footer { justify-content: flex-start; margin-top: 24px; }
.esim-dialog__state { display: grid; min-height: 220px; place-items: center; color: var(--text-muted, rgba(203, 213, 225, .68)); font-size: 13px; }
.esim-dialog__state--error { color: var(--danger, #f28b82); }
.esim-dialog__progress { color: var(--text-muted, rgba(203, 213, 225, .64)); font-size: 12px; }
.esim-dialog__bottom { justify-content: flex-end; margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border-glass, rgba(148, 163, 184, .12)); }
:global([data-theme='light'] .esim-dialog-overlay) { background: rgba(15, 23, 42, .48); }
:global([data-theme='light'] .esim-dialog) { background: #f8fafc; border: 1px solid rgba(15, 23, 42, .08); box-shadow: 0 12px 40px rgba(15, 23, 42, .14); backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
:global([data-theme='light'] .esim-download-card) { background: var(--glass-card, rgba(255, 255, 255, .92)); border: 1px solid var(--glass-border, rgba(15, 23, 42, .08)); box-shadow: 0 8px 28px rgba(15, 23, 42, .08); }
:global([data-theme='light'] .esim-download-preview) { background: rgba(15, 23, 42, .03); border-color: rgba(15, 23, 42, .08); }
@media (max-width: 640px) {
  .esim-dialog-overlay { padding: 10px; }
  .esim-dialog { max-height: calc(100vh - 20px); padding: 16px; border-radius: 18px; }
  .esim-dialog__identity { grid-template-columns: 1fr; }
  .esim-dialog__tabs { overflow-x: auto; }
  .esim-dialog__tabs button { white-space: nowrap; }
  .esim-download-card { padding: 16px; border-radius: 14px; }
  .esim-download-card__head { grid-template-columns: auto minmax(0, 1fr); }
  .esim-download-card__state { grid-column: 2; justify-self: start; }
  .esim-download-card__actions { align-items: stretch; flex-direction: column; }
  .esim-download-card__actions button { width: 100%; }
  .esim-download-card__format { margin-left: 0; text-align: center; }
}
@media (prefers-reduced-motion: reduce) {
  .esim-download-card__fill { transition-duration: 0ms; }
}
</style>
