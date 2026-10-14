<script setup>
import { computed, ref, watch } from 'vue'
import {
  fetchOnewifiOneToolsPairing,
  rotateOnewifiOneToolsPairing,
  saveOnewifiSettings,
  testOnewifiBark,
  testOnewifiEmail,
  testOnewifiPushPlus,
  testOnewifiTelegram,
  testOnewifiWebhook,
  testOnewifiWecom,
} from '../api/onewifiGateway'
import { useAppStore } from '../stores/app'
import { copyText } from '../utils/copyText.js'
import { normalizePairingOrigin, rewritePairingPayload } from '../utils/pairingOrigin.js'
import { NOTIFY_TABS, hydrateNotify, urlLines, urlsFromText } from '../views/settingsNotifyModel'
import MIcon from './MIcon.vue'

const props = defineProps({
  notify: { type: Object, required: true },
})
const emit = defineEmits(['update:notify', 'saved'])
const { showToast } = useAppStore()
const notifyTab = ref('telegram')
const notifyOpen = ref(false)
const notifySaving = ref(false)
const testing = ref('')
const pairingBusy = ref(false)
const pairingTarget = ref('lan')
const pairing = ref({ enabled: false, token_set: false, uri: '', json: '', origin: '' })
const urlDraft = ref({ bark: '', webhook: '', wecom: '' })

function loadUrlDrafts(source = props.notify) {
  urlDraft.value = {
    bark: urlLines(source?.bark),
    webhook: urlLines(source?.webhook),
    wecom: urlLines(source?.wecom),
  }
}

function onUrlsInput(name, text) {
  urlDraft.value = { ...urlDraft.value, [name]: text }
  patchNotify(name, urlsFromText(text))
}

const notifyCanTest = computed(() => notifyTab.value !== 'pushplus' && notifyTab.value !== 'onetools')
const displayedPairing = computed(() => {
  if (pairingTarget.value !== 'public') {
    return { uri: pairing.value.uri, json: pairing.value.json }
  }
  return rewritePairingPayload({
    uri: pairing.value.uri,
    json: pairing.value.json,
    origin: props.notify.onetools?.public_base_url,
  })
})
const pairingEmptyHint = computed(() => {
  if (pairingTarget.value === 'public') return '先填公网地址后再复制'
  return '保存并打开渠道后出示'
})

function openNotify(key) {
  loadUrlDrafts()
  notifyTab.value = key
  notifyOpen.value = true
}

function closeNotify() {
  notifyOpen.value = false
}

function patchNotify(name, extra) {
  emit('update:notify', { ...props.notify, [name]: { ...props.notify[name], ...extra } })
}

async function loadPairing() {
  pairingBusy.value = true
  try {
    pairing.value = await fetchOnewifiOneToolsPairing()
  } catch (err) {
    showToast(err?.message || '读不到配对码', 'error')
  } finally {
    pairingBusy.value = false
  }
}

async function rotatePairing() {
  pairingBusy.value = true
  try {
    pairing.value = await rotateOnewifiOneToolsPairing()
    showToast('已签发新令牌，手机要重新粘贴配对码')
  } catch (err) {
    showToast(err?.message || '轮换失败', 'error')
  } finally {
    pairingBusy.value = false
  }
}

async function copyPairing(kind) {
  const text = kind === 'json' ? displayedPairing.value.json : displayedPairing.value.uri
  if (!text) {
    showToast(pairingTarget.value === 'public' ? '先填公网地址' : '还没有配对码', 'error')
    return
  }
  const ok = await copyText(text)
  if (ok) showToast(kind === 'json' ? 'JSON 已复制' : '配对链接已复制')
  else showToast('复制失败，请手动选中复制', 'error')
}

