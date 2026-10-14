export function parseOnewifiDetail(data) {
  const envelope = data?.error
  if (envelope && typeof envelope === 'object') {
    return envelope.message || envelope.code || ''
  }
  const detail = data?.detail
  if (detail && typeof detail === 'object') {
    return detail.message || ''
  }
  if (typeof envelope === 'string' && envelope) return envelope
  if (typeof detail === 'string' && detail) return detail
  return data?.message || ''
}

export function onewifiErrorMessage(data, status) {
  const parsed = String(parseOnewifiDetail(data) || '').trim()
  if (status === 504) {
    return parsed || '网关等待模组超时。多半是 USB 没挂到这台机，或 AT/QMI 口不在容器里。'
  }
  if (status === 503) {
    if (/no usable AT port|at_port_unavailable/i.test(parsed)) {
      return '这台模组现在没有可用的 AT 口，读不了芯片。'
    }
    if (/VPCD|bridge|slot|Phone failure|timed out waiting|did not become active/i.test(parsed)) {
      return '切卡后重建读卡桥没齐。等十几秒再点「读芯片」，不要连点。'
    }
    return parsed || '服务暂时不可用'
  }
  if (parsed) return parsed
  if (status === 409) return '线路还没开通，或 SIM 还差必填项。'
  return ''
}
