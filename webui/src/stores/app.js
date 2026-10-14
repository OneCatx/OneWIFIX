import { reactive } from 'vue'

// 控制台共享的轻量状态。这里只保留真正被渲染链消费的两样东西：
// Toast 提示，以及侧栏与系统状态刷新共用的主机标识。
// 早先这里还挂着 mihomo/clash 的节点、订阅、规则与 DNS 状态机，但那些页面从未接入
// 路由，整层已随死代码一并移除（归档在 .xj-cursor/死代码归档-*），因此不再从此处
// 引入 mihomoEngine —— 否则一个用不到的子系统会被打进产物。
const state = reactive({
  system: {
    hostname: '—',
    os: '—',
  },
  toast: null,
})

const TOAST_DURATION_MS = 2800

function showToast(message, type = 'success') {
  state.toast = { message, type, id: Date.now() }
  setTimeout(() => { state.toast = null }, TOAST_DURATION_MS)
}

export function useAppStore() {
  return {
    state,
    showToast,
  }
}
