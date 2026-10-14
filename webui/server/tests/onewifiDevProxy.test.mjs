import test from 'node:test'
import assert from 'node:assert/strict'
import { rewriteSetCookieForInsecureDev, rewriteSetCookieHeader } from '../onewifiDevProxy.js'
import { onewifiErrorMessage, parseOnewifiDetail } from '../../src/api/onewifiDetail.js'

test('剥掉 Secure，并把 SameSite=Strict 改成 Lax', () => {
  const raw = 'mdd_session=abc; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Strict'
  assert.equal(
    rewriteSetCookieForInsecureDev(raw),
    'mdd_session=abc; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax',
  )
})

test('Expires 里的逗号不被误伤', () => {
  const raw = 'mdd_session=abc; Expires=Fri, 28 Aug 2026 12:00:00 GMT; HttpOnly; Secure'
  const out = rewriteSetCookieForInsecureDev(raw)
  assert.match(out, /Expires=Fri, 28 Aug 2026 12:00:00 GMT/)
  assert.doesNotMatch(out, /Secure/i)
})

test('rewriteSetCookieHeader 支持数组', () => {
  const out = rewriteSetCookieHeader([
    'a=1; Secure',
    'b=2; SameSite=Strict',
  ])
  assert.deepEqual(out, ['a=1', 'b=2; SameSite=Lax'])
})

test('parseOnewifiDetail 读 FastAPI 字符串 detail', () => {
  assert.equal(parseOnewifiDetail({ detail: 'invalid username or password' }), 'invalid username or password')
})

test('504 给出可行动的超时说明', () => {
  assert.match(onewifiErrorMessage({}, 504), /USB/)
})

test('503 VPCD 重建失败不说成没插 USB', () => {
  assert.match(
    onewifiErrorMessage({ detail: 'timed out waiting for VPCD bridge rebuild (last stage: stopped)' }, 503),
    /读卡桥/,
  )
  assert.match(
    onewifiErrorMessage({ detail: 'eSIM profile did not become active on every VPCD slot: Phone failure' }, 503),
    /读卡桥/,
  )
  assert.doesNotMatch(
    onewifiErrorMessage({ detail: 'timed out waiting for VPCD bridge rebuild (last stage: stopped)' }, 503),
    /USB/,
  )
})
