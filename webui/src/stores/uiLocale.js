import { reactive } from 'vue'
import { applyUiLanguage } from '../utils/uiLanguage'

export const uiLocale = reactive({ language: 'zh' })

export function setUiLanguage(lang) {
  uiLocale.language = applyUiLanguage(lang)
  return uiLocale.language
}

export function tCopy(zh, en) {
  return uiLocale.language === 'en' ? en : zh
}