async function saveNotify() {
  const payload = { ...props.notify }
  if (notifyTab.value === 'onetools') {
    const raw = payload.onetools?.public_base_url
    const origin = normalizePairingOrigin(raw)
    if (String(raw || '').trim() && !origin) {
      showToast('公网地址无效', 'error')
      return
    }
    payload.onetools = { ...payload.onetools, public_base_url: origin }
    emit('update:notify', payload)
  }
  notifySaving.value = true
  try {
    const live = await saveOnewifiSettings(payload)
    loadUrlDrafts(hydrateNotify(live))
    emit('saved', live)
    showToast('通知设置已保存')
    if (notifyTab.value === 'onetools') await loadPairing()
  } catch (err) {
    showToast(err?.message || '保存失败', 'error')
  } finally {
    notifySaving.value = false
  }
}

async function testChannel(kind) {
  testing.value = kind
  try {
    const channel = { ...props.notify[kind] }
    if (kind === 'webhook') await testOnewifiWebhook(channel)
    else if (kind === 'telegram') await testOnewifiTelegram(channel)
    else if (kind === 'pushplus') await testOnewifiPushPlus(channel)
    else if (kind === 'email') {
      if (typeof channel.to_addresses === 'string') {
        channel.to_addresses = channel.to_addresses.split(/[,;\s]+/).filter(Boolean)
      }
      await testOnewifiEmail(channel)
    }
    else if (kind === 'bark') await testOnewifiBark(channel)
    else if (kind === 'wecom') await testOnewifiWecom(channel)
    showToast('测试已发送')
  } catch (err) {
    showToast(err?.message || '测试失败', 'error')
  } finally {
    testing.value = ''
  }
}

watch([notifyOpen, notifyTab], ([open, tab]) => {
  if (open && tab === 'onetools') loadPairing()
})

defineExpose({ openNotify })
</script>

