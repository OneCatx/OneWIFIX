<script setup>
import { computed, ref } from 'vue'
import MIcon from './MIcon.vue'
import { useAppStore } from '../stores/app'
import { fetchDiscoveredOnewifiDevices, registerOnewifiDevice } from '../api/onewifiDevices'
import { addDeviceDefaults, addDeviceRegisterConfig, discoveredRosterLabel, discoveryIssueText } from './addDeviceCard.js'

const emit = defineEmits(['registered'])
const { showToast } = useAppStore()
const open = ref(false)
const status = ref('idle')
const error = ref('')
const devices = ref([])
const selectedKey = ref('')
const name = ref('')
const deviceId = ref('')
const deviceType = ref('')
const saving = ref(false)
let dialogRequestId = 0

const availableDevices = computed(() => devices.value.filter((device) => !device.configured))
const selected = computed(() => devices.value.find((device) => device.discovery_key === selectedKey.value) || null)
const canSubmit = computed(() => Boolean(selected.value && deviceId.value.trim() && name.value.trim() && deviceType.value && !saving.value))

async function openDialog() {
  const requestId = ++dialogRequestId
  open.value = true
  status.value = 'loading'
  error.value = ''
  try {
    const discovered = await fetchDiscoveredOnewifiDevices()
    if (requestId !== dialogRequestId || !open.value) return
    devices.value = discovered
    const first = availableDevices.value[0]
    if (first) selectDevice(first)
    status.value = 'ready'
  } catch (caught) {
    if (requestId !== dialogRequestId || !open.value) return
    error.value = caught?.message || '无法读取待登记模组'
    status.value = 'error'
  }
}

function closeDialog() {
  if (!saving.value) {
    dialogRequestId += 1
    open.value = false
  }
}

function selectDevice(device) {
  if (!device) return
  const defaults = addDeviceDefaults(device)
  selectedKey.value = defaults.selectedKey
  deviceId.value = defaults.deviceId
  name.value = defaults.name
  deviceType.value = defaults.deviceType
}

async function submit() {
  if (!canSubmit.value) return
  saving.value = true
  error.value = ''
  try {
    await registerOnewifiDevice(addDeviceRegisterConfig(selected.value, {
      id: deviceId.value,
      name: name.value,
      deviceType: deviceType.value,
    }))
    showToast('设备登记成功', 'success')
    open.value = false
    emit('registered')
  } catch (caught) {
    error.value = caught?.message || '设备登记失败'
    showToast(error.value, 'error')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <button type="button" class="device-card device-card--add glass-frame" aria-labelledby="add-device-title" @click="openDialog">
    <span class="device-card__add-icon" aria-hidden="true"><MIcon name="add" /></span>
    <strong id="add-device-title">新增设备</strong>
    <span>登记已发现模组</span>
  </button>

  <Teleport to="body">
    <div v-if="open" class="add-device-overlay" @click.self="closeDialog">
      <section class="add-device-dialog glass-frame" role="dialog" aria-modal="true" aria-labelledby="add-device-dialog-title">
        <header><div><p>设备登记</p><h2 id="add-device-dialog-title">新增设备</h2></div><button type="button" aria-label="关闭" :disabled="saving" @click="closeDialog">×</button></header>
        <div v-if="status === 'loading'" class="add-device-state" role="status">扫描真实模组中…</div>
        <div v-else-if="status === 'error'" class="add-device-state add-device-state--error" role="alert">{{ error }}</div>
        <form v-else class="add-device-form" @submit.prevent="submit">
          <label><span>已发现模组</span><select v-model="selectedKey" required @change="selectDevice(devices.find((item) => item.discovery_key === selectedKey))"><option value="" disabled>选择已发现模组</option><option v-for="device in devices" :key="device.discovery_key" :value="device.discovery_key" :disabled="device.configured">{{ discoveredRosterLabel(device) }}</option></select></label>
          <label><span>设备编号</span><input v-model.trim="deviceId" maxlength="64" required /></label>
          <label><span>设备名称</span><input v-model.trim="name" maxlength="64" required /></label>
          <label><span>设备类型</span><select v-model="deviceType" required><option value="" disabled>选择设备类型</option><option value="pcie_ec20_ec25">PCIe EC20/EC25</option><option value="dji_4g">DJI 4G</option><option value="wifi_410">WiFi 410</option><option value="usb_sim_reader">USB SIM 读卡器</option></select></label>
          <p v-if="selected?.discovery_issue" class="add-device-state add-device-state--error">{{ discoveryIssueText(selected.discovery_issue) }}</p>
          <p v-if="!availableDevices.length" class="add-device-state">暂无可登记模组</p>
          <p v-if="error" class="add-device-state add-device-state--error" role="alert">{{ error }}</p>
          <footer><button type="button" :disabled="saving" @click="closeDialog">取消</button><button type="submit" :disabled="!canSubmit">{{ saving ? '登记中…' : '登记设备' }}</button></footer>
        </form>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.device-card--add { align-items: flex-start; justify-content: flex-start; gap: 8px; min-height: 176px; padding: 14px 16px; border: 1px dashed rgba(52, 211, 153, .38); color: inherit; text-align: left; cursor: pointer; }
.device-card--add strong { font-size: 15px; }
.device-card--add > span:last-child { color: rgba(203, 213, 225, .62); font-size: 11px; }
.device-card__add-icon { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 9px; color: #6ee7b7; background: rgba(52, 211, 153, .12); }
.add-device-overlay { position: fixed; inset: 0; z-index: 1250; display: grid; place-items: center; padding: 20px; background: rgba(3, 5, 12, .66); backdrop-filter: blur(12px); }
.add-device-dialog { width: min(520px, 100%); padding: 20px; border-radius: 20px; color: var(--text-primary, #f8fafc); }
.add-device-dialog header, .add-device-dialog footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.add-device-dialog header p { margin: 0 0 3px; color: #6ee7b7; font-size: 11px; letter-spacing: .1em; }
.add-device-dialog h2 { margin: 0; font-size: 21px; }
.add-device-dialog header button { width: 32px; height: 32px; border: 0; border-radius: 9px; background: rgba(255,255,255,.06); color: inherit; font-size: 22px; cursor: pointer; }
.add-device-form { display: grid; gap: 12px; margin-top: 20px; }
.add-device-form label { display: grid; gap: 6px; color: rgba(203,213,225,.68); font-size: 12px; }
.add-device-form input, .add-device-form select { width: 100%; box-sizing: border-box; padding: 10px; border: 1px solid rgba(148,163,184,.22); border-radius: 9px; background: rgba(0,0,0,.16); color: inherit; font: inherit; }
.add-device-state { display: grid; min-height: 150px; place-items: center; color: rgba(203,213,225,.68); font-size: 13px; }
.add-device-state--error { min-height: auto; color: #fca5a5; }
.add-device-dialog footer { justify-content: flex-end; margin-top: 8px; }
.add-device-dialog footer button { padding: 9px 14px; border: 1px solid rgba(148,163,184,.24); border-radius: 9px; background: rgba(255,255,255,.06); color: inherit; cursor: pointer; }
.add-device-dialog footer button:last-child { border-color: rgba(52,211,153,.4); background: rgba(52,211,153,.14); color: #6ee7b7; }
.add-device-dialog button:disabled { opacity: .5; cursor: not-allowed; }
</style>
