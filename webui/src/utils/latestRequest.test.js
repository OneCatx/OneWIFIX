import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createLatestRequestGuard } from './latestRequest.js'

describe('createLatestRequestGuard', () => {
  it('prevents a slow previous device load from overwriting the latest device', async () => {
    const guard = createLatestRequestGuard()
    const applied = []
    let resolveA
    let resolveB
    const aResult = new Promise((resolve) => { resolveA = resolve })
    const bResult = new Promise((resolve) => { resolveB = resolve })

    async function loadDevice(deviceId, result) {
      const request = guard.begin(deviceId)
      const value = await result
      if (guard.isCurrent(request, deviceId)) applied.push(value)
    }

    const loadA = loadDevice('device-a', aResult)
    const loadB = loadDevice('device-b', bResult)
    resolveB('device-b')
    await loadB
    resolveA('device-a')
    await loadA

    assert.deepEqual(applied, ['device-b'])
  })

  it('invalidates an in-flight request when the dialog closes', () => {
    const guard = createLatestRequestGuard()
    const request = guard.begin('device-a')
    guard.invalidate()
    assert.equal(guard.isCurrent(request, 'device-a'), false)
  })
})
