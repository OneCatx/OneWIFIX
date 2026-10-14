<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { fetchOnewifiDevices } from '../api/onewifiDevices'
import { fetchCallHistory } from '../api/mddVoice'
import { useAppStore } from '../stores/app'
import MIcon from '../components/MIcon.vue'
import SoftLabelCard from '../components/SoftLabelCard.vue'
import { boardModems, maskTail4 } from '../utils/onewifiDevice'
import { lineActionBlockReason, lineActionId } from '../utils/onewifiModel'
import {
  KEYPAD_KEYS,
  appendDialKey,
  backspaceDial,
  callDirectionLabel,
  callStateLabel,
  formatCallTime,
  historyCallsFrom,
  imeiLooksBound,
  isRingingIncoming,
  liveCallsFrom,
  normalizeDialNumber,
  pickPreferredCallDevice,
  persistedCallsFromHistory,
  validDialNumber,
} from './callsModel'
import { isSecureCallAudio } from './callAudio'
import { answerWebCall, bindWebCallLine, dialWebCall, hangupWebCall, subscribeWebCall } from './webCallSession'

const { showToast } = useAppStore()
const deviceGridRef = ref(null)
const devices = ref([])
const selectedId = ref('')
const number = ref('')
const voiceEngineReady = ref(false)
const calls = ref([])
const serverHistory = ref([])
const historyFilter = ref('all')
const loading = ref(false)
const dialing = ref(false)
const actingId = ref('')
const error = ref('')
let pollTimer = 0
let loadRequestId = 0
let zeroHoldTimer = 0
let zeroHoldFired = false
let mounted = false
let unsubscribeWebCall = () => {}

const selected = computed(() => devices.value.find((item) => item.id === selectedId.value) || null)
const liveCalls = computed(() => liveCallsFrom(calls.value))
const historyCalls = computed(() => {
  const transient = historyCallsFrom(calls.value)
  const seen = new Set(transient.map((call) => `${call.number}|${call.started_at}`))
  const persisted = serverHistory.value.filter((call) => !seen.has(`${call.number}|${call.started_at}`))
  let merged = [...transient, ...persisted]
  if (historyFilter.value === 'incoming') {
    merged = merged.filter((call) => call.direction === 'incoming')
  } else if (historyFilter.value === 'outgoing') {
    merged = merged.filter((call) => call.direction === 'outgoing')
  }
  return merged.slice(0, 40)
})

function exportHistory() {
  showToast('网页不导出听筒通话记录', 'error')
}
const ringingCall = computed(() => liveCalls.value.find(isRingingIncoming) || null)
const activeCall = computed(() => liveCalls.value.find((call) => call.state === 'active' || call.state === 'dialing') || null)
const localPhone = computed(() => selected.value?.sim?.number_masked || maskTail4(selected.value?.local_phone || selected.value?.sim?.number))
const imeiReady = computed(() => imeiLooksBound(selected.value))
const audioSecure = computed(() => isSecureCallAudio())
const handsetStatus = ref('')

function pickDefaultDevice(list) {
  return pickPreferredCallDevice(list, selectedId.value)
}

function scrollDeviceRowPrev() {
  deviceGridRef.value?.scrollBy({ left: -196, behavior: 'smooth' })
}

function scrollDeviceRowNext() {
  deviceGridRef.value?.scrollBy({ left: 196, behavior: 'smooth' })
}

async function loadDevices() {
  const payload = await fetchOnewifiDevices()
  if (!mounted) return
  devices.value = boardModems(Array.isArray(payload?.devices) ? payload.devices : [])
  selectedId.value = pickDefaultDevice(devices.value)
}

async function loadCalls() {
  const device = selected.value
  if (!device) {
    serverHistory.value = []
    return
  }
  const lineId = lineActionId(device)
  if (!lineId) {
    serverHistory.value = []
    error.value = lineActionBlockReason(device)
    return
  }
  const requestId = ++loadRequestId
  try {
    const historyPayload = await fetchCallHistory(lineId)
    if (!mounted || requestId !== loadRequestId) return
    serverHistory.value = persistedCallsFromHistory(historyPayload).map((row) => ({
      id: `hist-${row.id || row.started_at || ''}`,
      number: row.number || row.number_tail || row.to || '',
      direction: row.direction === 'outgoing' ? 'outgoing' : 'incoming',
      state: row.state === 'active' ? 'ended' : (row.state || 'ended'),
      started_at: row.started_at,
      ended_at: row.ended_at,
      duration_seconds: row.duration_seconds,
      path: row.path,
    }))
    error.value = ''
  } catch (err) {
    if (!mounted || requestId !== loadRequestId) return
    error.value = err?.message || '无法读取通话'
    serverHistory.value = []
  }
}

