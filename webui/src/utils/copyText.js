export async function copyText(text, { clipboard, document } = {}) {
  const value = String(text || '')
  if (!value) return false
  const clip = clipboard ?? globalThis.navigator?.clipboard
  try {
    if (clip?.writeText) {
      await clip.writeText(value)
      return true
    }
  } catch {
    // HTTP 局域网没有 Clipboard API；走选中回退。
  }
  const doc = document ?? globalThis.document
  if (!doc?.body) return false
  const area = doc.createElement('textarea')
  area.value = value
  area.setAttribute('readonly', '')
  area.setAttribute('aria-hidden', 'true')
  area.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'
  doc.body.appendChild(area)
  area.focus()
  area.select()
  area.setSelectionRange(0, value.length)
  let ok = false
  try {
    ok = Boolean(doc.execCommand('copy'))
  } catch {
    ok = false
  } finally {
    area.remove()
  }
  return ok
}
