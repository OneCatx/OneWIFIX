/** 国家/地区识别与节点分组（数据来自 Mihomo /proxies） */

import {
  CODE_ALIASES,
  FLAG_CODE_ALIASES,
  REGION_KEYWORDS,
  REGION_NAMES,
  flagImageUrl,
  flagIsoCode,
  isIsoCountryCode,
  matchLongestCountryLabel,
  normalizeCountryCode,
  wifiGroupCountryPattern,
} from './countryRegistry.js'

export { REGION_NAMES, REGION_KEYWORDS, flagImageUrl, flagIsoCode }

/**
 * 节点/组名展示：去掉订阅商 TAG 标记（如「HK TAG | 香港」→「HK | 香港」，「TAG-WIFI」→「WIFI」）
 * @param {string} name
 */
export function formatNodeDisplayName(name) {
  if (!name) return ''
  return String(name)
    .replace(/^TAG-/i, '')
    .replace(/(?:[\u{1F1E6}-\u{1F1FF}]{2}\s*)+/gu, '')
    .replace(/[\u{1F30D}-\u{1F30F}\u{1F310}\u{1F5FA}\u{1F680}\u{2708}\u{1F6E9}\u{1F31F}\u{1F530}]/gu, '')
    .replace(/\uFE0F/g, '')
    .replace(/\s+TAG\s+\|\s*/gi, ' | ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** 设备主键 / 英语虚词里的两字母，禁止当国家码（Module-ID-2、.co.uk） */
const AMBIGUOUS_ISO = new Set([
  'ID', 'IN', 'IT', 'NO', 'TO', 'OR', 'ME', 'SO', 'AM', 'BY', 'AS',
  'DO', 'IS', 'AI', 'IO', 'TV', 'CC', 'CO',
])

const ISO_TOKEN = (code) => new RegExp(
  `(?:^|[\\s|·/\\\\[（(【])${code}(?:[\\s|·/\\\\）)\\]】]|$)`,
  'i',
)

function looksLikeHostOrDeviceId(text) {
  const raw = String(text || '').trim()
  if (!raw) return false
  if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(raw)) return true
  if (/(?:^|[^a-z])(?:module|device)[-_]?id(?:[^a-z]|$)/i.test(raw)) return true
  if (/(?:^|[-_])id[-_]\d+/i.test(raw)) return true
  return false
}

const HOST_CODE_RE = /(?:^|[.\-_/])([a-z]{2})(?:[.\-_/\d]|$)/i
const EMBEDDED_CODE_RE = /(?:^|[\s|·\-—[(（【])([A-Z]{2})(?:[\s|·\-—)\]）】]|$)/
const WIFI_GROUP_RE = wifiGroupCountryPattern()

/**
 * 从节点名前缀国旗 emoji 解析 ISO 3166-1（如 🇭🇰 → HK，🇦🇪 → AE）
 * @param {string} text
 * @returns {string|null}
 */
export function countryCodeFromFlagEmoji(text) {
  const chars = [...String(text || '').trim()]
  for (let i = 0; i < chars.length - 1; i += 1) {
    const cp1 = chars[i].codePointAt(0)
    const cp2 = chars[i + 1].codePointAt(0)
    if (cp1 < 0x1F1E6 || cp1 > 0x1F1FF || cp2 < 0x1F1E6 || cp2 > 0x1F1FF) {
      continue
    }

    let code = String.fromCharCode(cp1 - 0x1F1E6 + 65, cp2 - 0x1F1E6 + 65)
    if (FLAG_CODE_ALIASES[code]) code = FLAG_CODE_ALIASES[code]
    if (code === 'UK') code = 'GB'
    return code
  }
  return null
}

let zhRegionToCode
function getZhRegionToCode() {
  if (zhRegionToCode !== undefined) return zhRegionToCode
  const map = {}
  for (const [code, name] of Object.entries(REGION_NAMES)) {
    if (code !== 'GLOBAL') map[name] = code === 'UK' ? 'GB' : code
  }
  try {
    const dn = new Intl.DisplayNames(['zh-CN'], { type: 'region' })
    for (let i = 65; i <= 90; i += 1) {
      for (let j = 65; j <= 90; j += 1) {
        const code = String.fromCharCode(i, j)
        try {
          const label = dn.of(code)
          if (label && label !== code) map[label] = code
        } catch {
          /* skip invalid code */
        }
      }
    }
  } catch {
    /* Intl 不可用 */
  }
  map['台湾'] = 'TW'
  map['中国台湾'] = 'TW'
  map['中国香港'] = 'HK'
  map['中国澳门'] = 'MO'
  map['澳门'] = 'MO'
  zhRegionToCode = map
  return map
}

/** 从「TAG | 阿联酋」等中文后缀识别国家 */
export function countryCodeFromChineseLabel(text) {
  const raw = String(text || '')
  const segment = (raw.match(/\|\s*([^|]+)/)?.[1] || raw)
    .replace(/[\d×xX\s]+$/g, '')
    .trim()
  if (!segment) return null

  const fromLongest = matchLongestCountryLabel(segment) || matchLongestCountryLabel(raw)
  if (fromLongest) return fromLongest

  const map = getZhRegionToCode()
  if (map[segment]) return map[segment]

  const hit = Object.entries(map)
    .filter(([label]) => label.length >= 2)
    .sort((a, b) => b[0].length - a[0].length)
    .find(([label]) => segment.includes(label))
  return hit ? hit[1] : null
}

let regionNamesZh
function getRegionDisplayNames() {
  if (regionNamesZh !== undefined) return regionNamesZh
  try {
    regionNamesZh = new Intl.DisplayNames(['zh-CN'], { type: 'region' })
  } catch {
    regionNamesZh = null
  }
  return regionNamesZh
}

function inferFromNameSegments(name) {
  const parts = String(name || '').split(/[\s|·/\\—–\-+]+/).filter(Boolean)
  for (const part of parts) {
    const code = guessCountryCode(part)
    if (code !== 'GLOBAL') return code
    const embedded = extractEmbeddedRegionCode(part)
    if (embedded !== 'GLOBAL') return embedded
  }
  return 'GLOBAL'
}

function inferRegionFromProxyGroups(hint) {
  if (!hint) return 'GLOBAL'
  const wifi = hint.match(WIFI_GROUP_RE)
  if (wifi) return normalizeRegionCode(wifi[1])
  return guessCountryCode('', hint)
}

function normalizeRegionCode(raw) {
  if (!raw) return 'GLOBAL'
  const code = String(raw).toUpperCase()
  if (CODE_ALIASES[code]) return CODE_ALIASES[code]
  if (code === 'UK') return 'GB'
  if (/^[A-Z]{2}$/.test(code)) return code
  if (REGION_NAMES[code]) return code
  if (REGION_KEYWORDS.some(({ code: c }) => c === code)) return code
  return 'GLOBAL'
}

function extractEmbeddedRegionCode(text) {
  const m = String(text || '').match(EMBEDDED_CODE_RE)
  if (!m) return 'GLOBAL'
  return normalizeRegionCode(m[1])
}

function inferRegionFromServer(server) {
  const host = String(server || '').trim().toLowerCase()
  if (!host) return 'GLOBAL'
  // FQDN / 公共后缀（node.co.uk）不当国家
  if (host.includes('.')) return 'GLOBAL'

  const fromGuess = guessCountryCode(host)
  if (fromGuess !== 'GLOBAL') return fromGuess

  const hostMatch = host.match(HOST_CODE_RE)
  if (hostMatch) {
    const code = normalizeRegionCode(hostMatch[1].toUpperCase())
    if (code !== 'GLOBAL' && !AMBIGUOUS_ISO.has(code)) return code
  }

  return 'GLOBAL'
}

/**
 * 解析节点真实国家（用于拆开 GLOBAL 桶）
 * @param {object} node
 */
export function resolveNodeCountryCode(node) {
  if (!node) return 'GLOBAL'

  const hint = node.groupHint || node.proxyHint || ''
  const name = node.name || ''

  const fromEmoji = countryCodeFromFlagEmoji(name)
  if (fromEmoji) return fromEmoji

  if (node.region && node.region !== 'GLOBAL' && isIsoCountryCode(node.region)) {
    return normalizeRegionCode(node.region)
  }

  const fromChinese = countryCodeFromChineseLabel(name)
  if (fromChinese) return fromChinese

  let code = guessCountryCode(name, hint)
  if (code !== 'GLOBAL') return code

  code = extractEmbeddedRegionCode(name)
  if (code !== 'GLOBAL') return code

  code = inferFromNameSegments(name)
  if (code !== 'GLOBAL') return code

  code = inferRegionFromServer(node.address || node.server)
  if (code !== 'GLOBAL') return code

  code = inferRegionFromProxyGroups(hint)
  if (code !== 'GLOBAL') return code

  code = extractEmbeddedRegionCode(hint)
  if (code !== 'GLOBAL') return code

  return 'GLOBAL'
}

/**
 * 从节点名或组名自动识别国家代码
 * @param {string} name
 * @param {string} [groupName]
 */
export function guessCountryCode(name, groupName = '') {
  const sources = [name, groupName].filter(Boolean)
  for (const source of sources) {
    if (looksLikeHostOrDeviceId(source)) continue
    const fromLabel = matchLongestCountryLabel(source)
    if (fromLabel) return fromLabel === 'UK' ? 'GB' : fromLabel

    const upper = String(source).toUpperCase()
    for (const { code } of REGION_KEYWORDS) {
      const normalized = code === 'GB' ? 'GB' : code
      const infixOk = !AMBIGUOUS_ISO.has(code) && new RegExp(`[-_]${code}[-_]`, 'i').test(upper)
      if (
        ISO_TOKEN(code).test(upper)
        || upper.includes(`| ${code}`)
        || upper.startsWith(`${code}-`)
        || upper.startsWith(`${code}_`)
        || infixOk
      ) {
        return normalized === 'UK' ? 'GB' : normalized
      }
    }
    for (const { code, patterns } of REGION_KEYWORDS) {
      if (patterns.some((p) => p.test(source))) {
        return code === 'UK' ? 'GB' : code
      }
    }
  }
  return 'GLOBAL'
}

export function regionDisplayName(code) {
  if (REGION_NAMES[code]) return REGION_NAMES[code]
  const dn = getRegionDisplayNames()
  if (dn && code && code !== 'GLOBAL') {
    try {
      const label = dn.of(code === 'UK' ? 'GB' : code)
      if (label && label !== code) return label
    } catch {
      /* Intl 不可用 */
    }
  }
  return code
}

/** delay=0 或 timeout 视为不可用 */
export function isNodeAvailable(node) {
  if (!node) return false
  if (node.alive === false) return false
  return typeof node.delay === 'number' && node.delay > 0
}

export function delayTierClass(ms) {
  const value = Number(ms)
  if (!value || value <= 0) return ''
  if (value < 100) return 'ob-delay-fast'
  if (value <= 300) return 'ob-delay-warn'
  return 'ob-delay-slow'
}

export function nodeLatencySortKey(node) {
  if (!isNodeAvailable(node)) return Number.POSITIVE_INFINITY
  return node.delay
}

/** 国家组平均延迟（仅统计可用节点） */
export function countryGroupAvgLatency(group) {
  const online = (group.nodes || []).filter(isNodeAvailable)
  if (!online.length) return Number.POSITIVE_INFINITY
  const sum = online.reduce((acc, node) => acc + (node.delay || 0), 0)
  return Math.round(sum / online.length)
}

/**
 * 仪表盘实时排序范围：3 行 × 4 列
 */
export const DASHBOARD_LIVE_SORT_COUNT = 12

/**
 * GLOBAL 国家卡片排序：totalNodes ↓ → onlineNodes ↓ → avgLatency ↑
 * @param {Array} groups
 */
export function sortCountryGroups(groups) {
  return [...groups].sort((a, b) => (
    (b.totalNodes ?? b.total ?? 0) - (a.totalNodes ?? a.total ?? 0)
    || (b.onlineNodes ?? b.available ?? 0) - (a.onlineNodes ?? a.available ?? 0)
    || (a.avgLatency ?? Number.POSITIVE_INFINITY) - (b.avgLatency ?? Number.POSITIVE_INFINITY)
  ))
}

/**
 * 仅前 N 张卡片参与实时排序，其余按国家代码固定排列（避免全量重排）
 * @param {Array} groups
 * @param {number} [liveCount]
 */
export function arrangeCountryGroupsForDisplay(groups, liveCount = DASHBOARD_LIVE_SORT_COUNT) {
  const filtered = groups.filter((g) => g.code !== 'GLOBAL')
  if (filtered.length <= liveCount) return sortCountryGroups(filtered)

  const ranked = sortCountryGroups(filtered)
  const head = ranked.slice(0, liveCount)
  const headCodes = new Set(head.map((g) => g.code))
  const tail = filtered
    .filter((g) => !headCodes.has(g.code))
    .sort((a, b) => String(a.code).localeCompare(String(b.code), 'en'))

  return [...head, ...tail]
}

/**
 * @param {Array} nodes
 * @returns {Array<{ code, name, total, available, totalNodes, onlineNodes, avgLatency, onlineRate, bestDelay, nodes }>}
 */
export function buildCountryGroups(nodes) {
  const map = {}

  nodes.forEach((node) => {
    const code = resolveNodeCountryCode(node)
    if (!map[code]) {
      map[code] = {
        code,
        name: regionDisplayName(code),
        nodes: [],
        total: 0,
        available: 0,
        totalNodes: 0,
        onlineNodes: 0,
        avgLatency: Number.POSITIVE_INFINITY,
        onlineRate: 0,
        bestDelay: 0,
      }
    }
    map[code].nodes.push(node)
    map[code].total += 1
    if (isNodeAvailable(node)) map[code].available += 1
  })

  const groups = Object.values(map).map((group) => {
    group.nodes.sort((a, b) => nodeLatencySortKey(a) - nodeLatencySortKey(b))
    group.totalNodes = group.total
    group.onlineNodes = group.available
    group.onlineRate = group.total > 0
      ? Math.round((group.available / group.total) * 100)
      : 0
    const fastest = group.nodes.find(isNodeAvailable)
    group.bestDelay = fastest?.delay ?? 0
    group.avgLatency = countryGroupAvgLatency(group)
    return group
  })

  return arrangeCountryGroupsForDisplay(groups)
}

export function buildGlobalNodeStats(countryGroups) {
  const total = countryGroups.reduce((sum, g) => sum + g.total, 0)
  const available = countryGroups.reduce((sum, g) => sum + g.available, 0)
  return {
    total,
    available,
    onlineRate: total > 0 ? Math.round((available / total) * 100) : 0,
  }
}

/** 识别 WIFI 代理组；排除系统/杂项组（DR-WIFI、TAG-WIFI 等） */
export function isWifiProxyGroup(name) {
  if (!name || !/WIFI/i.test(name)) return false
  if (/^DR[-_]?WIFI$/i.test(name)) return false
  if (/^TAG[-_]?WIFI$/i.test(name)) return false
  return true
}
