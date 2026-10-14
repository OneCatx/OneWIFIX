import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { primaryNavLabels, NAV_MODULES, MOBILE_TAB_PATHS, visibleNavItems } from './sidebarNav.js'

const here = dirname(fileURLToPath(import.meta.url))
const router = readFileSync(join(here, '../router/index.js'), 'utf8')

describe('sidebar primary NAV', () => {
  it('has eight items without the retired DJI zone and keeps mobile primary tabs', () => {
    assert.deepEqual(primaryNavLabels(), [
      '仪表盘',
      '设备管理',
      '代理管理',
      '短信检测',
      '通话',
      '保号',
      '问题日志',
      '系统设置',
    ])
    const paths = visibleNavItems().map((item) => item.path)
    assert.deepEqual(paths, [
      '/dashboard',
      '/devices',
      '/proxy',
      '/sms',
      '/calls',
      '/keepalive',
      '/logs',
      '/settings',
    ])
    assert.equal(paths.includes('/multistandby'), false)
    assert.match(router, /path: 'multistandby', redirect: '\/dashboard'/)
    assert.match(router, /path: 'change-password', redirect: '\/settings'/)
    assert.doesNotMatch(router, /ChangePassword/)
    for (const extra of ['/dji', '/esim', '/diagnostics', '/notifications', '/automatic-tasks']) {
      assert.equal(paths.includes(extra), false)
    }
    assert.deepEqual(MOBILE_TAB_PATHS, ['/dashboard', '/devices', '/sms', '/keepalive'])
    assert.match(router, /path: 'calls', component:/)
    assert.doesNotMatch(router, /path: 'calls', redirect:/)
    assert.match(router, /path: 'dji', redirect: '\/devices'/)
    assert.doesNotMatch(router, /Dji\.vue/)
  })
})
