<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import MIcon from './MIcon.vue'
import SoftLabelCard from './SoftLabelCard.vue'
import RuntimeStatusDetails from './RuntimeStatusDetails.vue'
import EsimEditDialog from './EsimEditDialog.vue'
import OneWifiOverviewPolicyCard from './OneWifiOverviewPolicyCard.vue'
import AddDeviceCard from './AddDeviceCard.vue'
import OneWifiInstanceRenameDialog from './OneWifiInstanceRenameDialog.vue'
import OneWifiInstanceDeviceStack from './OneWifiInstanceDeviceStack.vue'
import { useOneWifiInstance } from '../composables/useOneWifiInstance'
import { updateInstance, getActiveInstanceId } from '../stores/onewifiInstances'
import { useAppStore } from '../stores/app'
import { ESIM_SWITCH_STEPS, idleEsimSwitchStages, displaySecret, lineActionBlockReason, lineActionId } from '../utils/onewifiModel'

const props = defineProps({
  instance: { type: Object, required: true },
})
const emit = defineEmits(['remove'])
const esimDialogDeviceId = ref('')
const renameDialogRef = ref(null)
const revealSecrets = ref(false)

function openEsimEdit(device) {
  const lineId = lineActionId(device || {})
  if (!lineId) return
  esimDialogDeviceId.value = lineId
}

function closeEsimEdit() {
  esimDialogDeviceId.value = ''
  void refresh({ silent: true })
}

function openDeviceRename(device) {
  renameDialogRef.value?.openDeviceRename(device)
}

const { showToast } = useAppStore()

const {
  upstream,
  sameOrigin,
  configured,
  connected,
  meta,
  loading,
  loggingIn,
  deviceAction,
  esimSwitching,
  atSending,
  devices,
  overviews,
  esimHardware,
  esimProfiles,
  cardPolicy,
  policyIccid,
  policyLoading,
  policySaving,
  selectedDevice,
  selectedOverview,
  deviceIsSwitching,
  start,
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
} = useOneWifiInstance(props.instance)

watch(esimDialogDeviceId, (id) => {
  setPollSuspended(Boolean(String(id || '').trim()))
})

watch(() => selectedDevice.value?.id, () => {
  revealSecrets.value = false
})

const draftLabel = ref(props.instance.label)
const draftHost = ref(props.instance.host)
const draftPort = ref(
  props.instance.port != null && props.instance.port !== ''
    ? String(props.instance.port)
    : '',
)

const isActiveBackend = computed(() => getActiveInstanceId() === props.instance.id)
const draftUsername = ref(props.instance.username || '')
const draftPassword = ref('')
const atCommand = ref('')

const deviceGridRef = ref(null)
const collapsed = computed({
  get: () => Boolean(props.instance.collapsed),
  set: (value) => updateInstance(props.instance.id, { collapsed: Boolean(value) }),
})

const actionBusy = computed(
  () => Boolean(deviceAction.value || esimSwitching.value || atSending.value || policySaving.value),
)
const applying = computed(() => loading.value || (meta.hydrating && !connected.value))
const statusLabel = computed(() => {
  if (applying.value || loggingIn.value) return '连接中'
  if (connected.value) return '已连接'
  if (meta.lastError) return '连接失败'
  if (!String(props.instance.host || '').trim()) return '未配置'
  if (!configured.value) return '未登录'
  return '离线'
})

const statusPillOffline = computed(
  () => !applying.value && !loggingIn.value && !connected.value,
)

function toggleCollapsed() {
  collapsed.value = !collapsed.value
}

function scrollDeviceRowPrev() {
  deviceGridRef.value?.scrollBy({ left: -196, behavior: 'smooth' })
}

function scrollDeviceRowNext() {
  deviceGridRef.value?.scrollBy({ left: 196, behavior: 'smooth' })
}
function yesNo(value) {
  if (value == null) return '—'
  return value ? '是' : '否'
}

function deviceSwitchProgressVisible(device) {
  if (deviceIsSwitching(device.id)) return true
  const progress = overviews.value[device.id]?.switchProgress
  return Boolean(progress?.active)
}

