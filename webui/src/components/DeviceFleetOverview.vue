<script setup>
import MIcon from './MIcon.vue'
import { fleetOverview } from '../stores/deviceFleetStats'

function formatRefreshTime(stamp) {
  if (stamp == null || stamp === '') return '—'
  const date = stamp instanceof Date ? stamp : new Date(stamp)
  if (Number.isNaN(date.getTime())) return '—'
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}
</script>

<template>
  <div class="metric-row device-fleet-overview" data-testid="device-fleet-overview">
    <div class="metric-card glass-frame metric-card--blue">
      <div class="metric-card__icon"><MIcon name="devices" size="md" /></div>
      <div class="metric-card__body">
        <div class="metric-card__label">设备总数</div>
        <div class="metric-card__value">{{ fleetOverview.total }}</div>
        <div class="metric-card__sub">内网 {{ fleetOverview.lanTotal }} · 公网 {{ fleetOverview.wanTotal }}</div>
      </div>
    </div>
    <div class="metric-card glass-frame metric-card--green">
      <div class="metric-card__icon"><MIcon name="monitor_heart" size="md" /></div>
      <div class="metric-card__body">
        <div class="metric-card__label">在线设备</div>
        <div class="metric-card__value">{{ fleetOverview.online }}</div>
        <div class="metric-card__sub">注册网关在线</div>
      </div>
    </div>
    <div class="metric-card glass-frame metric-card--purple">
      <div class="metric-card__icon"><MIcon name="wifi_off" size="md" /></div>
      <div class="metric-card__body">
        <div class="metric-card__label">离线设备</div>
        <div class="metric-card__value">{{ fleetOverview.offline }}</div>
        <div class="metric-card__sub">{{ fleetOverview.offline ? '内网+公网离线' : '暂无设备离线' }}</div>
      </div>
    </div>
    <div class="metric-card glass-frame metric-card--amber">
      <div class="metric-card__icon"><MIcon name="update" size="md" /></div>
      <div class="metric-card__body">
        <div class="metric-card__label">最近刷新</div>
        <div class="metric-card__value">{{ fleetOverview.anyConnected ? '自动轮询' : '—' }}</div>
        <div class="metric-card__sub">上次 {{ formatRefreshTime(fleetOverview.lastUpdated) }}</div>
      </div>
    </div>
  </div>
</template>
