import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  appendRuntimeLog,
  coalesceRuntimeLogs,
  formatLogReminder,
  filterRuntimeLogs,
  formatLogLine,
  formatLogTime,
  isAccessNoiseLog,
  isProblemLog,
  parseLogStreamFrame,
  logTone,
  logToneLabel,
  logToneIcon,
  proxyProbeRows,
  proxyProbeSummary,
} from './runtimeLogs.js'

describe('runtimeLogs', () => {
  it('formats ISO timestamps as local wall clock', () => {
    const text = formatLogTime('2026-08-29T12:00:00.000Z')
    assert.match(text, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('hides access-noise http request lines and keeps problem logs', () => {
    const logs = [
      { level: 'info', message: 'http request', fields: { path: '/api/devices' } },
      { level: 'info', message: 'ready', caller: 'hub.go' },
      { level: 'warn', message: 'VoWiFi operation failed' },
      { level: 'info', message: 'VoWiFi automatic retry scheduled' },
    ]
    assert.equal(isAccessNoiseLog(logs[0]), true)
    assert.equal(isProblemLog(logs[0]), false)
    assert.equal(isProblemLog(logs[2]), true)
    assert.equal(isProblemLog(logs[3]), true)
    const problems = filterRuntimeLogs(logs, { problemsOnly: true })
    assert.deepEqual(problems.map((item) => item.message), [
      'VoWiFi operation failed',
      'VoWiFi automatic retry scheduled',
    ])
    assert.equal(filterRuntimeLogs(logs).some((item) => item.message === 'http request'), false)
  })

  it('filters by level and search across message/caller/fields', () => {
    const logs = [
      { level: 'info', message: 'ready', caller: 'hub.go', fields: { device: 'ec25' } },
      { level: 'error', message: 'probe failed', caller: 'proxy.go', fields: null },
    ]
    assert.equal(filterRuntimeLogs(logs, { level: 'error' }).length, 1)
    assert.equal(filterRuntimeLogs(logs, { search: 'ec25' })[0].message, 'ready')
    assert.equal(filterRuntimeLogs(logs, { search: 'ec25', messageOnly: true }).length, 0)
    assert.equal(filterRuntimeLogs(logs, { search: 'probe', messageOnly: true })[0].message, 'probe failed')
  })

  it('collapses the same warning into one reminder instead of flooding the list', () => {
    const first = { level: 'warn', message: 'VoWiFi operation failed', fields: { device_id: 'quectel-a' }, time: '2026-08-31T03:47:00Z' }
    const again = { level: 'warn', message: 'VoWiFi operation failed', fields: { device_id: 'quectel-a' }, time: '2026-08-31T03:47:02Z' }
    const other = { level: 'warn', message: 'VoWiFi operation failed', fields: { device_id: 'quectel-b' }, time: '2026-08-31T03:47:03Z' }
    const merged = coalesceRuntimeLogs([first, again, other])
    assert.equal(merged.length, 2)
    assert.equal(merged[0].count, 2)
    assert.equal(merged[0].fields.device_id, 'quectel-a')
    assert.equal(formatLogReminder(merged[0]), 'VoWiFi operation failed · 已提醒 2 次')
    assert.equal(formatLogReminder(other), 'VoWiFi operation failed')
    const live = appendRuntimeLog(merged, again)
    assert.equal(live.at(-1).count, 3)
  })

  it('caps the live buffer and ignores empty SSE frames', () => {
    const capped = appendRuntimeLog(Array.from({ length: 1000 }, (_, i) => ({ message: String(i) })), { message: 'tail' })
    assert.equal(capped.length, 1000)
    assert.equal(capped.at(-1).message, 'tail')
    assert.equal(parseLogStreamFrame('{}'), null)
    assert.equal(parseLogStreamFrame('{"level":"info","message":"hi"}').message, 'hi')
  })

  it('formats an export line and probe copy', () => {
    const line = formatLogLine({
      time: '2026-01-01T00:00:00.000Z',
      level: 'warn',
      caller: 'sms.go',
      message: 'retry',
      fields: { n: 2 },
    })
    assert.match(line, /WARN/)
    assert.match(line, /retry/)
    assert.equal(logTone('warn'), 'warning')
    assert.equal(logToneLabel('success'), 'SUCCESS')
    assert.equal(logToneIcon('warning'), 'warning')
    assert.equal(proxyProbeSummary({ message: 'UDP 通过' }), 'UDP 通过')
    assert.equal(proxyProbeSummary({ probe: { udp_exchange_ok: true } }), 'SOCKS5 认证与真实 UDP 往返探测通过')
    assert.deepEqual(
      proxyProbeRows({ probe: { reachable: true, handshake_ok: true, udp_associate_ok: false, udp_exchange_ok: false } }).map((row) => row.ok),
      [true, true, false, false],
    )
  })
})
