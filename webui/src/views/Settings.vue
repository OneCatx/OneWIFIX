<script setup>
import { computed, onMounted, ref } from 'vue'
import { themeState, setThemeMode, setThemeSkin } from '../stores/theme'
import { changePassword } from '../api/auth'
import { useRouter } from 'vue-router'
import {
  checkOnewifiUpdate,
  fetchOnewifiDeveloperSettings,
  fetchOnewifiHttpsSettings,
  fetchOnewifiVowifiSettings,
  fetchOnewifiImeiPool,
  saveOnewifiImeiPool,
  fetchOnewifiSmsSettings,
  fetchOnewifiSecurity,
  fetchOnewifiSettings,
  saveOnewifiDeveloperMode,
  saveOnewifiDeveloperSettings,
  saveOnewifiHttpsSettings,
  saveOnewifiVowifiSettings,
  saveOnewifiSmsSettings,
  saveOnewifiSecurity,
  saveOnewifiSettings,
  exportCardBackup,
  validateCardBackup,
  restoreCardBackup,
  fetchOnewifiNotificationDeliveries,
  clearOnewifiNotificationDeliveries,
  fetchOnewifiLicense,
  activateOnewifiLicense,
} from '../api/onewifiGateway'
import { getOneBoardVersion } from '../api/oneboard'
import { useAppStore } from '../stores/app'
import { setUiLanguage, tCopy } from '../stores/uiLocale'
import { readUiLanguage } from '../utils/uiLanguage'
import OwGlassPanel from '../components/OwGlassPanel.vue'
import OwPageHead from '../components/OwPageHead.vue'
import MIcon from '../components/MIcon.vue'
import SettingsNotifyDialog from '../components/SettingsNotifyDialog.vue'
import { NOTIFY_TABS, emptyNotify, hydrateNotify } from './settingsNotifyModel'
import '../assets/onewifi-pages.css'

const { showToast } = useAppStore()
const router = useRouter()
const settings = ref({ language: 'zh', version: 'OneWIFI', developer: false, build_time: '' })
const saving = ref(false)
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const pwdBusy = ref(false)
const notifyDialogRef = ref(null)
const securitySaving = ref(false)
const quotaSaving = ref(false)
const httpsSaving = ref(false)
const vowifiMtu = ref(false)
const vowifiMtuLoaded = ref(false)
const vowifiMtuSaving = ref(false)
const imeiPool = ref({ entries: [], total: 0, unused: 0 })
const imeiPoolLoaded = ref(false)
const imeiPoolSaving = ref(false)
const imeiDraft = ref({ brand: 'APPLE', model: 'iPhone 18 Pro', imei: '' })
const smsAutoClear = ref(true)
const smsAutoClearLoaded = ref(false)
const smsAutoClearSaving = ref(false)
const developerBusy = ref(false)
const updateBusy = ref(false)
const updateInfo = ref(null)
const boardBusy = ref(false)
const boardInfo = ref({ version: '0.1.0', status: 'running' })
const https = ref(null)
const quota = ref(null)
const security = ref({
  mode: 'internal',
  allowed_cidrs_text: '',
  trust_proxy_headers: false,
  trusted_proxy_cidrs_text: '',
  client_ip: '',
  client_allowed: true,
})
const notify = ref(emptyNotify())
const licenseKey = ref('')
const licenseOn = ref(false)
const licenseBusy = ref(false)

const deliveries = ref([])
const deliveriesLoaded = ref(false)

async function loadDeliveries() {
  try {
    const payload = await fetchOnewifiNotificationDeliveries()
    deliveries.value = payload?.deliveries || []
    deliveriesLoaded.value = true
  } catch (err) {
    showToast(err?.message || '投递记录加载失败', 'error')
  }
}

async function clearDeliveries() {
  try {
    await clearOnewifiNotificationDeliveries()
    deliveries.value = []
    deliveriesLoaded.value = true
  } catch (err) {
    showToast(err?.message || '清空投递记录失败', 'error')
  }
}
function openNotify(key) {
  notifyDialogRef.value?.openNotify(key)
}

function applyLicense(raw = {}) {
  licenseKey.value = String(raw.code || raw.key || '').trim()
  licenseOn.value = Boolean(raw.activated && licenseKey.value)
}

async function activateLicense() {
  const key = licenseKey.value.trim()
  if (!key) {
    showToast('先填授权码', 'error')
    return
  }
  licenseBusy.value = true
  try {
    const live = await activateOnewifiLicense(key)
    applyLicense(live)
    showToast(live?.message || '授权码已绑定本机')
  } catch (err) {
    showToast(err?.message || '授权绑定失败', 'error')
  } finally {
    licenseBusy.value = false
  }
}

