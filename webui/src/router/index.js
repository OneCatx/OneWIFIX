import { createRouter, createWebHistory } from 'vue-router'
import MainLayout from '../layouts/MainLayout.vue'
import Dashboard from '../views/Dashboard.vue'
import { hydrateAuth } from '../api/auth'
import { isAuthenticated } from '../stores/auth'
import { resetLoading } from '../stores/globalLoading'

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/Login.vue'),
    meta: { public: true, title: '登录' },
  },
  {
    path: '/',
    component: MainLayout,
    meta: { requiresAuth: true },
    redirect: '/dashboard',
    children: [
      { path: 'dashboard', component: Dashboard, meta: { title: '仪表盘', module: 'monitor' } },
      { path: 'devices/:deviceId/edit', name: 'device-edit', component: () => import('../views/DeviceEdit.vue'), meta: { title: '编辑设备', module: 'monitor' } },
      { path: 'devices', component: () => import('../views/OneWifiDevices.vue'), meta: { title: '设备管理', module: 'monitor' } },
      { path: 'dji', redirect: '/devices' },
      { path: 'proxy', component: () => import('../views/Proxy.vue'), meta: { title: '代理管理', module: 'network' } },
      { path: 'sms', component: () => import('../views/OneWifiSms.vue'), meta: { title: '短信检测', module: 'monitor' } },
      { path: 'calls', component: () => import('../views/Calls.vue'), meta: { title: '通话', module: 'monitor' } },
      { path: 'multistandby', redirect: '/dashboard' },
      { path: 'automatic-tasks', redirect: '/keepalive' },
      { path: 'keepalive', component: () => import('../views/Keepalive.vue'), meta: { title: '保号', module: 'monitor' } },
      { path: 'logs', component: () => import('../views/Logs.vue'), meta: { title: '问题日志', module: 'system' } },
      { path: 'settings', component: () => import('../views/Settings.vue'), meta: { title: '系统设置', module: 'system' } },
      { path: 'change-password', redirect: '/settings' },
      { path: 'esim', redirect: '/devices' },
      { path: 'diagnostics', redirect: '/settings' },
      { path: 'notifications', component: () => import('../views/Notifications.vue'), meta: { title: '通知', module: 'system' } },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  await hydrateAuth()
  const authed = isAuthenticated()

  if (to.path === '/login') {
    if (authed) return '/dashboard'
    return true
  }

  if (to.matched.some((record) => record.meta.requiresAuth) && !authed) {
    return {
      path: '/login',
      query: { redirect: to.fullPath },
    }
  }

  return true
})

router.afterEach(() => {
  resetLoading()
})

router.onError(() => {
  resetLoading()
})

export default router
