<script setup>
import { computed } from 'vue'
import MIcon from './MIcon.vue'
import { useAnimatedNumber, usePulseOnEvent } from '../composables/useControlPlaneMotion'
import { ControlPlaneEvents, on } from '../stores/controlPlane/eventBus'
import { useControlPlaneState } from '../stores/controlPlane/controlPlaneState'
import { useOnewifiHub } from '../stores/onewifiHub'
import { boardModems } from '../utils/onewifiDevice'

const { meta, systemStatus } = useControlPlaneState()
const { hub, host } = useOnewifiHub()

const modems = computed(() => boardModems(hub.devices))
const modemOnline = computed(() => modems.value.filter((d) => d.present === true || d.physical_present === true).length)
const modemTotal = computed(() => modems.value.length)
const modemOnlineDisplay = useAnimatedNumber(modemOnline)

const memPercent = computed(() => Number(host.value.memory?.used_percent) || 0)
const memDisplay = useAnimatedNumber(memPercent)
const cpuPercent = computed(() => Number(host.value.cpu_percent) || Number(host.value.load?.['1m']) || 0)
const loadDisplay = useAnimatedNumber(cpuPercent)

const onewifiPulse = usePulseOnEvent(ControlPlaneEvents.ONEWIFI_DEVICE, on)

const runStateLabel = computed(() => {
  if (systemStatus.value === 'running') return '运行正常'
  if (systemStatus.value === 'warning') return '连接中'
  return '系统离线'
})

const linkStateLabel = computed(() => {
  if (systemStatus.value === 'running') return '已连接'
  if (systemStatus.value === 'warning') return '同步中'
  return '未连接'
})

const hostChip = computed(() => host.value.model || hub.system?.system_name || 'OneWIFI')
const uptimeChip = computed(() => {
  const seconds = Number(host.value.uptime_seconds) || 0
  if (!seconds) return hub.system ? '主机在线' : '等待主机'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  return days ? `已运行 ${days} 天 ${hours} 小时` : `已运行 ${hours} 小时`
})
</script>

<template>
  <section
    class="status-hero panel-card panel-neutral glass-frame"
    :class="{ 'is-alive': meta.lastEventAt || systemStatus !== 'offline' }"
  >
    <div class="status-hero__glow" aria-hidden="true" />
    <div class="status-hero__glass" aria-hidden="true" />

    <div class="status-hero__content">
      <div class="status-hero__layout">
        <div class="status-hero__visual" aria-hidden="true">
          <div class="hero-orbit">
            <span class="hero-orbit__ring hero-orbit__ring--a" />
            <span class="hero-orbit__ring hero-orbit__ring--b" />
            <span class="hero-orbit__orb" />
            <span class="hero-orbit__beam" />
            <span class="hero-orbit__label">READY ORBIT</span>
          </div>
        </div>

        <div class="status-hero__copy">
          <div class="status-hero__deco" aria-hidden="true">
            <span class="status-hero__deco-ring status-hero__deco-ring--a" />
            <span class="status-hero__deco-ring status-hero__deco-ring--b" />
            <span class="status-hero__deco-orb" />
          </div>
          <header class="status-hero__layer status-hero__layer--status">
            <p class="status-hero__kicker">CONTROL PLANE</p>
            <h1 class="status-hero__title status-hero__title--display">
              <span class="status-hero__title-row">
                <span class="status-hero__title-chunk status-hero__title-chunk--lg">ONE</span>
              </span>
              <span class="status-hero__title-row status-hero__title-row--split">
                <span class="status-hero__title-chunk status-hero__title-chunk--lg">WIFI</span>
              </span>
            </h1>
            <h1 class="status-hero__title status-hero__title--simple">OneWIFI</h1>
            <p class="status-hero__tagline">OneWIFI · 模组与 Wi‑Fi Calling</p>
            <div class="status-hero__pills">
              <span
                class="status-pill"
                :class="{
                  offline: systemStatus === 'offline',
                  'status-pill--warn': systemStatus === 'warning',
                }"
              >
                <span class="dot" />{{ runStateLabel }}
              </span>
              <span
                class="status-pill status-pill--muted"
                :class="{
                  offline: systemStatus === 'offline',
                  'status-pill--warn': systemStatus === 'warning',
                }"
              >
                <span class="dot" />{{ linkStateLabel }}
              </span>
            </div>
          </header>

          <div class="status-hero__layer status-hero__layer--metrics">
            <div class="hero-metric panel-card panel-green glass-frame glass-frame--compact glass-frame--static">
              <span class="hero-metric__label">
                <MIcon name="memory_alt" size="xs" />
                CPU
              </span>
              <span class="hero-metric__value">{{ Math.round(loadDisplay) }}%</span>
            </div>
            <div class="hero-metric panel-card panel-blue glass-frame glass-frame--compact glass-frame--static">
              <span class="hero-metric__label">
                <MIcon name="insights" size="xs" />
                内存
              </span>
              <span class="hero-metric__value">{{ Math.round(memDisplay) }}%</span>
            </div>
            <div
              class="hero-metric panel-card panel-purple glass-frame glass-frame--compact glass-frame--static"
              :class="{ 'is-pulse': onewifiPulse }"
            >
              <span class="hero-metric__label">
                <MIcon name="sim_card" size="xs" />
                模组
              </span>
              <span class="hero-metric__value">
                <span class="hero-metric__value-main">{{ Math.round(modemOnlineDisplay) }}</span><span class="hero-metric__value-sub"> / {{ modemTotal }}</span>
              </span>
            </div>
          </div>

          <footer class="status-hero__layer status-hero__layer--meta">
            <span class="hero-meta-chip" :class="{ 'hero-meta-chip--live': Boolean(host.model) }">{{ hostChip }}</span>
            <span class="hero-meta-chip" :class="{ 'hero-meta-chip--live': Boolean(host.uptime_seconds) }">{{ uptimeChip }}</span>
          </footer>
        </div>
      </div>
    </div>
  </section>
</template>
