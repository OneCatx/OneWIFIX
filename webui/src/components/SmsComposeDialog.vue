<script setup>
import { ref } from 'vue'
import { onMounted } from 'vue'
import { fileToMMSAttachment, sendMMS, fetchAddressBook } from '../api/onewifiEnhancements.js'

const props = defineProps({
  devices: { type: Array, required: true },
  selectedDeviceId: { type: String, required: true },
  sending: { type: Boolean, default: false },
  error: { type: String, default: '' },
  sendNew: { type: Function, required: true },
  selectContact: { type: Function, required: true },
  showToast: { type: Function, required: true },
})
const composeOpen = ref(false)
const composeDeviceId = ref('')
const composeTo = ref('')
const composeBody = ref('')
const composeFiles = ref([])
const addressBook = ref([])
const addressFilter = ref('')
let composeSessionId = 0

onMounted(async () => {
  try {
    const payload = await fetchAddressBook()
    addressBook.value = payload?.data?.contacts || []
  } catch {
    addressBook.value = []
  }
})

function pickAddress(number) {
  composeTo.value = number
}

function openCompose() {
  composeSessionId += 1
  composeDeviceId.value = props.selectedDeviceId !== 'all'
    ? props.selectedDeviceId
    : (props.devices[0]?.id || '')
  composeTo.value = ''
  composeBody.value = ''
  composeFiles.value = []
  composeOpen.value = true
}

function closeCompose() {
  composeSessionId += 1
  composeOpen.value = false
  composeFiles.value = []
}

function onPickFiles(event) {
  const files = Array.from(event.target?.files || [])
  composeFiles.value = files
  event.target.value = ''
}

async function onSendCompose() {
  const sessionId = composeSessionId
  const deviceId = composeDeviceId.value
  const to = composeTo.value
  const text = composeBody.value
  const files = composeFiles.value
  if (files.length) {
    try {
      const attachments = await Promise.all(files.map((file) => fileToMMSAttachment(file)))
      await sendMMS({
        device_id: deviceId,
        to,
        subject: '',
        body: text,
        attachments,
      })
      if (sessionId !== composeSessionId) return
      props.showToast('彩信已发出', 'success')
      closeCompose()
    } catch (err) {
      props.showToast(err?.message || '彩信发送失败', 'error')
    }
    return
  }
  const result = await props.sendNew({
    deviceId,
    to,
    text,
  })
  if (sessionId !== composeSessionId || !composeOpen.value
    || composeDeviceId.value !== deviceId || composeTo.value !== to || composeBody.value !== text) return
  if (result?.ok) {
    props.showToast(result.label || '短信已发送', 'success')
    closeCompose()
    if (result.contactKey) await props.selectContact(result.contactKey)
  } else if (result?.error || props.error) {
    props.showToast(result?.error || props.error, 'error')
  }
}

defineExpose({ composeOpen, openCompose, closeCompose })
</script>

<template>
  <Teleport to="body">
    <div v-if="composeOpen" class="ow-dialog-overlay" @click.self="closeCompose">
      <div class="ow-dialog glass-frame panel-card panel-neutral" role="dialog" aria-labelledby="sms-compose-title">
        <header class="ow-dialog__head">
          <div>
            <h2 id="sms-compose-title">发送测试短信</h2>
            <p>选一条线路，填对方号码和内容。号码只显示尾 4。</p>
          </div>
          <button type="button" class="ow-dialog__close" aria-label="关闭" @click="closeCompose">×</button>
        </header>
        <div class="ow-form-grid">
          <label class="ow-field">
            <span>发送设备</span>
            <select v-model="composeDeviceId">
              <option value="">选择设备</option>
              <option v-for="device in devices" :key="device.id" :value="device.id">{{ device.name || device.id }}</option>
            </select>
          </label>
          <label class="ow-field">
            <span>目标号码</span>
            <input v-model="composeTo" class="mono" type="tel" placeholder="+12025550177" />
            <div v-if="addressBook.length" class="ow-address-book">
              <input v-model="addressFilter" type="search" placeholder="从通讯录选择…" />
              <div class="ow-address-book__list">
                <button
                  v-for="c in addressBook.filter((c) => !addressFilter || c.name.includes(addressFilter) || (c.numbers || []).some((n) => n.includes(addressFilter))).slice(0, 8)"
                  :key="c.id"
                  type="button"
                  class="ow-address-book__item"
                  @click="pickAddress((c.numbers && c.numbers[0]) || '')"
                >
                  {{ c.name }} · {{ (c.numbers && c.numbers[0]) || '' }}
                </button>
              </div>
            </div>
          </label>
        </div>
        <label class="ow-field" style="margin-top: 12px">
          <span>短信内容</span>
          <textarea v-model="composeBody" rows="4" placeholder="输入短信内容，有图片时按彩信发送" />
        </label>
        <label class="ow-field" style="margin-top: 12px">
          <span>彩信附件（可选）</span>
          <input type="file" multiple accept="image/*,audio/*,video/*" @change="onPickFiles" />
          <small v-if="composeFiles.length">{{ composeFiles.map((f) => f.name).join('、') }}</small>
        </label>
        <footer class="ow-dialog__foot">
          <button type="button" class="ow-theme-chip glass-frame glass-frame--compact" @click="closeCompose">取消</button>
          <button
            type="button"
            class="ow-theme-chip glass-frame glass-frame--compact"
            :class="{ 'is-active': Boolean(composeDeviceId && composeTo.trim() && (composeBody.trim() || composeFiles.length)) }"
            :disabled="sending || !composeDeviceId || !composeTo.trim() || !(composeBody.trim() || composeFiles.length)"
            @click="onSendCompose"
          >
            {{ sending ? '发送中…' : (composeFiles.length ? '发彩信' : '发送') }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ow-address-book { margin-top: 8px; }
.ow-address-book__list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.ow-address-book__item { font-size: 12px; padding: 4px 8px; border-radius: 999px; border: 1px solid rgba(148,163,184,.35); background: transparent; cursor: pointer; }
</style>