onMounted(async () => {
  try {
    applyLicense(await fetchOnewifiLicense())
  } catch {
    applyLicense()
  }
  try {
    const live = await fetchOnewifiSettings()
    settings.value = { ...live, language: readUiLanguage(live) || live.language || 'zh' }
    setUiLanguage(settings.value.language)
    notify.value = hydrateNotify(live)
  } catch (err) {
    showToast(err?.message || '无法读取设置', 'error')
  }
  try {
    const data = await getOneBoardVersion()
    boardInfo.value = {
      version: data?.version || data?.data?.version || '0.1.0',
      status: data?.status || 'running',
    }
  } catch {
    boardInfo.value = { version: '0.1.0', status: 'running' }
  }
  try {
    const data = await fetchOnewifiSecurity()
    security.value = {
      mode: data?.mode === 'public' ? 'public' : 'internal',
      allowed_cidrs_text: (data?.allowed_cidrs || []).join('\n'),
      trust_proxy_headers: Boolean(data?.trust_proxy_headers),
      trusted_proxy_cidrs_text: (data?.trusted_proxy_cidrs || []).join('\n'),
      client_ip: data?.client_ip || '',
      client_allowed: data?.client_allowed !== false,
    }
  } catch (err) {
    showToast(err?.message || '访问策略加载失败', 'error')
  }
  if (settings.value.developer) {
    fetchOnewifiHttpsSettings().then((data) => { https.value = data }).catch(() => { https.value = null })
    fetchOnewifiDeveloperSettings().then((data) => { quota.value = data }).catch(() => { quota.value = null })
  }
  fetchOnewifiVowifiSettings()
    .then((data) => {
      vowifiMtu.value = data?.mtu_compatibility === true
      vowifiMtuLoaded.value = true
    })
    .catch(() => {
      vowifiMtuLoaded.value = true
    })
  fetchOnewifiSmsSettings()
    .then((data) => {
      smsAutoClear.value = data?.auto_clear_modem_storage !== false
      smsAutoClearLoaded.value = true
    })
    .catch(() => {
      smsAutoClearLoaded.value = true
    })
  loadImeiPool()
})

const imeiGroups = computed(() => {
  const groups = []
  const index = new Map()
  for (const entry of imeiPool.value.entries || []) {
    const key = `${entry.brand || 'OTHER'}|${entry.model || ''}`
    if (!index.has(key)) {
      const group = { brand: entry.brand || 'OTHER', model: entry.model || '', entries: [] }
      index.set(key, group)
      groups.push(group)
    }
    index.get(key).entries.push(entry)
  }
  return groups
})

function applyImeiPool(data = {}) {
  imeiPool.value = {
    entries: Array.isArray(data.entries) ? data.entries : [],
    total: Number(data.total || 0),
    unused: Number(data.unused || 0),
  }
  imeiPoolLoaded.value = true
}

async function loadImeiPool() {
  try {
    applyImeiPool(await fetchOnewifiImeiPool())
  } catch {
    imeiPoolLoaded.value = true
  }
}

async function persistImeiPool(entries) {
  imeiPoolSaving.value = true
  try {
    applyImeiPool(await saveOnewifiImeiPool(entries))
  } catch (err) {
    showToast(err?.message || 'IMEI 池保存失败', 'error')
  } finally {
    imeiPoolSaving.value = false
  }
}

async function addImei() {
  const imei = String(imeiDraft.value.imei || '').replace(/\D/g, '')
  if (imei.length !== 15) {
    showToast('IMEI 必须是 15 位数字', 'error')
    return
  }
  const entries = [...(imeiPool.value.entries || [])]
  if (entries.some((row) => row.imei === imei)) {
    showToast('这条 IMEI 已经在池里', 'error')
    return
  }
  entries.push({
    imei,
    brand: String(imeiDraft.value.brand || '').trim(),
    model: String(imeiDraft.value.model || '').trim(),
  })
  await persistImeiPool(entries)
  imeiDraft.value.imei = ''
}

async function removeImei(imei) {
  await persistImeiPool((imeiPool.value.entries || []).filter((row) => row.imei !== imei))
}

async function setLanguage(lang) {
  if (saving.value) return
  const next = lang === 'en' ? 'en' : 'zh'
  const already = settings.value.language === next
  settings.value = { ...settings.value, language: next }
  setUiLanguage(next)
  if (already) return
  saving.value = true
  try {
    const live = await saveOnewifiSettings({ language: next })
    const language = readUiLanguage(live) || next
    settings.value = { ...live, language }
    setUiLanguage(language)
    showToast(language === 'en' ? 'Language saved' : '语言已保存')
  } catch (err) {
    showToast(err?.message || (next === 'en' ? 'Save failed' : '保存失败'), 'error')
  } finally {
    saving.value = false
  }
}

