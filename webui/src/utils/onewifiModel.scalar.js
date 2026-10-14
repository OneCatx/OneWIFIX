/** Shared scalar coercion for OneWifi payload fields. Not a public barrel export. */

export function scalarText(value) {
  if (value == null || value === '') return ''
  if (typeof value === 'object') return ''
  return String(value)
}
