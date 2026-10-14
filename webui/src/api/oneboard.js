import { onewifiFetch } from './onewifi.js'

// 控制端版本跟网关走。真源是 GET /api/system/info 的 version 字段。
export async function getOneBoardVersion() {
  const info = await onewifiFetch('/api/system/info', { trackLoading: false })
  return {
    version: info?.version || '',
    status: 'running',
    build_time: info?.build_time || '',
  }
}
