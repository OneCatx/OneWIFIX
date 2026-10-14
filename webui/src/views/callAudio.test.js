import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  bytesToInt16LE,
  createPlaybackQueue,
  float32ToInt16,
  int16ToBytesLE,
  int16ToFloat32,
  isSecureCallAudio,
  resampleLinear,
  startCallHandset,
  startLocalRingback,
} from './callAudio.js'
import { deviceCallMediaSocketURL } from '../api/onewifiGateway.calls.js'
import { imeiLooksBound } from './callsModel.js'

describe('call audio bridge', () => {
  it('round-trips PCM s16le', () => {
    const samples = Int16Array.from([-32768, -1, 0, 1, 32767])
    const back = bytesToInt16LE(int16ToBytesLE(samples))
    assert.deepEqual(Array.from(back), Array.from(samples))
  })

  it('resamples 8 kHz to 48 kHz without dropping the last sample', () => {
    const out = resampleLinear(Float32Array.from([0, 1]), 8000, 48000)
    assert.equal(out.length, 12)
    assert.equal(out[0], 0)
    assert.equal(out[out.length - 1], 1)
  })

  it('converts float and int16 within clipping bounds', () => {
    const floats = int16ToFloat32(Int16Array.from([32767, -32768]))
    const back = float32ToInt16(floats)
    assert.equal(back[0], 32767)
    assert.equal(back[1], -32768)
  })

  it('plays queued samples then silence', () => {
    const queue = createPlaybackQueue()
    queue.push(Float32Array.from([0.5, -0.5]))
    assert.deepEqual(Array.from(queue.pull(3)), [0.5, -0.5, 0])
  })

  it('treats localhost secure context as required for the handset', () => {
    assert.equal(isSecureCallAudio({ isSecureContext: true }), true)
    assert.equal(isSecureCallAudio({ isSecureContext: false }), false)
  })

  it('builds a same-origin media websocket URL', () => {
    const url = deviceCallMediaSocketURL('ec20', 'call-1', { protocol: 'https:', host: 'board.local' }, '')
    assert.equal(url, 'wss://board.local/api/devices/ec20/calls/media?id=call-1')
  })

  it('attaches a bearer access token for split-origin handsets', () => {
    const url = deviceCallMediaSocketURL('ec20', 'call-1', { protocol: 'https:', host: 'board.local' }, 'sess-1')
    assert.equal(url, 'wss://board.local/api/devices/ec20/calls/media?id=call-1&access_token=sess-1')
  })

  it('opens the speaker without waiting for the microphone', async () => {
    let processorConnected = false
    const processor = {
      connect() { processorConnected = true },
      disconnect() {},
    }
    const ctx = {
      state: 'running',
      sampleRate: 8000,
      destination: {},
      createScriptProcessor() { return processor },
      createConstantSource() {
        return { offset: { value: 0 }, connect() {}, start() {}, stop() {}, disconnect() {} }
      },
    }
    const socket = { binaryType: '', readyState: 1, addEventListener() {}, close() {}, send() {} }
    let micAsked = false
    const handset = await startCallHandset({
      socket,
      audioContext: ctx,
      captureMic: false,
      getUserMedia: async () => {
        micAsked = true
        throw new Error('mic should wait until the call is active')
      },
    })
    assert.equal(processorConnected, true)
    assert.equal(micAsked, false)
    assert.equal(handset.micEnabled, false)
    await handset.stop()
  })

  it('plays a local ringback cadence on the unlocked audio context', () => {
    const gain = { gain: { value: 0, setTargetAtTime() {} }, connect() {}, disconnect() {} }
    const ctx = {
      currentTime: 0,
      destination: {},
      createGain() { return gain },
      createOscillator() {
        return { frequency: { value: 0 }, connect() {}, start() {}, stop() {}, disconnect() {} }
      },
    }
    const ring = startLocalRingback(ctx)
    ring.stop()
  })

  it('accepts 15 or 16 digit IMEI as bound', () => {
    assert.equal(imeiLooksBound({ imei: '490154203237518' }), true)
    assert.equal(imeiLooksBound({ modem: { imei: '4901542032375180' } }), true)
    assert.equal(imeiLooksBound({ imei: '' }), false)
    assert.equal(imeiLooksBound({ imei: '123' }), false)
  })
})
