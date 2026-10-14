<script setup>
import { ref } from 'vue'
import { useAppStore } from '../stores/app'

const props = defineProps({
  renameDevice: { type: Function, required: true },
  deleteDevice: { type: Function, required: true },
})
const { showToast } = useAppStore()
const renameTarget = ref(null)
const renameDraft = ref('')
const renameSaving = ref(false)
const deviceDeleting = ref('')

function openDeviceRename(device) {
  if (!device?.id) return
  renameTarget.value = device
  renameDraft.value = String(device.name || device.id || '')
}

function closeDeviceRename() {
  if (renameSaving.value || deviceDeleting.value) return
  renameTarget.value = null
}

async function saveDeviceRename() {
  const device = renameTarget.value
  const name = String(renameDraft.value || '').trim()
  if (!device?.id || !name || renameSaving.value || deviceDeleting.value) return
  renameSaving.value = true
  try {
    await props.renameDevice(device.id, name)
    showToast('设备名称已更新', 'success')
    renameTarget.value = null
  } catch (caught) {
    showToast(caught?.message || '设备名称保存失败', 'error')
  } finally {
    renameSaving.value = false
  }
}

async function onDeleteDevice(device) {
  const id = String(device?.id || '').trim()
  const label = String(device?.name || id || '设备').trim()
  if (!id || deviceDeleting.value) return
  if (!window.confirm(`确定删除设备「${label}」？模组登记会从网关移除。`)) return
  deviceDeleting.value = id
  try {
    await props.deleteDevice(id)
    showToast('设备已删除', 'success')
    if (renameTarget.value?.id === id) renameTarget.value = null
  } catch (caught) {
    showToast(caught?.message || '设备删除失败', 'error')
  } finally {
    deviceDeleting.value = ''
  }
}

defineExpose({ openDeviceRename })
</script>

<template>
  <Teleport to="body">
    <div v-if="renameTarget" class="device-rename-overlay" @click.self="closeDeviceRename">
      <section class="device-rename-dialog glass-frame" role="dialog" aria-modal="true" aria-labelledby="device-rename-title">
        <header>
          <div>
            <p>设备卡片</p>
            <h2 id="device-rename-title">编辑设备名称</h2>
          </div>
          <button type="button" aria-label="关闭" :disabled="renameSaving || Boolean(deviceDeleting)" @click="closeDeviceRename">×</button>
        </header>
        <form class="device-rename-form" @submit.prevent="saveDeviceRename">
          <label>
            <span>显示名称</span>
            <input v-model.trim="renameDraft" type="text" maxlength="64" autocomplete="off" :disabled="renameSaving || Boolean(deviceDeleting)" />
          </label>
          <footer>
            <button
              type="button"
              class="device-rename-delete"
              :disabled="renameSaving || Boolean(deviceDeleting)"
              @click="onDeleteDevice(renameTarget)"
            >
              {{ deviceDeleting === renameTarget.id ? '删除中…' : '删除设备' }}
            </button>
            <button type="button" :disabled="renameSaving || Boolean(deviceDeleting)" @click="closeDeviceRename">取消</button>
            <button type="submit" :disabled="renameSaving || Boolean(deviceDeleting) || !renameDraft.trim()">{{ renameSaving ? '保存中…' : '保存' }}</button>
          </footer>
        </form>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.device-rename-overlay {
  position: fixed;
  inset: 0;
  z-index: 1250;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(3, 5, 12, 0.66);
  backdrop-filter: blur(12px);
}
.device-rename-dialog {
  width: min(420px, 100%);
  padding: 20px;
  border-radius: 20px;
  color: var(--text-primary, #f8fafc);
}
.device-rename-dialog header,
.device-rename-dialog footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.device-rename-dialog header p {
  margin: 0 0 3px;
  color: #6ee7b7;
  font-size: 11px;
  letter-spacing: 0.1em;
}
.device-rename-dialog h2 {
  margin: 0;
  font-size: 21px;
}
.device-rename-dialog header button {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.06);
  color: inherit;
  font-size: 22px;
  cursor: pointer;
}
.device-rename-form {
  display: grid;
  gap: 12px;
  margin-top: 20px;
}
.device-rename-form label {
  display: grid;
  gap: 6px;
  color: rgba(203, 213, 225, 0.68);
  font-size: 12px;
}
.device-rename-form input {
  width: 100%;
  box-sizing: border-box;
  padding: 10px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 9px;
  background: rgba(0, 0, 0, 0.16);
  color: inherit;
  font: inherit;
}
.device-rename-dialog footer {
  justify-content: flex-end;
  margin-top: 8px;
}
.device-rename-dialog footer button {
  padding: 9px 14px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.06);
  color: inherit;
  cursor: pointer;
}
.device-rename-dialog footer .device-rename-delete {
  margin-right: auto;
  padding-left: 0;
  border-color: transparent;
  background: transparent;
  color: #fca5a5;
}
.device-rename-dialog footer .device-rename-delete:hover,
.device-rename-dialog footer .device-rename-delete:focus-visible {
  color: #fecaca;
  outline: none;
}
.device-rename-dialog footer button:last-child {
  border-color: rgba(52, 211, 153, 0.4);
  background: rgba(52, 211, 153, 0.14);
  color: #6ee7b7;
}
.device-rename-dialog button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
