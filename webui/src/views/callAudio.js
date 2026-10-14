const SAMPLE_RATE = 8000
const FRAME_SAMPLES = 160

export function isSecureCallAudio(win = globalThis) {
  return Boolean(win?.isSecureContext)
}

export function bytesToInt16LE(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || [])
  const count = Math.floor(view.byteLength / 2)
  const samples = new Int16Array(count)
  const data = new DataView(view.buffer, view.byteOffset, view.byteLength)
  for (let i = 0; i < count; i += 1) samples[i] = data.getInt16(i * 2, true)
  return samples
}

export function int16ToBytesLE(samples) {
  const list = samples || []
  const out = new Uint8Array(list.length * 2)
  const data = new DataView(out.buffer)
  for (let i = 0; i < list.length; i += 1) data.setInt16(i * 2, list[i], true)
  return out
}

export function int16ToFloat32(samples) {
  const out = new Float32Array(samples.length)
  for (let i = 0; i < samples.length; i += 1) out[i] = samples[i] / 32768
  return out
}

export function float32ToInt16(samples) {
  const out = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]))
    out[i] = Math.max(-32768, Math.min(32767, Math.round(clamped * 32768)))
  }
  return out
}

export function resampleLinear(input, fromRate, toRate) {
  const source = input || []
  if (!source.length || fromRate === toRate) return Float32Array.from(source)
  const outLen = Math.max(1, Math.round(source.length * toRate / fromRate))
  const out = new Float32Array(outLen)
  if (source.length === 1) {
    out.fill(source[0])
    return out
  }
  const scale = (source.length - 1) / Math.max(1, outLen - 1)
  for (let i = 0; i < outLen; i += 1) {
    const pos = i * scale
    const i0 = Math.floor(pos)
    const i1 = Math.min(i0 + 1, source.length - 1)
    const t = pos - i0
    out[i] = source[i0] * (1 - t) + source[i1] * t
  }
  return out
}

export function createPlaybackQueue() {
  let queue = new Float32Array(0)
  return {
    push(chunk) {
      if (!chunk?.length) return
      const next = new Float32Array(queue.length + chunk.length)
      next.set(queue)
      next.set(chunk, queue.length)
      queue = next
    },
    pull(length) {
      const out = new Float32Array(length)
      const take = Math.min(length, queue.length)
      if (take) out.set(queue.subarray(0, take))
      queue = queue.subarray(take)
      return out
    },
  }
}

export function startLocalRingback(audioContext) {
  if (!audioContext) throw new Error('听筒需要音频上下文')
  const gain = audioContext.createGain()
  gain.gain.value = 0
  const tones = [400, 450].map((hz) => {
    const osc = audioContext.createOscillator()
    osc.frequency.value = hz
    osc.connect(gain)
    osc.start()
    return osc
  })
  gain.connect(audioContext.destination)
  const cadence = [400, 200, 400, 2000]
  let step = 0
  let timer = 0
  let stopped = false
  const tick = () => {
    if (stopped) return
    const on = step % 2 === 0
    gain.gain.setTargetAtTime(on ? 0.07 : 0, audioContext.currentTime || 0, 0.015)
    timer = globalThis.setTimeout(tick, cadence[step % cadence.length])
    step += 1
  }
  tick()
  return {
    stop() {
      if (stopped) return
      stopped = true
      globalThis.clearTimeout(timer)
      tones.forEach((osc) => {
        try { osc.stop() } catch { /* already stopped */ }
        try { osc.disconnect() } catch { /* already closed */ }
      })
      try { gain.disconnect() } catch { /* already closed */ }
    },
  }
}

export async function startCallHandset({
  socket,
  audioContext,
  getUserMedia,
  captureMic = false,
  sampleRate = SAMPLE_RATE,
} = {}) {
  if (!socket || !audioContext) {
    throw new Error('听筒需要音频上下文')
  }
  const playback = createPlaybackQueue()
  const capture = []
  let stopped = false
  let micStream = null
  let micEnabled = false
  let silence = null
  let micSource = null

  socket.binaryType = 'arraybuffer'
  socket.addEventListener('message', (event) => {
    const samples = int16ToFloat32(bytesToInt16LE(event.data))
    playback.push(resampleLinear(samples, sampleRate, audioContext.sampleRate || sampleRate))
  })

  const processor = audioContext.createScriptProcessor(2048, 1, 1)
  processor.onaudioprocess = (event) => {
    if (stopped) return
    const output = event.outputBuffer.getChannelData(0)
    output.set(playback.pull(output.length))
    if (!micEnabled) return
    const input = event.inputBuffer.getChannelData(0)
    const down = resampleLinear(input, audioContext.sampleRate || sampleRate, sampleRate)
    for (let i = 0; i < down.length; i += 1) capture.push(down[i])
    while (capture.length >= FRAME_SAMPLES) {
      const frame = float32ToInt16(capture.splice(0, FRAME_SAMPLES))
      if (socket.readyState === 1) socket.send(int16ToBytesLE(frame))
    }
  }

  silence = audioContext.createConstantSource()
  silence.offset.value = 0
  silence.connect(processor)
  silence.start()
  processor.connect(audioContext.destination)
  if (audioContext.state === 'suspended' && audioContext.resume) await audioContext.resume()

  async function enableMic() {
    if (stopped || micEnabled || typeof getUserMedia !== 'function') return micEnabled
    try {
      micStream = await getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } })
      micSource = audioContext.createMediaStreamSource(micStream)
      micSource.connect(processor)
      try { silence?.stop() } catch { /* already stopped */ }
      try { silence?.disconnect() } catch { /* already closed */ }
      silence = null
      micEnabled = true
    } catch {
      micEnabled = false
    }
    return micEnabled
  }

  if (captureMic) await enableMic()

  return {
    get micEnabled() { return micEnabled },
    enableMic,
    async stop() {
      if (stopped) return
      stopped = true
      try { processor.disconnect() } catch { /* already closed */ }
      try { silence?.stop() } catch { /* already stopped */ }
      try { silence?.disconnect() } catch { /* already closed */ }
      try { micSource?.disconnect() } catch { /* already closed */ }
      micStream?.getTracks?.().forEach((track) => track.stop())
      if (socket.readyState === 1 || socket.readyState === 0) socket.close()
    },
  }
}
