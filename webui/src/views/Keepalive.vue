<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  deleteAutomaticTask,
  fetchAutomaticTaskDevices,
  fetchAutomaticTaskRuns,
  fetchAutomaticTasks,
  fetchOnewifiEsimChip,
  fetchOnewifiEsimChipCached,
  runAutomaticTask,
  saveAutomaticTask,
} from '../api/onewifiGateway'
import { onewifiFetch } from '../api/onewifi'
import { useAppStore } from '../stores/app'
import OwGlassPanel from '../components/OwGlassPanel.vue'
import OwPageHead from '../components/OwPageHead.vue'
import MIcon from '../components/MIcon.vue'
import { maskTail4 } from '../utils/onewifiDevice'
import { lineActionBlockReason, lineActionId } from '../utils/onewifiModel'
import {
  buildAutomaticTaskProfileOptions,
  createAutomaticTaskProfileRequestGuard,
  currentDeviceICCID,
  isUsbSimReader,
  selectAutomaticTaskProfileOption,
} from '../utils/automaticTaskProfiles'
import {
  emptyDraft,
  environmentLabel,
  formatDateTime,
  localDate,
  localTime,
  runStatusLabel,
  taskTypeLabel,
} from './keepaliveModel'
import '../assets/onewifi-pages.css'

const { showToast } = useAppStore()
const tasks = ref([])
const runs = ref([])
const runsTotal = ref(0)
const runsPage = ref(1)
const runsPageSize = 20
const devices = ref([])
const profiles = ref([])
const developer = ref(false)
const loading = ref(true)
const saving = ref(false)
const profileLoading = ref(false)
const taskBusyById = ref({})
const profileGuard = createAutomaticTaskProfileRequestGuard()
let pollTimer = 0
let loadRequestId = 0
let runsRequestId = 0
let draftSessionId = 0
let systemInfoLoaded = false

const draft = ref(emptyDraft())

function deviceById(id) {
  const key = String(id || '')
  return devices.value.find((device) => lineActionId(device) === key || String(device.id) === key)
}

function firstBoundLineId() {
  const device = devices.value.find((item) => lineActionId(item))
  return device ? lineActionId(device) : ''
}

function taskById(id) {
  return tasks.value.find((task) => Number(task.id) === Number(id))
}

function setTaskBusy(taskId, busy) {
  const key = String(taskId || '')
  if (!key) return
  const next = { ...taskBusyById.value }
  if (busy) next[key] = true
  else delete next[key]
  taskBusyById.value = next
}

function isTaskBusy(taskId) {
  return Boolean(taskBusyById.value[String(taskId || '')])
}

const selectedIsReader = computed(() => isUsbSimReader(deviceById(draft.value.device_id)))
const taskTypeOptions = computed(() => {
  const options = [
    { value: 'sms', label: '发送短信' },
    { value: 'call', label: '拨打电话' },
  ]
  if (developer.value && !selectedIsReader.value) {
    options.push({ value: 'public_ip', label: '开启漫游流量并获取一次公网 IP' })
  }
  return options
})
const environmentOptions = computed(() => {
  if (selectedIsReader.value || !developer.value) {
    return [{ value: 'vowifi', label: 'VoWiFi' }]
  }
  return [
    { value: 'vowifi', label: 'VoWiFi' },
    { value: 'cellular', label: '基站直连（自动选网）' },
  ]
})

function clampDraftConstraints(next) {
  const reader = isUsbSimReader(deviceById(next.device_id))
  if (next.task_type === 'call') next.environment = 'vowifi'
  if (reader || !developer.value) {
    next.environment = 'vowifi'
    if (next.task_type === 'public_ip') next.task_type = 'sms'
  }
  if (next.task_type === 'public_ip') next.environment = 'cellular'
  if (!next.duration_seconds) next.duration_seconds = 10
  return next
}

async function load(initial = false) {
  const requestId = ++loadRequestId
  if (initial) loading.value = true
  try {
    const jobs = [
      fetchAutomaticTasks(),
      fetchAutomaticTaskDevices(),
    ]
    if (!systemInfoLoaded) {
      jobs.push(onewifiFetch('/api/system/info', { trackLoading: false }).catch(() => ({})))
    }
    const [nextTasks, nextDevices, info] = await Promise.all(jobs)
    if (requestId !== loadRequestId) return false
    tasks.value = nextTasks
    devices.value = nextDevices
    if (info) {
      developer.value = Boolean(info?.developer)
      systemInfoLoaded = true
    }
    return true
  } catch (err) {
    if (requestId !== loadRequestId) return false
    if (initial) showToast(err?.message || '无法读取自动任务', 'error')
    return false
  } finally {
    if (initial && requestId === loadRequestId) loading.value = false
  }
}

