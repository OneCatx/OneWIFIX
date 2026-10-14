<script setup>
defineProps({
  title: { type: String, required: true },
  value: { type: [String, Number], default: '' },
  sub: { type: String, default: '' },
  mono: { type: Boolean, default: false },
  tone: { type: String, default: '' },
})
</script>

<template>
  <div
    class="soft-label-card"
    :class="tone ? `soft-label-card--${tone}` : ''"
  >
    <div class="soft-label-card__title">{{ title }}</div>
    <div
      class="soft-label-card__value"
      :class="{ 'soft-label-card__value--mono': mono }"
    >
      <slot>{{ value }}</slot>
    </div>
    <div v-if="sub" class="soft-label-card__sub">{{ sub }}</div>
    <div v-if="$slots.aux" class="soft-label-card__aux">
      <slot name="aux" />
    </div>
  </div>
</template>
