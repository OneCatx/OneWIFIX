import { onewifiFetch } from './onewifi'

export function parseAutomaticTaskPayload(raw) {
  if (!raw) return {}
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export async function fetchAutomaticTasks() {
  const payload = await onewifiFetch('/api/automatic-tasks', { trackLoading: false })
  const tasks = Array.isArray(payload?.tasks) ? payload.tasks : (Array.isArray(payload) ? payload : [])
  return tasks.map((task) => ({
    ...task,
    payload: parseAutomaticTaskPayload(task.payload),
  }))
}

export async function fetchAutomaticTaskRuns({ limit = 20, offset = 0 } = {}) {
  const payload = await onewifiFetch(
    `/api/automatic-tasks/runs?limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`,
    { trackLoading: false },
  )
  return {
    runs: Array.isArray(payload?.runs) ? payload.runs : [],
    total: Number(payload?.total) || 0,
  }
}

export async function fetchAutomaticTaskDevices() {
  const payload = await onewifiFetch('/api/devices', { trackLoading: false })
  return Array.isArray(payload?.devices) ? payload.devices : (Array.isArray(payload) ? payload : [])
}

export function saveAutomaticTask(body) {
  const id = Number(body?.id) || 0
  const payload = { ...body }
  delete payload.id
  if (id) return onewifiFetch(`/api/automatic-tasks/${id}`, { method: 'PUT', body: payload })
  return onewifiFetch('/api/automatic-tasks', { method: 'POST', body: payload })
}

export function deleteAutomaticTask(id) {
  return onewifiFetch(`/api/automatic-tasks/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function runAutomaticTask(id) {
  return onewifiFetch(`/api/automatic-tasks/${encodeURIComponent(id)}/run`, { method: 'POST', body: {} })
}
