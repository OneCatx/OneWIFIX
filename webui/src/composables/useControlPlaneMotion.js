import { onUnmounted, ref, watch } from 'vue'

export function useAnimatedNumber(source, { duration = 420 } = {}) {
  const display = ref(Number(source.value) || 0)
  let frame = 0

  function cancel() {
    if (frame) cancelAnimationFrame(frame)
    frame = 0
  }

  watch(
    source,
    (next) => {
      cancel()
      const target = Number(next) || 0
      const from = Number(display.value) || 0
      if (Math.abs(target - from) < 0.05) {
        display.value = target
        return
      }
      const start = performance.now()
      const tick = (now) => {
        const t = Math.min(1, (now - start) / duration)
        const eased = 1 - (1 - t) ** 3
        display.value = from + (target - from) * eased
        if (t < 1) frame = requestAnimationFrame(tick)
        else frame = 0
      }
      frame = requestAnimationFrame(tick)
    },
    { immediate: true },
  )

  onUnmounted(cancel)

  return display
}

export function usePulseOnEvent(eventName, on) {
  const pulsing = ref(false)
  let timer = null

  const stop = on(eventName, () => {
    pulsing.value = true
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      pulsing.value = false
      timer = null
    }, 650)
  })

  onUnmounted(() => {
    stop()
    if (timer) clearTimeout(timer)
  })

  return pulsing
}
