<script setup>
import { computed } from 'vue'
import MIcon from './MIcon.vue'
import GlassSelect from './GlassSelect.vue'
import { displaySecret } from '../utils/onewifiModel'

const IP_VERSION_OPTIONS = [
  { value: 'v4', label: 'IPv4' },
  { value: 'v6', label: 'IPv6' },
  { value: 'v4v6', label: 'IPv4+IPv6' },
]

const MBN_PROFILE_OPTIONS = [
  { value: '', label: '自动（按卡的 HPLMN 选择）' },
  { value: 'OpenMkt-Commercial-CU', label: '强制中国联通 OpenMkt' },
  { value: 'Volte_OpenMkt-Commercial-CMCC', label: '强制中国移动 VoLTE' },
  { value: 'OpenMkt-Commercial-CT', label: '强制中国电信 OpenMkt' },
]

const VOICE_PATH_OPTIONS = [
  { value: 'vowifi', label: 'VoWiFi' },
  { value: 'cellular', label: '蜂窝直拨' },
]

const props = defineProps({
  iccid: { type: String, default: '' },
  reveal: { type: Boolean, default: false },
  policy: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  capabilitiesOnly: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  developer: { type: Boolean, default: false },
  developerBusy: { type: Boolean, default: false },
})

const emit = defineEmits(['patch', 'developer'])

const locked = computed(() => props.loading || props.saving || !props.policy || props.disabled)

function onPatch(patch) {
  if (locked.value) return
  emit('patch', patch)
}

function onIpVersion(value) {
  if (props.capabilitiesOnly) return
  onPatch({ ipVersion: value })
}

function onApnBlur(event) {
  if (props.capabilitiesOnly) return
  const apn = String(event.target.value || '').trim()
  if (!props.policy || apn === props.policy.apn) return
  onPatch({ apn })
}

function onMbnProfile(value) {
  if (props.capabilitiesOnly) return
  onPatch({ mbnProfile: String(value || '') })
}

function onVoicePath(value) {
  onPatch({ voicePath: value === 'cellular' ? 'cellular' : 'vowifi' })
}
</script>