const SWITCH_PHASE_LABELS = {
  radio_held: '无线保持',
  identity_generation: '身份生成',
  if_token: '接口令牌',
  ims_begin_issued: 'IMS 已下发',
  switch_after: '写卡之后',
  switch_callbacks: '回调完成',
  degraded_with_error: '降级',
  failed: '失败',
  failed_internal: '内部失败',
  failed_with_error: '失败可恢复',
  failure_ims_recovery: '正在恢复',
}

function switchPhaseHint(device) {
  const progress = overviews.value[device.id]?.switchProgress
  const phase = progress?.phase
  if (!phase) return ''
  const label = SWITCH_PHASE_LABELS[phase] || phase
  if (progress.status === 'failed' && progress.recoverable === false) return `${label} · 不可重试`
  if (progress.status === 'failed') return `${label} · 可重试`
  return label
}

function switchStagesForDevice(device) {
  const progress = overviews.value[device.id]?.switchProgress
  if (progress?.stages?.length && (deviceIsSwitching(device.id) || progress.active || progress.status === 'failed')) {
    return progress.stages
  }
  if (deviceIsSwitching(device.id)) {
    return ESIM_SWITCH_STEPS.map((step, index) => ({
      ...step,
      ready: false,
      pending: index === 0,
      failed: false,
    }))
  }
  // Idle: the runtime card always shows the switch lane, so give it the resting stages.
  return idleEsimSwitchStages()
}
function esimBadgeClass(profile) {
  if (profile.active) return 'current'
  if (/启用|enabled/i.test(profile.stateText || '')) return 'enabled'
  if (/禁用|disabled/i.test(profile.stateText || '')) return 'disabled'
  return ''
}

function esimStateLabel(profile) {
  const raw = String(profile.stateText || '').trim()
  if (/disabled/i.test(raw)) return '已禁用'
  if (/enabled/i.test(raw) && !/已启用/.test(raw)) return '已启用'
  return raw || '已禁用'
}

watch(draftLabel, (value) => updateInstance(props.instance.id, { label: value.trim() || 'OneWIFI' }))

async function onLogin() {
  if (!draftHost.value.trim()) {
    showToast('请先填写网关主机或 URL', 'warning')
    return
  }
  updateInstance(props.instance.id, { host: draftHost.value.trim(), port: draftPort.value })
  const ok = await loginInstance(draftUsername.value, draftPassword.value)
  if (ok) {
    draftUsername.value = props.instance.username
    draftPassword.value = ''
    showToast(`已登录 ${upstream.value}`, 'success')
  } else if (meta.lastError) {
    showToast(meta.lastError, 'error')
  }
}

async function onApply() {
  if (!draftHost.value.trim()) {
    showToast('请先填写网关主机或 URL', 'warning')
    return
  }
  await applyConfig({ host: draftHost.value.trim(), port: draftPort.value })
  if (meta.lastError) showToast(meta.lastError, 'error')
  else showToast(`已连接 ${upstream.value}`, 'success')
}

async function onRefresh() {
  await refresh({ silent: false })
  if (meta.lastError) showToast(meta.lastError, 'error')
}

function onRemove() {
  if (sameOrigin.value) return
  if (!window.confirm(`确定删除「${props.instance.label}」容器？`)) return
  emit('remove', props.instance.id)
}

async function onSendAt() {
  const text = atCommand.value.trim()
  if (!text) return
  const targetDeviceId = selectedDevice.value?.id
  const ok = await sendAtCommand(text)
  if (selectedDevice.value?.id !== targetDeviceId) return
  if (ok) {
    showToast('AT 指令已发送', 'success')
    atCommand.value = ''
  } else if (meta.lastError) {
    showToast(meta.lastError, 'error')
  }
}

async function onReadChip() {
  const targetDeviceId = selectedDevice.value?.id
  const ok = await readChip()
  if (selectedDevice.value?.id !== targetDeviceId) return
  if (ok && meta.esimHint) showToast(meta.esimHint, 'warning')
  else if (ok) showToast('已读取芯片', 'success')
}

