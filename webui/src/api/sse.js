function parseJsonEvent(frame) {
  const data = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).replace(/^ /, ''))
    .join('\n')
    .trim()

  if (!data) return null
  try {
    return JSON.parse(data)
  } catch {
    return null
  }
}

// Read an SSE response incrementally. Calling response.text() here would wait
// for the server to close the connection and make a live progress UI appear
// frozen for the entire operation.
export async function readSseJson(response, onEvent, { collect = true } = {}) {
  if (!response?.body || typeof response.body.getReader !== 'function') {
    throw new Error('连接未返回事件流')
  }

  const streamReader = response.body.getReader()
  const decoder = new TextDecoder()
  const received = []
  let buffer = ''

  function dispatchFrames({ flush = false } = {}) {
    const frames = buffer.split(/\r?\n\r?\n/)
    buffer = frames.pop() || ''
    if (flush && buffer.trim()) {
      frames.push(buffer)
      buffer = ''
    }

    for (const frame of frames) {
      const event = parseJsonEvent(frame)
      if (!event) continue
      if (collect) received.push(event)
      onEvent?.(event)
    }
  }

  try {
    while (true) {
      const { done, value } = await streamReader.read()
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
      dispatchFrames({ flush: done })
      if (done) break
    }
  } finally {
    streamReader.releaseLock()
  }

  return received
}
