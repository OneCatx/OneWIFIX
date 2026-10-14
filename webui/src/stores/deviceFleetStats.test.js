import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  aggregateFleet,
  clearInstanceFleet,
  instanceFleetScope,
  reportInstanceFleet,
  resetFleetStats,
  fleetOverview,
} from './deviceFleetStats.js'

describe('deviceFleetStats', () => {
  beforeEach(() => resetFleetStats())

  it('treats loopback and RFC1918 as lan, public hosts as wan', () => {
    assert.equal(instanceFleetScope('127.0.0.1'), 'lan')
    assert.equal(instanceFleetScope('192.168.1.88'), 'lan')
    assert.equal(instanceFleetScope('10.0.0.4'), 'lan')
    assert.equal(instanceFleetScope('example.com'), 'wan')
    assert.equal(instanceFleetScope('8.8.8.8'), 'wan')
  })

  it('sums intranet and public-network instance rows into one overview', () => {
    const sum = aggregateFleet([
      { total: 3, online: 2, offline: 1, scope: 'lan', connected: true, lastUpdated: 100 },
      { total: 2, online: 1, offline: 1, scope: 'wan', connected: false, lastUpdated: 200 },
    ])
    assert.equal(sum.total, 5)
    assert.equal(sum.online, 3)
    assert.equal(sum.offline, 2)
    assert.equal(sum.lanTotal, 3)
    assert.equal(sum.wanTotal, 2)
    assert.equal(sum.lastUpdated, 200)
    assert.equal(sum.anyConnected, true)
  })

  it('keeps a live computed total after report and clear', () => {
    reportInstanceFleet('a', { total: 3, online: 3, scope: 'lan', connected: true })
    reportInstanceFleet('b', { total: 1, online: 0, scope: 'wan' })
    assert.equal(fleetOverview.value.total, 4)
    assert.equal(fleetOverview.value.lanTotal, 3)
    assert.equal(fleetOverview.value.wanTotal, 1)
    clearInstanceFleet('a')
    assert.equal(fleetOverview.value.total, 1)
  })
})
