// GSMA SGP.22 activation code is:
//   [LPA:]1$<SM-DP+ address>$<MatchingID>[$<Confirmation Code>]
// Operators often hand out the AC without the LPA: URI prefix. Treating
// `1$smdp$matching` as a bare host would send smdp="1" and fail at DNS.
function emptyActivation() {
  return { smdp: '', matchingId: '', confirmationCode: '' }
}

function smdpHost(raw) {
  const text = String(raw || '').trim()
  if (!text) return ''
  if (/^https?:\/\//i.test(text)) {
    try {
      return new URL(text).hostname || ''
    } catch {
      return ''
    }
  }
  return text.split('/')[0].trim()
}

export function parseLpaActivationCode(raw) {
  const text = String(raw || '').trim().replace(/[\s\u200b]+/g, '')
  if (!text) return emptyActivation()
  const withoutScheme = text.replace(/^LPA:/i, '')
  const parts = withoutScheme.split('$')
  if (parts[0] === '1' && parts.length >= 2) {
    return {
      smdp: smdpHost(parts[1]),
      matchingId: (parts[2] || '').trim(),
      confirmationCode: (parts[3] || '').trim(),
    }
  }
  return {
    smdp: smdpHost(parts[0]),
    matchingId: (parts[1] || '').trim(),
    confirmationCode: (parts[2] || '').trim(),
  }
}
