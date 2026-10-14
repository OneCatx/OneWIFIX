<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import EsimEditDialog from '../components/EsimEditDialog.vue'

const route = useRoute()
const router = useRouter()
const deviceId = computed(() => String(route.params.deviceId || '').trim())

function close() {
  void router.push('/devices')
}
</script>

<template>
  <div class="device-edit-route">
    <EsimEditDialog :open="Boolean(deviceId)" :device-id="deviceId" @close="close" />
    <div v-if="!deviceId" class="device-edit-route__empty" role="alert">
      缺少设备编号，无法打开 eSIM 编辑。
    </div>
  </div>
</template>

<style scoped>
.device-edit-route {
  min-height: 100vh;
  background: transparent;
}

.device-edit-route__empty {
  display: grid;
  min-height: 100vh;
  place-items: center;
  padding: 24px;
  color: rgba(226, 232, 240, 0.78);
}
</style>