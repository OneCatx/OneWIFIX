<script setup>
import { globalLoadingState } from '../stores/globalLoading'
</script>

<template>
  <div
    class="global-loading-bar"
    :class="{ active: globalLoadingState.active }"
    role="progressbar"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-busy="globalLoadingState.active"
    aria-label="页面加载中"
  >
    <div class="global-loading-bar__track" />
  </div>
</template>

<style scoped>
.global-loading-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  z-index: 10000;
  pointer-events: none;
  opacity: 0;
  overflow: hidden;
  transition: opacity 0.18s ease;
}

.global-loading-bar.active {
  opacity: 1;
}

.global-loading-bar__track {
  height: 100%;
  width: 36%;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--accent, #8ab4f8) 45%,
    var(--accent-hover, #aecbfa) 55%,
    transparent 100%
  );
  animation: global-loading-slide 0.95s ease-in-out infinite;
}

@keyframes global-loading-slide {
  0% { transform: translateX(-120%); }
  100% { transform: translateX(320%); }
}
</style>
