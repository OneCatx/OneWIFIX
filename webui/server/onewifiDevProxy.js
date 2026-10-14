/**
 * Vite dev talks HTTP; OneWIFI Set-Cookie is Secure + SameSite=Strict.
 * Browsers drop Secure cookies on http://localhost, so strip those flags in proxy.
 * Production serves Board from the same HTTPS origin — this rewrite is not used.
 */
export function rewriteSetCookieForInsecureDev(value) {
  return String(value)
    .replace(/;\s*Secure/gi, '')
    .replace(/;\s*SameSite=Strict/gi, '; SameSite=Lax')
}

export function rewriteSetCookieHeader(headerValue) {
  if (!headerValue) return headerValue
  const list = Array.isArray(headerValue) ? headerValue : [headerValue]
  return list.map(rewriteSetCookieForInsecureDev)
}

export function createOnewifiDevProxy(target) {
  return {
    target,
    changeOrigin: true,
    secure: false,
    configure(proxy) {
      proxy.on('proxyRes', (proxyRes) => {
        const sc = proxyRes.headers['set-cookie']
        if (!sc) return
        proxyRes.headers['set-cookie'] = rewriteSetCookieHeader(sc)
      })
    },
  }
}