function onNotifySaved(live) {
  settings.value = { ...settings.value, ...live }
  notify.value = hydrateNotify(live)
}

async function saveSecurity() {
  securitySaving.value = true
  try {
    const data = await saveOnewifiSecurity({
      mode: security.value.mode,
      allowed_cidrs: security.value.allowed_cidrs_text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
      trust_proxy_headers: Boolean(security.value.trust_proxy_headers),
      trusted_proxy_cidrs: security.value.trusted_proxy_cidrs_text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    })
    security.value = {
      mode: data?.mode === 'public' ? 'public' : 'internal',
      allowed_cidrs_text: (data?.allowed_cidrs || []).join('\n'),
      trust_proxy_headers: Boolean(data?.trust_proxy_headers),
      trusted_proxy_cidrs_text: (data?.trusted_proxy_cidrs || []).join('\n'),
      client_ip: data?.client_ip || '',
      client_allowed: data?.client_allowed !== false,
    }
    showToast('访问策略已保存')
  } catch (err) {
    showToast(err?.message || '访问策略保存失败', 'error')
  } finally {
    securitySaving.value = false
  }
}

async function saveQuota(field) {
  if (!quota.value) return
  quotaSaving.value = true
  try {
    const body = field === 'device'
      ? { device_limit: Number(quota.value.device_limit) }
      : { sms_hourly_limit: Number(quota.value.sms_hourly_limit) }
    quota.value = await saveOnewifiDeveloperSettings(body)
    showToast(field === 'device' ? '设备配额已保存' : '短信小时限额已保存')
  } catch (err) {
    showToast(err?.message || '保存失败', 'error')
  } finally {
    quotaSaving.value = false
  }
}

async function toggleDeveloper(enabled) {
  if (developerBusy.value) return
  developerBusy.value = true
  try {
    const data = await saveOnewifiDeveloperMode(enabled)
    settings.value = { ...settings.value, developer: Boolean(data?.enabled) }
    if (settings.value.developer) {
      https.value = await fetchOnewifiHttpsSettings().catch(() => null)
      quota.value = await fetchOnewifiDeveloperSettings().catch(() => null)
      showToast(data?.plugins_need_restart
        ? '开发者模式已开启。漫游数据立刻可用；插件和出口代理需重启服务。'
        : '开发者模式已开启')
    } else {
      https.value = null
      quota.value = null
      showToast('开发者模式已关闭')
    }
  } catch (err) {
    showToast(err?.message || '开发者模式切换失败', 'error')
  } finally {
    developerBusy.value = false
  }
}

async function setSmsAutoClear(enabled) {
  if (smsAutoClearSaving.value || !smsAutoClearLoaded.value) return
  smsAutoClearSaving.value = true
  try {
    const data = await saveOnewifiSmsSettings(enabled)
    smsAutoClear.value = data?.auto_clear_modem_storage !== false
    showToast(enabled
      ? tCopy('已开启自动清理模组短信存储', 'Modem SMS auto-clear enabled')
      : tCopy('已关闭自动清理。存满后可能收不到新短信', 'Auto-clear off. A full mailbox may block new SMS'))
  } catch (err) {
    showToast(err?.message || tCopy('短信存储设置保存失败', 'Failed to save SMS storage setting'), 'error')
  } finally {
    smsAutoClearSaving.value = false
  }
}

async function setVowifiMtu(enabled) {
  if (vowifiMtuSaving.value || !vowifiMtuLoaded.value) return
  vowifiMtuSaving.value = true
  try {
    const data = await saveOnewifiVowifiSettings(enabled)
    vowifiMtu.value = data?.mtu_compatibility === true
    showToast(tCopy('设置已保存，请重连 VoWiFi 后生效', 'Saved. Reconnect VoWiFi to apply.'))
  } catch (err) {
    showToast(err?.message || tCopy('VoWiFi 兼容设置保存失败', 'Failed to save VoWiFi compatibility'), 'error')
  } finally {
    vowifiMtuSaving.value = false
  }
}

