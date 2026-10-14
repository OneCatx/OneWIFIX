<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import MIcon from '../components/MIcon.vue'
import SmsComposeDialog from '../components/SmsComposeDialog.vue'
import { useOneWifiSms } from '../composables/useOneWifiSms'
import { useAppStore } from '../stores/app'
import { maskTail4 } from '../utils/onewifiDevice'
import '../assets/onewifi-pages.css'

const { showToast } = useAppStore()
const deviceGridRef = ref(null)
const composeDialogRef = ref(null)

const {
  configured,
  devices,
  engineReady,
  filteredContacts,
  messageGroups,
  selectedDeviceId,
  selectedContactKey,
  selectedContact,
  search,
  draft,
  loading,
  threadLoading,
  historyLoading,
  sending,
  deleting,
  hasMoreHistory,
  error,
  threadRef,
  selectDevice,
  selectContact,
  refreshAll,
  sendReply,
  sendNew,
  removeThread,
  removeMessage,
  exportInbox,
  onThreadScroll,
} = useOneWifiSms()

const selectedDevice = computed(() => devices.value.find((item) => item.id === selectedDeviceId.value) || null)

function scrollDeviceRowPrev() {
  deviceGridRef.value?.scrollBy({ left: -196, behavior: 'smooth' })
}

function scrollDeviceRowNext() {
  deviceGridRef.value?.scrollBy({ left: 196, behavior: 'smooth' })
}

watch(selectedContactKey, (key) => {
  if (key && composeDialogRef.value?.composeOpen) composeDialogRef.value.closeCompose()
})

async function onRefresh() {
  await refreshAll()
  if (error.value) showToast(error.value, 'error')
}

async function onSend() {
  const result = await sendReply()
  if (result?.ok) showToast(result.label || '短信已发送', 'success')
  else if (error.value) showToast(error.value, 'error')
}

async function onDeleteThread() {
  if (!window.confirm('删除这个会话里目前能看到的短信？')) return
  const result = await removeThread()
  if (result?.ok) showToast('会话已删除')
  else if (error.value) showToast(error.value, 'error')
}

async function onDeleteMessage(message) {
  if (!window.confirm('删除这条短信？')) return
  const result = await removeMessage(message)
  if (result?.ok) showToast('短信已删除')
  else if (error.value) showToast(error.value, 'error')
}

function onDraftKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    void onSend()
  }
}

