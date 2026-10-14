/**
 * OneWifi 认证 — 单连接 token 模型（与 Clash secret 平行，独立于 Clash 线路）。
 */
import { computed, ref } from 'vue'
import { STORAGE_KEYS } from '../utils/storageKeys'

const TOKEN_KEY = STORAGE_KEYS.onewifiToken
const USER_KEY = STORAGE_KEYS.onewifiUsername
const ENV_TOKEN = String(import.meta.env.VITE_ONEWIFI_TOKEN || '').trim()

function readStored(key) {
  try {
    return localStorage.getItem(key) || ''
  } catch {
    return ''
  }
}

const token = ref(readStored(TOKEN_KEY) || ENV_TOKEN)
const username = ref(readStored(USER_KEY))

export function getOneWifiToken() {
  return token.value || ENV_TOKEN || ''
}

export function isOneWifiAuthenticated() {
  return Boolean(getOneWifiToken())
}

export const onewifiAuthState = {
  token: computed(() => token.value),
  username: computed(() => username.value),
  authenticated: computed(() => Boolean(getOneWifiToken())),
}

export function setOneWifiSession(nextToken, nextUsername = '') {
  token.value = String(nextToken || '').trim()
  username.value = String(nextUsername || '').trim()
  try {
    if (token.value) {
      localStorage.setItem(TOKEN_KEY, token.value)
      if (username.value) localStorage.setItem(USER_KEY, username.value)
      else localStorage.removeItem(USER_KEY)
    } else {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
    }
  } catch {
    /* ignore */
  }
}

export function clearOneWifiSession() {
  setOneWifiSession('', '')
}
