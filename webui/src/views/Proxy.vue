<script setup>
import { computed, onMounted, ref } from 'vue'
import {
  deleteOnewifiCountryRule,
  deleteOnewifiUpstreamProxy,
  fetchOnewifiCountryRules,
  fetchOnewifiEgressStatus,
  fetchOnewifiProxyCountries,
  saveOnewifiCountryRule,
  saveOnewifiUpstreamProxy,
} from '../api/onewifiGateway'
import { useAppStore } from '../stores/app'
import OwPageHead from '../components/OwPageHead.vue'
import OwGlassPanel from '../components/OwGlassPanel.vue'
import OwProxyCountryCard from '../components/OwProxyCountryCard.vue'
import MIcon from '../components/MIcon.vue'
import { composeProxyAddr, proxyDisplayName, uniqueProxyId } from '../utils/upstreamProxy'
import '../assets/onewifi-pages.css'

const { showToast } = useAppStore()
const proxies = ref([])
const countries = ref([])
const countryRules = ref([])
const loading = ref(false)
const saving = ref(false)
const togglingByCountry = ref({})
const assigningByCountry = ref({})
const deletingByCountry = ref({})
const draftName = ref('')
const draftHost = ref('')
const draftPort = ref('')
const dialog = ref('')
const countryQuery = ref('')
const addCountryCode = ref('')
const addCountryProxyId = ref('')
const dialogSaving = ref(false)
const loadError = ref('')
const proxyRoutingOff = ref(false)
let loadRequestId = 0

const list = computed(() => proxies.value || [])
const proxyById = computed(() => Object.fromEntries(list.value.map((item) => [item.id, item])))

const sortedRules = computed(() => [...countryRules.value].sort((a, b) => String(a.country_name || a.country_code)
  .localeCompare(String(b.country_name || b.country_code), 'zh-CN')))

const usedCodes = computed(() => new Set(countryRules.value.map((rule) => String(rule.country_code || '').toUpperCase())))