onMounted(() => {
  if (!configured.value) showToast('请先登录网关', 'warning')
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
          <div class="metric-card__sub">在位模组，号码只显示尾 4</div>
        </div>
      </div>
      <div class="metric-card glass-frame metric-card--green">
        <div class="metric-card__icon"><MIcon name="sms" size="md" /></div>
        <div class="metric-card__body">
          <div class="metric-card__label">联系人</div>
          <div class="metric-card__value">{{ filteredContacts.length }}</div>
          <div class="metric-card__sub">{{ selectedDeviceId === 'all' ? '全部设备' : (selectedDevice?.name || selectedDevice?.id || '—') }}</div>
        </div>
      </div>
      <div class="metric-card glass-frame metric-card--purple">
        <div class="metric-card__icon"><MIcon name="smartphone" size="md" /></div>
        <div class="metric-card__body">
          <div class="metric-card__label">当前会话</div>
          <div class="metric-card__value">{{ selectedContact ? maskTail4(selectedContact.peer) : '—' }}</div>
          <div class="metric-card__sub">{{ selectedContact?.deviceName || (engineReady ? '选一个联系人' : '还没有线路') }}</div>
        </div>
      </div>
      <div class="metric-card glass-frame metric-card--amber">
        <div class="metric-card__icon"><MIcon name="cell_tower" size="md" /></div>
        <div class="metric-card__body">
          <div class="metric-card__label">线路</div>
          <div class="metric-card__value">{{ engineReady ? '可发' : '等待' }}</div>
          <div class="metric-card__sub">{{ engineReady ? '模组在位就能测短信' : '先到设备页接入模组' }}</div>
        </div>
      </div>
    </div>

    <p v-if="error" class="onewifi-region-warn">{{ error }}</p>

    <div class="device-scroll-wrap">
      <button type="button" class="device-scroll-btn" aria-label="向左滚动" @click="scrollDeviceRowPrev">
        <MIcon name="chevron_left" />
      </button>
      <div ref="deviceGridRef" class="device-grid">
        <article
          class="device-card glass-frame glass-frame--selectable"
          :class="{ 'is-active': selectedDeviceId === 'all', 'is-glow-green': selectedDeviceId === 'all' }"
          role="button"
          tabindex="0"
          aria-label="全部设备"
          @click="selectDevice('all')"
          @keydown.enter.prevent="selectDevice('all')"
        >
          <div class="device-card__lens" aria-hidden="true"></div>
          <div class="device-card__head">
            <div class="device-card__title">
              <span class="device-card__icon"><MIcon name="devices" size="sm" /></span>
              <span class="device-card__name">全部设备</span>
            </div>
            <div class="device-card__head-end">
              <span class="device-card__tag device-card__tag--status is-online">
                <span class="overview-badge__dot" aria-hidden="true"></span>
                {{ devices.length }} 台
              </span>
            </div>
          </div>
          <div class="device-card__ip device-card__mihomo">
            <span class="device-card__ip-label">范围</span>
            <span class="device-card__plate overview-badge overview-badge--hero glass-frame glass-frame--compact glass-frame--pill">
              <span class="overview-badge__dot" aria-hidden="true"></span>
              <span>全部会话</span>
            </span>
          </div>
        </article>
        <article
          v-for="device in devices"
          :key="device.id"
          class="device-card glass-frame glass-frame--selectable"
          :class="{
            'is-active': selectedDeviceId === device.id,
            'is-glow-green': selectedDeviceId === device.id,
          }"
          role="button"
          tabindex="0"
          :aria-label="`选择模组 ${device.name || device.id}`"
          @click="selectDevice(device.id)"
          @keydown.enter.prevent="selectDevice(device.id)"
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
              <span class="mono">{{ maskTail4(device.sim?.number_masked || device.sim?.number) }}</span>
            </span>
          </div>
        </article>
      </div>
      <button type="button" class="device-scroll-btn" aria-label="向右滚动" @click="scrollDeviceRowNext">
        <MIcon name="chevron_right" />
      </button>
    </div>

    <div class="overview-grid overview-grid--pair">
      <div class="overview-card overview-card--esim glass-frame">
        <div class="panel-title-row panel-title-row--esim">
          <span class="panel-title-icon panel-title-icon--amber"><MIcon name="sms" size="sm" /></span>
          <h3 class="overview-card__title">联系人</h3>
          <div class="runtime-actions">
            <button type="button" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" :disabled="loading" @click="onRefresh">
              <MIcon name="sync" size="sm" />
              {{ loading ? '刷新中…' : '刷新' }}
            </button>
            <button type="button" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" @click="exportInbox">
              <MIcon name="system_update_alt" size="sm" />
              导出
            </button>
            <button type="button" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" :disabled="!engineReady" @click="composeDialogRef?.openCompose()">
              <MIcon name="add" size="sm" />
              发送测试短信
            </button>
          </div>
        </div>
        <input v-model="search" class="sms-search ow-theme-chip glass-frame glass-frame--compact" type="search" placeholder="搜索联系人 / 内容" />
        <div v-if="loading && !filteredContacts.length" class="onewifi-empty-hint">加载中…</div>
        <div v-else-if="!filteredContacts.length" class="onewifi-empty-hint">
          {{ engineReady ? '暂无联系人。模组里有短信时会列在这里。' : '模组已列出。还没有绑定线路，发不了短信。' }}
        </div>
        <div v-else class="sms-contact-list">
          <div v-for="contact in filteredContacts" :key="contact.key" class="esim-row">
            <button
              type="button"
              class="esim-item glass-frame glass-frame--selectable"
              :class="{ 'is-active': selectedContactKey === contact.key, 'is-glow-green': selectedContactKey === contact.key }"
              @click="selectContact(contact.key)"
            >
              <div class="esim-item__head">
                <span class="esim-item__name">{{ maskTail4(contact.peer) }}</span>
                <span class="esim-item__badges">
                  <span v-if="contact.unread" class="esim-item__badge current">{{ contact.unread }}</span>
                  <span v-if="selectedContactKey === contact.key" class="esim-item__badge current">当前</span>
                  <span class="esim-item__badge">{{ contact.lastTimeLabel || '—' }}</span>
                </span>
              </div>
              <div class="esim-item__provider">{{ contact.lastMessage || '（无内容）' }}</div>
              <div class="esim-item__meta">
                <span v-if="contact.deviceName">{{ contact.deviceName }}</span>
                <span v-if="contact.localPhone" class="mono"> · {{ maskTail4(contact.localPhone) }}</span>
                <span v-if="contact.iccid" class="mono"> · {{ maskTail4(contact.iccid) }}</span>
              </div>
            </button>
          </div>
        </div>
      </div>

      <div class="overview-card overview-card--runtime glass-frame sms-thread-card">
        <div v-if="!selectedContact" class="onewifi-empty-hint">
          {{ engineReady ? '请选择联系人，或点「发送测试短信」。' : '模组已在位。发短信要等这条模组绑上线路。' }}
        </div>
        <template v-else>
          <div class="panel-title-row panel-title-row--runtime">
            <span class="panel-title-icon panel-title-icon--teal"><MIcon name="sms" size="sm" /></span>
            <h3 class="overview-card__title mono">{{ maskTail4(selectedContact.peer) }}</h3>
            <div class="runtime-actions">
              <button type="button" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" @click="refreshAll({ silent: false })">
                <MIcon name="sync" size="sm" />最新
              </button>
              <button type="button" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" :disabled="deleting" @click="onDeleteThread">
                <MIcon name="delete" size="sm" />删除会话
              </button>
            </div>
          </div>
          <p class="sms-sub">
            设备：{{ selectedContact.deviceName || selectedContact.deviceId || '—' }}
            <span v-if="selectedContact.localPhone" class="mono"> · {{ maskTail4(selectedContact.localPhone) }}</span>
            <span v-if="selectedContact.iccid" class="mono"> · {{ maskTail4(selectedContact.iccid) }}</span>
          </p>
          <div ref="threadRef" class="sms-thread" @scroll="onThreadScroll">
            <div v-if="historyLoading" class="sms-thread__hint">正在加载历史短信…</div>
            <div v-else-if="hasMoreHistory" class="sms-thread__hint">向上滚动加载更早短信</div>
            <div v-if="threadLoading && !messageGroups.length" class="onewifi-empty-hint">加载会话中…</div>
            <div v-else-if="!messageGroups.length" class="onewifi-empty-hint">暂无短信记录</div>
            <div v-for="group in messageGroups" :key="group.date" class="sms-day">
              <div class="sms-day__label">{{ group.date }}</div>
              <article v-for="message in group.items" :key="message.id" class="sms-msg" :class="{ 'sms-msg--out': message.direction === 'out' }">
                <div class="sms-msg__meta">
                  <span class="sms-msg__sender">{{ message.direction === 'out' ? '我' : maskTail4(message.peer || message.sender) }}</span>
                  <span class="sms-msg__time">{{ message.timeLabel }}</span>
                  <button v-if="message.numericId" type="button" class="sms-msg__del" :disabled="deleting" @click="onDeleteMessage(message)">
                    <MIcon name="delete" size="sm" />
                  </button>
                </div>
                <div class="sms-msg__bubble glass-frame glass-frame--compact" :class="{ 'sms-msg__bubble--empty': !message.body }">
                  {{ message.body || '这条短信没有可显示的文字' }}
                </div>
              </article>
            </div>
          </div>
          <footer class="sms-compose">
            <textarea
              v-model="draft"
              class="sms-compose__input glass-frame glass-frame--compact"
              rows="2"
              placeholder="回复（Enter 发送）"
              @keydown="onDraftKeydown"
            />
            <button type="button" class="ow-theme-chip glass-frame glass-frame--compact" :class="{ 'is-active': Boolean(draft.trim()) }" :disabled="sending || !draft.trim()" @click="onSend">
              {{ sending ? '发送中…' : '发送' }}
            </button>
          </footer>
        </template>
      </div>
    </div>

    <SmsComposeDialog
      ref="composeDialogRef"
      :devices="devices"
      :selected-device-id="selectedDeviceId"
      :sending="sending"
      :error="error"
      :send-new="sendNew"
      :select-contact="selectContact"
      :show-toast="showToast"
    />
  </div>
</template>

<style scoped>
.sms-search {
  width: 100%;
  box-sizing: border-box;
  margin: 0 0 12px;
  text-align: left;
  font-weight: 500;
  font-family: var(--sans);
}

.sms-contact-list {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 10px;
  flex: 0 0 auto;
  min-height: 0;
}

.sms-contact-list .esim-item__name {
  font-family: var(--sans);
  font-size: 16px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
}

.sms-contact-list .esim-item__provider {
  font-family: var(--sans);
  font-size: 13px;
  line-height: 1.5;
}

.sms-thread-card {
  display: flex;
  flex-direction: column;
  min-height: 520px;
}

.sms-sub {
  margin: 0 0 12px;
  font-size: 12px;
  opacity: 0.58;
}

.sms-thread {
  flex: 1 1 auto;
  min-height: 280px;
  max-height: none;
  overflow-y: auto;
}

.sms-thread__hint {
  margin-bottom: 12px;
  text-align: center;
  font-size: 12px;
  opacity: 0.55;
}

.sms-day + .sms-day {
  margin-top: 18px;
}

.sms-day__label {
  width: fit-content;
  margin: 0 auto 12px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  opacity: 0.55;
}

.sms-msg + .sms-msg {
  margin-top: 12px;
}

.sms-msg__meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.sms-msg__sender {
  font-size: 12px;
  font-weight: 600;
}

.sms-msg__time {
  font-size: 12px;
  opacity: 0.5;
}

.sms-msg__del {
  border: none;
  background: transparent;
  color: inherit;
  opacity: 0.45;
  cursor: pointer;
  padding: 0;
}

.sms-msg__bubble {
  padding: 12px 14px;
  font-size: 15px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text-primary, #f8fafc);
  font-family: var(--sans);
}

.sms-msg__bubble--empty {
  opacity: 0.55;
  font-size: 13px;
}

.sms-msg--out {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.sms-compose {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 88px;
  gap: 10px;
  margin-top: 12px;
}

.sms-compose__input {
  resize: vertical;
  min-height: 44px;
  padding: 10px 12px;
  color: inherit;
  font: inherit;
}
</style>
