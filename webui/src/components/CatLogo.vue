<template>
  <div
    class="brand-mark"
    :class="[sizeClass, { 'brand-mark--fill': fill, 'brand-mark--circle': shape === 'circle' }]"
    aria-hidden="true"
  >
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle
        v-if="shape === 'circle'"
        class="brand-mark__plate brand-mark__plate--circle"
        cx="20"
        cy="20"
        r="19"
      />
      <rect
        v-else
        class="brand-mark__plate"
        x="1"
        y="1"
        width="38"
        height="38"
        rx="11"
      />
      <path
        class="brand-mark__ring"
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M20 7.5a12.5 12.5 0 1 0 0 25 12.5 12.5 0 0 0 0-25Zm0 5.2a7.3 7.3 0 1 1 0 14.6 7.3 7.3 0 0 1 0-14.6Z"
      />
    </svg>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  size: { type: String, default: 'md' },
  shape: { type: String, default: 'squircle' },
  fill: { type: Boolean, default: false },
})

const sizeClass = computed(() => {
  if (props.fill) return ''
  if (props.size === 'sm') return 'brand-mark--sm'
  if (props.size === 'lg') return 'brand-mark--lg'
  return 'brand-mark--md'
})
</script>

<style scoped>
.brand-mark {
  --mark-plate: #141414;
  --mark-plate-border: rgba(255, 255, 255, 0.16);
  --mark-ring: #ffffff;

  width: 36px;
  height: 36px;
  flex-shrink: 0;
}

.brand-mark--sm {
  width: 28px;
  height: 28px;
}

.brand-mark--md {
  width: 36px;
  height: 36px;
}

.brand-mark--lg {
  width: 52px;
  height: 52px;
}

.brand-mark--fill {
  width: 100%;
  height: 100%;
}

.brand-mark svg {
  width: 100%;
  height: 100%;
  display: block;
}

.brand-mark__plate {
  fill: var(--mark-plate);
  stroke: var(--mark-plate-border);
  stroke-width: 1;
}

.brand-mark__plate--circle {
  fill: var(--mark-plate);
  stroke: var(--mark-plate-border);
  stroke-width: 1;
}

.brand-mark__ring {
  fill: var(--mark-ring);
}

:global([data-theme='light']) .brand-mark {
  --mark-plate: #101010;
  --mark-plate-border: rgba(255, 255, 255, 0.12);
}
</style>
