export function readUiLanguage(prefs) {
  const raw = String(prefs?.language ?? prefs?.data?.language ?? '').toLowerCase().trim()
  if (raw === 'en' || raw.startsWith('en-')) return 'en'
  if (raw === 'zh' || raw.startsWith('zh')) return 'zh'
  return ''
}

export function applyUiLanguage(lang) {
  const next = lang === 'en' ? 'en' : 'zh'
  if (typeof document !== 'undefined') {
    document.documentElement.lang = next === 'en' ? 'en' : 'zh-CN'
  }
  return next
}