const displayEsimProfiles = computed(() => esimProfiles.value)

async function onSwitchEsim(profile) {
  if (profile.locked) return
  if (profile.active) {
    showToast('已经是当前配置', 'warning')
    return
  }
  if (esimSwitching.value) {
    showToast('这台正在切卡', 'warning')
    return
  }
  const targetDeviceId = selectedDevice.value?.id
  const ok = await switchEsim(profile.iccid)
  if (selectedDevice.value?.id !== targetDeviceId) return
  if (ok) showToast(`已切换至「${profile.name}」`, 'success')
  else showToast(meta.lastError || '切卡未完成', 'error')
}

async function onReconnectVowifi() {
  if (!selectedDevice.value || actionBusy.value) return
  const targetDeviceId = selectedDevice.value.id
  const ok = await reconnectVowifi()
  if (selectedDevice.value?.id !== targetDeviceId) return
  if (ok) showToast('VoWiFi 重连指令已发送', 'success')
  else if (meta.lastError) showToast(meta.lastError, 'error')
}

async function onRebootModule() {
  if (!selectedDevice.value || actionBusy.value) return
  const name = selectedDevice.value.name || selectedDevice.value.id
  const targetDeviceId = selectedDevice.value.id
  if (!window.confirm(`确定重启模组「${name}」？设备将短暂离线。`)) return
  const ok = await rebootModule()
  if (selectedDevice.value?.id !== targetDeviceId) return
  if (ok) showToast('模组重启指令已发送', 'success')
  else if (meta.lastError) showToast(meta.lastError, 'error')
}

async function onPatchCardPolicy(patch) {
  const targetDeviceId = selectedDevice.value?.id
  const ok = await patchCardPolicy(patch)
  if (selectedDevice.value?.id !== targetDeviceId) return
  if (ok) showToast('卡策略已更新', 'success')
  else if (meta.lastError) showToast(meta.lastError, 'error')
}

async function onToggleDeveloper(enabled) {
  const ok = await setDeveloperMode(enabled)
  if (ok) showToast(enabled ? '开发者模式已开启，可再拨开启网络' : '开发者模式已关闭', 'success')
  else if (meta.lastError) showToast(meta.lastError, 'error')
}

async function onDeviceRegistered() {
  await refresh({ silent: false })
  if (meta.lastError) showToast(meta.lastError, 'error')
}

onMounted(() => start())
</script>

