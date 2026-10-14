import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  KEYPAD_KEYS,
  appendDialKey,
  backspaceDial,
  callDirectionLabel,
  callStateLabel,
  formatCallTime,
  historyCallsFrom,
  isLiveCall,
  isRingingIncoming,
  liveCallsFrom,
  hangupTargetsOnLeave,
  handsetCallFrom,
  parseCallsPayload,
  parseCallEventsPayload,
  findIncomingCallDevice,
  pickPreferredCallDevice,
  persistedCallsFromHistory,
  validDialNumber,
} from './callsModel.js'
import * as callsModel from './callsModel.js'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

describe('callsModel', () => {
  it('reads persisted calls from an unwrapped history payload', () => {
    const rows = persistedCallsFromHistory({
      calls: [{ id: 7, number_tail: '0086', direction: 'incoming' }],
    })
    assert.equal(rows.length, 1)
    assert.equal(rows[0].id, 7)
    assert.deepEqual(persistedCallsFromHistory({ data: { calls: [{ id: 1 }] } }), [])
    assert.deepEqual(persistedCallsFromHistory(null), [])
  })

  it('labels call state and direction', () => {
    assert.equal(callStateLabel('ringing'), '振铃')
    assert.equal(callDirectionLabel('incoming'), '来电')
    assert.equal(isLiveCall({ state: 'ringing' }), true)
    assert.equal(isLiveCall({ state: 'ended' }), false)
    assert.equal(isRingingIncoming({ direction: 'incoming', state: 'ringing' }), true)
    assert.equal(isRingingIncoming({ direction: 'outgoing', state: 'ringing' }), false)
  })

  it('accepts keypad dial strings', () => {
    assert.equal(validDialNumber('+447700900123'), true)
    assert.equal(validDialNumber('*100#'), true)
    assert.equal(validDialNumber('12 34'), false)
  })

  it('has a 12-key phone pad including star and hash', () => {
    assert.deepEqual(KEYPAD_KEYS.map((key) => key.digit), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'])
    assert.equal(KEYPAD_KEYS.find((key) => key.digit === '0').letters, '+')
  })

  it('appends keypad digits and long-press plus without breaking USSD', () => {
    assert.equal(appendDialKey('', '0'), '0')
    assert.equal(appendDialKey('', '+'), '+')
    assert.equal(appendDialKey('+44', '+'), '+44')
    assert.equal(appendDialKey('*10', '0'), '*100')
    assert.equal(appendDialKey('*100', '#'), '*100#')
    assert.equal(appendDialKey('12', 'a'), '12')
    assert.equal(backspaceDial('*100#'), '*100')
  })

  it('splits live sessions from recently ended history', () => {
    const payload = parseCallsPayload({
      calls: [
        { id: '1', state: 'ringing', direction: 'incoming' },
        { id: '2', state: 'ended' },
        { id: '3', state: 'failed' },
        { id: '4', state: 'active' },
      ],
    })
    assert.deepEqual(liveCallsFrom(payload).map((call) => call.id), ['1', '4'])
    assert.deepEqual(hangupTargetsOnLeave([], payload, 'device-a'), [])
    assert.deepEqual(historyCallsFrom(payload).map((call) => call.id), ['3', '2'])
    assert.equal(formatCallTime('0001-01-01T00:00:00Z'), '—')
  })

  it('only targets the owned call generation on the original device', () => {
    const owned = [{ deviceId: 'device-a', id: 'cellular-a', started_at: '2026-10-10T10:00:00Z' }]
    const current = [{ id: 'cellular-a', started_at: '2026-10-10T10:00:00Z', state: 'active' }]
    assert.deepEqual(hangupTargetsOnLeave(owned, current, 'device-a'), owned)
    assert.deepEqual(hangupTargetsOnLeave(owned, current, 'device-b'), [])
    assert.deepEqual(hangupTargetsOnLeave(owned, [{ ...current[0], started_at: '2026-10-10T10:01:00Z' }], 'device-a'), [])
    assert.deepEqual(hangupTargetsOnLeave(owned, [{ ...current[0], state: 'ended' }], 'device-a'), [])
    assert.deepEqual(hangupTargetsOnLeave([{ deviceId: 'device-a', id: 'cellular-a' }], current, 'device-a'), [])
  })

  it('checks late successful calls on the captured device before cleanup', async () => {
    assert.equal(typeof callsModel.createCallPageOwnership, 'function')
    const reads = []
    const hangups = []
    const ownership = callsModel.createCallPageOwnership({
      fetchCalls: async (deviceId) => {
        reads.push(deviceId)
        return { calls: [{ id: 'cellular-a', started_at: '2026-10-10T10:01:00Z', state: 'active' }] }
      },
      hangupCall: async (deviceId, id) => hangups.push([deviceId, id]),
    })
    await ownership.leave()
    await ownership.record('device-a', { id: 'cellular-a', started_at: '2026-10-10T10:00:00Z', state: 'active' })
    assert.deepEqual(reads, ['device-a'])
    assert.deepEqual(hangups, [])
  })

  it('cleans matching owned calls once after leaving and ignores observed calls', async () => {
    assert.equal(typeof callsModel.createCallPageOwnership, 'function')
    const hangups = []
    const ownership = callsModel.createCallPageOwnership({
      fetchCalls: async () => ({ calls: [
        { id: 'owned', started_at: '2026-10-10T10:00:00Z', state: 'active' },
        { id: 'external', started_at: '2026-10-10T10:00:00Z', state: 'active' },
      ] }),
      hangupCall: async (deviceId, id) => hangups.push([deviceId, id]),
    })
    await ownership.record('device-a', { id: 'owned', started_at: '2026-10-10T10:00:00Z', state: 'dialing' })
    await ownership.leave()
    await ownership.leave()
    assert.deepEqual(hangups, [['device-a', 'owned']])
  })

  it('cleans a late success only on its original device when the generation still matches', async () => {
    const reads = []
    const hangups = []
    const ownership = callsModel.createCallPageOwnership({
      fetchCalls: async (deviceId) => {
        reads.push(deviceId)
        return { calls: [{ id: 'cellular-a', started_at: '2026-10-10T10:00:00Z', state: 'active' }] }
      },
      hangupCall: async (deviceId, id) => hangups.push([deviceId, id]),
    })
    await ownership.leave()
    await ownership.record('device-a', { id: 'cellular-a', started_at: '2026-10-10T10:00:00Z', state: 'dialing' })
    assert.deepEqual(reads, ['device-a'])
    assert.deepEqual(hangups, [['device-a', 'cellular-a']])
  })

  it('does not hang up when the original device cannot be checked', async () => {
    const hangups = []
    const ownership = callsModel.createCallPageOwnership({
      fetchCalls: async () => { throw new Error('offline') },
      hangupCall: async (deviceId, id) => hangups.push([deviceId, id]),
    })
    await ownership.record('device-a', { id: 'owned', started_at: '2026-10-10T10:00:00Z', state: 'active' })
    await ownership.leave()
    assert.deepEqual(hangups, [])
  })

  it('waits for an explicit hangup before leave and does not send a second hangup on success', async () => {
    const request = deferred()
    const reads = []
    const hangups = []
    const call = { id: 'cellular-a', started_at: '2026-10-10T10:00:00Z', state: 'active' }
    const ownership = callsModel.createCallPageOwnership({
      fetchCalls: async (deviceId) => { reads.push(deviceId); return { calls: [call] } },
      hangupCall: (deviceId, id) => { hangups.push([deviceId, id]); return request.promise },
    })
    await ownership.record('device-a', call)
    const explicit = ownership.hangup('device-a', call)
    const leaving = ownership.leave()
    assert.deepEqual(hangups, [['device-a', 'cellular-a']])
    request.resolve()
    await Promise.all([explicit, leaving])
    assert.deepEqual(reads, [])
    assert.deepEqual(hangups, [['device-a', 'cellular-a']])
  })

  it('keeps ownership after a failed explicit hangup while mounted so the user can retry', async () => {
    const calls = []
    const call = { id: 'cellular-a', started_at: '2026-10-10T10:00:00Z', state: 'active' }
    const ownership = callsModel.createCallPageOwnership({
      fetchCalls: async () => ({ calls: [call] }),
      hangupCall: async (deviceId, id) => {
        calls.push([deviceId, id])
        if (calls.length === 1) throw new Error('temporary failure')
      },
    })
    await ownership.record('device-a', call)
    await assert.rejects(ownership.hangup('device-a', call), /temporary failure/)
    await ownership.hangup('device-a', call)
    await ownership.leave()
    assert.deepEqual(calls, [['device-a', 'cellular-a'], ['device-a', 'cellular-a']])
  })

  it('checks identity after a pending explicit hangup fails following leave, and preserves a new generation', async () => {
    const request = deferred()
    const reads = []
    const hangups = []
    const call = { id: 'cellular-a', started_at: '2026-10-10T10:00:00Z', state: 'active' }
    const ownership = callsModel.createCallPageOwnership({
      fetchCalls: async (deviceId) => {
        reads.push(deviceId)
        return { calls: [{ ...call, started_at: '2026-10-10T10:01:00Z' }] }
      },
      hangupCall: (deviceId, id) => { hangups.push([deviceId, id]); return request.promise },
    })
    await ownership.record('device-a', call)
    const explicit = ownership.hangup('device-a', call)
    const rejection = assert.rejects(explicit, /temporary failure/)
    const leaving = ownership.leave()
    request.reject(new Error('temporary failure'))
    await Promise.all([rejection, leaving])
    assert.deepEqual(reads, ['device-a'])
    assert.deepEqual(hangups, [['device-a', 'cellular-a']])
  })

  it('rechecks and cleans the owned generation after a pending explicit hangup fails following leave', async () => {
    const request = deferred()
    const hangups = []
    const call = { id: 'cellular-a', started_at: '2026-10-10T10:00:00Z', state: 'active' }
    const ownership = callsModel.createCallPageOwnership({
      fetchCalls: async () => ({ calls: [call] }),
      hangupCall: (deviceId, id) => {
        hangups.push([deviceId, id])
        return hangups.length === 1 ? request.promise : Promise.resolve()
      },
    })
    await ownership.record('device-a', call)
    const explicit = ownership.hangup('device-a', call)
    const rejection = assert.rejects(explicit, /temporary failure/)
    const leaving = ownership.leave()
    request.reject(new Error('temporary failure'))
    await Promise.all([rejection, leaving])
    assert.deepEqual(hangups, [['device-a', 'cellular-a'], ['device-a', 'cellular-a']])
  })

  it('does not hang up twice when a dial or answer succeeds after an unowned manual hangup and leave', async () => {
    const request = deferred()
    const hangups = []
    const call = { id: 'cellular-a', started_at: '2026-10-10T10:00:00Z', state: 'active' }
    const ownership = callsModel.createCallPageOwnership({
      fetchCalls: async () => ({ calls: [call] }),
      hangupCall: (deviceId, id) => {
        hangups.push([deviceId, id])
        return hangups.length === 1 ? request.promise : Promise.resolve()
      },
    })
    const explicit = ownership.hangup('device-a', call)
    await ownership.leave()
    const lateRecord = ownership.record('device-a', call)
    request.resolve()
    await Promise.all([explicit, lateRecord])
    assert.deepEqual(hangups, [['device-a', 'cellular-a']])
  })

  it('does not reacquire ownership when a completed unowned manual hangup is followed by a late record', async () => {
    const hangups = []
    const call = { id: 'cellular-a', started_at: '2026-10-10T10:00:00Z', state: 'active' }
    const ownership = callsModel.createCallPageOwnership({
      fetchCalls: async () => ({ calls: [call] }),
      hangupCall: async (deviceId, id) => { hangups.push([deviceId, id]) },
    })
    await ownership.hangup('device-a', call)
    await ownership.leave()
    await ownership.record('device-a', call)
    assert.deepEqual(hangups, [['device-a', 'cellular-a']])
  })

  it('shares an unowned pending manual hangup with a second explicit click', async () => {
    const request = deferred()
    const reads = []
    const hangups = []
    const call = { id: 'external', started_at: '2026-10-10T10:00:00Z', state: 'active' }
    const ownership = callsModel.createCallPageOwnership({
      fetchCalls: async (deviceId) => { reads.push(deviceId); return { calls: [call] } },
      hangupCall: (deviceId, id) => { hangups.push([deviceId, id]); return request.promise },
    })
    const first = ownership.hangup('device-a', call)
    const second = ownership.hangup('device-a', call)
    assert.deepEqual(hangups, [['device-a', 'external']])
    request.resolve()
    await Promise.all([first, second, ownership.leave()])
    assert.deepEqual(reads, [])
    assert.deepEqual(hangups, [['device-a', 'external']])
  })

  it('rechecks a late owned generation after an unowned manual hangup fails following leave', async () => {
    const request = deferred()
    const reads = []
    const hangups = []
    const call = { id: 'cellular-a', started_at: '2026-10-10T10:00:00Z', state: 'active' }
    const ownership = callsModel.createCallPageOwnership({
      fetchCalls: async (deviceId) => {
        reads.push(deviceId)
        return { calls: [{ ...call, started_at: '2026-10-10T10:01:00Z' }] }
      },
      hangupCall: (deviceId, id) => { hangups.push([deviceId, id]); return request.promise },
    })
    const explicit = ownership.hangup('device-a', call)
    const rejection = assert.rejects(explicit, /temporary failure/)
    await ownership.leave()
    const lateRecord = ownership.record('device-a', call)
    request.reject(new Error('temporary failure'))
    await Promise.all([rejection, lateRecord])
    assert.deepEqual(reads, ['device-a'])
    assert.deepEqual(hangups, [['device-a', 'cellular-a']])
  })

  it('cleans a late owned generation once when an unowned manual hangup fails after leave', async () => {
    const request = deferred()
    const hangups = []
    const call = { id: 'cellular-a', started_at: '2026-10-10T10:00:00Z', state: 'active' }
    const ownership = callsModel.createCallPageOwnership({
      fetchCalls: async () => ({ calls: [call] }),
      hangupCall: (deviceId, id) => {
        hangups.push([deviceId, id])
        return hangups.length === 1 ? request.promise : Promise.resolve()
      },
    })
    const explicit = ownership.hangup('device-a', call)
    const rejection = assert.rejects(explicit, /temporary failure/)
    await ownership.leave()
    const lateRecord = ownership.record('device-a', call)
    request.reject(new Error('temporary failure'))
    await Promise.all([rejection, lateRecord])
    assert.deepEqual(hangups, [['device-a', 'cellular-a'], ['device-a', 'cellular-a']])
  })

  it('does not let a successful manual hangup suppress another generation or device', async () => {
    const hangups = []
    const old = { id: 'cellular-a', started_at: '2026-10-10T10:00:00Z', state: 'active' }
    const newer = { ...old, started_at: '2026-10-10T10:01:00Z' }
    const ownership = callsModel.createCallPageOwnership({
      fetchCalls: async (deviceId) => ({ calls: [deviceId === 'device-a' ? newer : old] }),
      hangupCall: async (deviceId, id) => { hangups.push([deviceId, id]) },
    })
    await ownership.hangup('device-a', old)
    await ownership.leave()
    await ownership.record('device-a', newer)
    await ownership.record('device-b', old)
    assert.deepEqual(hangups, [
      ['device-a', 'cellular-a'],
      ['device-a', 'cellular-a'],
      ['device-b', 'cellular-a'],
    ])
  })

  it('shares cleanup with a manual hangup started while the identity check is in flight', async () => {
    const read = deferred()
    const hangup = deferred()
    const hangups = []
    const call = { id: 'cellular-a', started_at: '2026-10-10T10:00:00Z', state: 'active' }
    const ownership = callsModel.createCallPageOwnership({
      fetchCalls: () => read.promise,
      hangupCall: (deviceId, id) => { hangups.push([deviceId, id]); return hangup.promise },
    })
    await ownership.record('device-a', call)
    const leaving = ownership.leave()
    const explicit = ownership.hangup('device-a', call)
    read.resolve({ calls: [call] })
    hangup.resolve()
    await Promise.all([leaving, explicit])
    assert.deepEqual(hangups, [['device-a', 'cellular-a']])
  })

  it('shares one cleanup when leave and late record target the same generation', async () => {
    const read = deferred()
    const hangups = []
    const call = { id: 'cellular-a', started_at: '2026-10-10T10:00:00Z', state: 'active' }
    const ownership = callsModel.createCallPageOwnership({
      fetchCalls: () => read.promise,
      hangupCall: async (deviceId, id) => { hangups.push([deviceId, id]) },
    })
    await ownership.record('device-a', call)
    const leaving = ownership.leave()
    const lateRecord = ownership.record('device-a', call)
    read.resolve({ calls: [call] })
    await Promise.all([leaving, lateRecord])
    assert.deepEqual(hangups, [['device-a', 'cellular-a']])
  })

  
  it('prefers IMS-ready modem over the first board row', () => {
    const list = [
      { id: 'dotking-1', radio_registered: false },
      { id: 'dotking-2', vowifi_runtime: { ims_ready: true } },
      { id: 'dotking-cn', radio_registered: true },
    ]
    assert.equal(pickPreferredCallDevice(list), 'dotking-2')
    assert.equal(pickPreferredCallDevice(list, 'dotking-cn'), 'dotking-cn')
    assert.equal(pickPreferredCallDevice([{ id: 'only-radio', radio_registered: true }]), 'only-radio')
    assert.equal(pickPreferredCallDevice([{ id: 'first' }, { id: 'second' }]), 'first')
  })
  it('parses all-device snapshots and selects an unattended incoming call', () => {
    const devices = parseCallEventsPayload({
      devices: [
        { device_id: 'idle', ready: true, calls: [] },
        { device_id: 'ringing', ready: true, calls: [{ id: 'call-1', direction: 'incoming', state: 'ringing' }] },
      ],
    })
    assert.deepEqual(devices.map((device) => device.deviceId), ['idle', 'ringing'])
    assert.equal(findIncomingCallDevice(devices, 'idle'), 'ringing')
    assert.equal(findIncomingCallDevice(devices, 'idle', true), 'idle')
    assert.equal(findIncomingCallDevice(devices, 'ringing'), 'ringing')
  })

  it('picks a ringing early-media call for the speaker', () => {
    assert.equal(handsetCallFrom([
      { id: 'ring', state: 'early_media', media_ready: true },
      { id: 'dead', state: 'ended', media_ready: true },
    ])?.id, 'ring')
    assert.equal(handsetCallFrom([{ id: 'ring', state: 'ringing', media_ready: false }]), null)
  })
})
