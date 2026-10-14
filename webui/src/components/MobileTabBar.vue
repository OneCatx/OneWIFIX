<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MIcon from './MIcon.vue'
import { splitMobileNav, NAV_AUXILIARY, matchNavItem } from '../config/sidebarNav'
import { tCopy } from '../stores/uiLocale'
import { logout } from '../api/auth'
import { useLiquidTabBar } from '../composables/useLiquidTabBar'

const route = useRoute()
const router = useRouter()
const { minimized, keyboardHidden } = useLiquidTabBar()

const { primary, overflow } = splitMobileNav()
const moreOpen = ref(false)
const moreBtnRef = ref(null)
const sheetRef = ref(null)
const navigating = ref(false)

const isActive = (item) => matchNavItem(route.path, item)
/** 「更多」内任一页处于激活态时，底栏的更多按钮也点亮 */
const moreActive = computed(() => overflow.some((item) => isActive(item)))

watch(
  () => route.path,
  () => {
    moreOpen.value = false
    navigating.value = false
  },
)

function onSheetKeydown(event) {
  if (event.key === 'Escape') {
    event.stopPropagation()
    moreOpen.value = false
  }
}

watch(moreOpen, async (open) => {
  if (open) {
    document.addEventListener('keydown', onSheetKeydown)
    await nextTick()
    // 触屏设备勿强抢焦点：iOS Safari 会因此滚动/吞掉后续点击
    const coarse = window.matchMedia('(pointer: coarse)').matches
    if (!coarse) {
      sheetRef.value?.querySelector('button.lg-sheet__item, button.lg-sheet__aux-btn')?.focus()
    }
  } else {
    document.removeEventListener('keydown', onSheetKeydown)
    const coarse = window.matchMedia('(pointer: coarse)').matches
    if (!coarse) {
      moreBtnRef.value?.focus({ preventScroll: true })
    }
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onSheetKeydown)
})

async function goPath(path) {
  if (!path || navigating.value) return
  navigating.value = true
  moreOpen.value = false
  try {
    if (route.path !== path) {
      await router.push(path)
    }
  } finally {
    navigating.value = false
  }
}

async function onAux(item) {
  if (navigating.value) return
  if (item.action === 'logout') {
    navigating.value = true
    moreOpen.value = false
    try {
      await logout()
      await router.push('/login')
    } finally {
      navigating.value = false
    }
    return
  }
  if (item.path) {
    await goPath(item.path)
  }
}

function toggleMore() {
  moreOpen.value = !moreOpen.value
}
</script>

<template>
  <nav
    class="lg-tabbar lg-material"
    :class="{
      'lg-tabbar--min': minimized && !moreOpen,
      'lg-tabbar--hidden': keyboardHidden,
      'lg-tabbar--sheet-open': moreOpen,
    }"
    aria-label="移动端主导航"
    :aria-hidden="moreOpen ? 'true' : undefined"
  >
    <router-link
      v-for="item in primary"
      :key="item.path"
      :to="item.path"
      class="lg-tab"
      :class="{ active: isActive(item) }"
      :aria-current="isActive(item) ? 'page' : undefined"
    >
      <MIcon :name="item.icon" size="md" />
      <span class="lg-tab__label">{{ tCopy(item.label, item.labelEn || item.label) }}</span>
    </router-link>

    <button
      ref="moreBtnRef"
      type="button"
      class="lg-tab"
      :class="{ active: moreActive || moreOpen }"
      :aria-expanded="moreOpen"
      aria-haspopup="dialog"
      @click="toggleMore"
    >
      <MIcon name="view_module" size="md" />
      <span class="lg-tab__label">更多</span>
    </button>
  </nav>

  <Teleport to="body">
    <Transition name="lg-sheet-pop">
      <div
        v-if="moreOpen"
        class="lg-sheet-backdrop"
        @click.self="moreOpen = false"
      >
        <div
          ref="sheetRef"
          class="lg-sheet lg-material"
          role="dialog"
          aria-modal="true"
          aria-label="更多页面"
          @click.stop
        >
          <div class="lg-sheet__handle" aria-hidden="true" />
          <div class="lg-sheet__grid">
            <button
              v-for="item in overflow"
              :key="item.path"
              type="button"
              class="lg-sheet__item"
              :class="{ active: isActive(item) }"
              :aria-current="isActive(item) ? 'page' : undefined"
              @click="goPath(item.path)"
            >
              <MIcon :name="item.icon" size="md" />
              <span>{{ tCopy(item.label, item.labelEn || item.label) }}</span>
            </button>
          </div>
          <div class="lg-sheet__divider" aria-hidden="true" />
          <div class="lg-sheet__aux">
            <button
              v-for="item in NAV_AUXILIARY"
              :key="item.id"
              type="button"
              class="lg-sheet__aux-btn"
              :class="{ 'lg-sheet__aux-btn--danger': item.action === 'logout' }"
              @click="onAux(item)"
            >
              <MIcon :name="item.icon" size="sm" />
              {{ tCopy(item.label, item.labelEn || item.label) }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