<template>
  <article class="onewifi-instance glass-frame" :class="{ 'is-collapsed': collapsed, 'is-active-backend': isActiveBackend }">
    <!-- 横向配置 + 操作头 -->
    <header class="vhi-head">
      <div class="vhi-head__row vhi-head__row--top">
        <div class="vhi-title">
          <button
            type="button"
            class="vhi-collapse-btn"
            :aria-expanded="!collapsed"
            :aria-label="collapsed ? '展开容器' : '折叠容器'"
            @click="toggleCollapsed"
          >
            <span class="vhi-collapse-btn__icon" :class="{ 'is-open': !collapsed }">
              <MIcon name="expand_more" size="sm" />
            </span>
          </button>
          <input v-model="draftLabel" class="vhi-title__input" type="text" aria-label="容器名称" />
          <span class="status-pill" :class="{ offline: statusPillOffline }">
            <span class="dot" aria-hidden="true"></span>
            {{ statusLabel }}
          </span>
          <span v-if="isActiveBackend" class="vhi-active-badge">当前后端</span>
          <span v-if="draftHost.trim() && !collapsed && !sameOrigin" class="vhi-title__upstream">{{ upstream }}</span>
        </div>

        <div v-show="!collapsed" class="vhi-head__actions">
          <input
            v-model="atCommand"
            type="text"
            class="onewifi-at-input"
            placeholder="AT 指令"
            :disabled="!selectedDevice || atSending"
            @keyup.enter="onSendAt"
          />
          <button type="button" class="vhi-btn" :disabled="loading" @click="onRefresh">
            <MIcon name="sync" size="sm" />
            {{ loading ? '刷新中…' : '刷新' }}
          </button>
          <button v-if="!sameOrigin" type="button" class="vhi-btn vhi-btn--danger" aria-label="删除容器" @click="onRemove">
            <MIcon name="delete" size="sm" />
            删除
          </button>
        </div>
      </div>

      <div v-show="!collapsed && !sameOrigin" class="vhi-head__row vhi-head__row--config">
        <label class="vhi-field">
          <span>主机 / URL</span>
          <input
            v-model="draftHost"
            type="text"
            placeholder="192.168.1.10 或 https://onewifi.example.com"
            @keyup.enter="onApply"
          />
        </label>
        <label class="vhi-field vhi-field--port">
          <span>端口（可选）</span>
          <input
            v-model="draftPort"
            type="text"
            inputmode="numeric"
            placeholder="6688，反代域名可留空"
          />
        </label>
        <label class="vhi-field">
          <span>用户名</span>
          <input v-model="draftUsername" type="text" autocomplete="off" placeholder="管理员账号" />
        </label>
        <label class="vhi-field">
          <span>密码</span>
          <input
            v-model="draftPassword"
            type="password"
            autocomplete="off"
            placeholder="登录密码"
            @keyup.enter="onLogin"
          />
        </label>
        <button type="button" class="vhi-btn vhi-btn--login" :disabled="loggingIn || applying" @click="onLogin">
          <MIcon name="login" size="sm" />
          {{ loggingIn ? '登录中…' : '登录' }}
        </button>
        <button type="button" class="vhi-btn vhi-btn--primary" :disabled="applying" @click="onApply">
          <MIcon name="link" size="sm" />
          {{ applying ? '连接中…' : '保存并连接' }}
        </button>
      </div>
    </header>

    <!-- 设备展示体 -->
    <section v-show="!collapsed" class="onewifi-console vhi-body">
      <div v-if="!configured" class="onewifi-empty-hint">
        请填写主机并 <strong>登录</strong> 后同步设备状态
      </div>

      <template v-else>
        <div v-if="meta.lastError && !meta.streamWarning" class="onewifi-region-warn">{{ meta.lastError }}</div>
        <div v-else-if="meta.streamWarning" class="onewifi-region-warn onewifi-region-warn--soft">{{ meta.streamWarning }}</div>

        <div v-if="devices.length || configured" class="device-scroll-wrap">
          <button type="button" class="device-scroll-btn" aria-label="向左滚动" @click="scrollDeviceRowPrev">
            <MIcon name="chevron_left" />
          </button>
          <div ref="deviceGridRef" class="device-grid">
            <OneWifiInstanceDeviceStack
              :devices="devices"
              :selected-device="selectedDevice"
              :esim-hardware="esimHardware"
              :device-is-switching="deviceIsSwitching"
              :select-device="selectDevice"
              :open-device-rename="openDeviceRename"
            />
            <AddDeviceCard v-if="sameOrigin" @registered="onDeviceRegistered" />
          </div>
          <button type="button" class="device-scroll-btn" aria-label="向右滚动" @click="scrollDeviceRowNext">
            <MIcon name="chevron_right" />
          </button>
        </div>

        <div v-if="!devices.length && !meta.lastError" class="onewifi-empty-hint">暂无设备</div>

        <div v-if="selectedDevice" class="overview-grid">
          <div class="overview-card overview-card--runtime glass-frame">
            <div class="panel-title-row panel-title-row--runtime">
              <span class="panel-title-icon panel-title-icon--teal"><MIcon name="insights" size="sm" /></span>
              <h3 class="overview-card__title">运行状态</h3>
              <div class="runtime-actions">
                <button type="button" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" :disabled="actionBusy" @click="onReconnectVowifi">
                  <MIcon name="sync" size="sm" />
                  {{ deviceAction === 'vowifi-reconnect' ? '重连中…' : '重连 VoWiFi' }}
                </button>
              </div>
            </div>
            <div class="runtime-status-center">
              <div class="runtime-status-block">
                <div class="runtime-status-hero">
                  <div class="overview-badge overview-badge--hero glass-frame glass-frame--compact glass-frame--pill" :class="{ 'glass-frame--tone-green': selectedOverview.wificallReady }">
                    <span class="overview-badge__dot"></span>
                    {{ selectedOverview.wificallLabel }}
                  </div>
                  <div
                    v-if="!selectedOverview.flightMode && (selectedOverview.radioRegistered || selectedOverview.radioLabel)"
                    class="overview-badge overview-badge--hero glass-frame glass-frame--compact glass-frame--pill"
                    :class="{ 'glass-frame--tone-green': selectedOverview.radioRegistered }"
                  >
                    <span class="overview-badge__dot"></span>
                    蜂窝驻留
                  </div>
                  <div
                    v-if="!selectedOverview.flightMode && selectedOverview.radioLabel"
                    class="overview-badge overview-badge--hero glass-frame glass-frame--compact glass-frame--pill"
                    :class="{ 'glass-frame--tone-green': selectedOverview.radioRegistered }"
                  >
                    <span class="overview-badge__dot"></span>
                    {{ selectedOverview.radioLabel }}
                  </div>
                </div>
                <div class="runtime-progress-stack">
                  <section class="runtime-progress glass-frame glass-frame--compact" aria-label="当前进度">
                    <p class="runtime-progress__label">当前进度</p>
                    <div class="stage-row" :style="{ '--stage-cols': selectedOverview.stages.length }" role="list">
                      <div v-for="stage in selectedOverview.stages" :key="stage.key" class="stage-item" role="listitem">
                        <div class="stage-bar" :class="{ ready: stage.ready }"></div>
                        <span class="stage-label">{{ stage.label }}</span>
                      </div>
                    </div>
                  </section>
                  <section
                    class="runtime-progress runtime-progress--switch glass-frame glass-frame--compact"
                    :class="{ 'is-active': deviceSwitchProgressVisible(selectedDevice) }"
                    :aria-label="`${selectedDevice.name || selectedDevice.id} 切卡进度`"
                  >
                    <p class="runtime-progress__label">
                      切卡进度
                      <em v-if="switchPhaseHint(selectedDevice)" class="runtime-progress__hint">{{ switchPhaseHint(selectedDevice) }}</em>
                      <em v-else-if="deviceSwitchProgressVisible(selectedDevice)" class="runtime-progress__hint">进行中</em>
                    </p>
                    <div
                      class="device-card__stages stage-row"
                      :style="{ '--stage-cols': switchStagesForDevice(selectedDevice).length || 5 }"
                      role="list"
                    >
                      <div
                        v-for="stage in switchStagesForDevice(selectedDevice)"
                        :key="stage.key"
                        class="stage-item"
                        role="listitem"
                        :aria-label="`${stage.label} ${stage.ready ? '完成' : stage.failed ? '失败' : stage.pending ? '进行中' : '等待'}`"
                      >
                        <div class="stage-bar" :class="{ ready: stage.ready, pending: stage.pending, failed: stage.failed }"></div>
                        <span class="stage-label">{{ stage.label }}</span>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            </div>
            <RuntimeStatusDetails
              :data-plane="selectedOverview.dataPlane"
              :last-reason="selectedOverview.lastReason"
              :error-category="selectedOverview.errorCategory"
            />
          </div>

          <div class="overview-card overview-card--sim glass-frame">
            <div class="panel-title-row panel-title-row--sim">
              <span class="panel-title-icon panel-title-icon--purple"><MIcon name="sim_card" size="sm" /></span>
              <h3 class="overview-card__title">SIM / 设备</h3>
              <div class="runtime-actions">
                <button
                  type="button"
                  class="runtime-action-btn runtime-action-btn--icon glass-frame glass-frame--compact glass-frame--pill"
                  :class="{ 'is-on': revealSecrets }"
                  :aria-pressed="revealSecrets"
                  :aria-label="revealSecrets ? '隐藏完整号码' : '显示完整号码'"
                  :title="revealSecrets ? '隐藏完整号码' : '显示完整号码'"
                  @click="revealSecrets = !revealSecrets"
                >
                  <MIcon :name="revealSecrets ? 'visibility' : 'visibility_off'" size="sm" />
                </button>
                <button type="button" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" :disabled="actionBusy" @click="onRebootModule">
                  <MIcon name="power_settings_new" size="sm" />
                  {{ deviceAction === 'reboot' ? '重启中…' : '重启模组' }}
                </button>
              </div>
            </div>
            <div class="carrier-banner">
              <div class="sim-visual" aria-hidden="true">
                <div class="sim-visual__glow"></div>
                <div class="sim-visual__chip">
                  <span class="sim-visual__corner"></span>
                  <span class="sim-visual__lines"></span>
                </div>
              </div>
            </div>
            <div class="soft-label-grid kv-list">
              <SoftLabelCard title="IMEI" :value="displaySecret(selectedOverview.imei, revealSecrets)" mono />
              <SoftLabelCard title="ICCID" :value="displaySecret(selectedOverview.iccid, revealSecrets)" mono />
              <SoftLabelCard title="IMSI" :value="displaySecret(selectedOverview.imsi, revealSecrets)" mono />
              <SoftLabelCard title="本机号码" :value="displaySecret(selectedOverview.phone, revealSecrets)" mono />
              <SoftLabelCard title="当前 eSIM" :value="selectedOverview.esimProfile" />
              <SoftLabelCard title="原运营商" :value="selectedOverview.operator" />
              <SoftLabelCard v-if="selectedOverview.radioRegistered" title="服务小区" :value="selectedOverview.servingOperator" />
              <SoftLabelCard v-if="selectedOverview.radioRegistered" title="注网" :value="selectedOverview.radioStatus" />
              <SoftLabelCard v-if="selectedOverview.radioRegistered && selectedOverview.radioMode !== '—'" title="频段" :value="selectedOverview.radioMode" />
              <SoftLabelCard v-if="selectedOverview.radioRegistered && selectedOverview.radioSignal !== '—'" title="信号" :value="selectedOverview.radioSignal" />
              <SoftLabelCard title="出口代理" :value="selectedDevice.proxyLabel || '直连'" />
              <SoftLabelCard title="固件版本" :value="selectedOverview.firmware" mono />
              <SoftLabelCard title="飞行模式">
                <span>
                  {{ yesNo(selectedOverview.flightMode) }}
                  <em v-if="selectedOverview.vowifiActive"> · VoWiFi 接管中</em>
                </span>
              </SoftLabelCard>
              <SoftLabelCard title="运行模式" :value="selectedOverview.runningMode" />
              <SoftLabelCard
                v-if="selectedOverview.smsStorage?.me"
                title="ME 短信"
                :value="`${selectedOverview.smsStorage.me.used}/${selectedOverview.smsStorage.me.total}`"
                mono
              />
              <SoftLabelCard
                v-if="selectedOverview.smsStorage?.sm"
                title="SM 短信"
                :value="`${selectedOverview.smsStorage.sm.used}/${selectedOverview.smsStorage.sm.total}`"
                mono
              />
            </div>
            <p v-if="selectedOverview.smsStorageWarning" class="onewifi-region-warn sim-sms-storage-warn">{{ selectedOverview.smsStorageWarning }}</p>
          </div>

          <div class="overview-card overview-card--esim glass-frame">
            <div class="panel-title-row panel-title-row--esim">
              <span class="panel-title-icon panel-title-icon--amber"><MIcon name="swap_horiz" size="sm" /></span>
              <h3 class="overview-card__title">切卡</h3>
              <div class="runtime-actions">
                <button
                  type="button"
                  class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill"
                  :disabled="!selectedDevice || !lineActionId(selectedDevice)"
                  :title="selectedDevice && !lineActionId(selectedDevice) ? lineActionBlockReason(selectedDevice) : undefined"
                  :aria-label="`编辑 eSIM ${selectedDevice.name || selectedDevice.id}`"
                  @click="openEsimEdit(selectedDevice)"
                >
                  <MIcon name="edit" size="sm" />
                  编辑 eSIM
                </button>
                <button v-if="sameOrigin" type="button" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" :disabled="actionBusy" @click="onReadChip">
                  <MIcon name="sim_card" size="sm" />
                  读芯片
                </button>
              </div>
            </div>
            <div v-if="!displayEsimProfiles.length" class="onewifi-panel-empty">
              {{ sameOrigin ? (meta.esimHint || '芯片缓存为空，请点击「读芯片」读取配置。') : '暂无 eSIM 配置' }}
            </div>
            <div v-else class="esim-list">
              <div v-for="profile in displayEsimProfiles" :key="profile.iccid" class="esim-row">
                <button
                  type="button"
                  class="esim-item glass-frame glass-frame--selectable"
                  :class="{ 'is-active': profile.active, 'is-glow-green': profile.active, 'is-switching': esimSwitching === profile.iccid }"
                  :disabled="profile.locked || profile.active || Boolean(esimSwitching)"
                  @click="onSwitchEsim(profile)"
                >
                  <div class="esim-item__head">
                    <span class="esim-item__name">{{ profile.name }}</span>
                    <span v-if="profile.locked" class="esim-item__badges">
                      <span class="esim-item__badge current">当前</span>
                      <span class="esim-item__badge">物理卡</span>
                    </span>
                    <span v-else-if="profile.active" class="esim-item__badges">
                      <span class="esim-item__badge current">当前</span>
                      <span class="esim-item__badge enabled">已启用</span>
                    </span>
                    <span v-else-if="esimSwitching === profile.iccid" class="esim-item__badge pending">切换中</span>
                    <span v-else class="esim-item__badge" :class="esimBadgeClass(profile)">{{ esimStateLabel(profile) }}</span>
                  </div>
                  <div class="esim-item__provider">{{ profile.provider }}</div>
                  <div class="esim-item__meta"><span class="mono">{{ displaySecret(profile.iccid, revealSecrets) }}</span></div>
                </button>
              </div>
              <p v-if="meta.esimHint && !esimProfiles.length" class="onewifi-empty-hint" style="margin-top: 10px; padding: 10px 12px">{{ meta.esimHint }}</p>
            </div>
          </div>

          <OneWifiOverviewPolicyCard
            :iccid="policyIccid"
            :reveal="revealSecrets"
            :policy="cardPolicy"
            :loading="policyLoading"
            :saving="policySaving"
            :capabilities-only="sameOrigin"
            :developer="Boolean(selectedDevice?.developer_enabled)"
            :developer-busy="developerSaving"
            @patch="onPatchCardPolicy"
            @developer="onToggleDeveloper"
          />
        </div>
      </template>
    </section>
  </article>
  <EsimEditDialog
    :open="Boolean(esimDialogDeviceId)"
    :device-id="esimDialogDeviceId"
    :capabilities-only="sameOrigin"
    :api-ctx="requestCtx"
    :cached-profiles="displayEsimProfiles"
    :cached-euiccs="esimHardware[selectedDevice?.id] || []"
    @close="closeEsimEdit"
  />
  <OneWifiInstanceRenameDialog
    ref="renameDialogRef"
    :rename-device="renameSelectedDevice"
    :delete-device="deleteSelectedDevice"
  />
