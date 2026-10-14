<script setup>
import { computed } from 'vue'
import MIcon from './MIcon.vue'
import { proxyDisplayName } from '../utils/upstreamProxy'

const props = defineProps({
  country: { type: Object, required: true },
  proxy: { type: Object, default: null },
  proxies: { type: Array, default: () => [] },
  busy: { type: Boolean, default: false },
})

const emit = defineEmits(['toggle', 'assign', 'remove'])

const code = computed(() => String(props.country?.country_code || '').toUpperCase())
const title = computed(() => props.country?.country_name || code.value || '国家')
const displayCode = computed(() => (code.value === 'GB' ? 'UK' : code.value))
const enabled = computed(() => props.country?.enabled !== false)
const selectedId = computed(() => String(props.proxy?.id || props.country?.upstream_proxy_id || ''))
const badgeText = computed(() => (props.proxy ? proxyDisplayName(props.proxy) : '') || '未选代理')

function onAssign(event) {
  const next = String(event.target.value || '').trim()
  if (!next || next === selectedId.value) return
  emit('assign', next)
}
</script>

<template>
  <article
    class="ow-proxy-country-card glass-frame"
    :class="{ 'is-muted': !enabled }"
    :data-region="code"
  >
    <div class="ow-proxy-esim-body">
      <div class="ow-proxy-esim-head">
        <div class="ow-proxy-esim-title">
          <span class="ow-proxy-esim-name cnc-title">{{ title }}</span>
          <span class="ow-proxy-esim-provider">{{ displayCode }}</span>
        </div>
        <button
          type="button"
          class="ow-proxy-toggle"
          :disabled="busy"
          :aria-label="enabled ? `禁用${title}` : `启用${title}`"
          @click.stop="$emit('toggle')"
        >
          <span class="ow-proxy-toggle__track" :class="{ 'is-on': enabled }" aria-hidden="true">
            <span class="ow-proxy-toggle__thumb" />
          </span>
          <span>{{ enabled ? '已启用' : '已禁用' }}</span>
        </button>
      </div>
      <div class="ow-proxy-plate-row">
        <label class="ow-proxy-plate">
          <span
            class="overview-badge overview-badge--hero glass-frame glass-frame--compact glass-frame--pill"
            :class="{ 'glass-frame--tone-green': Boolean(proxy) }"
          >
            <span class="overview-badge__dot" aria-hidden="true"></span>
            <span class="overview-badge__text">{{ badgeText }}</span>
          </span>
          <select
            class="ow-proxy-plate__select"
            :disabled="busy || !proxies.length"
            :value="selectedId"
            :aria-label="`${title} 出口代理`"
            @change="onAssign"
          >
            <option v-if="!proxies.length" value="">先在上面添加代理</option>
            <option v-for="item in proxies" :key="item.id" :value="item.id">{{ proxyDisplayName(item) }}</option>
          </select>
        </label>
        <button type="button" class="runtime-action-btn glass-frame glass-frame--compact glass-frame--pill" :disabled="busy" @click="$emit('remove')">
          <MIcon name="delete" size="sm" />
          删除
        </button>
      </div>
    </div>
  </article>
</template>
