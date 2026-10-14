/**
 * OneWifi API Adapter — 所有 OneWifi 请求经此层，endpoint 集中管理。
 * 对接 OneWifi 网关 REST API（/api/devices、/api/health 等）。
 *
 * 本文件是只 re-export 的桶；实现按域拆在：
 *   ./onewifi.adapter.core.js     路径白名单 / URL / 请求管道（叶子）
 *   ./onewifi.adapter.devices.js  设备列表 / 健康 / 登录 / 设备操作 / 设备配置
 *   ./onewifi.adapter.cards.js    eSIM 档案 / 卡策略
 *   ./onewifi.adapter.sms.js      短信
 * 域文件禁止反向 import 本文件（ESM 循环 → TDZ）。桶只转发原本公开的名字，不转发 core 内部 helper。
 */
export {
  isOnewifiSameOrigin,
  ONEWIFI_ENDPOINTS,
  assertOneWifiEndpointAllowed,
  isOneWifiMissingApiError,
  onewifiAdapterRequest,
} from './onewifi.adapter.core.js'

export {
  getDevices,
  getHealth,
  getSystemInfo,
  changeOneWifiPassword,
  getDeveloperMode,
  setDeveloperMode,
  getTraffic,
  fetchEgressStatus,
  login,
  getDeviceOverview,
  refreshDeviceInfo,
  rebootDevice,
  reconnectVowifi,
  sendAtCommand,
  rescanDevices,
  rotateDeviceIp,
  getDeviceConfig,
  updateDeviceConfig,
  setDeviceFlightMode,
  setDeviceNetwork,
  setDeviceVowifi,
  patchDeviceCapabilities,
  renameDevice,
  deleteDevice,
} from './onewifi.adapter.devices.js'

export {
  getEsimProfiles,
  getEsimOverview,
  switchEsimProfile,
  getCardPolicy,
  putCardPolicy,
} from './onewifi.adapter.cards.js'

export {
  getSmsContacts,
  getSmsThread,
  sendSms,
  deleteSmsMessage,
} from './onewifi.adapter.sms.js'
