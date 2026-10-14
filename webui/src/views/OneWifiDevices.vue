<script setup>
import { computed } from 'vue'
import OneWifiInstanceCard from '../components/OneWifiInstanceCard.vue'
import DeviceFleetOverview from '../components/DeviceFleetOverview.vue'
import { onewifiEndpointIsThisBoard } from '../utils/onewifiEndpoint'
import {
  addInstance,
  ensureLanOneWifiInstance,
  onewifiInstances,
} from '../stores/onewifiInstances'
import { removeOneWifiInstanceWithSync } from '../stores/onewifiInstanceHub'

ensureLanOneWifiInstance()

const visibleInstances = computed(() => onewifiInstances)

function isLocalBoardInstance(instance) {
  return onewifiEndpointIsThisBoard({ host: instance?.host, port: instance?.port })
}

function onRemove(id) {
  const inst = onewifiInstances.find((item) => item.id === id)
  if (!inst || isLocalBoardInstance(inst)) return
  void removeOneWifiInstanceWithSync(id)
}

function onAdd() {
  addInstance({
    host: '',
    port: null,
  })
}
</script>

<template>
  <div class="onewifi-lab-shell">
    <DeviceFleetOverview />
    <p v-if="!visibleInstances.length" class="onewifi-empty-hint">还没有可展示的 OneWIFI 连接。</p>
    <div v-else class="onewifi-instances">
      <OneWifiInstanceCard
        v-for="instance in visibleInstances"
        :key="instance.id"
        :instance="instance"
        @remove="onRemove"
      />
    </div>
    <button type="button" class="onewifi-add-btn" @click="onAdd">增加设备</button>
  </div>
</template>

<style scoped>
.onewifi-instances {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.onewifi-empty-hint {
  margin: 0;
  padding: 18px 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(226, 232, 240, 0.78);
}

.onewifi-add-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  margin-top: 22px;
  padding: 16px;
  border-radius: 16px;
  border: 1.5px dashed rgba(148, 163, 184, 0.4);
  background: rgba(255, 255, 255, 0.03);
  color: rgba(148, 163, 184, 0.95);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}

.onewifi-add-btn:hover {
  border-color: rgba(34, 197, 94, 0.55);
  background: rgba(34, 197, 94, 0.08);
  color: #22c55e;
}

[data-theme='light'] .onewifi-add-btn {
  border-color: rgba(15, 23, 42, 0.18);
  background: rgba(15, 23, 42, 0.02);
  color: rgba(15, 23, 42, 0.6);
}
</style>
