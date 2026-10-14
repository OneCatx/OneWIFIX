<script setup>
import MIcon from './MIcon.vue'

defineProps({
  title: { type: String, default: '' },
  desc: { type: String, default: '' },
  padded: { type: Boolean, default: true },
  icon: { type: String, default: '' },
  iconTone: { type: String, default: 'teal' },
})
</script>

<template>
  <section
    class="ow-glass glass-frame panel-card panel-neutral"
    :class="{ 'ow-glass--padded': padded }"
  >
    <header v-if="title || $slots.head" class="ow-glass__head">
      <slot name="head">
        <div class="ow-glass__title-row">
          <span
            v-if="icon"
            class="panel-title-icon"
            :class="`panel-title-icon--${iconTone}`"
            aria-hidden="true"
          >
            <MIcon :name="icon" size="sm" />
          </span>
          <h2 v-if="title" class="ow-glass__title">{{ title }}</h2>
        </div>
        <p v-if="desc" class="ow-glass__desc">{{ desc }}</p>
      </slot>
    </header>
    <div class="ow-glass__body">
      <slot />
    </div>
  </section>
</template>
