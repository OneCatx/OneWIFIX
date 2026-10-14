import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const router = readFileSync(join(here, '../router/index.js'), 'utf8')
const pagePath = join(here, 'DeviceEdit.vue')

describe('device edit route', () => {
  it('registers /devices/:deviceId/edit on DeviceEdit', () => {
    assert.match(router, /devices\/:deviceId\/edit/)
    assert.match(router, /DeviceEdit/)
  })
})

describe('device edit page shell', () => {
  it('mounts the eSIM dialog route with a safe missing-id state', () => {
    assert.equal(existsSync(pagePath), true)
    const page = readFileSync(pagePath, 'utf8')
    assert.match(page, /EsimEditDialog/)
    assert.match(page, /device-edit-route/)
    assert.match(page, /缺少设备编号，无法打开 eSIM 编辑/)
    assert.match(page, /role="alert"/)
    assert.match(page, /router\.push\(['"]\/devices['"]\)/)
  })
})