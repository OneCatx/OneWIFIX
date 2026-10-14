<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  fetchOnewifiLogHistory,
  fetchOnewifiLoggingSettings,
  saveOnewifiLoggingSettings,
} from '../api/onewifiGateway'
import { useAppStore } from '../stores/app'
import OwGlassPanel from '../components/OwGlassPanel.vue'
import OwPageHead from '../components/OwPageHead.vue'
import MIcon from '../components/MIcon.vue'
import {
  appendRuntimeLog,
  coalesceRuntimeLogs,
  filterRuntimeLogs,
  formatLogLine,
  formatLogReminder,
  formatLogTime,
  logTone,
  logToneIcon,
  logToneLabel,
  parseLogStreamFrame,
} from '../utils/runtimeLogs'
import '../assets/onewifi-pages.css'

const { showToast } = useAppStore()
const onewifiLogs = ref([])
const loading = ref(false)
const connected = ref(false)
const paused = ref(false)
const autoTail = ref(true)
const memoryOnly = ref(false)
const messageOnly = ref(false)
const showAllLevels = ref(false)
const search = ref('')
const connError = ref('')
const logBox = ref(null)
const retention = ref({ mode: 'unlimited', count: 10000, days: 30, stored_logs: 0 })
const retentionSaving = ref(false)

let eventSource = null

const filtered = computed(() => filterRuntimeLogs(onewifiLogs.value, {
  search: search.value,
  messageOnly: messageOnly.value,
  problemsOnly: !showAllLevels.value,
  includeAccess: showAllLevels.value,
}))

function closeStream() {
  eventSource?.close()
  eventSource = null
  connected.value = false
}

function onFrame(event) {
  if (paused.value) return
  const entry = parseLogStreamFrame(event.data)
  if (!entry) return
  onewifiLogs.value = appendRuntimeLog(onewifiLogs.value, entry)
}

function connect() {
  closeStream()
  const streamUrl = showAllLevels.value ? '/api/logs/stream' : '/api/logs/stream?level=warn'
  const sourceStream = new EventSource(streamUrl)
  eventSource = sourceStream
  sourceStream.addEventListener('connected', () => {
    connected.value = true
    connError.value = ''
  })
  sourceStream.onopen = () => {
    connected.value = true
    connError.value = ''
  }
  sourceStream.onerror = () => {
    connected.value = false
    connError.value = '连接中断，正在尝试重连…'
  }
  sourceStream.addEventListener('log', onFrame)
  sourceStream.onmessage = onFrame
}

async function loadHistory() {
  if (memoryOnly.value) return
  loading.value = true
  try {
    onewifiLogs.value = coalesceRuntimeLogs(await fetchOnewifiLogHistory({
      lines: 500,
      level: showAllLevels.value ? '' : 'warn',
    }))
  } catch {
    /* 历史回填失败不阻塞实时流 */
  } finally {
    loading.value = false
  }
}

async function loadRetention() {
  try {
    const data = await fetchOnewifiLoggingSettings()
    retention.value = {
      mode: data?.mode || 'unlimited',
      count: Number(data?.count) || 10000,
      days: Number(data?.days) || 30,
      stored_logs: Number(data?.stored_logs) || 0,
    }
  } catch (err) {
    showToast(err?.message || '日志保留策略加载失败', 'error')
  }
}

async function saveRetention() {
  retentionSaving.value = true
  try {
    const data = await saveOnewifiLoggingSettings({
      mode: retention.value.mode,
      count: Math.max(1, Math.trunc(Number(retention.value.count)) || 1),
      days: Math.max(1, Math.trunc(Number(retention.value.days)) || 1),
    })
    retention.value = {
      mode: data?.mode || retention.value.mode,
      count: Number(data?.count) || retention.value.count,
      days: Number(data?.days) || retention.value.days,
      stored_logs: Number(data?.stored_logs) || 0,
    }
    showToast('日志保留策略已保存')
  } catch (err) {
    showToast(err?.message || '日志保留策略保存失败', 'error')
  } finally {
    retentionSaving.value = false
  }
}

function onRefresh() {
  void loadHistory()
  if (!paused.value) connect()
}

function clearLogs() {
  onewifiLogs.value = []
}

function exportLogs() {
  const text = filtered.value.map((entry) => formatLogLine(entry)).join('\n')
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `logs-${new Date().toISOString().slice(0, 10)}.txt`
  link.click()
  URL.revokeObjectURL(url)
  showToast('已导出日志')
}

