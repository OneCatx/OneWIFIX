<script setup>
import { computed, watch, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import Sidebar from '../components/Sidebar.vue'
import Toast from '../components/Toast.vue'
import MobileTabBar from '../components/MobileTabBar.vue'
import GlobalCallBanner from '../components/GlobalCallBanner.vue'
import { startOnewifiHub, stopOnewifiHub } from '../stores/onewifiHub'

const route = useRoute()
const isEmbedded = computed(() => route.matched.some((record) => record.meta?.embedded))

// 悬浮 Tab 栏仅移动端渲染：桌面端连滚动监听都不挂，零开销
const mobileQuery = window.matchMedia('(max-width: 900px)')
const isMobile = ref(mobileQuery.matches)
const onMobileChange = (event) => {
  isMobile.value = event.matches
}

watch(
  isEmbedded,
  (embedded) => {
    document.documentElement.classList.toggle('onebord-embed', embedded)
  },
  { immediate: true },
)

onMounted(() => {
  mobileQuery.addEventListener('change', onMobileChange)
  startOnewifiHub()
})

onUnmounted(() => {
  mobileQuery.removeEventListener('change', onMobileChange)
  document.documentElement.classList.remove('onebord-embed')
  stopOnewifiHub()
})
</script>

<template>
  <div class="layout" :class="{ 'layout--embedded': isEmbedded }">
    <div class="app-shell" :class="{ 'app-shell--embedded': isEmbedded }">
      <Sidebar />
      <main class="content" :class="{ 'content--embedded': isEmbedded }">
        <div class="content-inner onewifi-lab-shell" :class="{ 'content-inner--embedded': isEmbedded }">
          <router-view />
        </div>
      </main>
    </div>
    <Toast />
    <GlobalCallBanner />
    <MobileTabBar v-if="isMobile" />
  </div>
</template>

<style scoped>
.layout {
  box-sizing: border-box;
  height: 100vh;
  max-height: 100vh;
  padding: var(--layout-gutter);
  overflow: hidden;
  background: transparent;
}

.app-shell {
  display: flex;
  align-items: stretch;
  gap: var(--sidebar-content-gap);
  height: calc(100vh - var(--layout-gutter) * 2);
  max-height: calc(100vh - var(--layout-gutter) * 2);
  min-height: 0;
  overflow: hidden;
}

.content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  padding: var(--content-padding);
  overflow-x: hidden;
  overflow-y: auto;
}

.content-inner {
  width: 100%;
  padding-inline: var(--content-inner-inset, 0);
}

.layout--embedded {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 100vh;
  max-height: 100vh;
  min-height: 100vh;
  overflow: hidden;
}

.app-shell--embedded {
  display: flex;
  flex: 1 1 auto;
  align-items: stretch;
  align-self: stretch;
  width: 100%;
  min-height: 0;
  height: 100%;
}

.content--embedded {
  box-sizing: border-box;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  min-height: 0;
  height: 100%;
  padding: 0;
  overflow: hidden;
}

.content-inner--embedded {
  box-sizing: border-box;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  width: 100%;
  min-height: 0;
  height: 100%;
  padding: 0;
  overflow: hidden;
}

@media (max-width: 900px) {
  /*
   * 小屏滚动链：layout 锁视口 → app-shell 吃剩余高度 → content 独占纵向滚动。
   * 旧版 height:auto + overflow:visible 会让壳层随内容长高，再被 layout 的
   * overflow:hidden 裁掉底部，表现为「向下滑被截断」。
   */
  .layout {
    display: flex;
    flex-direction: column;
    padding: 16px;
  }

  .app-shell {
    flex: 1 1 auto;
    flex-direction: column;
    min-height: 0;
    height: auto;
    max-height: none;
    overflow: hidden;
  }

  .content {
    flex: 1 1 auto;
    min-height: 0;
    padding: 0;
    overflow-x: hidden;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .layout--embedded {
    height: 100vh;
    max-height: 100vh;
    padding: 16px;
  }

  .app-shell--embedded {
    flex: 1 1 auto;
    height: 100%;
    min-height: 0;
  }

  .content--embedded,
  .content-inner--embedded {
    flex: 1 1 auto;
    height: 100%;
    min-height: 0;
  }
}
</style>

<style>
html.onebord-embed,
html.onebord-embed body,
html.onebord-embed #app,
html.onebord-embed .app-main {
  height: 100%;
  min-height: 100%;
  overflow: hidden;
}
</style>
