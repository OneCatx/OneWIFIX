import { reactive, computed } from 'vue'
import { STORAGE_KEYS } from '../utils/storageKeys'

const STORAGE_KEY = STORAGE_KEYS.theme

function getStoredMode() {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (value === 'light' || value === 'dark' || value === 'auto') return value
  } catch {}
  return 'dark'
}

function resolveEffective(mode) {
  if (mode === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return mode
}

function getStoredSkin() {
  try {
    const value = localStorage.getItem(STORAGE_KEYS.skin)
    if (value === 'classic' || value === 'onewifi') return value
  } catch {}
  return 'onewifi'
}

export const themeState = reactive({
  mode: getStoredMode(),
  skin: getStoredSkin(),
})

export const effectiveTheme = computed(() => resolveEffective(themeState.mode))
export const isDark = computed(() => effectiveTheme.value === 'dark')

/** 与 index.html 首帧一致。OneWIFI 是默认皮肤；经典走上游玻璃底色。 */
const THEME_COLORS = {
  onewifi: { dark: '#071723', light: '#F2F7FB' },
  classic: { dark: '#070812', light: '#f2f0eb' },
}

/**
 * 同步 meta[name=theme-color]，让 Android 状态栏 / iOS Safari 标签栏
 * 跟随面板主题切换着色（静态 meta 只覆盖首帧，切换需运行时更新）
 */
function syncThemeColorMeta(effective) {
  // 移除带 media 的静态标签，避免与动态值互相打架
  document
    .querySelectorAll('meta[name="theme-color"][media]')
    .forEach((el) => el.remove())
  let meta = document.querySelector('meta[name="theme-color"]:not([media])')
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    document.head.appendChild(meta)
  }
  const palette = THEME_COLORS[themeState.skin] || THEME_COLORS.onewifi
  meta.setAttribute('content', palette[effective] || palette.dark)
}

export function applyTheme() {
  const effective = resolveEffective(themeState.mode)
  const root = document.documentElement
  root.dataset.theme = effective
  if (themeState.skin === 'onewifi') root.dataset.skin = 'onewifi'
  else delete root.dataset.skin
  root.style.colorScheme = effective
  syncThemeColorMeta(effective)
}

export function setThemeSkin(skin) {
  if (skin !== 'onewifi' && skin !== 'classic') return
  themeState.skin = skin
  try {
    localStorage.setItem(STORAGE_KEYS.skin, skin)
  } catch {}
  applyTheme()
}

export function setThemeMode(mode) {
  if (mode !== 'light' && mode !== 'dark' && mode !== 'auto') return
  themeState.mode = mode
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {}
  applyTheme()
}

export function toggleDarkMode() {
  if (themeState.mode === 'auto') {
    setThemeMode(isDark.value ? 'light' : 'dark')
    return
  }
  setThemeMode(themeState.mode === 'dark' ? 'light' : 'dark')
}

export function initTheme() {
  reloadThemeFromStorage()
  applyTheme()
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (themeState.mode === 'auto') applyTheme()
  })
}

export function reloadThemeFromStorage() {
  themeState.mode = getStoredMode()
  themeState.skin = getStoredSkin()
}