</template>

<style scoped>
.onewifi-instance {
  display: flex;
  flex-direction: column;
  gap: 22px;
  padding: 22px 20px 24px;
  border-radius: 20px;
  transition: gap 0.22s ease, padding 0.22s ease;
}

.onewifi-instance.is-collapsed {
  gap: 0;
  padding-bottom: 14px;
}

.vhi-head {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.vhi-head__row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.vhi-head__row--top {
  justify-content: space-between;
}

.vhi-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.vhi-collapse-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(148, 163, 184, 0.95);
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.18s ease, color 0.18s ease;
}

.vhi-collapse-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.vhi-collapse-btn__icon {
  transition: transform 0.22s ease;
}

.vhi-collapse-btn__icon.is-open {
  transform: rotate(180deg);
}

.vhi-title__input {
  width: 120px;
  border: none;
  background: transparent;
  font-size: 15px;
  font-weight: 700;
  color: inherit;
  outline: none;
  border-bottom: 1px solid transparent;
}

.vhi-title__input:focus {
  border-bottom-color: rgba(148, 163, 184, 0.5);
}

.vhi-title .status-pill {
  flex-shrink: 0;
}

.vhi-title__upstream {
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: rgba(148, 163, 184, 0.85);
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vhi-active-badge {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: #34d399;
  background: rgba(52, 211, 153, 0.12);
  border: 1px solid rgba(52, 211, 153, 0.28);
}

.onewifi-instance.is-active-backend {
  border-color: rgba(52, 211, 153, 0.28);
}

.vhi-head__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.vhi-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: rgba(148, 163, 184, 0.9);
}

