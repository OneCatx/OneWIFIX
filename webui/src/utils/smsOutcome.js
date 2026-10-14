const LABELS = {
  delivered: '已送达',
  accepted_unconfirmed: '已提交，等待回执',
  partial: '部分送达',
  failed: '发送失败',
}

export function smsOutcomeLabel(outcome) {
  return LABELS[String(outcome || '').toLowerCase()] || ''
}