async function toggleHttps(enabled) {
  httpsSaving.value = true
  try {
    const data = await saveOnewifiHttpsSettings(enabled)
    https.value = data
    showToast(enabled ? 'HTTPS 已开启，正在切换连接' : 'HTTPS 已关闭，正在恢复 HTTP')
    const target = enabled ? data.https_url : data.http_url
    if (target) {
      window.setTimeout(() => {
        window.location.replace(target + window.location.pathname + window.location.search + window.location.hash)
      }, 700)
    } else {
      httpsSaving.value = false
    }
  } catch (err) {
    showToast(err?.message || 'HTTPS 配置保存失败', 'error')
    httpsSaving.value = false
  }
}

async function onChangePassword() {
  if (newPassword.value.length < 10) {
    showToast('新密码至少 10 位', 'error')
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    showToast('两次密码不一致', 'error')
    return
  }
  pwdBusy.value = true
  try {
    await changePassword({ currentPassword: currentPassword.value, newPassword: newPassword.value })
    showToast('密码已改，请重新登录')
    await router.push('/login')
  } catch (err) {
    showToast(err?.message || '改密失败', 'error')
  } finally {
    pwdBusy.value = false
  }
}

function downloadCardBackup(payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'card-backup.json'
  link.click()
  URL.revokeObjectURL(url)
}

async function onExportCardBackup() {
  cardBackupBusy.value = true
  try {
    const document = await exportCardBackup()
    if (!document?.cards?.length) {
      showToast('还没有可导出的卡设置', 'warning')
      return
    }
    downloadCardBackup(document)
    showToast(`已导出 ${document.cards.length} 张卡的设置`)
  } catch (err) {
    showToast(err?.message || '导出卡设置失败', 'error')
  } finally {
    cardBackupBusy.value = false
  }
}

async function readCardBackupFile(file) {
  const text = await file.text()
  const document = JSON.parse(text)
  if (!document || typeof document !== 'object' || !Array.isArray(document.cards)) {
    throw new Error('这不是卡策略备份')
  }
  return document
}

async function onCardBackupFile(event) {
  const file = event.target.files?.[0]
  cardBackupFile.value = null
  cardBackupPreview.value = null
  if (!file) return
  cardBackupBusy.value = true
  try {
    const document = await readCardBackupFile(file)
    cardBackupFile.value = document
    cardBackupPreview.value = await validateCardBackup(document)
    showToast(`校验通过，${cardBackupPreview.value.card_count} 张卡`)
  } catch (err) {
    showToast(err?.message || '备份校验失败', 'error')
  } finally {
    cardBackupBusy.value = false
    event.target.value = ''
  }
}

async function onRestoreCardBackup() {
  if (!cardBackupFile.value) {
    showToast('先选择一份备份', 'warning')
    return
  }
  cardBackupBusy.value = true
  try {
    const result = await restoreCardBackup(cardBackupFile.value, cardBackupImei.value)
    showToast(`已还原 ${result?.restored ?? cardBackupPreview.value?.card_count ?? 0} 张卡的设置`)
  } catch (err) {
    showToast(err?.message || '还原卡设置失败', 'error')
  } finally {
    cardBackupBusy.value = false
  }
}

async function checkBoardVersion() {
  boardBusy.value = true
  try {
    const data = await getOneBoardVersion()
    boardInfo.value = {
      version: data?.version || data?.data?.version || boardInfo.value.version,
      status: data?.status || 'running',
    }
    showToast('OneBoard 随网关发布，当前控制端已在运行')
  } catch {
    showToast('控制端版本随网关二进制发布，当前按本地包 0.1.0 显示')
  } finally {
    boardBusy.value = false
  }
}

async function checkUpdate() {
  updateBusy.value = true
  try {
    updateInfo.value = await checkOnewifiUpdate()
    showToast(updateInfo.value?.available ? '发现新版本' : (updateInfo.value?.message || '当前已是最新'))
  } catch (err) {
    showToast(err?.message || '检查更新失败', 'error')
  } finally {
    updateBusy.value = false
  }
}

const versionLabel = computed(() => settings.value?.version || 'OneWIFI')
const boardRunning = computed(() => boardInfo.value.status === 'running')
const wifiUpdateHint = computed(() => {
  if (!updateInfo.value) return ''
  if (updateInfo.value.available) return `最新 ${updateInfo.value.version}`
  return updateInfo.value.message || '已是最新'
})
</script>