async function loadRuns(page = runsPage.value, notify = false) {
  const requestId = ++runsRequestId
  try {
    const data = await fetchAutomaticTaskRuns({
      limit: runsPageSize,
      offset: (page - 1) * runsPageSize,
    })
    if (requestId !== runsRequestId) return false
    const pages = Math.max(1, Math.ceil((data.total || 0) / runsPageSize))
    if (page > pages) {
      runsPage.value = pages
      return loadRuns(pages, notify)
    }
    runs.value = data.runs || []
    runsTotal.value = data.total || 0
    runsPage.value = page
    return true
  } catch (err) {
    if (requestId !== runsRequestId) return false
    if (notify) showToast(err?.message || '无法读取执行记录', 'error')
    return false
  }
}

async function loadProfiles(deviceId, keepICCID = '') {
  if (!deviceId) {
    profileGuard.invalidate()
    profiles.value = []
    profileLoading.value = false
    return
  }
  const requestID = profileGuard.begin()
  profiles.value = []
  profileLoading.value = true
  const currentICCID = currentDeviceICCID(deviceById(deviceId))
  try {
    let payload = await fetchOnewifiEsimChipCached(deviceId)
    let options = buildAutomaticTaskProfileOptions(payload, currentICCID)
    if (!options.length) {
      payload = await fetchOnewifiEsimChip(deviceId)
      if (!profileGuard.isCurrent(requestID)) return
      options = buildAutomaticTaskProfileOptions(payload, currentICCID)
    }
    if (!profileGuard.isCurrent(requestID)) return
    profiles.value = options
    const selected = selectAutomaticTaskProfileOption(options, keepICCID)
    if (selected && draft.value.device_id === deviceId) {
      draft.value = { ...draft.value, profile_iccid: selected.iccid, profile_aid: selected.aidHex }
    }
  } catch (err) {
    if (!profileGuard.isCurrent(requestID)) return
    profiles.value = buildAutomaticTaskProfileOptions({}, currentICCID)
    if (!profiles.value.length) showToast(err?.message || '无法读取 SIM / Profile', 'error')
  } finally {
    if (profileGuard.isCurrent(requestID)) profileLoading.value = false
  }
}

function resetDraft() {
  draftSessionId += 1
  profileGuard.invalidate()
  profileLoading.value = false
  profiles.value = []
  draft.value = emptyDraft(firstBoundLineId())
  if (draft.value.device_id) void loadProfiles(draft.value.device_id)
}

function edit(task) {
  draftSessionId += 1
  const deviceId = task?.device_id || firstBoundLineId()
  const next = clampDraftConstraints({
    id: Number(task.id) || 0,
    name: task.name || '',
    enabled: Boolean(task.enabled),
    device_id: deviceId,
    profile_iccid: task.profile_iccid || '',
    profile_aid: task.profile_aid || '',
    task_type: task.task_type || 'sms',
    environment: task.environment || 'vowifi',
    interval_days: Number(task.interval_days) || 1,
    start_date: task.start_date || localDate(),
    run_time: task.run_time || localTime(),
    retry_count: Number(task.retry_count) || 0,
    notify: Boolean(task.notify),
    phone: task.payload?.phone || '',
    message: task.payload?.message || '',
    duration_seconds: Number(task.payload?.duration_seconds) || 10,
  })
  draft.value = next
  void loadProfiles(deviceId, next.profile_iccid)
}

function chooseDevice(deviceId) {
  const device = deviceById(deviceId)
  if (device && !lineActionId(device)) {
    showToast(lineActionBlockReason(device), 'error')
    return
  }
  draft.value = clampDraftConstraints({
    ...draft.value,
    device_id: deviceId,
    profile_iccid: '',
    profile_aid: '',
  })
  void loadProfiles(deviceId)
}

function chooseProfile(iccid) {
  const selected = profiles.value.find((profile) => profile.iccid === iccid)
  draft.value = {
    ...draft.value,
    profile_iccid: iccid,
    profile_aid: selected?.aidHex || '',
  }
}

function chooseTaskType(taskType) {
  draft.value = clampDraftConstraints({ ...draft.value, task_type: taskType })
}

