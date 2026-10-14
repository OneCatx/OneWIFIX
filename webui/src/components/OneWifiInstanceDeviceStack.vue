<script setup>
import MIcon from './MIcon.vue'

const props = defineProps({
  devices: { type: Array, required: true },
  selectedDevice: { type: Object, default: null },
  esimHardware: { type: Object, required: true },
  deviceIsSwitching: { type: Function, required: true },
  selectDevice: { type: Function, required: true },
  openDeviceRename: { type: Function, required: true },
})

function isDeviceSelected(device) {
  return props.selectedDevice?.id === device.id
}

function deviceHasProxy(device) {
  const label = String(device?.proxyLabel || '').trim()
  return Boolean(label && label !== '直连')
}

function euiccNameplateForDevice(device) {
  const list = props.esimHardware[device?.id] || []
  return list[0]?.nameplate || ''
}

function euiccSlotsForDevice(device) {
  return (props.esimHardware[device?.id] || []).filter(Boolean)
}
</script>

<template>
  <div
    v-for="device in devices"
    :key="device.id"
    class="device-card-stack"
  >
    <article
      class="device-card glass-frame glass-frame--selectable"
      :class="{
        'is-active': isDeviceSelected(device),
        'is-glow-green': isDeviceSelected(device),
        'is-esim-switching': deviceIsSwitching(device.id),
      }"
      role="button"
      tabindex="0"
      :aria-busy="deviceIsSwitching(device.id) ? 'true' : undefined"
      @click="selectDevice(device.id)"
      @keydown.enter.prevent="selectDevice(device.id)"
    >
      <div class="device-card__lens" aria-hidden="true"></div>
      <div class="device-card__head">
        <div class="device-card__title">
          <span class="device-card__icon"><MIcon name="smartphone" size="sm" /></span>
          <span class="device-card__name">{{ device.name || device.id }}</span>
          <span
            class="device-card__mihomo device-card__plate overview-badge overview-badge--hero glass-frame glass-frame--compact glass-frame--pill"
            :class="{ 'glass-frame--tone-green': deviceHasProxy(device) }"
          >
            <span class="overview-badge__dot" aria-hidden="true"></span>
            <span>{{ device.proxyLabel || '直连' }}</span>
            <em v-if="deviceIsSwitching(device.id)" class="device-card__switch-hint">切卡中</em>
          </span>
        </div>
        <div class="device-card__head-end">
          <span class="device-card__tag device-card__tag--status" :class="device.online ? 'is-online' : 'is-offline'">
            <span class="overview-badge__dot" aria-hidden="true"></span>
            {{ device.online ? '在线' : '离线' }}
          </span>
          <button
            type="button"
            class="device-card__edit runtime-action-btn glass-frame glass-frame--compact glass-frame--pill"
            :aria-label="`编辑设备名称 ${device.name || device.id}`"
            @click.stop="openDeviceRename(device)"
          >
            <MIcon name="edit" size="sm" />
            编辑
          </button>
        </div>
      </div>
      <div v-if="euiccNameplateForDevice(device) || euiccSlotsForDevice(device).length" class="device-card__plates">
        <span
          v-if="euiccNameplateForDevice(device)"
          class="device-card__nameplate device-card__plate overview-badge overview-badge--hero glass-frame glass-frame--compact glass-frame--pill"
          :title="euiccNameplateForDevice(device)"
        >
          <span class="overview-badge__dot" aria-hidden="true"></span>
          <span>{{ euiccNameplateForDevice(device) }}</span>
        </span>
        <span
          v-for="euicc in euiccSlotsForDevice(device)"
          :key="euicc.aidHex || euicc.eid || `slot-${euicc.index}`"
          class="device-card__plate device-card__plate--esim glass-frame glass-frame--compact glass-frame--pill"
          :title="euicc.label || ''"
        >
          <span class="device-card__plate-prefix">eSIM {{ euicc.index + 1 }}</span>
          <template v-if="euicc.freeNvram">
            <span class="device-card__plate-separator" aria-hidden="true">·</span>
            <span class="device-card__plate-capacity">可用 {{ euicc.freeNvram }}</span>
          </template>
        </span>
      </div>
    </article>
  </div>
</template>

<style scoped>
.device-card__head {
  padding-right: 0;
  align-items: center;
}

.device-card__head-end {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.device-card__edit {
  position: relative;
  z-index: 3;
  flex-shrink: 0;
  width: auto;
  height: auto;
  min-height: 28px;
  margin: 0;
  padding: 4px 10px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.device-card__edit:hover,
.device-card__edit:focus-visible {
  border-color: transparent;
  background: rgba(52, 211, 153, 0.12);
  color: #34d399;
  outline: none;
  transform: translateY(-1px);
}

[data-theme='light'] .device-card__edit {
  border-color: transparent;
  background: transparent;
  color: rgba(15, 23, 42, 0.55);
}

@media (max-width: 520px) {
  .device-card__head-end {
    flex-wrap: wrap;
    justify-content: flex-end;
  }
}
</style>