async function refresh() {
  loading.value = true
  try {
    await loadDevices()
    if (!mounted) return
    await loadCalls({ force: true })
  } catch (err) {
    if (mounted) showToast(err?.message || '无法读取设备', 'error')
  } finally {
    if (mounted) loading.value = false
  }
}

function pressKey(digit) {
  number.value = appendDialKey(number.value, digit)
}

function onKeyPointerDown(digit) {
  if (digit !== '0') return
  zeroHoldFired = false
  window.clearTimeout(zeroHoldTimer)
  zeroHoldTimer = window.setTimeout(() => {
    zeroHoldFired = true
    pressKey('+')
  }, 420)
}

function onKeyPointerUp(digit) {
  if (digit !== '0') return
  window.clearTimeout(zeroHoldTimer)
  zeroHoldTimer = 0
  if (!zeroHoldFired) pressKey('0')
}

function onDialInput(event) {
  const next = String(event.target.value || '').replace(/[^\d*#+]/g, '')
  number.value = next.slice(0, 32)
}

function fillNumber(value) {
  number.value = normalizeDialNumber(value)
}

async function initVoiceEngine() {
  const device = selected.value
  if (!device) {
    await bindWebCallLine('')
    voiceEngineReady.value = false
    handsetStatus.value = ''
    return
  }
  const lineId = lineActionId(device)
  if (!lineId) {
    await bindWebCallLine('')
    voiceEngineReady.value = false
    handsetStatus.value = lineActionBlockReason(device)
    return
  }
  const snap = await bindWebCallLine(lineId, globalThis.location?.origin || '')
  if (!mounted) return
  voiceEngineReady.value = Boolean(snap.ready)
  handsetStatus.value = snap.ready ? '' : (snap.lastError || '语音引擎不可用')
}

async function dial() {
  const device = selected.value
  const lineId = lineActionId(device || {})
  const dialed = normalizeDialNumber(number.value)
  if (!lineId) {
    showToast(lineActionBlockReason(device || {}) || '未绑定线路，线路操作已禁用', 'error')
    return
  }
  if (!validDialNumber(dialed)) {
    showToast('请输入有效号码', 'error')
    return
  }
  if (liveCalls.value.length) {
    showToast('先挂断当前通话', 'error')
    return
  }
  if (!voiceEngineReady.value) {
    showToast('语音引擎不可用', 'error')
    return
  }
  dialing.value = true
  try {
    await dialWebCall(dialed)
    if (!mounted) return
    showToast(`正在拨打 ${maskTail4(dialed)}`)
  } catch (err) {
    if (mounted) showToast(err?.message || '语音引擎不可用', 'error')
  } finally {
    if (mounted) dialing.value = false
  }
}

async function answer(call) {
  actingId.value = call?.id || 'webrtc'
  try {
    await answerWebCall()
    if (!mounted) return
    showToast('已接听')
  } catch (err) {
    if (mounted) showToast(err?.message || '语音引擎不可用', 'error')
  } finally {
    if (mounted) actingId.value = ''
  }
}

async function hangup(call) {
  actingId.value = call?.id || 'webrtc'
  try {
    await hangupWebCall()
    if (!mounted) return
    showToast(isRingingIncoming(call) ? '已拒绝' : '已挂断')
  } catch (err) {
    if (mounted) showToast(err?.message || '语音引擎不可用', 'error')
  } finally {
    if (mounted) actingId.value = ''
  }
}

function startPoll() {
  if (pollTimer) return
  void loadCalls({ force: true })
  pollTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible') void loadCalls()
  }, 2000)
}

function stopPoll() {
  if (pollTimer) window.clearInterval(pollTimer)
  pollTimer = 0
  window.clearTimeout(zeroHoldTimer)
}