const availableCountries = computed(() => {
  const q = countryQuery.value.trim().toLowerCase()
  return [...countries.value]
    .filter((country) => !usedCodes.value.has(String(country.country_code || '').toUpperCase()))
    .filter((country) => {
      if (!q) return true
      return [country.country_name, country.country_code, ...(country.mccs || [])]
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
    .sort((a, b) => String(a.country_name || a.country_code)
      .localeCompare(String(b.country_name || b.country_code), 'zh-CN'))
})

function setCountryBusy(bucket, countryCode, busy) {
  const code = String(countryCode || '').trim().toUpperCase()
  if (!code) return
  const next = { ...bucket.value }
  if (busy) next[code] = true
  else delete next[code]
  bucket.value = next
}

function isCountryBusy(countryCode) {
  const code = String(countryCode || '').trim().toUpperCase()
  return Boolean(
    togglingByCountry.value[code]
    || assigningByCountry.value[code]
    || deletingByCountry.value[code],
  )
}

async function load() {
  const requestId = ++loadRequestId
  loading.value = true
  try {
    const [live, countryList, ruleList] = await Promise.all([
      fetchOnewifiEgressStatus(),
      fetchOnewifiProxyCountries(),
      fetchOnewifiCountryRules(),
    ])
    if (requestId !== loadRequestId) return
    proxies.value = live.proxies || []
    proxyRoutingOff.value = live.enabled === false
    countries.value = Array.isArray(countryList) ? countryList : []
    countryRules.value = Array.isArray(ruleList) ? ruleList : []
    loadError.value = ''
    if (live.statusError) showToast(live.statusError, 'error')
  } catch (err) {
    if (requestId !== loadRequestId) return
    loadError.value = err?.message || '无法读取代理'
    showToast(loadError.value, 'error')
  } finally {
    if (requestId === loadRequestId) loading.value = false
  }
}

onMounted(() => { void load() })

function closeDialog() {
  if (dialogSaving.value) return
  dialog.value = ''
  countryQuery.value = ''
  addCountryCode.value = ''
  addCountryProxyId.value = ''
}

function openAddCountry() {
  if (!list.value.length) {
    showToast('先在上面加一个代理', 'warning')
    return
  }
  countryQuery.value = ''
  addCountryCode.value = availableCountries.value[0]?.country_code || ''
  addCountryProxyId.value = list.value[0]?.id || ''
  dialog.value = 'country'
}

async function addProxy() {
  const name = String(draftName.value || '').trim()
  if (!name) {
    showToast('先填名称', 'error')
    return
  }
  let addr = ''
  try {
    addr = composeProxyAddr(draftHost.value, draftPort.value)
  } catch (err) {
    showToast(err?.message || '地址无效', 'error')
    return
  }
  const existing = list.value.find((item) => item.addr === addr)
  if (existing && String(existing.name || '').trim() === name) {
    showToast('这个地址已经加过了', 'warning')
    return
  }
  saving.value = true
  try {
    if (existing) {
      await saveOnewifiUpstreamProxy({
        id: existing.id,
        name,
        addr: existing.addr,
        username: existing.username || '',
        password: existing.password || '',
        enabled: existing.enabled !== false,
      }, { create: false })
      draftName.value = ''
      draftHost.value = ''
      draftPort.value = ''
      showToast('已改名称')
      await load()
      return
    }
    const id = uniqueProxyId(addr, list.value)
    await saveOnewifiUpstreamProxy({
      id,
      name,
      addr,
      username: '',
      password: '',
      enabled: true,
    }, { create: true })
    draftName.value = ''
    draftHost.value = ''
    draftPort.value = ''
    showToast('代理已添加')
    await load()
  } catch (err) {
    showToast(err?.message || '添加失败', 'error')
  } finally {
    saving.value = false
  }
}

async function removeProxy(item) {
  if (!window.confirm(`删除「${proxyDisplayName(item)}」？用到它的国家规则会一起清掉。`)) return
  try {
    const affected = countryRules.value.filter((rule) => rule.upstream_proxy_id === item.id)
    await deleteOnewifiUpstreamProxy(item.id)
    await Promise.all(affected.map((rule) => deleteOnewifiCountryRule(rule.country_code).catch(() => null)))
    showToast('上游代理已删除')
    await load()
  } catch (err) {
    showToast(err?.message || '删除失败', 'error')
  }
}

async function toggleCountry(rule) {
  const code = String(rule?.country_code || '').trim().toUpperCase()
  const proxyId = String(rule?.upstream_proxy_id || '').trim()
  const nextEnabled = rule?.enabled === false
  if (!code || !proxyId || isCountryBusy(code)) return
  setCountryBusy(togglingByCountry, code, true)
  try {
    await saveOnewifiCountryRule(code, {
      upstream_proxy_id: proxyId,
      enabled: nextEnabled,
    })
    showToast(nextEnabled ? '已启用' : '已禁用')
    await load()
  } catch (err) {
    showToast(err?.message || '切换失败', 'error')
  } finally {
    setCountryBusy(togglingByCountry, code, false)
  }
}

async function assignCountry(rule, proxyId) {
  const code = String(rule?.country_code || '').trim().toUpperCase()
  const targetProxyId = String(proxyId || '').trim()
  const enabled = rule?.enabled !== false
  if (!code || !targetProxyId || isCountryBusy(code)) return
  setCountryBusy(assigningByCountry, code, true)
  try {
    await saveOnewifiCountryRule(code, {
      upstream_proxy_id: targetProxyId,
      enabled,
    })
    showToast('已改出口代理')
    await load()
  } catch (err) {
    showToast(err?.message || '选取代理失败', 'error')
  } finally {
    setCountryBusy(assigningByCountry, code, false)
  }
}

async function removeCountry(rule) {
  const code = String(rule?.country_code || '').trim().toUpperCase()
  if (!code || isCountryBusy(code)) return
  if (!window.confirm(`去掉「${rule.country_name || rule.country_code}」这条国家规则？`)) return
  setCountryBusy(deletingByCountry, code, true)
  try {
    await deleteOnewifiCountryRule(code)
    showToast('国家规则已去掉')
    await load()
  } catch (err) {
    showToast(err?.message || '去掉失败', 'error')
  } finally {
    setCountryBusy(deletingByCountry, code, false)
  }
}

async function saveAddCountry() {
  const code = String(addCountryCode.value || '').trim()
  const proxyId = String(addCountryProxyId.value || '').trim()
  if (!code) {
    showToast('先选一个国家', 'error')
    return
  }
  if (!proxyId) {
    showToast('先选上面的代理', 'error')
    return
  }
  dialogSaving.value = true
  try {
    await saveOnewifiCountryRule(code, { upstream_proxy_id: proxyId, enabled: true })
    showToast('国家规则已添加')
    closeDialog()
    await load()
  } catch (err) {
    showToast(err?.message || '添加国家失败', 'error')
  } finally {
    dialogSaving.value = false
  }
}
</script>

<template>
  <div class="ow-page">
    <OwPageHead title="代理管理" desc="上面用短名称管代理。下面的国家自己选出口、自己开关。未匹配的卡直连。" />

    <OwGlassPanel title="上游代理" icon="lan" desc="名称给页面看，IP 和端口才是真地址。同一地址再提交一次会改名称。">
      <form class="ow-proxy-add-row" @submit.prevent="addProxy">
        <label class="ow-field ow-proxy-add-row__name">
          <span>名称</span>
          <input v-model.trim="draftName" type="text" maxlength="32" autocomplete="off" placeholder="家宽" :disabled="saving" />
        </label>
        <label class="ow-field ow-proxy-add-row__host">
          <span>IP / 主机</span>
          <input v-model.trim="draftHost" type="text" autocomplete="off" placeholder="192.168.1.99" :disabled="saving" />
        </label>
        <label class="ow-field ow-proxy-add-row__port">
          <span>端口</span>
          <input v-model.trim="draftPort" type="text" inputmode="numeric" autocomplete="off" placeholder="7891" :disabled="saving" />
        </label>
        <button type="submit" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" :disabled="saving">
          <MIcon name="add" size="sm" />
          {{ saving ? '添加中…' : '添加' }}
        </button>
      </form>
      <p v-if="proxyRoutingOff && list.length" class="onewifi-region-warn">国家出口总开关是关的。这里保存的代理不会被拿去转发。</p>
      <div v-if="loading && !list.length" class="ow-page__empty glass-frame glass-frame--compact">加载中…</div>
      <div v-else-if="loadError && !list.length" class="ow-page__empty glass-frame glass-frame--compact">{{ loadError }}</div>
      <div v-else-if="!list.length" class="ow-page__empty glass-frame glass-frame--compact">还没有代理。用上面这一排加上。</div>
      <ul v-else class="ow-proxy-chip-list">
        <li v-for="item in list" :key="item.id" class="ow-proxy-chip glass-frame glass-frame--compact" :title="item.addr || item.id">
          <span class="ow-proxy-chip__text">
            <span class="ow-proxy-chip__name">{{ proxyDisplayName(item) }}</span>
            <span v-if="item.addr && proxyDisplayName(item) !== item.addr" class="ow-proxy-chip__addr">{{ item.addr }}</span>
          </span>
          <button type="button" class="ow-proxy-chip__remove" :aria-label="`删除 ${proxyDisplayName(item)}`" @click="removeProxy(item)">删除</button>
        </li>
      </ul>
    </OwGlassPanel>

    <OwGlassPanel title="国家规则" icon="public" desc="每个国家单独启用或禁用，出口只能选上面已经加好的代理。">
      <div class="ow-proxy-country-toolbar">
        <button type="button" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" @click="openAddCountry">
          <MIcon name="add" size="sm" />
          增加国家
        </button>
      </div>
      <div class="ow-proxy-stack">
        <OwProxyCountryCard
          v-for="rule in sortedRules"
          :key="rule.country_code"
          :country="rule"
          :proxy="proxyById[rule.upstream_proxy_id] || null"
          :proxies="list"
          :busy="isCountryBusy(rule.country_code)"
          @toggle="toggleCountry(rule)"
          @assign="assignCountry(rule, $event)"
          @remove="removeCountry(rule)"
        />
      </div>
    </OwGlassPanel>

    <Teleport to="body">
      <div v-if="dialog === 'country'" class="ow-dialog-overlay" @click.self="closeDialog">
        <div class="ow-dialog glass-frame panel-card panel-neutral" role="dialog" aria-labelledby="add-country-dialog-title">
          <header class="ow-dialog__head">
            <h2 id="add-country-dialog-title">增加国家</h2>
            <button type="button" class="ow-dialog__close" aria-label="关闭" @click="closeDialog">×</button>
          </header>
          <input v-model="countryQuery" class="ow-search" type="search" placeholder="搜索国家" />
          <div class="ow-form-grid">
            <label class="ow-field">
              <span>国家</span>
              <select v-model="addCountryCode" :disabled="dialogSaving">
                <option value="">选择国家</option>
                <option v-for="country in availableCountries" :key="country.country_code" :value="country.country_code">
                  {{ country.country_name || country.country_code }}
                </option>
              </select>
            </label>
            <label class="ow-field">
              <span>出口代理</span>
              <select v-model="addCountryProxyId" :disabled="dialogSaving">
                <option value="">选择代理</option>
                <option v-for="item in list" :key="item.id" :value="item.id">{{ proxyDisplayName(item) }}</option>
              </select>
            </label>
          </div>
          <p v-if="!availableCountries.length" class="ow-page__empty" style="margin-top: 12px">没有可增加的国家</p>
          <footer class="ow-dialog__foot">
            <button type="button" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" :disabled="dialogSaving" @click="closeDialog">取消</button>
            <button type="button" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" :disabled="dialogSaving" @click="saveAddCountry">{{ dialogSaving ? '添加中…' : '添加' }}</button>
          </footer>
        </div>
      </div>
    </Teleport>
  </div>
</template>
