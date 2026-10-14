import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const outDir = path.resolve('release/mobile-smoke')
fs.mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
})
const page = await context.newPage()
const report = {
  url: 'http://localhost:5173/',
  viewport: '390x844',
  checks: [],
}

function add(name, pass, detail) {
  report.checks.push({ name, pass, detail })
}

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(800)

const viewportMeta = await page.evaluate(() => {
  const m = document.querySelector('meta[name="viewport"]')
  return m ? m.getAttribute('content') : null
})
add(
  'viewport_fit_cover',
  !!(viewportMeta && viewportMeta.includes('viewport-fit=cover')),
  String(viewportMeta),
)

// Login page visual baseline
const loginMetrics = await page.evaluate(() => {
  const card = document.querySelector('.auth-card')
  const pageEl = document.querySelector('.auth-page')
  if (!card || !pageEl) return null
  const cr = card.getBoundingClientRect()
  const pr = pageEl.getBoundingClientRect()
  return {
    cardVisible: cr.width > 0 && cr.height > 0,
    cardWithinViewport: cr.top >= -2 && cr.bottom <= window.innerHeight + 2,
    pageH: pr.height,
    vh: window.innerHeight,
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
  }
})
add('login_card_in_viewport', !!(loginMetrics && loginMetrics.cardWithinViewport), JSON.stringify(loginMetrics))
add('login_no_h_overflow', !!(loginMetrics && !loginMetrics.overflowX), JSON.stringify(loginMetrics))
await page.screenshot({ path: path.join(outDir, 'login-390.png'), fullPage: false })

// Authenticate (default bootstrap: admin/admin; may force change-password)
await page.fill('input[name="username"]', 'admin')
await page.fill('input[name="password"]', 'admin')
await page.click('button[type="submit"], .auth-submit, form.auth-card button')
await page.waitForTimeout(1500)

let route = page.url()
if (route.includes('change-password')) {
  const inputs = page.locator('input[type="password"]')
  const count = await inputs.count()
  // Prefer labeled fields if present
  const oldPwd = page.locator('input[autocomplete="current-password"]').first()
  const newPwd = page.locator('input[autocomplete="new-password"]').first()
  if ((await oldPwd.count()) && (await newPwd.count()) >= 1) {
    await oldPwd.fill('admin')
    const news = page.locator('input[autocomplete="new-password"]')
    await news.nth(0).fill('Admin123!')
    if ((await news.count()) > 1) await news.nth(1).fill('Admin123!')
  } else if (count >= 2) {
    await inputs.nth(0).fill('admin')
    await inputs.nth(1).fill('Admin123!')
    if (count >= 3) await inputs.nth(2).fill('Admin123!')
  }
  await page.click('button[type="submit"]')
  await page.waitForTimeout(2000)
  route = page.url()
}

// If still on login (password already changed previously), retry with new password
if (route.includes('/login')) {
  await page.fill('input[name="username"]', 'admin')
  await page.fill('input[name="password"]', 'Admin123!')
  await page.click('button[type="submit"], .auth-submit, form.auth-card button')
  await page.waitForTimeout(2000)
  route = page.url()
}

add('authenticated_past_login', !route.includes('/login'), `url=${route}`)

if (!route.includes('/login') && !route.includes('change-password')) {
  await page.waitForSelector('.layout', { timeout: 10000 }).catch(() => null)
  await page.waitForTimeout(800)

  const shell = await page.evaluate(() => {
    const el = document.querySelector('.layout')
    if (!el) return null
    const cs = getComputedStyle(el)
    const content = document.querySelector('.content')
    const ccs = content ? getComputedStyle(content) : null
    return {
      height: cs.height,
      maxHeight: cs.maxHeight,
      overflow: cs.overflow,
      paddingBottom: cs.paddingBottom,
      paddingTop: cs.paddingTop,
      rectH: el.getBoundingClientRect().height,
      contentOverflowY: ccs?.overflowY || null,
      vh: window.innerHeight,
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
    }
  })

  const tabBar = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('[class*="lg-"], [class*="tab"], nav, footer')]
    return nodes
      .filter((n) => {
        const cs = getComputedStyle(n)
        const r = n.getBoundingClientRect()
        return cs.position === 'fixed' && r.height > 48 && r.width > 180 && parseFloat(cs.bottom) < 40
      })
      .slice(0, 3)
      .map((n) => ({
        cls: String(n.className).slice(0, 160),
        h: Math.round(n.getBoundingClientRect().height),
        bottom: getComputedStyle(n).bottom,
      }))
  })

  add('layout_exists', !!shell, JSON.stringify(shell))
  if (shell) {
    const h = parseFloat(shell.height) || shell.rectH
    add(
      'layout_height_fits_viewport',
      h > 0 && h <= shell.vh + 2,
      `layoutH=${h} vh=${shell.vh} maxH=${shell.maxHeight}`,
    )
    add(
      'layout_bottom_clearance',
      parseFloat(shell.paddingBottom) >= 48,
      `paddingBottom=${shell.paddingBottom}`,
    )
    add('shell_no_h_overflow', !shell.overflowX, JSON.stringify(shell))
    add(
      'content_scrollable',
      shell.contentOverflowY === 'auto' || shell.contentOverflowY === 'scroll',
      `overflowY=${shell.contentOverflowY}`,
    )
  }
  add('mobile_tabbar_fixed', tabBar.length > 0, JSON.stringify(tabBar))

  // Scroll content to bottom if possible
  await page.evaluate(() => {
    const c = document.querySelector('.content')
    if (c) c.scrollTop = c.scrollHeight
  })
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(outDir, 'shell-390.png'), fullPage: false })

  for (const [w, h, name] of [
    [375, 812, 'shell-iphone-se'],
    [768, 1024, 'shell-ipad-mini'],
  ]) {
    await page.setViewportSize({ width: w, height: h })
    await page.waitForTimeout(400)
    const m = await page.evaluate(() => ({
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      w: window.innerWidth,
      sw: document.documentElement.scrollWidth,
      hasLayout: !!document.querySelector('.layout'),
    }))
    add(`shell_no_h_overflow_${name}`, !m.overflowX, JSON.stringify(m))
    await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: false })
  }
} else {
  add('layout_exists', false, `blocked at ${route}`)
  await page.screenshot({ path: path.join(outDir, 'auth-blocked.png'), fullPage: false })
}

const failed = report.checks.filter((c) => !c.pass)
report.summary = {
  total: report.checks.length,
  passed: report.checks.length - failed.length,
  failed: failed.length,
  ok: failed.length === 0,
}

fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
await browser.close()
process.exit(report.summary.ok ? 0 : 2)
