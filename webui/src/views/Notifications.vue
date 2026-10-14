<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
onMounted(() => {
  router.replace({ path: '/settings', hash: '#notify' })
})
</script>

<template>
  <div class="ow-page">
    <p class="ow-page__sub">通知渠道已并入系统设置，正在跳转…</p>
  </div>
</template>
