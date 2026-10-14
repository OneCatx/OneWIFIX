// 下载前国家和体积提示。激活码本身不含这些字段。
// Nekoko LPA 的做法：用 SM-DP+ 主机名去对社区实测库
// （NekokoLPA2 data/reference_sizes_simple.json，MIT © 2026 Nekoko），
// 再按本卡 EID 前 8 位（EUM）取更接近的占用。
// 这不是连 SM-DP+ 拉包，只是本地对照。

import { parseLpaActivationCode } from './lpaCode.js'
import catalog from './lpaSmdpPreview.db.json' with { type: 'json' }

const ISO_ZH = {
  AD: '安道尔', AE: '阿联酋', AL: '阿尔巴尼亚', AM: '亚美尼亚', AO: '安哥拉',
  AR: '阿根廷', AT: '奥地利', AU: '澳大利亚', AW: '阿鲁巴', AZ: '阿塞拜疆',
  BA: '波黑', BD: '孟加拉', BE: '比利时', BG: '保加利亚', BH: '巴林',
  BN: '文莱', BO: '玻利维亚', BQ: '荷属加勒比', BR: '巴西', BS: '巴哈马',
  BY: '白俄罗斯', BZ: '伯利兹', CA: '加拿大', CD: '刚果（金）', CH: '瑞士',
  CL: '智利', CN: '中国', CO: '哥伦比亚', CR: '哥斯达黎加', CV: '佛得角',
  CY: '塞浦路斯', CZ: '捷克', DE: '德国', DK: '丹麦', DO: '多米尼加',
  EC: '厄瓜多尔', EE: '爱沙尼亚', EG: '埃及', ES: '西班牙', FI: '芬兰',
  FO: '法罗群岛', FR: '法国', GB: '英国', GE: '格鲁吉亚', GI: '直布罗陀',
  GL: '格陵兰', GM: '冈比亚', GR: '希腊', GY: '圭亚那', HK: '香港',
  HR: '克罗地亚', HU: '匈牙利', ID: '印尼', IE: '爱尔兰', IL: '以色列',
  IN: '印度', IQ: '伊拉克', IS: '冰岛', IT: '意大利', JM: '牙买加',
  JO: '约旦', JP: '日本', KE: '肯尼亚', KG: '吉尔吉斯', KH: '柬埔寨',
  KM: '科摩罗', KP: '朝鲜', KR: '韩国', KW: '科威特', KZ: '哈萨克',
  LA: '老挝', LB: '黎巴嫩', LI: '列支敦士登', LK: '斯里兰卡', LT: '立陶宛',
  LU: '卢森堡', LV: '拉脱维亚', MA: '摩洛哥', MD: '摩尔多瓦', ME: '黑山',
  MK: '北马其顿', MM: '缅甸', MN: '蒙古', MO: '澳门', MT: '马耳他',
  MU: '毛里求斯', MV: '马尔代夫', MX: '墨西哥', MY: '马来西亚', NG: '尼日利亚',
  NL: '荷兰', NO: '挪威', NP: '尼泊尔', NZ: '新西兰', OM: '阿曼',
  PE: '秘鲁', PF: '法属波利尼西亚', PH: '菲律宾', PK: '巴基斯坦', PL: '波兰',
  PT: '葡萄牙', PW: '帕劳', PY: '巴拉圭', QA: '卡塔尔', RO: '罗马尼亚',
  RS: '塞尔维亚', RU: '俄罗斯', RW: '卢旺达', SA: '沙特', SC: '塞舌尔',
  SE: '瑞典', SG: '新加坡', SI: '斯洛文尼亚', SK: '斯洛伐克', SV: '萨尔瓦多',
  SY: '叙利亚', TH: '泰国', TJ: '塔吉克', TN: '突尼斯', TR: '土耳其',
  TT: '特立尼达', TW: '台湾', TZ: '坦桑尼亚', UA: '乌克兰', UG: '乌干达',
  US: '美国', UY: '乌拉圭', UZ: '乌兹别克', VE: '委内瑞拉', VN: '越南',
  WS: '萨摩亚', YT: '马约特', ZA: '南非', ZM: '赞比亚', ZW: '津巴布韦',
}

export function normalizeSmdpHost(raw) {
  const text = String(raw || '').trim().toLowerCase().replace(/\.$/, '')
  if (!text) return ''
  if (/^https?:\/\//i.test(text)) {
    try {
      return new URL(text).hostname.toLowerCase().replace(/\.$/, '')
    } catch {
      return ''
    }
  }
  return text.split('/')[0].split(':')[0]
}

