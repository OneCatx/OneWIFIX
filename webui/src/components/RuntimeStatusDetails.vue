<script setup>
import MIcon from './MIcon.vue'

defineProps({
  dataPlane: { type: String, default: '—' },
  lastReason: { type: String, default: '—' },
  errorCategory: { type: String, default: '—' },
})

function display(value) {
  const text = String(value || '').trim()
  return text && text !== '—' ? text : '—'
}
</script>

<template>
  <details class="runtime-details glass-frame" open>
    <summary class="runtime-details__summary">
      <span>详情</span>
      <MIcon name="expand_more" size="sm" class="runtime-details__chevron" />
    </summary>
    <div class="runtime-details__body">
      <div class="detail-row">
        <span>数据平面</span>
        <span class="mono">{{ display(dataPlane) }}</span>
      </div>
      <div class="detail-row">
        <span>最后原因</span>
        <span class="mono">{{ display(lastReason) }}</span>
      </div>
      <div class="detail-row">
        <span>错误分类</span>
        <span class="mono">{{ display(errorCategory) }}</span>
      </div>
    </div>
  </details>
</template>