function toSaveBody() {
  return {
    id: draft.value.id,
    name: draft.value.name.trim(),
    enabled: Boolean(draft.value.enabled),
    device_id: draft.value.device_id,
    profile_iccid: draft.value.profile_iccid,
    profile_aid: draft.value.profile_aid || '',
    task_type: draft.value.task_type,
    environment: draft.value.environment,
    interval_days: Number(draft.value.interval_days) || 1,
    start_date: draft.value.start_date,
    run_time: draft.value.run_time,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai',
    retry_count: Number(draft.value.retry_count) || 0,
    notify: Boolean(draft.value.notify),
    payload: {
      phone: draft.value.phone,
      message: draft.value.message,
      duration_seconds: Number(draft.value.duration_seconds) || 10,
    },
  }
}

async function save() {
  if (!draft.value.name.trim()) {
    showToast('请输入任务名称', 'error')
    return
  }
  if (!draft.value.device_id) {
    showToast('请选择设备', 'error')
    return
  }
  if (!draft.value.profile_iccid) {
    showToast('请选择 SIM 卡或 eSIM Profile', 'error')
    return
  }
  if (selectedIsReader.value && (draft.value.environment !== 'vowifi' || draft.value.task_type === 'public_ip')) {
    showToast('USB SIM读卡器仅支持 VoWiFi 短信与通话任务', 'error')
    return
  }
  if (draft.value.task_type !== 'public_ip' && !String(draft.value.phone).trim()) {
    showToast('请输入号码', 'error')
    return
  }
  if (draft.value.task_type === 'sms' && !String(draft.value.message).trim()) {
    showToast('请输入短信内容', 'error')
    return
  }
  const sessionId = draftSessionId
  const body = toSaveBody()
  const wasEditing = Boolean(body.id)
  saving.value = true
  try {
    await saveAutomaticTask(body)
    showToast(wasEditing ? `「${body.name}」已更新` : `「${body.name}」已创建`)
    if (sessionId === draftSessionId) {
      resetDraft()
    }
    await load()
    await loadRuns(1, true)
  } catch (err) {
    showToast(err?.message || `「${body.name}」保存失败`, 'error')
  } finally {
    saving.value = false
  }
}

async function toggle(task) {
  if (!task?.id || isTaskBusy(task.id)) return
  setTaskBusy(task.id, true)
  try {
    await saveAutomaticTask({
      id: task.id,
      name: task.name,
      enabled: !task.enabled,
      device_id: task.device_id,
      profile_iccid: task.profile_iccid,
      profile_aid: task.profile_aid || '',
      task_type: task.task_type,
      environment: task.environment,
      interval_days: task.interval_days,
      start_date: task.start_date,
      run_time: task.run_time,
      timezone: task.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai',
      retry_count: task.retry_count,
      notify: task.notify,
      payload: {
        phone: task.payload?.phone || '',
        message: task.payload?.message || '',
      },
    })
    await load()
  } catch (err) {
    showToast(err?.message || '无法切换任务', 'error')
  } finally {
    setTaskBusy(task.id, false)
  }
}

async function runNow(task) {
  if (!task?.id || isTaskBusy(task.id)) return
  if (!window.confirm(`现在执行「${task.name}」？`)) return
  setTaskBusy(task.id, true)
  try {
    await runAutomaticTask(task.id)
    showToast('任务已加入设备队列')
    await load()
    await loadRuns(1, true)
  } catch (err) {
    showToast(err?.message || '执行失败', 'error')
  } finally {
    setTaskBusy(task.id, false)
  }
}

async function remove(task) {
  if (!task?.id || isTaskBusy(task.id)) return
  if (!window.confirm('确定删除这个自动任务吗？')) return
  setTaskBusy(task.id, true)
  try {
    await deleteAutomaticTask(task.id)
    showToast('自动任务已删除')
    if (Number(draft.value.id) === Number(task.id)) resetDraft()
    await load()
    await loadRuns(runsPage.value, true)
  } catch (err) {
    showToast(err?.message || '删除失败', 'error')
  } finally {
    setTaskBusy(task.id, false)
  }
}

const runsPages = computed(() => Math.max(1, Math.ceil(runsTotal.value / runsPageSize)))

onMounted(async () => {
  await load(true)
  await loadRuns(1, true)
  resetDraft()
  startKeepalivePoll()
  document.addEventListener('visibilitychange', onKeepaliveVisibility)
})

