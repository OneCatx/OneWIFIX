import { startLoading, stopLoading } from '../stores/globalLoading'

/**
 * 带全局 loading 拦截的 fetch 封装。
 * - 默认 trackLoading: true
 * - success / error 均在 finally 中 stopLoading
 */
export async function apiFetch(input, options = {}) {
  const { trackLoading = true, ...fetchOptions } = options
  let ticket = null

  if (trackLoading) ticket = startLoading()

  try {
    return await fetch(input, fetchOptions)
  } finally {
    if (ticket != null) stopLoading(ticket)
  }
}

export async function apiFetchJson(input, options = {}) {
  const res = await apiFetch(input, options)
  const text = await res.text()
  if (!res.ok) {
    let message = text
    try {
      const json = JSON.parse(text)
      message = json.message || json.error || json.status || text
    } catch {
      /* plain text */
    }
    throw new Error(message || `Request failed → ${res.status}`)
  }
  if (res.status === 204 || !text) return null
  return JSON.parse(text)
}
