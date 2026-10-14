<script setup>
import { computed } from 'vue'
import { ICON_SIZE_PX, resolveIcon } from '../config/iconRegistry'

const props = defineProps({
  name: { type: String, required: true },
  size: { type: String, default: 'md' },
  strokeWidth: { type: [Number, String], default: 1.75 },
  disabled: { type: Boolean, default: false },
})

const IconComponent = computed(() => resolveIcon(props.name))
const pixelSize = computed(() => ICON_SIZE_PX[props.size] || ICON_SIZE_PX.md)
</script>

<template>
  <component
    :is="IconComponent"
    class="ob-icon"
    :class="[`ob-icon--${size}`, { 'ob-icon--disabled': disabled }]"
    :size="pixelSize"
    :stroke-width="strokeWidth"
    aria-hidden="true"
  />
</template>
