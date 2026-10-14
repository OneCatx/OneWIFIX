<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { callStateLabel, callDirectionLabel } from '../views/callsModel'
import { maskTail4 } from '../utils/onewifiDevice'
import { answerWebCall, hangupWebCall, subscribeWebCall } from '../views/webCallSession'
import { useAppStore } from '../stores/app'

const { showToast } = useAppStore()
const snap = ref({ incoming: null, ready: false, lineId: '', lastError: '' })
const busy = ref(false)
let unsubscribe = () => {}

const ringing = computed(() => {
  const incoming = snap.value.incoming
  if (!incoming) return null
  return {
    call: { number: incoming.number || '', direction: 'incoming', state: 'ringing' },
    device: { deviceId: snap.value.lineId || '' },
  }
})

onMounted(() => {
  unsubscribe = subscribeWebCall((next) => {
    snap.value = next
  })
})

onUnmounted(() => {
  unsubscribe()
  unsubscribe = () => {}
})

async function answer() {
  if (!ringing.value || busy.value) return
  busy.value = true
  try {
    await answerWebCall()
    showToast('已接听')
    window.location.pathname = '/calls'
  } catch (err) {
    showToast(err?.message || '语音引擎不可用', 'error')
  } finally {
    busy.value = false
  }
}

async function reject() {
  if (!ringing.value || busy.value) return
  busy.value = true
  try {
    await hangupWebCall()
    showToast('已拒绝')
  } catch (err) {
    showToast(err?.message || '语音引擎不可用', 'error')
  } finally {
    busy.value = false
  }
}

function openCalls() {
  window.location.href = '/calls'
}
</script>

<template>
  <div v-if="ringing" class="global-call-banner" role="alert">
    <div class="global-call-banner__body" @click="openCalls">
      <strong>来电</strong>
      <span class="global-call-banner__num">
        {{ ringing.call.number ? maskTail4(ringing.call.number) : '未知号码' }}
      </span>
      <span class="global-call-banner__meta">
        {{ callDirectionLabel(ringing.call.direction) }} · {{ callStateLabel(ringing.call.state) }}
        · {{ ringing.device.deviceId }}
      </span>
    </div>
    <div class="global-call-banner__actions">
      <button type="button" class="global-call-banner__btn accept" :disabled="busy" @click="answer">接听</button>
      <button type="button" class="global-call-banner__btn reject" :disabled="busy" @click="reject">拒绝</button>
    </div>
  </div>
</template>

<style scoped>
.global-call-banner {
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 4000;
  display: flex;
  gap: 12px;
  align-items: center;
  max-width: min(420px, calc(100vw - 24px));
  padding: 12px 14px;
  border-radius: 14px;
  background: #0f766e;
  color: #fff;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
}
.global-call-banner__body {
  display: grid;
  gap: 2px;
  cursor: pointer;
  min-width: 0;
}
.global-call-banner__num {
  font-size: 18px;
  font-weight: 700;
}
.global-call-banner__meta {
  opacity: 0.9;
  font-size: 12px;
}
.global-call-banner__actions {
  display: flex;
  gap: 8px;
}
.global-call-banner__btn {
  border: 0;
  border-radius: 999px;
  padding: 8px 14px;
  font-weight: 600;
  cursor: pointer;
}
.global-call-banner__btn.accept {
  background: #22c55e;
  color: #06240f;
}
.global-call-banner__btn.reject {
  background: #fee2e2;
  color: #7f1d1d;
}
</style>
