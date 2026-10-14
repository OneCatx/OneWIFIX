import fs from 'node:fs'
import bcrypt from 'bcryptjs'
import { chromium } from 'playwright'

const usersPath = '.onebord/data/users.json'
const original = fs.readFileSync(usersPath, 'utf8')
const store = JSON.parse(original)
const smokePwd = 'SmokeTest#390'
store.users[0].password_hash = bcrypt.hashSync(smokePwd, 12)
store.users[0].must_change_password = false
fs.writeFileSync(usersPath, JSON.stringify(store, null, 2))

const results = []

try {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.fill('input[name=username]', 'admin')
  await page.fill('input[name=password]', smokePwd)
  await page.click('button[type=submit]')
  await page.waitForURL((u) => u.pathname.includes('/dashboard'), { timeout: 10000 })
  await page.waitForTimeout(500)

  async function openMore() {
    await page
      .waitForFunction(() => !document.querySelector('.lg-sheet-backdrop'), { timeout: 2500 })
      .catch(() => {})
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('.lg-tab')].find((el) => el.textContent.includes('更多'))
      btn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    })
    await page.waitForSelector('.lg-sheet', { timeout: 3000 })
    await page.waitForTimeout(400)
  }

  await openMore()

  const hit = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.lg-sheet__item, .lg-sheet__aux-btn')]
    return {
      count: items.length,
      tags: items.map((el) => el.tagName),
      allButtons: items.every((el) => el.tagName === 'BUTTON'),
      allHit: items.every((el) => {
        const r = el.getBoundingClientRect()
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        return top && (el === top || el.contains(top))
      }),
    }
  })
  results.push({ step: 'hit', ...hit, ok: hit.allButtons && hit.allHit && hit.count >= 8 })

  // 关掉命中测试留下的抽屉，避免下一次「更多」变成 toggle 关闭
  await page.evaluate(() => {
    document.querySelector('.lg-sheet-backdrop')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, view: window }),
    )
  })
  await page.waitForTimeout(350)

  for (const [label, expectPath] of [
    ['DNS 监控', '/dns'],
    ['规则', '/rules'],
    ['订阅', '/subscriptions'],
    ['Proxy', '/proxy'],
    ['设置', '/settings'],
    ['日志', '/logs'],
    ['帮助 / 关于', '/settings'],
  ]) {
    await openMore()
    await page.evaluate((text) => {
      const el = [...document.querySelectorAll('.lg-sheet button')].find((node) =>
        node.textContent.replace(/\s+/g, ' ').includes(text),
      )
      el?.click()
    }, label)
    await page.waitForURL((u) => u.pathname === expectPath, { timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(200)
    const path = new URL(page.url()).pathname
    results.push({ label, path, ok: path === expectPath })
  }

  console.log(JSON.stringify({ results }, null, 2))
  process.exit(results.some((r) => r.ok === false) ? 2 : 0)
} finally {
  fs.writeFileSync(usersPath, original)
  console.log('users restored')
}