function keepalivePageVisible() {
  return document.visibilityState !== 'hidden'
}

function startKeepalivePoll() {
  stopKeepalivePoll()
  if (!keepalivePageVisible()) return
  pollTimer = window.setInterval(() => {
    void load()
    void loadRuns(runsPage.value)
  }, 5000)
}

function stopKeepalivePoll() {
  if (pollTimer) window.clearInterval(pollTimer)
  pollTimer = 0
}

function onKeepaliveVisibility() {
  if (keepalivePageVisible()) {
    startKeepalivePoll()
    void load()
    void loadRuns(runsPage.value)
    return
  }
  stopKeepalivePoll()
}

onBeforeUnmount(() => {
  profileGuard.invalidate()
  document.removeEventListener('visibilitychange', onKeepaliveVisibility)
  stopKeepalivePoll()
})
</script>

<template>
  <div class="ow-page">
    <OwPageHead
      title="保号"
      :desc="developer ? '按周期使用指定 SIM / eSIM，排队执行短信或漫游公网 IP。' : '按周期使用指定 SIM / eSIM，排队执行短信。'"
    />

    <div class="ow-lab-grid">
      <OwGlassPanel :title="draft.id ? '编辑任务' : '添加任务'" icon="add" :desc="devices.length ? '执行前会校验目标 SIM / Profile。号码只显示尾 4。' : '还没有设备，先到设备页接入模组。'">
        <div class="ow-form-grid">
          <label class="ow-field"><span>任务名称</span><input v-model="draft.name" placeholder="例如：每日短信保活" /></label>
          <label class="ow-field">
            <span>设备</span>
            <select :value="draft.device_id" :disabled="!devices.length" @change="chooseDevice($event.target.value)">
              <option v-if="!devices.length" value="">暂无设备</option>
              <option v-for="device in devices" :key="device.id" :value="lineActionId(device)" :disabled="!lineActionId(device)">
                {{ device.name || device.id }}{{ lineActionId(device) ? '' : '（未绑定线路）' }}
              </option>
            </select>
          </label>
          <label class="ow-field">
            <span>SIM / Profile</span>
            <select :value="draft.profile_iccid" :disabled="profileLoading || !draft.device_id" @change="chooseProfile($event.target.value)">
              <option value="">{{ profileLoading ? '读取 Profile 中…' : '请选择 SIM / Profile' }}</option>
              <option v-for="profile in profiles" :key="profile.iccid" :value="profile.iccid">{{ profile.label }}</option>
            </select>
          </label>
          <label class="ow-field">
            <span>任务类型</span>
            <select :value="draft.task_type" @change="chooseTaskType($event.target.value)">
              <option v-for="option in taskTypeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
          <label class="ow-field">
            <span>执行环境</span>
            <select v-model="draft.environment" :disabled="draft.task_type === 'public_ip' || draft.task_type === 'call' || selectedIsReader">
              <option v-for="option in environmentOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
          <label v-if="draft.task_type === 'sms' || draft.task_type === 'call'" class="ow-field"><span>号码</span><input v-model="draft.phone" placeholder="+447700900123" /></label>
          <label v-if="draft.task_type === 'call'" class="ow-field"><span>通话时长（秒）</span><input v-model.number="draft.duration_seconds" type="number" min="5" max="60" /></label>
          <label class="ow-field"><span>首次执行日期</span><input v-model="draft.start_date" type="date" /></label>
          <label class="ow-field"><span>执行时间</span><input v-model="draft.run_time" type="time" /></label>
          <label class="ow-field"><span>执行周期（天）</span><input v-model.number="draft.interval_days" type="number" min="1" max="365" /></label>
          <label class="ow-field">
            <span>失败重试次数</span>
            <select v-model.number="draft.retry_count">
              <option v-for="count in 11" :key="count - 1" :value="count - 1">{{ count - 1 }} 次</option>
            </select>
          </label>
        </div>
        <label v-if="draft.task_type === 'sms'" class="ow-field" style="margin-top: 12px">
          <span>短信内容</span>
          <textarea v-model="draft.message" rows="3" />
        </label>
        <p v-if="selectedIsReader" class="ow-page__sub" style="margin-top: 12px">USB SIM读卡器仅支持 VoWiFi 短信与通话任务。</p>
        <p v-else-if="draft.task_type === 'call'" class="ow-page__sub" style="margin-top: 12px">通话任务走 VoWiFi IMS：拨打后保持设定秒数再挂断。</p>
        <p v-else-if="developer && draft.task_type === 'public_ip'" class="ow-page__sub" style="margin-top: 12px">该任务固定使用基站直连；执行时会开启漫游数据。</p>
        <label class="ow-row" style="margin-top: 12px">
          <span>启用任务</span>
          <input v-model="draft.enabled" type="checkbox" />
        </label>
        <label class="ow-row">
          <span>完成后推送通知</span>
          <input v-model="draft.notify" type="checkbox" />
        </label>
        <div class="ow-page__actions" style="margin-top: 12px">
          <button type="button" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" :disabled="saving || !devices.length" @click="save">
            <MIcon name="add" size="sm" />
            {{ saving ? '保存中…' : '保存' }}
          </button>
          <button v-if="draft.id" type="button" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" @click="resetDraft">取消编辑</button>
        </div>
      </OwGlassPanel>

      <OwGlassPanel title="已配置的任务" icon="timer" icon-tone="blue">
        <div v-if="loading && !tasks.length" class="ow-page__empty glass-frame glass-frame--compact">加载中…</div>
        <div v-else-if="!tasks.length" class="ow-page__empty glass-frame glass-frame--compact">暂无自动任务。添加后会按设备排队执行。</div>
        <div v-else class="ow-list">
          <article v-for="task in tasks" :key="task.id" class="ow-item glass-frame glass-frame--compact">
            <span class="panel-title-icon panel-title-icon--teal" aria-hidden="true"><MIcon name="timer" size="sm" /></span>
            <div class="ow-item__body">
              <span class="ow-item__name">{{ task.name }}</span>
              <span class="ow-item__meta">
                {{ deviceById(task.device_id)?.name || task.device_id }} · {{ maskTail4(task.profile_iccid) }} ·
                {{ taskTypeLabel(task.task_type) }} · {{ environmentLabel(task.environment) }} ·
                每 {{ task.interval_days }} 天 {{ task.run_time }} ·
                下次 {{ formatDateTime(task.next_run_at) }}
                <template v-if="task.last_status"> · 上次 {{ task.last_status === 'success' ? '成功' : '失败' }}</template>
              </span>
            </div>
            <div class="ow-item__actions">
              <button type="button" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" :disabled="isTaskBusy(task.id)" @click="toggle(task)">
                <MIcon name="power_settings_new" size="sm" />
                {{ task.enabled ? '停用' : '启用' }}
              </button>
              <button type="button" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" :disabled="isTaskBusy(task.id)" @click="runNow(task)">
                <MIcon name="play_arrow" size="sm" />立即执行
              </button>
              <button type="button" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" @click="edit(task)">
                <MIcon name="edit" size="sm" />编辑
              </button>
              <button type="button" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" :disabled="isTaskBusy(task.id)" @click="remove(task)">
                <MIcon name="delete" size="sm" />删除
              </button>
            </div>
          </article>
        </div>
      </OwGlassPanel>
    </div>

    <OwGlassPanel title="最近执行记录" icon="article" icon-tone="purple">
      <div v-if="!runs.length" class="ow-page__empty glass-frame glass-frame--compact">暂无执行记录。</div>
      <div v-else class="ow-list">
        <article v-for="run in runs" :key="run.id" class="ow-item glass-frame glass-frame--compact">
          <span class="panel-title-icon panel-title-icon--purple" aria-hidden="true"><MIcon name="clipboard" size="sm" /></span>
          <div class="ow-item__body">
            <span class="ow-item__name">{{ taskById(run.task_id)?.name || `#${run.task_id}` }}</span>
            <span class="ow-item__meta">
              {{ deviceById(run.device_id)?.name || run.device_id }} · {{ runStatusLabel(run.status) }} ·
              {{ formatDateTime(run.scheduled_at) }} · 尝试 {{ run.attempts }}
              <template v-if="run.error || run.output"> · {{ run.error || run.output }}</template>
            </span>
          </div>
        </article>
      </div>
      <div v-if="runsTotal > runsPageSize" class="ow-page__actions" style="margin-top: 12px">
        <button type="button" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" :disabled="runsPage <= 1" @click="loadRuns(runsPage - 1)">上一页</button>
        <span class="ow-page__sub">{{ runsPage }} / {{ runsPages }}</span>
        <button type="button" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" :disabled="runsPage >= runsPages" @click="loadRuns(runsPage + 1)">下一页</button>
      </div>
    </OwGlassPanel>
  </div>
</template>
