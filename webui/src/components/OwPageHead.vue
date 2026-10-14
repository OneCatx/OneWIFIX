<script setup>
defineProps({
  title: { type: String, required: true },
  desc: { type: String, default: '' },
})
</script>

<template>
  <header class="ow-page-head">
    <div class="ow-page-head__main">
      <h1 class="ow-page-head__title">{{ title }}</h1>
      <p v-if="desc" class="ow-page-head__desc">{{ desc }}</p>
    </div>
    <div class="ow-page-head__actions">
      <slot name="actions" />
    </div>
  </header>
</template>
