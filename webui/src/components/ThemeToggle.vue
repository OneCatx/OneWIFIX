<script setup>
import MIcon from './MIcon.vue'
import { isDark, toggleDarkMode } from '../stores/theme'
</script>

<template>
  <button
    type="button"
    class="theme-capsule"
    role="switch"
    :aria-checked="isDark"
    :aria-label="isDark ? '切换浅色模式' : '切换深色模式'"
    @click="toggleDarkMode"
  >
    <span class="theme-capsule__track" :class="{ 'is-dark': isDark }">
      <span class="theme-capsule__icon theme-capsule__icon--sun">
        <MIcon name="light_mode" size="xs" />
      </span>
      <span class="theme-capsule__icon theme-capsule__icon--moon">
        <MIcon name="dark_mode" size="xs" />
      </span>
      <span class="theme-capsule__thumb" />
    </span>
  </button>
</template>

<style scoped>
.theme-capsule {
  display: inline-flex;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.theme-capsule__track {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: center;
  width: 72px;
  height: 34px;
  padding: 3px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(148, 163, 184, 0.26);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
  transition: background 0.28s ease, border-color 0.28s ease, box-shadow 0.28s ease;
}

[data-theme='light'] .theme-capsule__track {
  background: rgba(255, 255, 255, 0.82);
  border-color: rgba(148, 163, 184, 0.28);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.95),
    0 4px 14px rgba(148, 163, 184, 0.12);
}

.theme-capsule__track.is-dark {
  background: rgba(30, 41, 59, 0.72);
  border-color: rgba(94, 234, 212, 0.28);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 0 18px rgba(52, 211, 153, 0.08);
}

.theme-capsule__icon {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: rgba(148, 163, 184, 0.72);
  transition: color 0.28s ease, opacity 0.28s ease;
}

.theme-capsule__track:not(.is-dark) .theme-capsule__icon--sun {
  color: #2563eb;
}

.theme-capsule__track.is-dark .theme-capsule__icon--moon {
  color: #6ee7b7;
}

.theme-capsule__thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  z-index: 1;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: linear-gradient(165deg, rgba(255, 255, 255, 0.98) 0%, rgba(226, 232, 240, 0.96) 100%);
  border: 1px solid rgba(255, 255, 255, 0.85);
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.14);
  transition: transform 0.32s cubic-bezier(0.34, 1.2, 0.64, 1), background 0.28s ease, box-shadow 0.28s ease;
}

.theme-capsule__track.is-dark .theme-capsule__thumb {
  transform: translateX(38px);
  background: linear-gradient(165deg, rgba(30, 41, 59, 0.98) 0%, rgba(15, 23, 42, 0.96) 100%);
  border-color: rgba(94, 234, 212, 0.22);
  box-shadow:
    0 2px 10px rgba(0, 0, 0, 0.35),
    0 0 12px rgba(52, 211, 153, 0.12);
}

.theme-capsule:focus-visible .theme-capsule__track {
  outline: 2px solid rgba(96, 165, 250, 0.55);
  outline-offset: 2px;
}
</style>
