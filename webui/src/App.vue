<script setup>
import { computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { isDark } from './stores/theme'
import { initControlPlaneEngine, stopControlPlaneEngine } from './stores/controlPlane/controlPlaneEngine'
import { AUTH_EXPIRED_EVENT, onewifiFetch, setSessionToken } from './api/onewifi'
import { stopOnewifiHub } from './stores/onewifiHub'
import { invalidateAuthHydrate } from './api/auth'
import { clearAuthSession } from './stores/auth'
import GlobalLoadingBar from './components/GlobalLoadingBar.vue'
import { readUiLanguage } from './utils/uiLanguage'
import { setUiLanguage } from './stores/uiLocale'

const route = useRoute()
const router = useRouter()
const showPageBg = computed(() =>
  route.path !== '/login',
)

function onAuthExpired() {
  setSessionToken('')
  clearAuthSession()
  invalidateAuthHydrate()
  stopOnewifiHub()
  if (route.path !== '/login') {
    void router.replace('/login')
  }
}

onMounted(() => {
  window.addEventListener(AUTH_EXPIRED_EVENT, onAuthExpired)
  initControlPlaneEngine()
  void onewifiFetch('/api/settings/preferences', { trackLoading: false })
    .then((prefs) => setUiLanguage(readUiLanguage(prefs) || 'zh'))
    .catch(() => {})
})
onUnmounted(() => {
  window.removeEventListener(AUTH_EXPIRED_EVENT, onAuthExpired)
  stopControlPlaneEngine()
  stopOnewifiHub()
})
</script>

<template>
  <GlobalLoadingBar />
  <div v-if="showPageBg" class="app-page-bg" :class="{ 'is-dark': isDark }" aria-hidden="true">
    <div class="app-page-bg__mesh">
      <div class="ref-orb ref-orb--mint" />
      <div class="ref-orb ref-orb--blue" />
      <div class="ref-orb ref-orb--purple" />
      <div class="ref-orb ref-orb--lavender" />
      <div class="ref-orb ref-orb--peach" />
    </div>
    <div class="app-page-bg__light" />
  </div>
  <router-view class="app-main" />
</template>

<style>
.app-main {
  position: relative;
  z-index: 1;
  min-height: 100vh;
  background: transparent;
}

.app-page-bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
  background:
    radial-gradient(ellipse 90% 70% at 12% 18%, rgba(196, 181, 253, 0.58) 0%, transparent 58%),
    radial-gradient(ellipse 75% 60% at 88% 12%, rgba(147, 197, 253, 0.52) 0%, transparent 54%),
    radial-gradient(ellipse 70% 55% at 48% 42%, rgba(129, 140, 248, 0.38) 0%, transparent 62%),
    radial-gradient(ellipse 80% 65% at 6% 88%, rgba(110, 231, 183, 0.52) 0%, transparent 56%),
    radial-gradient(ellipse 68% 58% at 94% 86%, rgba(253, 186, 140, 0.48) 0%, transparent 54%),
    linear-gradient(155deg, #e8edff 0%, #edf8f3 32%, #f0ebff 58%, #fdf0e8 100%);
}

.app-page-bg__mesh {
  position: absolute;
  inset: -16% -12%;
  overflow: hidden;
}

.ref-orb {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  filter: blur(88px);
}

.ref-orb--mint {
  top: -14%;
  left: -10%;
  width: min(58vw, 640px);
  height: min(52vh, 540px);
  background: radial-gradient(circle, rgba(110, 231, 183, 0.72) 0%, rgba(110, 231, 183, 0.18) 42%, transparent 72%);
}

.ref-orb--blue {
  top: 8%;
  right: -8%;
  width: min(50vw, 560px);
  height: min(46vh, 480px);
  background: radial-gradient(circle, rgba(147, 197, 253, 0.68) 0%, rgba(147, 197, 253, 0.16) 44%, transparent 74%);
}

.ref-orb--purple {
  top: 32%;
  left: 34%;
  width: min(48vw, 520px);
  height: min(44vh, 440px);
  background: radial-gradient(circle, rgba(129, 140, 248, 0.52) 0%, rgba(129, 140, 248, 0.12) 46%, transparent 74%);
}

.ref-orb--lavender {
  top: -6%;
  left: 28%;
  width: min(42vw, 460px);
  height: min(38vh, 400px);
  background: radial-gradient(circle, rgba(199, 210, 254, 0.58) 0%, rgba(199, 210, 254, 0.14) 44%, transparent 72%);
}

.ref-orb--peach {
  bottom: 4%;
  right: 6%;
  width: min(40vw, 440px);
  height: min(36vh, 380px);
  background: radial-gradient(circle, rgba(253, 186, 140, 0.58) 0%, rgba(253, 186, 140, 0.14) 44%, transparent 72%);
}

.app-page-bg.is-dark {
  background:
    radial-gradient(ellipse 88% 64% at 8% 10%, rgba(30, 64, 82, 0.34) 0%, transparent 58%),
    radial-gradient(ellipse 72% 58% at 92% 14%, rgba(47, 39, 88, 0.34) 0%, transparent 56%),
    radial-gradient(ellipse 76% 62% at 48% 76%, rgba(12, 67, 62, 0.28) 0%, transparent 60%),
    linear-gradient(155deg, #090d18 0%, #0c1220 42%, #111022 72%, #10151d 100%);
}

.app-page-bg.is-dark .ref-orb {
  opacity: 0.32;
  filter: blur(112px);
}

.app-page-bg.is-dark .ref-orb--mint {
  background: radial-gradient(circle, rgba(52, 211, 153, 0.26) 0%, rgba(52, 211, 153, 0.06) 42%, transparent 72%);
}

.app-page-bg.is-dark .ref-orb--blue {
  background: radial-gradient(circle, rgba(96, 165, 250, 0.24) 0%, rgba(96, 165, 250, 0.05) 44%, transparent 74%);
}

.app-page-bg.is-dark .ref-orb--purple {
  background: radial-gradient(circle, rgba(139, 92, 246, 0.2) 0%, rgba(139, 92, 246, 0.04) 46%, transparent 74%);
}

.app-page-bg.is-dark .ref-orb--lavender {
  background: radial-gradient(circle, rgba(129, 140, 248, 0.16) 0%, rgba(129, 140, 248, 0.03) 44%, transparent 72%);
}

.app-page-bg.is-dark .ref-orb--peach {
  background: radial-gradient(circle, rgba(251, 191, 36, 0.12) 0%, rgba(251, 191, 36, 0.025) 44%, transparent 72%);
}

.app-page-bg__light {
  display: none;
}
</style>
