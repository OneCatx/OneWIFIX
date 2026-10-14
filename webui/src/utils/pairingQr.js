import { renderSVG } from './uqr.mjs'

export function pairingQrSvg(text) {
  const uri = String(text || '').trim()
  if (!uri) return ''
  return renderSVG(uri, { pixelSize: 4, whiteColor: '#ffffff', blackColor: '#111111' })
}

export function pairingQrDataUrl(text) {
  const svg = pairingQrSvg(text)
  if (!svg) return ''
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
