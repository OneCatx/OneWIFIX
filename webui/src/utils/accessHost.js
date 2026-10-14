/** localhost / 回环地址 */
export function isLocalHost(hostname) {
  if (!hostname) return true
  const h = hostname.toLowerCase()
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]'
}

/** 局域网私有地址（192.168 / 10 / 172.16–31） */
export function isLanHost(hostname) {
  if (!hostname) return false
  const h = hostname.toLowerCase()

  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true

  const m = h.match(/^172\.(\d{1,2})\.\d{1,3}\.\d{1,3}$/)
  if (m) {
    const second = Number(m[1])
    if (second >= 16 && second <= 31) return true
  }

  return false
}

/** Mihomo API 允许的来源：localhost / 127.0.0.1 / 局域网 */
export function isAllowedApiHost(hostname) {
  if (!hostname) return false
  return isLocalHost(hostname) || isLanHost(hostname)
}

/**
 * 解析 Mihomo API 主机名（localhost → 127.0.0.1）
 * @returns {string}
 */
export function resolveMihomoApiHostname() {
  if (typeof window === 'undefined') {
    throw new Error('Mihomo API 仅在浏览器环境可用')
  }

  const hostname = window.location.hostname
  if (!isAllowedApiHost(hostname)) {
    throw new Error(`未配置的 API 来源：${hostname || '未知'}（仅允许 localhost / 127.0.0.1 / 局域网）`)
  }

  if (isLocalHost(hostname)) {
    return '127.0.0.1'
  }

  return hostname
}

/** 从 URL 提取 hostname */
export function hostFromUrl(url) {
  if (!url || url.startsWith('/')) return ''
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

/** 从 URL 提取 host（含非默认端口） */
export function hostPortFromUrl(url) {
  if (!url || url.startsWith('/')) return ''
  try {
    const u = new URL(url)
    const defaultPort = u.protocol === 'https:' ? '443' : '80'
    if (u.port && u.port !== defaultPort) {
      return `${u.hostname}:${u.port}`
    }
    return u.hostname
  } catch {
    return ''
  }
}

/**
 * 解析当前面板访问地址（优先 location，其次 API baseURL host）
 * @param {string} [apiBaseUrl] - 如 http://127.0.0.1:9090
 * @returns {string}
 */
export function resolveAccessAddress(apiBaseUrl = '') {
  if (typeof window === 'undefined') {
    return hostPortFromUrl(apiBaseUrl) || '—'
  }

  const { hostname, port, protocol } = window.location
  const defaultPort = protocol === 'https:' ? '443' : '80'

  if (!isLocalHost(hostname)) {
    if (port && port !== defaultPort) {
      return `${hostname}:${port}`
    }
    return hostname
  }

  const fromApi = hostPortFromUrl(apiBaseUrl)
  if (fromApi && !isLocalHost(hostFromUrl(apiBaseUrl))) {
    return fromApi
  }

  if (hostname) {
    if (port && port !== defaultPort) {
      return `${hostname}:${port}`
    }
    return hostname
  }

  return fromApi || '—'
}
