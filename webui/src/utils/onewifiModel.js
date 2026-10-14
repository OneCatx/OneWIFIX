/** OneWifi 设备 / 状态归一化 */

export {
  normalizeDeviceList,
  normalizeDevice,
  lineActionId,
  lineActionBlockReason,
  LINE_UNBOUND_REASON,
  policyFromDeviceRow,
  deviceStatusTone,
  signalLabel,
  formatOneWifiTime,
  maskSecret,
  displaySecret,
  normalizeDeviceOverview,
  normalizeSmsStorage,
  smsStorageAreaFull,
  smsStorageWarning,
} from './onewifiModel.device.js'

export {
  normalizeSmsList,
  smsTimeMs,
  normalizeSmsContact,
  normalizeSmsContacts,
  displaySmsBody,
  normalizeSmsMessage,
  sortSmsMessagesAsc,
  formatSmsTime,
  groupSmsByDate,
} from './onewifiModel.sms.js'

export {
  normalizeEuiccHardware,
  normalizeEsimProfiles,
  parseOnewifiEsimPayload,
  onewifiEsimError,
  onewifiEsimHint,
  esimProfileTail,
  canDeleteEsimProfile,
  esimDeleteConfirmMessage,
  esimDeleteActionLabel,
  currentSimAsProfile,
  ESIM_SWITCH_STEPS,
  idleEsimSwitchStages,
  normalizeEsimSwitchProgress,
} from './onewifiModel.esim.js'

export {
  normalizeCardPolicy,
  cardPolicyToPayload,
  esimIccidKey,
  applyLiveIccidToProfiles,
  isPlaceholderEsimProfileName,
  retainEsimProfileName,
  mergeOverviewKeepingEsimName,
  resolveActiveIccid,
} from './onewifiModel.policy.js'
