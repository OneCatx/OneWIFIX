/** 控制台侧栏：仪表盘 / 设备 / 代理 / 短信 / 通话 / 保号 / 日志 / 设置。 */

export const NAV_MODULES = [
  {
    id: 'main',
    label: '导航',
    items: [
      { path: '/dashboard', label: '仪表盘', labelEn: 'Dashboard', icon: 'space_dashboard', module: 'monitor' },
      { path: '/devices', label: '设备管理', labelEn: 'Devices', icon: 'smartphone', module: 'monitor' },
      { path: '/proxy', label: '代理管理', labelEn: 'Proxy', icon: 'public', module: 'network' },
      { path: '/sms', label: '短信检测', labelEn: 'SMS', icon: 'sms', module: 'monitor' },
      { path: '/calls', label: '通话', labelEn: 'Calls', icon: 'phone', module: 'monitor' },
      { path: '/keepalive', label: '保号', labelEn: 'Keepalive', icon: 'timer', module: 'monitor' },
      { path: '/logs', label: '问题日志', labelEn: 'Logs', icon: 'article', module: 'system' },
      { path: '/settings', label: '系统设置', labelEn: 'Settings', icon: 'settings', module: 'system' },
    ],
  },
]

export const NAV_AUXILIARY = [
  /** 暂无独立关于页：复用设置页版本/关于信息区 */
  { id: 'help', label: '帮助 / 关于', labelEn: 'Help / About', icon: 'help_outline', path: '/settings' },
  { id: 'logout', label: '退出登录', labelEn: 'Sign out', icon: 'logout', action: 'logout' },
]

/** 返回控制台全部导航项。 */
export function visibleNavItems() {
  return NAV_MODULES.flatMap((group) => group.items)
}

/** 移动端底部悬浮栏的常驻目的地（其余进「更多」抽屉），按手机高频使用排序 */
export const MOBILE_TAB_PATHS = ['/dashboard', '/devices', '/sms', '/keepalive']

/** 按 MOBILE_TAB_PATHS 把导航拆成「底栏常驻 + 更多抽屉」两组，数据仍复用 NAV_MODULES */
export function splitMobileNav() {
  const all = NAV_MODULES.flatMap((group) => group.items)
  const primary = MOBILE_TAB_PATHS
    .map((path) => all.find((item) => item.path === path))
    .filter(Boolean)
  const overflow = all.filter((item) => !MOBILE_TAB_PATHS.includes(item.path))
  return { primary, overflow }
}

export function matchNavItem(routePath, item) {
  if (item.matchPrefix) return routePath.startsWith(item.matchPrefix)
  return routePath === item.path
}

export function activeModuleId(routePath) {
  for (const group of NAV_MODULES) {
    if (group.items.some((item) => matchNavItem(routePath, item))) {
      return group.id
    }
  }
  return null
}

export function primaryNavLabels() {
  return visibleNavItems().map((item) => item.label)
}
