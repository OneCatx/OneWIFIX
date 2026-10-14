<script setup>
import { useAppStore } from '../stores/app'

const { state } = useAppStore()
</script>

<template>
  <Transition name="toast">
    <div v-if="state.toast" class="toast" :class="state.toast.type">
      <span class="toast-icon">
        <svg v-if="state.toast.type === 'success'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 6L9 17l-5-5" />
        </svg>
        <svg v-else-if="state.toast.type === 'error'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6M9 9l6 6" />
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
        </svg>
      </span>
      {{ state.toast.message }}
    </div>
  </Transition>
</template>

<style scoped>
.toast {
  position: fixed;
  top: 20px;
  right: 24px;
  z-index: 200;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-field);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow);
  font-size: var(--fs-base);
  color: var(--text-primary);
}

.toast.success {
  border-color: rgba(34, 197, 94, 0.4);
}

.toast.error {
  border-color: rgba(239, 68, 68, 0.4);
}

.toast.warning {
  border-color: rgba(245, 158, 11, 0.4);
}

.toast.info {
  border-color: rgba(0, 140, 255, 0.4);
}

.toast-icon {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.toast.success .toast-icon { color: var(--success); }
.toast.error .toast-icon { color: var(--danger); }
.toast.warning .toast-icon { color: var(--warning); }
.toast.info .toast-icon { color: var(--accent); }

.toast-icon svg {
  width: 16px;
  height: 16px;
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
</style>