function rowTone(entry) {
  return logTone(entry?.level)
}

watch(showAllLevels, () => {
  void loadHistory()
  if (!paused.value) connect()
})

watch([filtered, autoTail, paused], async () => {
  if (!autoTail.value || paused.value) return
  await nextTick()
  const el = logBox.value
  if (el) el.scrollTop = el.scrollHeight
})

onMounted(async () => {
  await Promise.all([loadHistory(), loadRetention()])
  if (!paused.value) connect()
})

onBeforeUnmount(() => {
  closeStream()
})
</script>

<template>
  <div class="ow-page ow-logs">
    <OwPageHead title="问题日志" desc="同类告警只提醒一次，不再轮询。访问流水默认不显示。" />

    <div class="ow-log-toolbar glass-frame">
      <label class="ow-log-search">
        <MIcon name="search" size="sm" />
        <input v-model="search" type="search" placeholder="搜索告警、失败、重试…" />
      </label>
      <label class="ow-log-check"><input v-model="memoryOnly" type="checkbox" />仅内存</label>
      <label class="ow-log-check"><input v-model="autoTail" type="checkbox" />自动翻滚</label>
      <label class="ow-log-check"><input v-model="messageOnly" type="checkbox" />仅内容</label>
      <label class="ow-log-check"><input v-model="showAllLevels" type="checkbox" />显示全部级别</label>
      <div class="ow-log-toolbar__actions">
        <button type="button" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" :disabled="loading" @click="onRefresh">
          <MIcon name="sync" size="sm" />刷新
        </button>
        <button type="button" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" @click="clearLogs">
          <MIcon name="delete" size="sm" />清空
        </button>
        <button type="button" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" @click="exportLogs">
          <MIcon name="system_update_alt" size="sm" />导出
        </button>
      </div>
    </div>
    <p v-if="connError && !connected" class="ow-page__sub">{{ connError }}</p>

    <OwGlassPanel icon="article" icon-tone="teal">
      <div class="ow-log-stream-head">
        <h3>问题与告警</h3>
        <span class="ow-log-count">{{ filtered.length }} 条</span>
      </div>
      <div ref="logBox" class="ow-log-stream" role="log">
        <p v-if="loading && !filtered.length" class="ow-log-empty">读取中…</p>
        <p v-else-if="!filtered.length" class="ow-log-empty">暂时没有告警或失败。访问流水已隐藏。</p>
        <article
          v-for="(entry, index) in filtered"
          :key="`${entry.time}-${index}-${entry.message}`"
          class="ow-log-row"
          :class="`ow-log-row--${rowTone(entry)}`"
        >
          <MIcon :name="logToneIcon(rowTone(entry))" size="sm" />
          <span class="ow-log-row__idx">{{ index + 1 }}</span>
          <span class="ow-log-row__msg">{{ formatLogReminder(entry) || formatLogLine(entry) }}</span>
          <span class="ow-log-row__tone">{{ logToneLabel(rowTone(entry)) }}</span>
          <time class="ow-log-row__time">{{ formatLogTime(entry.time) }}</time>
        </article>
      </div>
    </OwGlassPanel>

    <OwGlassPanel title="日志保留" icon="tune" icon-tone="purple" desc="服务端按条数或天数裁剪持久化日志。">
      <div class="ow-form-grid">
        <label class="ow-field">
          <span>策略</span>
          <select v-model="retention.mode">
            <option value="unlimited">不限制</option>
            <option value="count">按条数</option>
            <option value="days">按天数</option>
          </select>
        </label>
        <label v-if="retention.mode === 'count'" class="ow-field">
          <span>保留条数</span>
          <input v-model.number="retention.count" type="number" min="1" />
        </label>
        <label v-if="retention.mode === 'days'" class="ow-field">
          <span>保留天数</span>
          <input v-model.number="retention.days" type="number" min="1" />
        </label>
      </div>
      <p class="ow-page__sub" style="margin-top: 10px">当前已存 {{ retention.stored_logs }} 条</p>
      <div class="ow-page__actions" style="margin-top: 12px">
        <button type="button" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" :disabled="retentionSaving" @click="saveRetention">
          <MIcon name="tune" size="sm" />
          {{ retentionSaving ? '保存中…' : '保存策略' }}
        </button>
      </div>
    </OwGlassPanel>
  </div>
</template>
