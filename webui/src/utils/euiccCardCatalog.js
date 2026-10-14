/**
 * 消费级可插拔 eUICC 零售 SKU 库 + 确定性匹配。
 *
 * 两层身份不要混：
 * - EUM / EID 前缀 / SAS = 硅片厂（Thales / G+D / 东信和平 / Kigen…）
 * - ISD-R AID + 唯一 EIN/SAS/固件组合 = 零售品牌与 SKU
 *
 * 禁止用剩余 NVRAM 猜 SKU（同一硅片多家复用，写入后剩余还会变）。
 * 指纹不够唯一时只入库、不自动点名，铭牌回落「Nekoko联名」。
 *
 * 实验室 88 真机（2026-09-02 app_settings esim.inventory）：
 * - DJ-1 ESTK SE0 + EIN 89049032 + fw 32.33.0 → Estk.me C beta
 * - DJ-2 GSMA ISD-R + EIN 89049032 + SAS GD-NG-UP-1227 → G+D天联
 * - DJ-3 SE0+SE1 + EIN 89033023×2 + fw 66.113.0 → ESTK.me Max
 *
 * 来源（2026-09-02）：
 * - ESTKme product-history https://store.estk.me/product-history
 * - osmocom OEM AID https://euicc-manual.osmocom.org/docs/lpa/applet-id-oem/
 * - osmocom known-card https://euicc-manual.osmocom.org/docs/lpa/known-card/
 * - 360CARD https://360card.site/known-sgp-22-consumer-euiccs/
 * - 9eSIM FAQ / 9es.im（V0 ECP 89086030，V3 Kigen 89044045）
 * - 5ber / XeSIM / eSIM.me / LinksField / Switch.eSIM / eIoTClub / JMP / sysmocom 官方页
 */

import {
  XESIM_ISD_R_AID,
  ESIM_ME_ISD_R_AID,
  BER5_ISD_R_AID,
  LINKSFIELD_ISD_R_AID,
  EUICC_SKU_DATABASE,
} from './euiccCardCatalog.sku.js'

export {
  XESIM_ISD_R_AID,
  ESIM_ME_ISD_R_AID,
  BER5_ISD_R_AID,
  LINKSFIELD_ISD_R_AID,
  EUICC_SKU_DATABASE,
}

export const GSMA_ISD_R_AID = 'A0000005591010FFFFFFFF8900000100'

export const ESTK_PRODUCT_AID = 'A06573746B6D65FFFFFFFFFFFF6D6774'
export const ESTK_SE0_AID = 'A06573746B6D65FFFF4953442D522030'
export const ESTK_SE1_AID = 'A06573746B6D65FFFF4953442D522031'
export const ESTK_AUX_AID = 'A06573746B6D65FFFFFFFF4953442D52'

export const UNKNOWN_EUICC_NAMEPLATE = 'Nekoko联名'

/** EID 前 8 位 EIN → 硅片厂。89033023 被误当成 ESTK 品牌就会把 Max 显示成 Thales。 */
export const EID_CHIP_MAKER = Object.freeze({
  '89033023': 'Thales DIS France SAS',
  '89033024': 'IDEMIA',
  '89034011': 'Valid',
  '89041030': 'STMicroelectronics',
  '89043051': 'NXP',
  '89043052': 'NXP',
  '89044045': 'Kigen / SIMLINK',
  '89044047': 'Kigen',
  '89049032': 'G+D Mobile Security GmbH',
  '89049038': 'G+D Mobile Security GmbH',
  '89049044': 'G+D Mobile Security GmbH',
  '89086001': '恒宝 Hengbao',
  '89086029': '武汉天瑜',
  '89086030': '东信和平 Eastcompeace',
  '35060000': '中国大陆 EUM',
  '35840574': 'WatchData Technologies Ltd.',
})

/** GSMA SGP.02 EID[1:5] 四位 EUM 码（与后端 esim_lpa_info.go 对齐，前端补一层）。 */
export const EUM_CODE_CHIP_MAKER = Object.freeze({
  '5840': 'WatchData Technologies Ltd.',
  '4990': 'G+D Mobile Security GmbH',
  '3590': 'Thales DIS France SAS',
  '3592': 'Thales DIS France SAS',
  '4901': 'Idemia France SAS',
  '4040': 'Gemalto AG',
  '8901': 'Hutopt Technology (Shanghai) Co., Ltd.',
  '9086': 'Eastcompeace Technology Co., Ltd.',
})

export function normalizeAidHex(value) {
  return String(value || '').replace(/\s+/g, '').toUpperCase()
}

export function chipMakerFromEid(eid) {
  const digits = String(eid || '').replace(/\D/g, '')
  if (digits.length >= 8 && EID_CHIP_MAKER[digits.slice(0, 8)]) {
    return EID_CHIP_MAKER[digits.slice(0, 8)]
  }
  if (digits.length >= 5 && EUM_CODE_CHIP_MAKER[digits.slice(1, 5)]) {
    return EUM_CODE_CHIP_MAKER[digits.slice(1, 5)]
  }
  return ''
}

function hasAid(aids, wanted) {
  const target = normalizeAidHex(wanted)
  return aids.some((aid) => normalizeAidHex(aid) === target)
}

function isEstkAid(aid) {
  return normalizeAidHex(aid).startsWith('A06573746B6D65')
}