watch(selectedId, () => {
  calls.value = []
  void initVoiceEngine()
  void loadCalls()
})

onMounted(async () => {
  mounted = true
  unsubscribeWebCall = subscribeWebCall((snap) => {
    voiceEngineReady.value = Boolean(snap.ready)
    calls.value = Array.isArray(snap.live) ? snap.live : []
    if (!snap.ready && snap.lastError) handsetStatus.value = snap.lastError
  })
  await refresh()
  if (!mounted) return
  startPoll()
})

onBeforeUnmount(() => {
  mounted = false
  unsubscribeWebCall()
  unsubscribeWebCall = () => {}
  stopPoll()
})
</script>

<template>
  <div class="onewifi-lab-shell">
    <div class="metric-row">
      <div class="metric-card glass-frame metric-card--blue">
        <div class="metric-card__icon"><MIcon name="devices" size="md" /></div>
        <div class="metric-card__body">
          <div class="metric-card__label">可选模组</div>
          <div class="metric-card__value">{{ devices.length }}</div>
          <div class="metric-card__sub">号码只显示尾 4，拨号盘用完整号码</div>
        </div>
      </div>
      <div class="metric-card glass-frame metric-card--green">
        <div class="metric-card__icon"><MIcon name="phone" size="md" /></div>
        <div class="metric-card__body">
          <div class="metric-card__label">进行中</div>
          <div class="metric-card__value">{{ liveCalls.length }}</div>
          <div class="metric-card__sub">{{ ringingCall ? '有来电振铃' : (activeCall ? callStateLabel(activeCall.state) : '没有振铃或通话') }}</div>
          <div class="metric-card__sub">语音引擎：{{ voiceEngineReady ? 'WebRTC 已注册' : '语音引擎不可用' }}</div>
        </div>
      </div>
      <div class="metric-card glass-frame metric-card--purple">
        <div class="metric-card__icon"><MIcon name="smartphone" size="md" /></div>
        <div class="metric-card__body">
          <div class="metric-card__label">本机号码</div>
          <div class="metric-card__value">{{ selected ? localPhone : '—' }}</div>
          <div class="metric-card__sub">{{ selected ? (selected.name || selected.id) : '先选一台模组' }}</div>
        </div>
      </div>
      <div class="metric-card glass-frame metric-card--amber">
        <div class="metric-card__icon"><MIcon name="cell_tower" size="md" /></div>
        <div class="metric-card__body">
          <div class="metric-card__label">线路</div>
          <div class="metric-card__value">{{ voiceEngineReady ? '可打' : '不可用' }}</div>
          <div class="metric-card__sub">{{ voiceEngineReady ? 'WebRTC 已注册' : '语音引擎不可用' }}</div>
        </div>
      </div>
    </div>

    <p v-if="error" class="onewifi-region-warn">{{ error }}</p>
    <p v-else-if="selected && !imeiReady" class="onewifi-region-warn">模组 IMEI 没读到。运营商要设备身份时会拒通话（常表现为 SIP 487）。</p>
    <p v-else-if="handsetStatus" class="onewifi-region-warn onewifi-region-warn--soft">{{ handsetStatus }}</p>
    <p v-else-if="!audioSecure" class="onewifi-region-warn">浏览器麦克风需要 HTTPS。</p>

    <div class="device-scroll-wrap">
      <button type="button" class="device-scroll-btn" aria-label="向左滚动" @click="scrollDeviceRowPrev">
        <MIcon name="chevron_left" />
      </button>
      <div ref="deviceGridRef" class="device-grid">
        <article
          v-for="device in devices"
          :key="device.id"
          class="device-card glass-frame glass-frame--selectable"
          :class="{
            'is-active': selectedId === device.id,
            'is-glow-green': selectedId === device.id,
          }"
          role="button"
          tabindex="0"
          :aria-label="`选择模组 ${device.name || device.id}`"
          @click="selectedId = device.id"
          @keydown.enter.prevent="selectedId = device.id"
        >
          <div class="device-card__lens" aria-hidden="true"></div>
          <div class="device-card__head">
            <div class="device-card__title">
              <span class="device-card__icon"><MIcon name="smartphone" size="sm" /></span>
              <span class="device-card__name">{{ device.name || device.id }}</span>
            </div>
            <div class="device-card__head-end">
              <span class="device-card__tag device-card__tag--status" :class="device.online ? 'is-online' : 'is-offline'">
                <span class="overview-badge__dot" aria-hidden="true"></span>
                {{ device.online ? '在线' : '离线' }}
              </span>
            </div>
          </div>
          <div class="device-card__ip device-card__mihomo">
            <span class="device-card__ip-label">本机</span>
            <span class="device-card__plate overview-badge overview-badge--hero glass-frame glass-frame--compact glass-frame--pill">
              <span class="overview-badge__dot" aria-hidden="true"></span>
              <span class="mono">{{ device.sim?.number_masked || maskTail4(device.local_phone) }}</span>
            </span>
          </div>
        </article>
      </div>
      <button type="button" class="device-scroll-btn" aria-label="向右滚动" @click="scrollDeviceRowNext">
        <MIcon name="chevron_right" />
      </button>
    </div>

    <div class="overview-grid overview-grid--trio">
      <div class="overview-card overview-card--dial glass-frame">
        <div class="panel-title-row panel-title-row--runtime">
          <span class="panel-title-icon panel-title-icon--teal"><MIcon name="phone" size="sm" /></span>
          <h3 class="overview-card__title">拨号盘</h3>
          <div class="runtime-actions">
            <button type="button" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" :disabled="loading" @click="refresh">
              <MIcon name="sync" size="sm" />
              {{ loading ? '刷新中…' : '刷新' }}
            </button>
          </div>
        </div>
        <div class="soft-label-grid">
          <SoftLabelCard title="本机号码" :value="selected ? localPhone : '—'" mono />
          <SoftLabelCard title="VoWiFi" :value="voiceEngineReady ? 'WebRTC 已注册' : '语音引擎不可用'" />
          <SoftLabelCard title="IMEI" :value="selected ? (selected.imei_masked || '未绑定') : '—'" mono />
          <SoftLabelCard title="WebRTC" :value="voiceEngineReady ? '已注册' : '不可用'" />
        </div>
        <input
          class="calls-dial"
          :value="number"
          inputmode="tel"
          autocomplete="off"
          placeholder="输入号码"
          aria-label="拨号号码"
          @input="onDialInput"
          @keydown.enter.prevent="dial"
        />
        <div class="ow-keypad calls-keypad" role="group" aria-label="拨号盘">
          <button
            v-for="key in KEYPAD_KEYS"
            :key="key.digit"
            type="button"
            class="ow-key glass-frame glass-frame--compact"
            :aria-label="key.digit === '0' ? '0，长按输入加号' : `拨号键 ${key.digit}`"
            @click="key.digit === '0' ? undefined : pressKey(key.digit)"
            @pointerdown="onKeyPointerDown(key.digit)"
            @pointerup="onKeyPointerUp(key.digit)"
            @pointercancel="onKeyPointerUp(key.digit)"
            @contextmenu.prevent
          >
            <span>{{ key.digit }}</span>
            <small v-if="key.letters" class="ow-key__letters">{{ key.letters }}</small>
          </button>
        </div>
        <div class="calls-dial__actions ow-theme-row">
          <button type="button" class="ow-theme-chip glass-frame glass-frame--compact" :disabled="!number" @click="number = backspaceDial(number)">
            <MIcon name="backspace" size="sm" />
            退格
          </button>
          <button
            v-if="ringingCall"
            type="button"
            class="ow-theme-chip glass-frame glass-frame--compact is-active"
            :disabled="actingId === ringingCall.id"
            @click="answer(ringingCall)"
          >
            <MIcon name="phone" size="sm" />
            接听
          </button>
          <button
            v-if="liveCalls.length"
            type="button"
            class="ow-theme-chip glass-frame glass-frame--compact"
            :disabled="Boolean(actingId)"
            @click="hangup(ringingCall || liveCalls[0])"
          >
            <MIcon name="phone_off" size="sm" />
            {{ ringingCall ? '拒绝' : '挂断' }}
          </button>
          <button
            v-else
            type="button"
            class="ow-theme-chip glass-frame glass-frame--compact"
            :class="{ 'is-active': validDialNumber(number) }"
            :disabled="dialing || !voiceEngineReady"
            @click="dial"
          >
            <MIcon name="phone" size="sm" />
            {{ dialing ? '拨打中…' : '拨打' }}
          </button>
        </div>
      </div>

      <div class="overview-card overview-card--esim glass-frame">
        <div class="panel-title-row panel-title-row--esim">
          <span class="panel-title-icon panel-title-icon--amber"><MIcon name="phone" size="sm" /></span>
          <h3 class="overview-card__title">进行中</h3>
        </div>
        <div v-if="loading && !calls.length" class="onewifi-panel-empty">加载中…</div>
        <div v-else-if="!liveCalls.length" class="onewifi-panel-empty">没有振铃或通话中的会话。</div>
        <div v-else class="esim-list">
          <div v-for="call in liveCalls" :key="call.id" class="esim-row">
            <button
              type="button"
              class="esim-item glass-frame glass-frame--selectable"
              :class="{ 'is-glow-green': isRingingIncoming(call) || call.state === 'active' }"
              @click="fillNumber(call.number)"
            >
              <div class="esim-item__head">
                <span class="esim-item__name">{{ call.number ? maskTail4(call.number) : '未知号码' }}</span>
                <span class="esim-item__badges">
                  <span v-if="call.direction === 'incoming'" class="esim-item__badge current">来电</span>
                  <span class="esim-item__badge">{{ callStateLabel(call.state) }}</span>
                </span>
              </div>
              <div class="esim-item__provider">
                {{ callDirectionLabel(call.direction) }}
                <template v-if="call.codec"> · {{ call.codec }}</template>
                <template v-if="call.media_ready"> · 媒体就绪</template>
                <template v-if="call.reason"> · {{ call.reason }}</template>
              </div>
              <div class="esim-item__meta">{{ formatCallTime(call.started_at) }}</div>
            </button>
            <div class="calls-live-actions">
              <button
                v-if="isRingingIncoming(call)"
                type="button"
                class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill"
                :disabled="actingId === call.id"
                @click="answer(call)"
              >
                接听
              </button>
              <button
                type="button"
                class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill"
                :disabled="actingId === call.id"
                @click="hangup(call)"
              >
                {{ isRingingIncoming(call) ? '拒绝' : '挂断' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="overview-card overview-card--runtime glass-frame">
        <div class="panel-title-row panel-title-row--runtime">
          <span class="panel-title-icon panel-title-icon--purple"><MIcon name="history" size="sm" /></span>
          <h3 class="overview-card__title">最近通话</h3>
          <div class="calls-history-tools">
            <button type="button" class="ow-theme-chip glass-frame glass-frame--compact" :class="{ 'is-active': historyFilter === 'all' }" @click="historyFilter = 'all'">全部</button>
            <button type="button" class="ow-theme-chip glass-frame glass-frame--compact" :class="{ 'is-active': historyFilter === 'incoming' }" @click="historyFilter = 'incoming'">来电</button>
            <button type="button" class="ow-theme-chip glass-frame glass-frame--compact" :class="{ 'is-active': historyFilter === 'outgoing' }" @click="historyFilter = 'outgoing'">去电</button>
            <button type="button" class="ow-theme-chip glass-frame glass-frame--compact" :disabled="!selectedId" @click="exportHistory">导出 CSV</button>
          </div>
        </div>
        <div v-if="!historyCalls.length" class="onewifi-panel-empty">结束后约 30 秒内会留在这里，点一条可回填拨号盘。</div>
        <div v-else class="call-history-list">
          <div v-for="call in historyCalls" :key="call.id" class="esim-row">
            <button type="button" class="esim-item glass-frame glass-frame--selectable" @click="fillNumber(call.number)">
              <div class="esim-item__head">
                <span class="esim-item__name">{{ call.number ? maskTail4(call.number) : '未知号码' }}</span>
                <span class="esim-item__badges">
                  <span class="esim-item__badge">{{ callStateLabel(call.state) }}</span>
                </span>
              </div>
              <div class="esim-item__provider">
                {{ callDirectionLabel(call.direction) }}
                <template v-if="call.reason"> · {{ call.reason }}</template>
                <template v-if="call.sip_code"> · SIP {{ call.sip_code }}</template>
              </div>
              <div class="esim-item__meta">{{ formatCallTime(call.ended_at || call.started_at) }}</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>