<template>
  <Teleport to="body">
    <div v-if="notifyOpen" class="ow-dialog-overlay" @click.self="closeNotify">
      <div class="ow-dialog ow-dialog--sheet glass-frame panel-card panel-neutral" role="dialog">
        <header class="ow-dialog__head">
          <h2>{{ NOTIFY_TABS.find((tab) => tab.key === notifyTab)?.label || '通知' }}</h2>
          <button type="button" class="ow-dialog__close" aria-label="关闭" @click="closeNotify">×</button>
        </header>

        <div class="ow-dialog__body">
    <template v-if="notifyTab === 'telegram'">
      <label class="ow-row"><span>启用</span><input type="checkbox" :checked="!!notify.telegram.enabled" @change="patchNotify('telegram', { enabled: $event.target.checked })" /></label>
      <div class="ow-form-grid ow-form-grid--2">
        <label class="ow-field"><span>Bot token</span><input :value="notify.telegram.bot_token" type="password" @input="patchNotify('telegram', { bot_token: $event.target.value })" /></label>
        <label class="ow-field"><span>Chat ID</span><input :value="notify.telegram.chat_id" @input="patchNotify('telegram', { chat_id: $event.target.value })" /></label>
        <label class="ow-field"><span>Admin ID</span><input :value="notify.telegram.admin_id" @input="patchNotify('telegram', { admin_id: $event.target.value })" /></label>
        <label class="ow-field"><span>Base URL</span><input :value="notify.telegram.base_url" placeholder="可空" @input="patchNotify('telegram', { base_url: $event.target.value })" /></label>
        <label class="ow-field"><span>代理</span><input :value="notify.telegram.proxy" placeholder="可空" @input="patchNotify('telegram', { proxy: $event.target.value })" /></label>
      </div>
    </template>

    <template v-else-if="notifyTab === 'bark'">
      <label class="ow-row"><span>启用</span><input type="checkbox" :checked="!!notify.bark.enabled" @change="patchNotify('bark', { enabled: $event.target.checked })" /></label>
      <div class="ow-form-grid ow-form-grid--2">
        <label class="ow-field"><span>推送 URL</span><textarea :value="urlDraft.bark" rows="3" @input="onUrlsInput('bark', $event.target.value)" /></label>
        <label class="ow-field"><span>分组</span><input :value="notify.bark.group" @input="patchNotify('bark', { group: $event.target.value })" /></label>
        <label class="ow-field"><span>图标</span><input :value="notify.bark.icon" @input="patchNotify('bark', { icon: $event.target.value })" /></label>
        <label class="ow-field"><span>级别</span><input :value="notify.bark.level" @input="patchNotify('bark', { level: $event.target.value })" /></label>
      </div>
    </template>

    <template v-else-if="notifyTab === 'email'">
      <label class="ow-row"><span>启用</span><input type="checkbox" :checked="!!notify.email.enabled" @change="patchNotify('email', { enabled: $event.target.checked })" /></label>
      <div class="ow-form-grid ow-form-grid--2">
        <label class="ow-field"><span>SMTP 主机</span><input :value="notify.email.smtp_host" @input="patchNotify('email', { smtp_host: $event.target.value })" /></label>
        <label class="ow-field"><span>端口</span><input :value="notify.email.smtp_port" type="number" @input="patchNotify('email', { smtp_port: Number($event.target.value) || 0 })" /></label>
        <label class="ow-field"><span>用户名</span><input :value="notify.email.username" @input="patchNotify('email', { username: $event.target.value })" /></label>
        <label class="ow-field"><span>密码</span><input :value="notify.email.password" type="password" @input="patchNotify('email', { password: $event.target.value })" /></label>
        <label class="ow-field"><span>发件人</span><input :value="notify.email.from_address" @input="patchNotify('email', { from_address: $event.target.value })" /></label>
        <label class="ow-field"><span>收件人（逗号分隔）</span><input :value="notify.email.to_addresses" @input="patchNotify('email', { to_addresses: $event.target.value })" /></label>
      </div>
      <label class="ow-row" style="margin-top: 8px"><span>SSL</span><input type="checkbox" :checked="!!notify.email.use_ssl" @change="patchNotify('email', { use_ssl: $event.target.checked })" /></label>
    </template>

    <template v-else-if="notifyTab === 'pushplus'">
      <label class="ow-row"><span>启用</span><input type="checkbox" :checked="!!notify.pushplus.enabled" @change="patchNotify('pushplus', { enabled: $event.target.checked })" /></label>
      <div class="ow-form-grid ow-form-grid--2">
        <label class="ow-field"><span>Token</span><input :value="notify.pushplus.token" type="password" @input="patchNotify('pushplus', { token: $event.target.value })" /></label>
        <label class="ow-field"><span>Topic</span><input :value="notify.pushplus.topic" @input="patchNotify('pushplus', { topic: $event.target.value })" /></label>
        <label class="ow-field"><span>Channel</span><input :value="notify.pushplus.channel" @input="patchNotify('pushplus', { channel: $event.target.value })" /></label>
      </div>
      <p class="ow-page__sub" style="margin-top: 8px">此通道不支持连通测试。</p>
    </template>

    <template v-else-if="notifyTab === 'webhook'">
      <label class="ow-row"><span>启用</span><input type="checkbox" :checked="!!notify.webhook.enabled" @change="patchNotify('webhook', { enabled: $event.target.checked })" /></label>
      <div class="ow-form-grid ow-form-grid--2">
        <label class="ow-field"><span>URL</span><textarea :value="urlDraft.webhook" rows="3" @input="onUrlsInput('webhook', $event.target.value)" /></label>
        <label class="ow-field"><span>Secret</span><input :value="notify.webhook.secret" type="password" @input="patchNotify('webhook', { secret: $event.target.value })" /></label>
        <label class="ow-field"><span>超时（毫秒）</span><input :value="notify.webhook.timeout_ms" type="number" min="100" max="30000" @input="patchNotify('webhook', { timeout_ms: Number($event.target.value) })" /></label>
      </div>
    </template>

    <template v-else-if="notifyTab === 'onetools'">
      <label class="ow-row"><span>启用</span><input type="checkbox" :checked="!!notify.onetools?.enabled" @change="patchNotify('onetools', { enabled: $event.target.checked })" /></label>
      <p class="ow-page__sub" style="margin-top: 8px">配对链接或 JSON，二选一。复制到 OneTools：增强 → OneWifi → 设置，贴一行后点保存。然后打开「连接」。</p>
      <div class="ow-theme-row ow-pairing-switch">
        <button
          type="button"
          class="ow-theme-chip glass-frame glass-frame--compact"
          :class="{ 'is-active': pairingTarget === 'lan' }"
          data-testid="onetools-pairing-lan"
          @click="pairingTarget = 'lan'"
        >当前访问</button>
        <button
          type="button"
          class="ow-theme-chip glass-frame glass-frame--compact"
          :class="{ 'is-active': pairingTarget === 'public' }"
          data-testid="onetools-pairing-public"
          @click="pairingTarget = 'public'"
        >公网</button>
      </div>
      <label v-if="pairingTarget === 'public'" class="ow-field" style="margin-top: 10px">
        <span>公网地址</span>
        <input
          :value="notify.onetools?.public_base_url"
          placeholder="http://公网IP:端口"
          data-testid="onetools-public-base-url"
          @input="patchNotify('onetools', { public_base_url: $event.target.value })"
        />
      </label>
      <p class="ow-page__sub" style="margin-top: 8px">
        {{ pairingTarget === 'public'
          ? '出门用流量用这个地址。登录与访问也要开「公网」。'
          : '用现在打开网页的地址。同一 Wi-Fi 下用这个。' }}
      </p>
      <div class="ow-pairing" style="margin-top: 12px">
        <label class="ow-field">
          <span>配对链接</span>
          <div class="ow-pairing-row">
            <input
              :value="displayedPairing.uri"
              :placeholder="pairingEmptyHint"
              readonly
              data-testid="onetools-pairing-uri"
            />
            <button type="button" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" :disabled="pairingBusy || !displayedPairing.uri" @click="copyPairing('uri')">复制</button>
          </div>
        </label>
        <label class="ow-field">
          <span>JSON</span>
          <div class="ow-pairing-row">
            <input
              :value="displayedPairing.json"
              :placeholder="pairingEmptyHint"
              readonly
              data-testid="onetools-pairing-json"
            />
            <button type="button" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" :disabled="pairingBusy || !displayedPairing.json" @click="copyPairing('json')">复制</button>
          </div>
        </label>
        <div class="ow-pairing-actions">
          <button type="button" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" :disabled="pairingBusy" @click="rotatePairing">{{ pairingBusy ? '签发中…' : '轮换令牌' }}</button>
        </div>
      </div>
    </template>

    <template v-else>
      <label class="ow-row"><span>启用</span><input type="checkbox" :checked="!!notify.wecom.enabled" @change="patchNotify('wecom', { enabled: $event.target.checked })" /></label>
      <div class="ow-form-grid ow-form-grid--2">
        <label class="ow-field"><span>Webhook URL</span><textarea :value="urlDraft.wecom" rows="3" @input="onUrlsInput('wecom', $event.target.value)" /></label>
        <label class="ow-field"><span>Payload 模板</span><input :value="notify.wecom.payload_template" @input="patchNotify('wecom', { payload_template: $event.target.value })" /></label>
      </div>
    </template>
        </div>

        <footer class="ow-dialog__foot ow-dialog__foot--split">
          <div class="ow-dialog__foot-start">
            <button
              v-if="notifyCanTest"
              type="button"
              class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill"
              :disabled="Boolean(testing)"
              @click="testChannel(notifyTab)"
            >
              {{ testing === notifyTab ? '测试中…' : '测试' }}
            </button>
          </div>
          <div class="ow-dialog__foot-end">
            <button type="button" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" :disabled="notifySaving" @click="saveNotify">
              <MIcon name="notifications" size="sm" />
              {{ notifySaving ? '保存中…' : '保存通知设置' }}
            </button>
            <button type="button" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" @click="closeNotify">完成</button>
          </div>
        </footer>
      </div>
    </div>
  </Teleport>
</template>
