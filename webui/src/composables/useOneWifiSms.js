import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchOnewifiSmsMessages, fetchOnewifiSmsThreads, sendOnewifiSms, deleteOnewifiSmsThread, deleteOnewifiSmsMessage, downloadOnewifiSmsExport } from '../api/onewifiGateway'
import { useOnewifiHub } from '../stores/onewifiHub'
import { isAuthenticated } from '../stores/auth'
import {
  displaySmsBody,
  formatSmsTime,
  groupSmsByDate,
  normalizeSmsMessage,
  smsTimeMs,
  sortSmsMessagesAsc,
  lineActionBlockReason,
  lineActionId,
} from '../utils/onewifiModel'
import { smsCapableDevices } from '../utils/onewifiDevice'
import { smsOutcomeLabel } from '../utils/smsOutcome'

function mapThread(thread, device) {
  const timeMs = smsTimeMs(thread.last_ts || thread.last_timestamp)
  const date = timeMs ? new Date(timeMs) : null
  const lineId = lineActionId(device)
  const physicalId = String(device.id)
  const peer = String(thread.peer || '').trim()
  const iccid = String(thread.iccid || '').trim()
  return {
    key: `${lineId || physicalId}|${iccid}|${peer}`,
    peer,
    iccid,
    imsi: String(thread.imsi || '').trim(),
    instanceId: lineId,
    deviceId: physicalId,
    deviceName: device.name || lineId || physicalId,
    localPhone: String(thread.local_phone || device.sim?.number || '').trim(),
    lastMessage: displaySmsBody(thread.last_body || thread.last_content || thread.last_message || '').slice(0, 120),
    lastTs: timeMs,
    lastTimeLabel: formatSmsTime(date),
    count: Number(thread.n) || 0,
  }
}

function mapMessage(raw, device) {
  const normalized = normalizeSmsMessage(raw)
  return {
    ...normalized,
    deviceId: String(device.id || normalized.deviceId),
    deviceName: device.name || normalized.deviceName,
    sender: normalized.direction === 'out' ? '我' : (normalized.peer || normalized.sender),
  }
}

