/**
 * 保号页（Keepalive.vue）的无状态纯函数：日期/时间格式化、空草稿、枚举文案。
 * 不依赖任何 ref / computed / 设备列表；带状态的逻辑仍留在 SFC。
 */

export function localDate(value = new Date()) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function localTime(value = new Date(Date.now() + 5 * 60_000)) {
  return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`
}

export function emptyDraft(deviceId = '') {
  return {
    id: 0,
    name: '',
    enabled: true,
    device_id: deviceId,
    profile_iccid: '',
    profile_aid: '',
    task_type: 'sms',
    environment: 'vowifi',
    interval_days: 1,
    start_date: localDate(),
    run_time: localTime(),
    retry_count: 1,
    notify: true,
    phone: '',
    message: '',
    duration_seconds: 10,
  }
}

export function formatDateTime(value) {
  if (!value || String(value).startsWith('0001-')) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

export function taskTypeLabel(value) {
  return ({
    sms: '发送短信',
    call: '拨打电话',
    public_ip: '获取漫游公网 IP',
  })[value] || value || '—'
}

export function environmentLabel(value) {
  return value === 'cellular' ? '基站直连' : 'VoWiFi'
}

export function runStatusLabel(value) {
  return ({ queued: '排队中', running: '执行中', success: '成功', failed: '失败' })[value] || value || '—'
}