function isOemRetailAid(aid) {
  const hex = normalizeAidHex(aid)
  return hex === XESIM_ISD_R_AID
    || hex === BER5_ISD_R_AID
    || hex === ESIM_ME_ISD_R_AID
    || hex === LINKSFIELD_ISD_R_AID
    || isEstkAid(hex)
}

function isGdSas(value) {
  return /^GD[-_]/i.test(String(value || '').trim())
}

function einPrefixes(eids) {
  return [...new Set(
    (Array.isArray(eids) ? eids : [])
      .map((eid) => String(eid || '').replace(/\D/g, ''))
      .filter((eid) => eid.length >= 8)
      .map((eid) => eid.slice(0, 8)),
  )]
}

function firmwareMajor(firmware) {
  const text = String(firmware || '').trim()
  const match = text.match(/^(\d+)/)
  return match ? match[1] : ''
}

function isEstkCos6(firmware) {
  const text = String(firmware || '').trim()
  if (/cos\s*6/i.test(text)) return true
  return firmwareMajor(text) === '32'
}

function productFromSku(sku, extra = {}) {
  return {
    id: sku.id,
    brand: sku.brand,
    sku: sku.sku,
    nameplate: sku.nameplate,
    dualEuicc: Boolean(sku.dualEuicc),
    expectedEuiccCount: sku.expectedEuiccCount || (sku.dualEuicc ? 2 : 1),
    ...extra,
  }
}

function emptyProduct(expectedEuiccCount) {
  return {
    id: '',
    brand: '',
    sku: '',
    nameplate: '',
    dualEuicc: false,
    expectedEuiccCount: Math.max(expectedEuiccCount, 1),
  }
}

function skuById(id) {
  return EUICC_SKU_DATABASE.find((item) => item.id === id)
}

/**
 * 用一张卡上出现的全部 ISD-R AID + EID + SAS + 固件判定零售品牌。
 * 不读取剩余 NVRAM。
 */
export function resolveEuiccProduct({
  aids = [],
  eids = [],
  sasList = [],
  firmware = '',
} = {}) {
  const list = Array.isArray(aids) ? aids.map(normalizeAidHex).filter(Boolean) : []
  const eins = einPrefixes(eids)
  const sas = Array.isArray(sasList) ? sasList : []
  const se0 = hasAid(list, ESTK_SE0_AID)
  const se1 = hasAid(list, ESTK_SE1_AID)
  const estk = se0 || se1 || list.some(isEstkAid)
  const gsma = hasAid(list, GSMA_ISD_R_AID)
  const gdEin = eins.includes('89049032') || eins.includes('89049038')
  const thalesEstk = eins.length > 0 && eins.every((ein) => ein === '89033023')

  if (se0 && se1) return productFromSku(skuById('estk-max'))
  if (estk && thalesEstk) return productFromSku(skuById('estk-max'))
  if (estk && eins.includes('89034011')) return productFromSku(skuById('estk-plus-plus'))
  if (estk && eins.includes('89049032') && isEstkCos6(firmware)) {
    return productFromSku(skuById('estk-c-beta'))
  }
  if (estk) return productFromSku(skuById('estk-generic'))

  if (hasAid(list, XESIM_ISD_R_AID)) return productFromSku(skuById('xesim'))
  if (hasAid(list, BER5_ISD_R_AID)) return productFromSku(skuById('5ber'))
  if (hasAid(list, ESIM_ME_ISD_R_AID)) return productFromSku(skuById('esim-me'))
  if (hasAid(list, LINKSFIELD_ISD_R_AID)) return productFromSku(skuById('linksfield'))

  if (sas.some(isGdSas) || (gdEin && gsma)) return productFromSku(skuById('tianlian'))

  if ((eins.includes('89044045') || eins.includes('89044047')) && !list.some(isOemRetailAid)) {
    return productFromSku(skuById('9esim'))
  }
  if (eins.includes('89049044')) return productFromSku(skuById('sysmo-c2t'))
  if (eins.includes('89086030') && sas.some((value) => String(value || '').trim().toUpperCase() === 'ED-ZI-UP-0828')) {
    return productFromSku(skuById('9esim-b1'))
  }

  return emptyProduct(Math.max(list.length, eins.length, 1))
}

/** 型号库对不上时，保留卡上自带的 9eSIM 铭牌，不要改成「Nekoko联名」。 */
export function explicitEuiccLabel(value) {
  const text = String(value || '').trim()
  if (/^9\s*e\s*sim\b/i.test(text)) return text
  return ''
}

export function decorateEuiccHardware(entries) {
  const list = Array.isArray(entries) ? entries : []
  const firmware = list.map((item) => item?.firmware).find((value) => String(value || '').trim()) || ''
  const product = resolveEuiccProduct({
    aids: list.map((item) => item?.aidHex),
    eids: list.map((item) => item?.eid),
    sasList: list.map((item) => item?.sas),
    firmware,
  })
  return list.map((item) => {
    const chipMaker = String(item?.chipMaker || item?.manufacturer || '').trim()
      || chipMakerFromEid(item?.eid)
    const { cardLabel, ...rest } = item || {}
    const nameplate = product.nameplate || explicitEuiccLabel(cardLabel) || UNKNOWN_EUICC_NAMEPLATE
    return {
      ...rest,
      chipMaker,
      brand: product.brand,
      sku: product.sku,
      nameplate,
      dualEuicc: product.dualEuicc,
      expectedEuiccCount: product.expectedEuiccCount,
    }
  })
}