.vhi-field--port {
  width: 84px;
}

.vhi-field input {
  width: 150px;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: rgba(255, 255, 255, 0.04);
  color: inherit;
  font-size: 13px;
  outline: none;
}

.vhi-field--port input {
  width: 100%;
}

.vhi-field input:focus {
  border-color: rgba(34, 197, 94, 0.5);
}

.vhi-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 14px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: rgba(255, 255, 255, 0.05);
  color: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  align-self: flex-end;
  transition: background 0.18s ease, border-color 0.18s ease, transform 0.15s ease;
}

.vhi-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  transform: translateY(-1px);
}

.vhi-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.vhi-btn--primary {
  border-color: rgba(34, 197, 94, 0.45);
  background: rgba(34, 197, 94, 0.16);
  color: #22c55e;
}

.vhi-btn--login {
  border-color: rgba(59, 130, 246, 0.45);
  background: rgba(59, 130, 246, 0.14);
  color: #60a5fa;
}

.vhi-btn--danger {
  border-color: rgba(239, 68, 68, 0.4);
  background: rgba(239, 68, 68, 0.12);
  color: #f87171;
}

.vhi-body {
  margin: 0;
  padding: 0;
}

[data-theme='light'] .vhi-field input,
[data-theme='light'] .vhi-btn {
  background: rgba(15, 23, 42, 0.03);
  border-color: rgba(15, 23, 42, 0.12);
}

