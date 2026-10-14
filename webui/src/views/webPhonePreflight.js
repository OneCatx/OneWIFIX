export const MEDIA_FAIL_CAUSE = 'User Denied Media Access'

/**
 * Detect whether this browser has a microphone without prompting for permission.
 * Absorbed from MDD softphone preflight and used by OneWIFI handset attach.
 * @returns {'insecure'|'unknown'|'present'|'none'}
 */
export async function audioInputPresence() {
  const media = navigator.mediaDevices
  if (!media || !media.getUserMedia) return 'insecure'
  if (!media.enumerateDevices) return 'unknown'
  try {
    const devices = await media.enumerateDevices()
    if (!devices.length) return 'unknown'
    return devices.some((d) => d.kind === 'audioinput') ? 'present' : 'none'
  } catch {
    return 'unknown'
  }
}

export function mediaFailMessage(cause) {
  if (cause === MEDIA_FAIL_CAUSE || /denied/i.test(String(cause || ''))) {
    return '麦克风被拒绝或不存在（浏览器需 HTTPS 且允许麦克风）'
  }
  return String(cause || '听筒启动失败')
}