<template>
  <div v-if="compact" class="policy-compact">
    <div v-if="loading && !policy" class="policy-compact__empty">加载卡策略…</div>
    <template v-else-if="policy">
      <div class="policy-compact__row">
        <span>开启网络</span>
        <button
          type="button"
          class="policy-toggle"
          :class="{ 'is-on': policy.networkEnabled }"
          :disabled="locked || (!capabilitiesOnly && (policy.vowifiEnabled || policy.airplaneEnabled))"
          :aria-pressed="policy.networkEnabled"
          aria-label="开启网络"
          @click="onPatch({ networkEnabled: !policy.networkEnabled })"
        >
          <span class="policy-toggle__thumb" />
        </button>
      </div>
      <div class="policy-compact__row">
        <span>VoWiFi</span>
        <button
          type="button"
          class="policy-toggle"
          :class="{ 'is-on': policy.vowifiEnabled }"
          :disabled="locked"
          :aria-pressed="policy.vowifiEnabled"
          aria-label="VoWiFi"
          @click="onPatch({ vowifiEnabled: !policy.vowifiEnabled })"
        >
          <span class="policy-toggle__thumb" />
        </button>
      </div>
      <div class="policy-compact__row">
        <span>飞行模式</span>
        <button
          type="button"
          class="policy-toggle"
          :class="{ 'is-on': policy.airplaneEnabled }"
          :disabled="locked || (!capabilitiesOnly && policy.vowifiEnabled)"
          :aria-pressed="policy.airplaneEnabled"
          aria-label="飞行模式"
          @click="onPatch({ airplaneEnabled: !policy.airplaneEnabled })"
        >
          <span class="policy-toggle__thumb" />
        </button>
      </div>
      <div class="policy-compact__mbn">
        <span>语音</span>
        <GlassSelect
          class="policy-compact__select"
          :model-value="policy.voicePath || 'vowifi'"
          :options="VOICE_PATH_OPTIONS"
          :disabled="locked"
          aria-label="语音路径"
          data-testid="card-policy-voice"
          @update:model-value="onVoicePath"
        />
      </div>
      <div v-if="!capabilitiesOnly" class="policy-compact__mbn">
        <span>MBN 配置</span>
        <GlassSelect
          class="policy-compact__select"
          :model-value="policy.mbnProfile || ''"
          :options="MBN_PROFILE_OPTIONS"
          :disabled="locked"
          aria-label="MBN 配置"
          @update:model-value="onMbnProfile"
        />
        <p class="policy-compact__hint">EC20-CE 没有通用 ROW；海外卡请指定运营商。正在使用的卡更改后模组可能会重启。</p>
      </div>
      <p v-if="disabled && !saving" class="policy-compact__hint">启用此卡后可改策略</p>
      <p v-if="saving" class="policy-compact__hint">保存中…</p>
    </template>
    <div v-else class="policy-compact__empty">暂无卡策略</div>
  </div>

  <div v-else class="overview-card overview-card--policy glass-frame">
    <div class="panel-title-row panel-title-row--policy">
      <span class="panel-title-icon panel-title-icon--blue">
        <MIcon name="tune" size="sm" />
      </span>
      <h3 class="overview-card__title">卡策略</h3>
    </div>

    <div v-if="loading && !policy" class="onewifi-panel-empty">加载卡策略…</div>
    <template v-else-if="policy">
      <div class="policy-iccid glass-frame glass-frame--compact">
        <span class="policy-iccid__label">当前卡 ICCID</span>
        <span class="policy-iccid__value mono">{{ iccid ? displaySecret(iccid, reveal) : '尚未识别' }}</span>
      </div>

      <div class="policy-grid">
        <label class="policy-field glass-frame glass-frame--compact">
          <span class="policy-field__label">IP 版本</span>
          <GlassSelect
            v-if="!capabilitiesOnly"
            class="policy-field__select"
            :model-value="policy.ipVersion"
            :options="IP_VERSION_OPTIONS"
            :disabled="locked"
            aria-label="IP 版本"
            @update:model-value="onIpVersion"
          />
          <span v-else class="policy-field__readonly">IPv4（本端口不支持改）</span>
          <span class="policy-field__hint">{{ capabilitiesOnly ? '当前模组不提供此项' : '下次开启网络时生效' }}</span>
        </label>

        <label class="policy-field glass-frame glass-frame--compact">
          <span class="policy-field__label">语音</span>
          <GlassSelect
            class="policy-field__select"
            :model-value="policy.voicePath || 'vowifi'"
            :options="VOICE_PATH_OPTIONS"
            :disabled="locked"
            aria-label="语音路径"
            data-testid="card-policy-voice"
            @update:model-value="onVoicePath"
          />
          <span class="policy-field__hint">跟着这张卡走。蜂窝直拨只在插到蜂窝模组上时可用，读卡器没有这条路径。</span>
        </label>

        <label v-if="!capabilitiesOnly" class="policy-field policy-field--full glass-frame glass-frame--compact">
          <span class="policy-field__label">MBN 配置</span>
          <GlassSelect
            class="policy-field__select"
            :model-value="policy.mbnProfile || ''"
            :options="MBN_PROFILE_OPTIONS"
            :disabled="locked"
            aria-label="MBN 配置"
            data-testid="card-policy-mbn"
            @update:model-value="onMbnProfile"
          />
          <span class="policy-field__hint">EC20-CE 没有通用 ROW；海外卡请指定运营商。正在使用的卡更改后模组可能会重启。</span>
        </label>

        <label class="policy-field glass-frame glass-frame--compact">
          <span class="policy-field__label">APN（可选）</span>
          <input
            class="policy-field__input ob-field-input"
            type="text"
            :value="policy.apn"
            :placeholder="capabilitiesOnly ? '只读' : '留空自动识别'"
            :disabled="locked || capabilitiesOnly"
            :readonly="capabilitiesOnly"
            @blur="onApnBlur"
          />
          <span class="policy-field__hint">{{ capabilitiesOnly ? '当前 APN，不能从这里改' : '下次开启网络时生效' }}</span>
        </label>

        <div class="policy-field glass-frame glass-frame--compact">
          <span class="policy-field__label">开发者模式</span>
          <button
            type="button"
            class="policy-toggle"
            :class="{ 'is-on': developer }"
            :disabled="locked || developerBusy"
            :aria-pressed="developer"
            data-testid="developer-mode-toggle"
            @click="emit('developer', !developer)"
          >
            <span class="policy-toggle__thumb" />
          </button>
          <span class="policy-field__hint">{{ developer ? '漫游数据可用' : '开启后才能拨开启网络' }}</span>
        </div>

        <div class="policy-field glass-frame glass-frame--compact">
          <span class="policy-field__label">开启网络</span>
          <button
            type="button"
            class="policy-toggle"
            :class="{ 'is-on': policy.networkEnabled }"
            :disabled="locked || (!capabilitiesOnly && (policy.vowifiEnabled || policy.airplaneEnabled))"
            :aria-pressed="policy.networkEnabled"
            @click="onPatch({ networkEnabled: !policy.networkEnabled })"
          >
            <span class="policy-toggle__thumb" />
          </button>
          <span class="policy-field__hint">{{ capabilitiesOnly ? '4G 数据开关' : 'VoWiFi/飞行开启时不可用' }}</span>
        </div>

        <div class="policy-field glass-frame glass-frame--compact">
          <span class="policy-field__label">VoWiFi</span>
          <button
            type="button"
            class="policy-toggle"
            :class="{ 'is-on': policy.vowifiEnabled }"
            :disabled="locked"
            :aria-pressed="policy.vowifiEnabled"
            @click="onPatch({ vowifiEnabled: !policy.vowifiEnabled })"
          >
            <span class="policy-toggle__thumb" />
          </button>
          <span class="policy-field__hint">{{ capabilitiesOnly ? 'VoWiFi 开关' : '启用后进飞行模式' }}</span>
        </div>

        <div class="policy-field glass-frame glass-frame--compact">
          <span class="policy-field__label">飞行模式</span>
          <button
            type="button"
            class="policy-toggle"
            :class="{ 'is-on': policy.airplaneEnabled }"
            :disabled="locked || (!capabilitiesOnly && policy.vowifiEnabled)"
            :aria-pressed="policy.airplaneEnabled"
            @click="onPatch({ airplaneEnabled: !policy.airplaneEnabled })"
          >
            <span class="policy-toggle__thumb" />
          </button>
          <span class="policy-field__hint">{{ capabilitiesOnly ? '飞行模式开关' : 'VoWiFi 开启时由其接管' }}</span>
        </div>
      </div>

      <p v-if="saving" class="policy-saving">保存中…</p>
    </template>
    <div v-else class="onewifi-panel-empty">暂无卡策略</div>
  </div>
</template>

<style scoped>
.policy-compact {
  display: grid;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(148, 163, 184, 0.14);
}
.policy-compact__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: rgba(203, 213, 225, 0.78);
  font-size: 12px;
}
.policy-compact__empty,
.policy-compact__hint {
  margin: 0;
  color: rgba(148, 163, 184, 0.72);
  font-size: 11px;
}
.policy-compact__mbn {
  display: grid;
  gap: 6px;
}
.policy-compact__select {
  min-width: 0;
}
.policy-toggle {
  position: relative;
  flex-shrink: 0;
  width: 44px;
  height: 24px;
  padding: 0;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.18);
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease;
}
.policy-toggle.is-on {
  background: rgba(52, 211, 153, 0.32);
  border-color: rgba(110, 231, 183, 0.55);
}
.policy-toggle:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.policy-toggle__thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
  transition: transform 0.18s ease;
}
.policy-toggle.is-on .policy-toggle__thumb {
  transform: translateX(20px);
}
</style>