/* 小屏：配置头单列排开，避免 150px 输入框乱折成「一坨」 */
@media (max-width: 900px) {
  .onewifi-instance {
    gap: 14px;
    padding: 14px 12px;
  }

  .vhi-head {
    gap: 14px;
  }

  .vhi-head__row--top {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .vhi-title {
    flex-wrap: wrap;
    row-gap: 8px;
  }

  .vhi-title__input {
    width: auto;
    flex: 1 1 120px;
    min-width: 0;
    font-size: 16px;
  }

  .vhi-title__upstream {
    max-width: 100%;
    flex-basis: 100%;
  }

  .vhi-head__actions {
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
    width: 100%;
  }

  .vhi-head__actions .onewifi-at-input {
    width: 100%;
    min-width: 0;
  }

  .vhi-head__actions .vhi-btn {
    width: 100%;
    justify-content: center;
    align-self: stretch;
  }

  .vhi-head__row--config {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
    align-items: stretch;
  }

  .vhi-field,
  .vhi-field--port {
    width: 100%;
  }

  .vhi-field input,
  .vhi-field--port input {
    width: 100%;
    box-sizing: border-box;
    font-size: 16px;
    padding: 11px 12px;
  }

  .vhi-head__row--config .vhi-btn {
    width: 100%;
    justify-content: center;
    align-self: stretch;
    min-height: 44px;
  }

  .vhi-btn:hover:not(:disabled) {
    transform: none;
  }
}
</style>
