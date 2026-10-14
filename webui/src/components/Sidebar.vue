<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CatLogo from './CatLogo.vue'
import MIcon from './MIcon.vue'
import ThemeToggle from './ThemeToggle.vue'
import { logout } from '../api/auth'
import { getAuthUser } from '../stores/auth'
import { useAppStore } from '../stores/app'
import { NAV_MODULES, NAV_AUXILIARY, matchNavItem, visibleNavItems } from '../config/sidebarNav'
import { tCopy } from '../stores/uiLocale'

const route = useRoute()
const router = useRouter()
const { state } = useAppStore()

const authUser = computed(() => getAuthUser())
const displayName = computed(() => authUser.value?.username || '管理员')
const hostLabel = computed(() => {
  const host = state.system.hostname
  return host && host !== '—' ? host : 'OneWIFI'
})

const primaryNavItems = computed(() => visibleNavItems())

function isActive(item) {
  return matchNavItem(route.path, item)
}

async function handleLogout() {
  await logout()
  await router.push('/login')
}

function onAuxClick(item, event) {
  if (item.action === 'logout') {
    event.preventDefault()
    void handleLogout()
    return
  }
  if (item.path) {
    event.preventDefault()
    void router.push(item.path)
  }
}
</script>

<template>
  <aside class="cp-sidebar">
    <div class="cp-sidebar__dock">
      <header class="cp-sidebar__nameplate" aria-label="用户信息">
        <div class="cp-sidebar__avatar">
          <CatLogo shape="circle" fill />
        </div>
        <h2 class="cp-sidebar__name">{{ displayName }}</h2>
        <p class="cp-sidebar__host">{{ hostLabel }}</p>
        <div class="cp-sidebar__badges">
          <span class="cp-sidebar__badge cp-sidebar__badge--live">在线</span>
          <span class="cp-sidebar__badge">OneWIFI</span>
        </div>
      </header>

      <nav class="cp-sidebar__rail" aria-label="控制台导航">
        <router-link
          v-for="item in primaryNavItems"
          :key="item.path"
          :to="item.path"
          class="cp-nav-item"
          :class="{ active: isActive(item) }"
        >
          <span class="cp-nav-item__icon-wrap">
            <MIcon
              v-if="item.icon"
              :name="item.icon"
              size="sm"
              class="cp-nav-item__icon"
            />
          </span>
          <span class="cp-nav-item__label">{{ tCopy(item.label, item.labelEn || item.label) }}</span>
        </router-link>

        <div class="cp-sidebar__rail-divider" aria-hidden="true" />

        <template v-for="item in NAV_AUXILIARY" :key="item.id">
          <router-link
            v-if="item.path"
            :to="item.path"
            class="cp-nav-item cp-nav-item--aux"
            :class="{ active: matchNavItem(route.path, item) }"
          >
            <span class="cp-nav-item__icon-wrap">
              <MIcon
                v-if="item.icon"
                :name="item.icon"
                size="sm"
                class="cp-nav-item__icon"
              />
            </span>
            <span class="cp-nav-item__label">{{ tCopy(item.label, item.labelEn || item.label) }}</span>
          </router-link>
          <a
            v-else-if="item.href"
            :href="item.href"
            class="cp-nav-item cp-nav-item--aux"
          >
            <span class="cp-nav-item__icon-wrap">
              <MIcon
                v-if="item.icon"
                :name="item.icon"
                size="sm"
                class="cp-nav-item__icon"
              />
            </span>
            <span class="cp-nav-item__label">{{ tCopy(item.label, item.labelEn || item.label) }}</span>
          </a>
          <button
            v-else
            type="button"
            class="cp-nav-item cp-nav-item--aux"
            :class="{ 'cp-nav-item--danger': item.action === 'logout' }"
            @click="onAuxClick(item, $event)"
          >
            <span class="cp-nav-item__icon-wrap">
              <MIcon
                v-if="item.icon"
                :name="item.icon"
                size="sm"
                class="cp-nav-item__icon"
              />
            </span>
            <span class="cp-nav-item__label">{{ tCopy(item.label, item.labelEn || item.label) }}</span>
          </button>
        </template>
      </nav>

      <footer class="cp-sidebar__dock-foot" aria-label="主题设置">
        <ThemeToggle />
      </footer>
    </div>
  </aside>
</template>
