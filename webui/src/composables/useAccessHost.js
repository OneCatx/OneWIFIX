import { ref, onMounted, onUnmounted } from 'vue'
import { resolveAccessAddress } from '../utils/accessHost'

/**
 * 实时反映当前面板访问地址（浏览器 location）
 */
export function useAccessHost() {
  const accessAddress = ref('—')

  function refresh() {
    try {
      accessAddress.value = resolveAccessAddress()
    } catch {
      accessAddress.value = '—'
    }
  }

  onMounted(() => {
    refresh()
    window.addEventListener('focus', refresh)
    window.addEventListener('popstate', refresh)
    document.addEventListener('visibilitychange', refresh)
  })

  onUnmounted(() => {
    window.removeEventListener('focus', refresh)
    window.removeEventListener('popstate', refresh)
    document.removeEventListener('visibilitychange', refresh)
  })

  return { accessAddress, refreshAccessHost: refresh }
}