export function useOneWifiSms() {
  const route = useRoute()
  const router = useRouter()
  const { hub, refreshOnewifiDevices } = useOnewifiHub()

  const contacts = ref([])
  const messages = ref([])
  const selectedDeviceId = ref(typeof route.query.device === 'string' ? route.query.device : 'all')
  const selectedContactKey = ref(typeof route.query.contact === 'string' ? route.query.contact : '')
  const search = ref('')
  const draft = ref('')
  const newTo = ref('')
  const loading = ref(false)
  const threadLoading = ref(false)
  const historyLoading = ref(false)
  const sending = ref(false)
  const deleting = ref(false)
  const hasMoreHistory = ref(false)
  const error = ref('')
  const threadRef = ref(null)
  let contactsRequestId = 0
  let threadRequestId = 0

  const configured = computed(() => isAuthenticated())
  const devices = computed(() => smsCapableDevices(hub.devices).map((device) => ({
    ...device,
    online: device.present !== false,
    code: device.sim?.country || '',
  })))
  const engineReady = computed(() => devices.value.length > 0)

  const selectedContact = computed(
    () => contacts.value.find((item) => item.key === selectedContactKey.value) || null,
  )

  const filteredContacts = computed(() => {
    const q = search.value.trim().toLowerCase()
    if (!q) return contacts.value
    return contacts.value.filter((item) =>
      [item.peer, item.lastMessage, item.deviceName, item.localPhone, item.iccid]
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  })

  const messageGroups = computed(() => groupSmsByDate(messages.value))

  function syncRoute() {
    const query = {}
    if (selectedDeviceId.value && selectedDeviceId.value !== 'all') {
      query.device = selectedDeviceId.value
    }
    if (selectedContactKey.value) query.contact = selectedContactKey.value
    router.replace({ query })
  }

  function targetDevices() {
    if (selectedDeviceId.value === 'all') return devices.value
    return devices.value.filter((device) => device.id === selectedDeviceId.value)
  }

  function contactsDeviceSig() {
    return targetDevices().map((device) => String(device.id)).join('\0')
  }

  let loadedContactsSig = ''

  async function loadContacts({ silent = false } = {}) {
    const requestId = ++contactsRequestId
    const requestDeviceId = selectedDeviceId.value
    const requestedDevices = targetDevices()
    loadedContactsSig = requestedDevices.map((device) => String(device.id)).join('\0')
    if (!silent) loading.value = true
    error.value = ''
    try {
      const rows = []
      let loadError = ''
      await Promise.all(requestedDevices.map(async (device) => {
        const lineId = lineActionId(device)
        if (!lineId) {
          loadError = lineActionBlockReason(device)
          return
        }
        try {
          const payload = await fetchOnewifiSmsThreads(lineId)
          for (const thread of payload.threads || []) {
            rows.push(mapThread(thread, device))
          }
        } catch (err) {
          loadError = err?.message || '短信会话加载失败'
        }
      }))
      if (requestId !== contactsRequestId || selectedDeviceId.value !== requestDeviceId) return false
      contacts.value = rows.sort((a, b) => b.lastTs - a.lastTs)
      error.value = loadError
      return true
    } finally {
      if (!silent && requestId === contactsRequestId && selectedDeviceId.value === requestDeviceId) {
        loading.value = false
      }
    }
  }

  async function loadThread({ silent = false, scrollToBottom = true } = {}) {
    const requestId = ++threadRequestId
    const contact = selectedContact.value
    if (!contact) {
      messages.value = []
      return false
    }
    const requestContactKey = contact.key
    const device = hub.devices.find((item) => item.id === contact.deviceId)
    const lineId = contact.instanceId || lineActionId(device)
    if (!device?.id || !lineId) {
      error.value = lineActionBlockReason(device || {})
      return false
    }
    if (!silent) threadLoading.value = true
    error.value = ''
    try {
      const payload = await fetchOnewifiSmsMessages(lineId, contact.peer, {
        iccid: contact.iccid,
        imsi: contact.imsi,
      })
      if (requestId !== threadRequestId || selectedContactKey.value !== requestContactKey) return false
      messages.value = sortSmsMessagesAsc((payload.messages || []).map((row) => mapMessage(row, device)))
      hasMoreHistory.value = false
      if (scrollToBottom) await scrollThreadToBottom()
      return true
    } catch (err) {
      if (requestId !== threadRequestId || selectedContactKey.value !== requestContactKey) return false
      error.value = err?.message || '短信会话加载失败'
      messages.value = []
      return false
    } finally {
      if (!silent && requestId === threadRequestId && selectedContactKey.value === requestContactKey) {
        threadLoading.value = false
      }
    }
  }

  async function scrollThreadToBottom() {
    await nextTick()
    requestAnimationFrame(() => {
      const el = threadRef.value
      if (el) el.scrollTop = el.scrollHeight
    })
  }

  function onThreadScroll() {
    /* OneWIFI 按会话一次返回，没有更早分页 */
  }

  async function selectDevice(deviceId) {
    const nextId = String(deviceId || 'all')
    if (selectedDeviceId.value === nextId) return
    selectedDeviceId.value = nextId
    selectedContactKey.value = ''
    messages.value = []
    threadLoading.value = false
    syncRoute()
    await loadContacts()
  }

  async function selectContact(contactKey) {
    if (!contactKey || selectedContactKey.value === contactKey) return
    selectedContactKey.value = contactKey
    messages.value = []
    threadLoading.value = false
    syncRoute()
    await loadThread()
  }

  function startCompose() {
    threadRequestId += 1
    selectedContactKey.value = ''
    messages.value = []
    threadLoading.value = false
    syncRoute()
  }

  async function refreshAll({ silent = false } = {}) {
    await refreshOnewifiDevices()
    await loadContacts({ silent })
    if (selectedContact.value) await loadThread({ silent, scrollToBottom: !silent })
  }

  async function sendReply() {
    const contact = selectedContact.value
    const contactKey = contact?.key || ''
    const text = draft.value.trim()
    if (!contact || !text || sending.value) return { ok: false }
    sending.value = true
    error.value = ''
    try {
      const payload = await sendOnewifiSms(contact.instanceId, contact.peer, text)
      if (selectedContactKey.value === contactKey) {
        draft.value = ''
        await loadContacts({ silent: true })
        if (selectedContactKey.value === contactKey) {
          await loadThread({ silent: true, scrollToBottom: true })
        }
      }
      return { ok: true, outcome: payload?.outcome || '', label: smsOutcomeLabel(payload?.outcome) || '短信已发送' }
    } catch (err) {
      if (selectedContactKey.value === contactKey) error.value = err?.message || '短信发送失败'
      return { ok: false }
    } finally {
      sending.value = false
    }
  }

  async function sendNew(opts = {}) {
    const requestDeviceId = selectedDeviceId.value
    const requestContactKey = selectedContactKey.value
    const wantedId = String(opts.deviceId || '')
    const line = wantedId
      ? devices.value.find((device) => device.id === wantedId)
      : targetDevices()[0]
    const to = String(opts.to ?? newTo.value).trim()
    const text = String(opts.text ?? draft.value).trim()
    const lineId = lineActionId(line || {})
    if (!lineId || !to || !text || sending.value) {
      if (!lineId && to && text) error.value = line ? lineActionBlockReason(line) : '没有可发短信的模组'
      return { ok: false }
    }
    sending.value = true
    error.value = ''
    try {
      const payload = await sendOnewifiSms(lineId, to, text)
      await loadContacts({ silent: true })
      const match = contacts.value
        .filter((item) => item.deviceId === line.id && item.peer === to)
        .sort((a, b) => b.lastTs - a.lastTs)[0]
      return {
        ok: true,
        contactKey: match?.key || '',
        outcome: payload?.outcome || '',
        label: smsOutcomeLabel(payload?.outcome) || '短信已发送',
      }
    } catch (err) {
      const message = err?.message || '短信发送失败'
      if (selectedDeviceId.value === requestDeviceId && selectedContactKey.value === requestContactKey) {
        error.value = message
      }
      return { ok: false, error: message }
    } finally {
      sending.value = false
    }
  }

  async function removeThread() {
    const contact = selectedContact.value
    if (!contact || deleting.value) return { ok: false }
    deleting.value = true
    error.value = ''
    try {
      await deleteOnewifiSmsThread(contact.instanceId || contact.deviceId, contact.peer, {
        iccid: contact.iccid,
        imsi: contact.imsi,
      })
      if (selectedContactKey.value === contact.key) {
        threadRequestId += 1
        selectedContactKey.value = ''
        messages.value = []
        syncRoute()
      }
      await loadContacts({ silent: true })
      return { ok: true }
    } catch (err) {
      if (selectedContactKey.value === contact.key) error.value = err?.message || '删除会话失败'
      return { ok: false }
    } finally {
      deleting.value = false
    }
  }

  async function exportInbox() {
    error.value = ''
    let exportId = selectedDeviceId.value
    if (exportId && exportId !== 'all') {
      const device = devices.value.find((item) => item.id === exportId)
      exportId = lineActionId(device || {})
      if (!exportId) {
        error.value = lineActionBlockReason(device || {})
        return
      }
    }
    try {
      await downloadOnewifiSmsExport(exportId)
    } catch (err) {
      error.value = err?.message || '导出短信失败'
    }
  }

  async function removeMessage(message) {
    const id = Number(message?.numericId || message?.id)
    const contactKey = selectedContactKey.value
    if (!id || deleting.value) return { ok: false }
    deleting.value = true
    error.value = ''
    try {
      await deleteOnewifiSmsMessage(id)
      if (selectedContactKey.value === contactKey) {
        await loadContacts({ silent: true })
        if (selectedContactKey.value === contactKey) {
          await loadThread({ silent: true, scrollToBottom: false })
        }
      }
      return { ok: true }
    } catch (err) {
      if (selectedContactKey.value === contactKey) error.value = err?.message || '删除短信失败'
      return { ok: false }
    } finally {
      deleting.value = false
    }
  }

  watch(contactsDeviceSig, async (sig) => {
    if (!sig || sig === loadedContactsSig) return
    await loadContacts({ silent: true })
  })

  onMounted(async () => {
    await refreshAll({ silent: true })
    if (selectedContactKey.value && !selectedContact.value && contacts.value.length) {
      selectedContactKey.value = ''
      syncRoute()
    }
    if (!selectedContactKey.value && contacts.value.length) {
      await selectContact(contacts.value[0].key)
    } else if (selectedContact.value) {
      await loadThread({ silent: true })
    }
  })

  return {
    configured,
    devices,
    engineReady,
    contacts,
    filteredContacts,
    messages,
    messageGroups,
    selectedDeviceId,
    selectedContactKey,
    selectedContact,
    search,
    draft,
    newTo,
    loading,
    threadLoading,
    historyLoading,
    sending,
    deleting,
    hasMoreHistory,
    error,
    threadRef,
    selectDevice,
    selectContact,
    startCompose,
    refreshAll,
    sendReply,
    sendNew,
    removeThread,
    removeMessage,
    onThreadScroll,
    exportInbox,
    scrollThreadToBottom,
  }
}