export function flagEmoji(iso) {
  const code = String(iso || '').trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) return ''
  return String.fromCodePoint(...[...code].map((char) => 127397 + char.charCodeAt(0)))
}

export function countryLabel(iso) {
  const code = String(iso || '').trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) return ''
  return ISO_ZH[code] || code
}

export function formatProfileBytes(bytes) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) return ''
  const kb = value / 1024
  if (kb >= 1024) return `${(kb / 1024).toFixed(2)} MB`
  return `${kb >= 100 ? kb.toFixed(0) : kb.toFixed(1)} KB`
}

function eumPrefix(eid) {
  const digits = String(eid || '').replace(/\D/g, '')
  return digits.length >= 8 ? digits.slice(0, 8) : ''
}

function pickSize(record, eid) {
  const eum = eumPrefix(eid)
  const mapped = eum && record?.e ? Number(record.e[eum]) : NaN
  if (Number.isFinite(mapped) && mapped > 0) {
    return { bytes: mapped, matchedEum: eum, ranged: false }
  }
  const min = Number(record?.n)
  const max = Number(record?.x)
  const mid = Number(record?.r)
  if (Number.isFinite(min) && Number.isFinite(max) && max > min * 1.35) {
    return { bytes: Number.isFinite(mid) ? mid : min, min, max, matchedEum: '', ranged: true }
  }
  if (Number.isFinite(mid) && mid > 0) return { bytes: mid, matchedEum: '', ranged: false }
  if (Number.isFinite(min) && min > 0) return { bytes: min, matchedEum: '', ranged: false }
  return { bytes: 0, matchedEum: '', ranged: false }
}

export function lookupSmdpPreview(smdp, options = {}, db = catalog) {
  const host = normalizeSmdpHost(smdp)
  if (!host) return null
  const record = db?.hosts?.[host]
  if (!record) return { known: false, host }

  const countries = (record.c || [])
    .map((iso) => {
      const code = String(iso || '').toUpperCase()
      const name = countryLabel(code)
      return name ? { iso: code, name, flag: flagEmoji(code) } : null
    })
    .filter(Boolean)
  const operators = (record.o || []).filter(Boolean)
  const operatorTotal = Number(record.k) || operators.length
  const size = pickSize(record, options.eid)
  const free = Number(options.freeNvramBytes)
  const spaceWarning = Number.isFinite(free) && free > 0 && size.bytes > 0 && free < size.bytes * 1.25

  return {
    known: true,
    host,
    countries,
    operators,
    operatorTotal,
    sizeBytes: size.bytes,
    sizeMin: size.min || size.bytes,
    sizeMax: size.max || size.bytes,
    sizeRanged: Boolean(size.ranged),
    matchedEum: size.matchedEum,
    spaceWarning,
  }
}

export function formatSmdpPreview(preview) {
  if (!preview) return null
  if (!preview.known) {
    return {
      title: '未收录此 SM-DP+',
      detail: `${preview.host} 不在社区样本库里，下载前无法估计国家和占用。`,
      size: '',
      warning: '',
    }
  }

  const countryText = preview.countries.length === 0
    ? '国家未知'
    : preview.countries.length <= 3
      ? preview.countries.map((item) => `${item.flag} ${item.name}`.trim()).join(' · ')
      : `${preview.countries.slice(0, 2).map((item) => `${item.flag} ${item.name}`.trim()).join(' · ')} 等 ${preview.countries.length} 地`

  const operatorText = preview.operatorTotal > preview.operators.length
    ? `${preview.operators.slice(0, 3).join(' / ')} 等 ${preview.operatorTotal} 家`
    : preview.operators.slice(0, 3).join(' / ')

  const size = preview.sizeRanged
    ? `估计 ${formatProfileBytes(preview.sizeMin)}–${formatProfileBytes(preview.sizeMax)}`
    : preview.sizeBytes
      ? `约 ${formatProfileBytes(preview.sizeBytes)}`
      : ''

  return {
    title: countryText,
    detail: [operatorText, preview.matchedEum ? '已按本卡硅片校正体积' : '社区样本，不是实测包体']
      .filter(Boolean)
      .join(' · '),
    size,
    warning: preview.spaceWarning ? '估计占用接近或超过当前可用空间，下载可能失败。' : '',
  }
}

export function previewLpaActivation(raw, options = {}, db = catalog) {
  const parsed = parseLpaActivationCode(raw)
  if (!parsed.smdp) return null
  return lookupSmdpPreview(parsed.smdp, options, db)
}
