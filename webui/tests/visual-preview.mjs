// Test-only built-UI preview. Synthetic auth identifies itself and never fabricates hardware.
// Run after npm run build: node tests/visual-preview.mjs
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'

const dist = resolve(import.meta.dirname, '..', 'dist')
const port = Number(process.env.MDD_VISUAL_PORT || 5180)
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.txt': 'text/plain' }
const visualSettings = {
  webhook: { enabled: false, url: '' }, telegram: { enabled: false }, pushplus: { enabled: false }, feishu: { channels: [] },
  wecom: { enabled: false, urls: ['********', '********'], payload_template: '', events: { incoming_sms: true } },
  bark: { enabled: false, urls: ['********'], group: '', icon: '', level: 'active', events: { incoming_call: true } },
  apns: { enabled: false, environment: 'production', bundle_id: '', team_id: '', key_id: '', auth_key_path: '********' },
  apns_voip: { enabled: false, environment: 'sandbox', bundle_id: '', team_id: '', key_id: '', auth_key_path: '' },
}

createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname
  if (pathname.startsWith('/api/')) {
    const fixtures = {
      '/api/auth/status': { configured: true, authenticated: true, username: 'VISUAL FIXTURE', csrf: 'visual-only' },
      '/api/instances': { instances: [] },
      '/api/cards': { cards: [] },
      '/api/devices': { devices: [], discovering: false },
      '/api/messages/unread': { total: 0, lines: [] },
      '/api/system/status': { version: 'visual-fixture' },
      '/api/system/update/check': { update_available: false },
      '/api/system/update/progress': { state: 'idle' },
      '/api/system/repository/stars': { stars: null },
      '/api/settings': visualSettings,
      '/api/notifications/deliveries': { pending: [], history: [] },
    }
    const body = JSON.stringify(fixtures[pathname] || {})
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    response.end(body)
    return
  }
  const file = resolve(dist, `.${pathname === '/' ? '/index.html' : pathname}`)
  if (file !== dist && !file.startsWith(dist + sep)) { response.writeHead(404).end(); return }
  try {
    const body = await readFile(file)
    response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' })
    response.end(body)
  } catch { response.writeHead(404).end() }
}).listen(port, '127.0.0.1', () => console.log(`TEST-ONLY visual preview: http://127.0.0.1:${port}/`))
