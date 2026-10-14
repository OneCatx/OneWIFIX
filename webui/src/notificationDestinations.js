export const SECRET_MASK = '********'

export function destinationSummary(urls) {
  return String(Array.isArray(urls) ? urls.length : 0)
}

export function prepareNotificationSettings(settings, drafts) {
  const result = { ...settings }
  for (const name of ['wecom', 'bark']) {
    if (!Object.hasOwn(drafts, name)) continue
    const urls = String(drafts[name]).split(/\r?\n/).map(url => url.trim()).filter(Boolean)
    if (urls.some(url => url.includes(SECRET_MASK))) {
      throw new Error('Re-enter every destination URL; masked values cannot be mixed with replacements.')
    }
    if (urls.length > 10) throw new Error('Use at most 10 destination URLs.')
    if (result[name]?.enabled && !urls.length) throw new Error('An enabled channel needs at least one destination URL.')
    result[name] = { ...(result[name] || {}), urls }
  }
  return result
}