<template>
  <div class="ow-page">
    <OwPageHead
      :title="tCopy('系统设置', 'Settings')"
      :desc="tCopy('版本、产品授权、外观和通知。登录口令在下面单独改。', 'Version, license, appearance, and notifications. Change the login password below.')"
    />

    <div class="ow-ver-grid" data-testid="settings-version-hero">
      <article class="ow-ver-card glass-frame">
        <header class="ow-ver-card__head">
          <div class="ow-ver-card__title">
            <span class="panel-title-icon panel-title-icon--blue"><MIcon name="view_module" size="sm" /></span>
            <div>
              <h3>OneBoard</h3>
              <p>控制端版本 · 本地服务</p>
            </div>
          </div>
          <span class="ow-ver-pill" :class="boardRunning ? 'is-ok' : 'is-off'">{{ boardRunning ? '运行中' : '离线' }}</span>
        </header>
        <p class="ow-ver-card__badge">当前版本 v{{ boardInfo.version }} · 状态 正常</p>
        <button type="button" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" :disabled="boardBusy" @click="checkBoardVersion">
          <MIcon name="system_update_alt" size="sm" />
          {{ boardBusy ? '检查中…' : '更新' }}
        </button>
      </article>

      <article class="ow-ver-card glass-frame">
        <header class="ow-ver-card__head">
          <div class="ow-ver-card__title">
            <span class="panel-title-icon panel-title-icon--teal"><MIcon name="router" size="sm" /></span>
            <div>
              <h3>OneWIFI</h3>
              <p>网关版本 · {{ settings.build_time || '本机服务' }}</p>
            </div>
          </div>
          <span class="ow-ver-pill is-ok">运行中</span>
        </header>
        <p class="ow-ver-card__badge">当前版本 {{ versionLabel }}{{ wifiUpdateHint ? ` · ${wifiUpdateHint}` : '' }}</p>
        <button type="button" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" :disabled="updateBusy" @click="checkUpdate">
          <MIcon name="update" size="sm" />
          {{ updateBusy ? '检查中…' : '检查更新' }}
        </button>
      </article>

      <article class="ow-ver-card glass-frame">
        <header class="ow-ver-card__head">
          <div class="ow-ver-card__title">
            <span class="panel-title-icon panel-title-icon--amber"><MIcon name="key" size="sm" /></span>
            <div>
              <h3>{{ tCopy('授权', 'License') }}</h3>
              <p>{{ tCopy('同一张码可激活软路由和安卓各一台。向销售获取。授权只做占席展示，不限制本机通话或设备功能。', 'One code binds this router and one Android app. Get it from sales. Registration is a seat record only and does not limit calling or device features.') }}</p>
            </div>
          </div>
          <span class="ow-ver-pill" :class="licenseOn ? 'is-ok' : 'is-off'">{{ licenseOn ? tCopy('已登记', 'Registered') : tCopy('未登记', 'Unregistered') }}</span>
        </header>
        <div class="ow-license-row">
          <label class="ow-field">
            <span>{{ tCopy('授权码', 'License key') }}</span>
            <input v-model.trim="licenseKey" type="text" autocomplete="off" :placeholder="tCopy('向销售获取', 'From sales')" :disabled="licenseBusy" />
          </label>
          <button type="button" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" :disabled="licenseBusy" @click="activateLicense">
            <MIcon name="key" size="sm" />
            {{ licenseBusy ? tCopy('绑定中…', 'Binding…') : (licenseOn ? tCopy('重新绑定', 'Rebind') : tCopy('激活', 'Activate')) }}
          </button>
        </div>
      </article>
    </div>

    <div class="ow-settings-trio">
      <OwGlassPanel :title="tCopy('外观', 'Appearance')" icon="tune" icon-tone="blue" :desc="tCopy('皮肤和明暗只留在这台浏览器，不进网关。', 'Skin and light or dark stay in this browser. This does not change the gateway.')">
        <div class="ow-theme-stack">
          <div class="ow-theme-row ow-theme-row--tall">
            <button type="button" class="ow-theme-chip glass-frame glass-frame--compact" :class="{ 'is-active': themeState.skin === 'onewifi' }" @click="setThemeSkin('onewifi')">OneWIFI</button>
            <button type="button" class="ow-theme-chip glass-frame glass-frame--compact" :class="{ 'is-active': themeState.skin === 'classic' }" @click="setThemeSkin('classic')">{{ tCopy('经典', 'Classic') }}</button>
          </div>
          <div class="ow-theme-row ow-theme-row--tall">
            <button type="button" class="ow-theme-chip glass-frame glass-frame--compact" :class="{ 'is-active': themeState.mode === 'light' }" @click="setThemeMode('light')">{{ tCopy('浅色', 'Light') }}</button>
            <button type="button" class="ow-theme-chip glass-frame glass-frame--compact" :class="{ 'is-active': themeState.mode === 'dark' }" @click="setThemeMode('dark')">{{ tCopy('深色', 'Dark') }}</button>
            <button type="button" class="ow-theme-chip glass-frame glass-frame--compact" :class="{ 'is-active': themeState.mode === 'auto' }" @click="setThemeMode('auto')">{{ tCopy('跟随系统', 'System') }}</button>
          </div>
        </div>
      </OwGlassPanel>

      <OwGlassPanel :title="tCopy('界面语言', 'Language')" icon="tune" icon-tone="blue" :desc="tCopy('只改这台浏览器的界面语言。', 'Interface language for this browser only.')">
        <div class="ow-theme-row ow-theme-row--tall">
          <button type="button" class="ow-theme-chip glass-frame glass-frame--compact" :class="{ 'is-active': settings.language === 'zh' }" :disabled="saving" @click="setLanguage('zh')">中文</button>
          <button type="button" class="ow-theme-chip glass-frame glass-frame--compact" :class="{ 'is-active': settings.language === 'en' }" :disabled="saving" @click="setLanguage('en')">English</button>
        </div>
      </OwGlassPanel>

      <OwGlassPanel :title="tCopy('开发者模式', 'Developer mode')" icon="tune" icon-tone="amber" :desc="tCopy('打开后才能拨开启网络。插件和出口代理仍要重启服务。', 'Required for roaming data. Plugins and export proxies still need a service restart.')">
        <div class="ow-theme-row ow-theme-row--tall">
          <button
            type="button"
            class="ow-theme-chip glass-frame glass-frame--compact"
            :class="{ 'is-active': settings.developer }"
            :disabled="developerBusy"
            data-testid="developer-mode-on"
            @click="toggleDeveloper(true)"
          >{{ tCopy('开启', 'On') }}</button>
          <button
            type="button"
            class="ow-theme-chip glass-frame glass-frame--compact"
            :class="{ 'is-active': !settings.developer }"
            :disabled="developerBusy"
            data-testid="developer-mode-off"
            @click="toggleDeveloper(false)"
          >{{ tCopy('关闭', 'Off') }}</button>
        </div>
      </OwGlassPanel>

    </div>

    <div class="ow-settings-stack">

    <OwGlassPanel
      :title="tCopy('VoWiFi MTU 兼容模式', 'VoWiFi MTU compatibility')"
      icon="tune"
      icon-tone="blue"
      :desc="tCopy('改善部分系统因网络包大小限制导致的注册失败', 'Helps when packet-size limits block VoWiFi registration')"
    >
      <div class="ow-theme-row ow-theme-row--tall">
        <button
          type="button"
          class="ow-theme-chip glass-frame glass-frame--compact"
          :class="{ 'is-active': vowifiMtu }"
          :disabled="!vowifiMtuLoaded || vowifiMtuSaving"
          data-testid="vowifi-mtu-on"
          @click="setVowifiMtu(true)"
        >{{ tCopy('开启', 'On') }}</button>
        <button
          type="button"
          class="ow-theme-chip glass-frame glass-frame--compact"
          :class="{ 'is-active': !vowifiMtu }"
          :disabled="!vowifiMtuLoaded || vowifiMtuSaving"
          data-testid="vowifi-mtu-off"
          @click="setVowifiMtu(false)"
        >{{ tCopy('关闭', 'Off') }}</button>
      </div>
      <p class="ow-page__sub" style="margin-top: 8px">
        {{ tCopy('默认关闭。遇到 MTU 不足导致的 VoWiFi 连接问题时可尝试开启。此设置适用于所有设备，保存后请重连 VoWiFi。', 'Off by default. Try enabling this if MTU limits cause VoWiFi problems. Applies to all devices; reconnect VoWiFi after saving.') }}
      </p>
    </OwGlassPanel>

    <OwGlassPanel
      :title="tCopy('IMEI 池', 'IMEI pool')"
      icon="key"
      icon-tone="amber"
      :desc="tCopy('读卡器没有 IMEI 时随机绑一条再拉 VoWiFi。模组不绑。', 'USB readers pick a free IMEI at random before VoWiFi. Modems are left alone.')"
    >
      <p class="ow-page__sub" data-testid="imei-pool-summary">
        {{ tCopy('共', 'Total') }} {{ imeiPool.total }} {{ tCopy('条，未绑定', 'unused') }} {{ imeiPool.unused }}
      </p>
      <div v-for="group in imeiGroups" :key="group.brand + group.model" class="ow-imei-group">
        <h4>{{ group.brand }}{{ group.model ? ` · ${group.model}` : '' }}</h4>
        <p v-for="row in group.entries" :key="row.imei" class="ow-imei-row">
          <code>{{ row.imei }}</code>
          <span>{{ row.bound ? row.bound_device_id : tCopy('空闲', 'Free') }}</span>
          <button type="button" class="ow-theme-chip glass-frame glass-frame--compact" :disabled="imeiPoolSaving" @click="removeImei(row.imei)">{{ tCopy('删除', 'Remove') }}</button>
        </p>
      </div>
      <form class="ow-license-row" data-testid="imei-pool-add" @submit.prevent="addImei">
        <label class="ow-field">
          <span>{{ tCopy('品牌', 'Brand') }}</span>
          <input v-model.trim="imeiDraft.brand" type="text" />
        </label>
        <label class="ow-field">
          <span>{{ tCopy('型号', 'Model') }}</span>
          <input v-model.trim="imeiDraft.model" type="text" />
        </label>
        <label class="ow-field">
          <span>IMEI</span>
          <input v-model.trim="imeiDraft.imei" type="text" inputmode="numeric" maxlength="15" placeholder="15 位数字" />
        </label>
        <button type="submit" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" :disabled="imeiPoolSaving || !imeiPoolLoaded">
          {{ tCopy('加入', 'Add') }}
        </button>
      </form>
    </OwGlassPanel>

    <OwGlassPanel
      :title="tCopy('自动清理模组短信存储', 'Auto-clear modem SMS storage')"
      icon="sms"
      icon-tone="blue"
      :desc="tCopy('入库成功后删除模组 SM/ME 副本，网页记录保留', 'Delete the modem SM/ME copy after a successful ingest. Web history stays.')"
    >
      <div class="ow-theme-row ow-theme-row--tall">
        <button
          type="button"
          class="ow-theme-chip glass-frame glass-frame--compact"
          :class="{ 'is-active': smsAutoClear }"
          :disabled="!smsAutoClearLoaded || smsAutoClearSaving"
          data-testid="sms-auto-clear-on"
          @click="setSmsAutoClear(true)"
        >{{ tCopy('开启', 'On') }}</button>
        <button
          type="button"
          class="ow-theme-chip glass-frame glass-frame--compact"
          :class="{ 'is-active': !smsAutoClear }"
          :disabled="!smsAutoClearLoaded || smsAutoClearSaving"
          data-testid="sms-auto-clear-off"
          @click="setSmsAutoClear(false)"
        >{{ tCopy('关闭', 'Off') }}</button>
      </div>
      <p class="ow-page__sub" style="margin-top: 8px">
        {{ tCopy('默认开启。模组 ME 通常只有二十多格。关闭后仍会同步到数据库，但不再删除模组原件，存满后可能收不到新短信。', 'On by default. The modem ME mailbox is usually only a few dozen slots. Turning this off still syncs to the database but leaves the modem copy, which can block new SMS when full.') }}
      </p>
    </OwGlassPanel>

    <OwGlassPanel title="通知" icon="notifications" icon-tone="blue" desc="点开通道填写参数，保存后立刻生效。">
      <div class="ow-notify-grid">
        <button
          v-for="tab in NOTIFY_TABS"
          :id="tab.key === 'telegram' ? 'notify' : undefined"
          :key="tab.key"
          type="button"
          class="ow-notify-tile glass-frame"
          @click="openNotify(tab.key)"
        >
          <span class="ow-notify-tile__name">{{ tab.label }}</span>
          <span class="ow-notify-tile__state">{{ notify[tab.key]?.enabled ? '已开启' : '已关闭' }}</span>
        </button>
      </div>
    </OwGlassPanel>

    <SettingsNotifyDialog ref="notifyDialogRef" v-model:notify="notify" @saved="onNotifySaved" />

      <div class="ow-page__actions">
        <button type="button" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" @click="loadDeliveries">最近投递</button>
        <button type="button" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" :disabled="!deliveries.length" @click="clearDeliveries">清空记录</button>
      </div>
      <p v-if="deliveriesLoaded && !deliveries.length" class="ow-page__sub">还没有投递记录。</p>
      <ul v-else-if="deliveries.length" class="ow-page__sub">
        <li v-for="row in deliveries.slice(0, 8)" :key="row.id || row.created_at">{{ row.channel }} · {{ row.event }} · {{ row.status }}</li>
      </ul>
    <OwGlassPanel title="登录与访问" icon="security" icon-tone="amber" desc="改登录口令，以及谁能打开这块面板。">
      <div class="ow-form-grid ow-form-grid--2">
        <label class="ow-field"><span>当前密码</span><input v-model="currentPassword" type="password" autocomplete="current-password" /></label>
        <label class="ow-field"><span>新密码（≥10）</span><input v-model="newPassword" type="password" autocomplete="new-password" /></label>
    <OwGlassPanel title="卡策略备份" icon="sim_card" icon-tone="blue" desc="按 ICCID 带走 APN、VoWiFi、飞行模式和语音路径。不含短信和 PIN。">
      <div class="ow-page__actions">
        <button type="button" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" :disabled="cardBackupBusy" @click="onExportCardBackup">
          导出
        </button>
        <label class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill">
          选择备份
          <input type="file" accept="application/json,.json" hidden :disabled="cardBackupBusy" @change="onCardBackupFile" />
        </label>
        <button type="button" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" :disabled="cardBackupBusy || !cardBackupFile" @click="onRestoreCardBackup">
          还原
        </button>
      </div>
      <label class="ow-field" style="margin-top: 12px">
        <span>目标 IMEI（备份绑了设备时填写）</span>
        <input v-model="cardBackupImei" type="text" inputmode="numeric" autocomplete="off" />
      </label>
      <p v-if="cardBackupPreview" class="ow-page__sub" style="margin-top: 8px">
        {{ cardBackupPreview.card_count }} 张卡
        <template v-if="cardBackupPreview.cards?.length">
          · 尾号 {{ cardBackupPreview.cards.map((card) => card.iccid_tail).join('、') }}
        </template>
      </p>
    </OwGlassPanel>

        <label class="ow-field"><span>确认新密码</span><input v-model="confirmPassword" type="password" autocomplete="new-password" /></label>
        <label class="ow-field">
          <span>访问模式</span>
          <select v-model="security.mode">
            <option value="internal">仅内网</option>
            <option value="public">公网 + 允许列表</option>
          </select>
        </label>
      </div>
      <label class="ow-field" style="margin-top: 12px">
        <span>额外允许 CIDR（每行一条）</span>
        <textarea v-model="security.allowed_cidrs_text" rows="3" placeholder="10.0.0.0/8"></textarea>
      </label>
      <label class="ow-row" style="margin-top: 10px">
        <span>信任反向代理头</span>
        <input v-model="security.trust_proxy_headers" type="checkbox" />
      </label>
      <label class="ow-field" style="margin-top: 12px">
        <span>可信反代 CIDR（每行一条；不填则忽略代理头）</span>
        <textarea v-model="security.trusted_proxy_cidrs_text" rows="2" placeholder="10.0.0.1/32"></textarea>
      </label>
      <p class="ow-page__sub" style="margin-top: 8px">当前客户端 {{ security.client_ip || '—' }} · {{ security.client_allowed ? '允许' : '拒绝' }}</p>
      <div class="ow-page__actions" style="margin-top: 12px">
        <button type="button" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" :disabled="pwdBusy" @click="onChangePassword">
          <MIcon name="security" size="sm" />
          {{ pwdBusy ? '提交中…' : '改密并退出' }}
        </button>
        <button type="button" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" :disabled="securitySaving" @click="saveSecurity">
          <MIcon name="security" size="sm" />
          {{ securitySaving ? '保存中…' : '保存访问策略' }}
        </button>
      </div>
    </OwGlassPanel>

    <OwGlassPanel v-if="https" title="HTTPS" icon="security" icon-tone="amber" desc="自签证书，仅开发者模式可用。">
      <label class="ow-row">
        <span>启用 HTTPS</span>
        <input type="checkbox" :checked="!!https.enabled" :disabled="httpsSaving" @change="toggleHttps($event.target.checked)" />
      </label>
      <p v-if="https.fingerprint" class="ow-page__sub" style="margin-top: 8px">指纹 {{ https.fingerprint }}</p>
    </OwGlassPanel>

    <OwGlassPanel v-if="quota" title="设备配额 / 短信限额" icon="tune" icon-tone="purple" desc="仅开发者模式。">
      <div class="ow-form-grid">
        <label class="ow-field">
          <span>设备上限（1–{{ quota.max_device_limit || 10 }}）</span>
          <input v-model.number="quota.device_limit" type="number" min="1" />
        </label>
        <label class="ow-field">
          <span>短信每小时上限（1–{{ quota.max_sms_hourly_limit || 20 }}）</span>
          <input v-model.number="quota.sms_hourly_limit" type="number" min="1" />
        </label>
      </div>
      <div class="ow-page__actions" style="margin-top: 12px">
        <button type="button" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" :disabled="quotaSaving" @click="saveQuota('device')">保存设备配额</button>
        <button type="button" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" :disabled="quotaSaving" @click="saveQuota('sms')">保存短信限额</button>
      </div>
    </OwGlassPanel>
    </div>
  </div>
</template>
