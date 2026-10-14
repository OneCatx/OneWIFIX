import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * iOS 26 悬浮 Tab 栏行为：滚动方向感知收缩 + 软键盘避让
 *
 * 对照 Apple `tabBarMinimizeBehavior(.onScrollDown)`：
 *  - 下滑（看内容）→ 栏体收缩成迷你态；上滑（找导航）→ 立即回弹
 *  - 接近页面底部时保持展开（此时用户大概率要切页）
 *  - 软键盘弹出（visualViewport 变矮）→ 整栏隐藏，避免顶在键盘上
 */
export function useLiquidTabBar() {
  const minimized = ref(false)
  const keyboardHidden = ref(false)

  let lastY = 0
  let ticking = false
  /** 方向累计位移：越过阈值才切态，过滤橡皮筋与细碎抖动 */
  let acc = 0
  let lastDir = 0
  const THRESHOLD = 24

  function onScroll() {
    if (ticking) return
    ticking = true
    requestAnimationFrame(() => {
      ticking = false
      const y = Math.max(0, window.scrollY)
      const delta = y - lastY
      lastY = y

      // 顶部或临近底部：始终展开
      const nearBottom =
        window.innerHeight + y >= document.documentElement.scrollHeight - 120
      if (y < 32 || nearBottom) {
        minimized.value = false
        acc = 0
        return
      }

      const dir = delta > 0 ? 1 : delta < 0 ? -1 : 0
      if (dir === 0) return
      if (dir !== lastDir) {
        acc = 0
        lastDir = dir
      }
      acc += Math.abs(delta)
      if (acc > THRESHOLD) minimized.value = dir > 0
    })
  }

  function onViewportResize() {
    const vv = window.visualViewport
    if (!vv) return
    // 视口高度骤降 >25% 视为软键盘弹出
    keyboardHidden.value = vv.height < window.innerHeight * 0.75
  }

  onMounted(() => {
    lastY = Math.max(0, window.scrollY)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.visualViewport?.addEventListener('resize', onViewportResize)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('scroll', onScroll)
    window.visualViewport?.removeEventListener('resize', onViewportResize)
  })

  return { minimized, keyboardHidden }
}
