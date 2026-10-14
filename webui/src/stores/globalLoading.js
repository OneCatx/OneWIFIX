import { reactive } from 'vue'

export const LOADING_TIMEOUT_MS = 3000

export const globalLoadingState = reactive({
  active: false,
  pending: 0,
})

let ticketSeq = 0
/** @type {Map<number, ReturnType<typeof setTimeout>>} */
const tickets = new Map()

function syncActive() {
  globalLoadingState.pending = tickets.size
  globalLoadingState.active = tickets.size > 0
}

function endTicket(id) {
  const timer = tickets.get(id)
  if (timer) clearTimeout(timer)
  tickets.delete(id)
  syncActive()
}

/**
 * 开启全局 loading；返回 ticket，response/finally 时必须 stopLoading(ticket)
 */
export function startLoading() {
  const id = ++ticketSeq
  tickets.set(
    id,
    window.setTimeout(() => endTicket(id), LOADING_TIMEOUT_MS),
  )
  syncActive()
  return id
}

/**
 * @param {number|null|undefined} ticket startLoading 返回值；省略则关闭最早的一个 ticket
 */
export function stopLoading(ticket) {
  if (ticket != null) {
    endTicket(ticket)
    return
  }
  const first = tickets.keys().next().value
  if (first != null) endTicket(first)
}

/** 强制清空所有 loading 状态（路由切换 / 初始化 / WS 兜底） */
export function resetLoading() {
  for (const timer of tickets.values()) clearTimeout(timer)
  tickets.clear()
  syncActive()
}

/** WS 事件兜底：释放所有 loading，防止 WS 链路卡住 UI */
export function stopLoadingFromWs() {
  resetLoading()
}
