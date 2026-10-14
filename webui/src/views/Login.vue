<script setup>
import { onUnmounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import CatLogo from '../components/CatLogo.vue'
import MIcon from '../components/MIcon.vue'
import { isGatewayDown, login as loginApi, setup as setupApi } from '../api/auth'
import { enterUiPreview, getAuthUser, isAuthConfigured } from '../stores/auth'
import '../assets/login.css'

const router = useRouter()
const route = useRoute()

const configured = ref(isAuthConfigured())
const username = ref(getAuthUser()?.username || 'admin')
const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const error = ref('')
const retryAfter = ref(0)
const gatewayDown = ref(false)
const canPreview = import.meta.env.DEV

let retryTimer = 0

function stopRetryTimer() {
  if (retryTimer) {
    window.clearInterval(retryTimer)
    retryTimer = 0
  }
}

function startRetryCountdown(seconds) {
  stopRetryTimer()
  retryAfter.value = Math.max(1, Number(seconds) || 60)
  retryTimer = window.setInterval(() => {
    retryAfter.value = Math.max(0, retryAfter.value - 1)
    if (retryAfter.value <= 0) stopRetryTimer()
  }, 1000)
}

onUnmounted(stopRetryTimer)

async function handleSubmit() {
  if (loading.value || retryAfter.value > 0) return
  error.value = ''

  const user = username.value.trim()
  if (!user || !password.value) {
    error.value = '请输入账号和密码'
    return
  }

  if (!configured.value) {
    if (password.value.length < 10) {
      error.value = '密码至少 10 位'
      return
    }
    if (password.value !== confirmPassword.value) {
      error.value = '两次输入的密码不一致'
      return
    }
  }

  loading.value = true
  gatewayDown.value = false
  try {
    if (configured.value) {
      await loginApi(user, password.value)
    } else {
      await setupApi(user, password.value)
    }
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard'
    await router.push(redirect)
  } catch (err) {
    if (err?.status === 429) {
      const headerSeconds = Number(err.retryAfter)
      const bodySeconds = Number(err.data?.retry_after || err.data?.error?.retry_after)
      const seconds = Math.max(1, headerSeconds || bodySeconds || 60)
      startRetryCountdown(seconds)
      error.value = `尝试次数过多，请 ${seconds} 秒后再试`
    } else if (err?.status === 401) {
      error.value = '用户名或密码不对。请用 OneWIFI 管理员账号（密码至少 10 位）。'
    } else if (isGatewayDown(err)) {
      gatewayDown.value = true
      error.value = '本机还没有 OneWIFI 网关（https://127.0.0.1:10443）。这是连不上后端，不是密码错。'
    } else {
      error.value = err?.message || '登录失败，请稍后重试'
    }
  } finally {
    loading.value = false
  }
}

async function previewUi() {
  enterUiPreview()
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard'
  await router.push(redirect)
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-bg" aria-hidden="true">
      <span class="auth-wave auth-wave--1" />
      <span class="auth-wave auth-wave--2" />
      <span class="auth-wave auth-wave--3" />
      <span class="auth-wave auth-wave--4" />
    </div>
    <div class="auth-scrim" aria-hidden="true" />

    <div class="auth-stage">
      <form class="auth-card glass-frame" @submit.prevent="handleSubmit">
        <span class="auth-deco auth-deco--cube auth-deco--a" aria-hidden="true" />
        <span class="auth-deco auth-deco--cube auth-deco--b" aria-hidden="true" />
        <div class="auth-brand">
          <CatLogo size="lg" />
          <span class="auth-brand-name">OneWIFI</span>
        </div>

        <h1 class="auth-title">{{ configured ? '登录网关' : '创建管理员' }}</h1>
        <p class="auth-lead">
          {{
            configured
              ? '账号密码来自 OneWIFI 网关（首次打开时「创建管理员」设的那串，至少 10 位），不是以前 OneBoard 本地的 admin。'
              : '首次使用请创建 OneWIFI 网关管理员。密码至少 10 位，以后登录都用这一套。'
          }}
        </p>

        <label class="auth-field">
          <span class="auth-field-icon" aria-hidden="true">
            <MIcon name="login" size="sm" />
          </span>
          <input
            v-model="username"
            class="auth-input"
            type="text"
            name="username"
            autocomplete="username"
            placeholder="用户名"
            :readonly="configured"
            :disabled="loading"
          />
        </label>

        <label class="auth-field">
          <span class="auth-field-icon" aria-hidden="true">
            <MIcon name="security" size="sm" />
          </span>
          <input
            v-model="password"
            class="auth-input"
            type="password"
            name="password"
            :autocomplete="configured ? 'current-password' : 'new-password'"
            :placeholder="configured ? '密码' : '密码（至少 10 位）'"
            minlength="10"
            :disabled="loading"
            @keyup.enter="handleSubmit"
          />
        </label>

        <label v-if="!configured" class="auth-field">
          <span class="auth-field-icon" aria-hidden="true">
            <MIcon name="security" size="sm" />
          </span>
          <input
            v-model="confirmPassword"
            class="auth-input"
            type="password"
            name="confirmPassword"
            autocomplete="new-password"
            placeholder="确认密码"
            minlength="10"
            :disabled="loading"
            @keyup.enter="handleSubmit"
          />
        </label>

        <p v-if="!configured" class="auth-hint">密码遗失需在主机侧重置。请妥善保管。</p>

        <p v-if="error" class="auth-alert auth-alert--error" role="alert">
          {{ retryAfter > 0 ? `尝试次数过多，请 ${retryAfter} 秒后再试` : error }}
        </p>
        <button
          v-if="canPreview && gatewayDown"
          type="button"
          class="auth-preview"
          @click="previewUi"
        >
          仅预览界面
        </button>

        <div class="auth-actions">
          <button
            class="auth-go"
            type="submit"
            :disabled="loading || retryAfter > 0"
            :aria-busy="loading"
          >
            <svg v-if="!loading && retryAfter <= 0" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                fill="none"
                stroke="#fff"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M5 12h13m0 0-5-5m5 5-5 5"
              />
            </svg>
            <span v-else class="auth-spinner" aria-hidden="true" />
            <span class="sr-only">
              {{ retryAfter > 0 ? `请等待 ${retryAfter} 秒` : loading ? (configured ? '登录中' : '创建中') : (configured ? '登录' : '创建账号') }}
            </span>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
