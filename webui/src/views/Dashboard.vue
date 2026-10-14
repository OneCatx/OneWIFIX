<script setup>
import ControlPlaneHero from '../components/ControlPlaneHero.vue'
import SoftLabelCard from '../components/SoftLabelCard.vue'
import OwGlassPanel from '../components/OwGlassPanel.vue'
import MIcon from '../components/MIcon.vue'
import { computed } from 'vue'
import { useAccessHost } from '../composables/useAccessHost'
import { useOnewifiHub } from '../stores/onewifiHub'
import '../assets/onewifi-pages.css'

const { hub, host } = useOnewifiHub()
const { accessAddress } = useAccessHost()

const mem = computed(() => host.value.memory || {})
const disk = computed(() => host.value.disk || {})
const load = computed(() => host.value.load || {})
const cpuPercent = computed(() => {
  if (host.value.cpu_percent != null && host.value.cpu_percent !== '') {
    return Math.min(100, Number(host.value.cpu_percent) || 0)
  }
  const cores = Number(load.value.cores) || 1
  const one = Number(load.value['1m']) || 0
  return Math.min(100, Math.round((one / cores) * 1000) / 10)
})
const memPercent = computed(() => Number(mem.value.used_percent) || 0)
const diskPercent = computed(() => Number(disk.value.used_percent) || 0)
const tempLabel = computed(() => (
  host.value.temperature_c != null ? `${host.value.temperature_c} °C` : '—'
))
const memTotalGb = computed(() => {
  const mb = Number(mem.value.total_mb) || 0
  return mb ? `${Math.round((mb / 1024) * 10) / 10} GB` : '—'
})
const osLabel = computed(() => hub.system?.system_name || host.value.model || 'OneWIFI')
</script>

<template>
  <div class="ow-page dashboard dashboard--stream">
    <div class="dashboard-shell">
      <ControlPlaneHero />

      <div class="dashboard-body">
        <div class="metric-row">
          <div class="metric-card glass-frame metric-card--green">
            <div class="metric-card__icon"><MIcon name="memory_alt" size="md" /></div>
            <div class="metric-card__body">
              <div class="metric-card__label">CPU</div>
              <div class="metric-card__value">{{ cpuPercent.toFixed(1) }}%</div>
              <div class="metric-card__sub">主机占用</div>
            </div>
          </div>
          <div class="metric-card glass-frame metric-card--blue">
            <div class="metric-card__icon"><MIcon name="insights" size="md" /></div>
            <div class="metric-card__body">
              <div class="metric-card__label">内存</div>
              <div class="metric-card__value">{{ memPercent.toFixed(1) }}%</div>
              <div class="metric-card__sub">系统内存</div>
            </div>
          </div>
          <div class="metric-card glass-frame metric-card--purple">
            <div class="metric-card__icon"><MIcon name="hard_drive" size="md" /></div>
            <div class="metric-card__body">
              <div class="metric-card__label">磁盘</div>
              <div class="metric-card__value">{{ diskPercent.toFixed(1) }}%</div>
              <div class="metric-card__sub">根分区</div>
            </div>
          </div>
          <div class="metric-card glass-frame metric-card--amber">
            <div class="metric-card__icon"><MIcon name="device_thermostat" size="md" /></div>
            <div class="metric-card__body">
              <div class="metric-card__label">温度</div>
              <div class="metric-card__value">{{ tempLabel }}</div>
              <div class="metric-card__sub">thermal</div>
            </div>
          </div>
        </div>

        <div class="info-row">
          <OwGlassPanel title="主机" icon="router" icon-tone="blue">
            <div class="soft-label-stack">
              <SoftLabelCard title="系统" :value="osLabel" />
              <SoftLabelCard title="机型" :value="host.model || '—'" />
              <SoftLabelCard title="访问地址" :value="accessAddress" mono />
              <SoftLabelCard title="CPU" :value="host.cpu_model || '—'" />
            </div>
          </OwGlassPanel>

          <OwGlassPanel title="占用" icon="insights" icon-tone="purple">
            <div class="soft-label-stack">
              <SoftLabelCard title="内存总量" :value="memTotalGb" />
              <SoftLabelCard title="CPU" :value="`${cpuPercent.toFixed(1)}%`">
                <template #aux>
                  <div class="progress-bar"><div class="progress-fill fill-purple" :style="{ width: cpuPercent + '%' }" /></div>
                </template>
              </SoftLabelCard>
              <SoftLabelCard title="内存" :value="`${memPercent.toFixed(1)}%`">
                <template #aux>
                  <div class="progress-bar"><div class="progress-fill fill-teal" :style="{ width: memPercent + '%' }" /></div>
                </template>
              </SoftLabelCard>
              <SoftLabelCard title="磁盘" :value="`${diskPercent}%`">
                <template #aux>
                  <div class="progress-bar"><div class="progress-fill fill-pink" :style="{ width: diskPercent + '%' }" /></div>
                </template>
              </SoftLabelCard>
            </div>
          </OwGlassPanel>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.info-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-grid);
}

.soft-label-stack .progress-bar {
  margin-top: 2px;
}

@media (max-width: 900px) {
  .info-row {
    grid-template-columns: 1fr;
  }
}
</style>
