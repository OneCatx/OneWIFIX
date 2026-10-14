import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
// 父组件拆出了改名弹层与设备卡片栈两个子 SFC，契约断言扫三份源码拼接后的同一份文本。
// 父组件放最后：`SIM / 设备 … 编辑 eSIM … 切卡` 这条 doesNotMatch 是无锚正则，
// 若设备卡片栈（含「切卡中」）排在父组件之后会跨文件误命中。
const card = [
  readFileSync(join(here, 'OneWifiInstanceDeviceStack.vue'), 'utf8'),
  readFileSync(join(here, 'OneWifiInstanceRenameDialog.vue'), 'utf8'),
  readFileSync(join(here, 'OneWifiInstanceCard.vue'), 'utf8'),
].join('\n')
const labCss = readFileSync(join(here, '../assets/onewifi-lab.css'), 'utf8')
const addCard = readFileSync(join(here, 'AddDeviceCard.vue'), 'utf8')

describe('OneWifiInstanceCard device card vs eSIM edit', () => {
  it('opens eSIM from the 切卡 group, not the SIM panel or device-card pencil', () => {
    assert.match(card, /EsimEditDialog/)
    assert.match(card, /openEsimEdit\(selectedDevice\)/)
    assert.match(card, /lineActionId\(selectedDevice\)/)
    assert.doesNotMatch(card, /openEsimEdit\(selectedDevice\.id\)/)
    assert.match(card, /overview-card__title">切卡[\s\S]*?编辑 eSIM/)
    assert.doesNotMatch(card, /overview-card__title">SIM \/ 设备[\s\S]*?编辑 eSIM[\s\S]*?切卡/)
    assert.match(card, /device-card__edit/)
    assert.match(card, /device-card__head-end/)
    assert.match(card, /runtime-action-btn glass-frame glass-frame--compact glass-frame--pill/)
    assert.match(card, /openDeviceRename\(device\)"[\s\S]{0,280}编辑/)
    assert.match(card, /@click\.stop="openDeviceRename\(device\)"/)
    assert.doesNotMatch(card, /@click\.stop="openEsimEdit\(device\.id\)"/)
    assert.match(card, /:api-ctx="requestCtx"/)
    assert.match(card, /renameSelectedDevice/)
    assert.doesNotMatch(card, /renameOnewifiDevice/)
    assert.match(card, /编辑设备名称/)
  })

  it('keeps a single online pill and independent device cards with stacked hardware nameplates', () => {
    assert.match(card, /aria-label="向左滚动"/)
    assert.match(card, /aria-label="向右滚动"/)
    assert.match(card, /scrollDeviceRowPrev/)
    assert.match(card, /device-card__tag--status/)
    assert.match(card, /device-card__mihomo/)
    assert.doesNotMatch(card, /device-card__ip-label">Mihomo</)
    assert.doesNotMatch(card, />Mihomo</)
    assert.match(card, /device-card__plate/)
    assert.match(card, /device-card__plates/)
    assert.match(card, /device-card__plate--esim/)
    assert.match(card, /device-card__nameplate device-card__plate overview-badge overview-badge--hero glass-frame glass-frame--compact glass-frame--pill/)
    assert.match(card, /v-if="euiccNameplateForDevice\(device\) \|\| euiccSlotsForDevice\(device\)\.length"/)
    assert.match(card, /v-if="euiccNameplateForDevice\(device\)"/)
    assert.doesNotMatch(card, /\|\| 'eSIM 实体卡'/)
    assert.match(card, /euiccSlotsForDevice\(device\)/)
    assert.match(card, /v-for="euicc in euiccSlotsForDevice\(device\)"/)
    assert.doesNotMatch(card, /device-card__plate--slot-reserve/)
    assert.match(card, />eSIM \{\{ euicc\.index \+ 1 \}\}</)
    assert.match(card, />\u53ef\u7528 \{\{ euicc\.freeNvram \}\}</)
    assert.doesNotMatch(card, /device-card__plate-manufacturer/)
    assert.match(card, /proxyLabel/)
    assert.match(card, /出口代理/)
    assert.match(card, /switchStagesForDevice\(selectedDevice\)/)
    assert.match(card, /deviceSwitchProgressVisible\(selectedDevice\)/)
    assert.match(card, /runtime-progress-stack/)
    assert.doesNotMatch(card, /sim-progress-stack/)
    assert.match(card, /当前进度/)
    assert.match(card, /切卡进度/)
    assert.match(card, /idleEsimSwitchStages\(\)/)
    // 两条进度条都常显示：不再用 v-if 隐藏切卡进度
    assert.doesNotMatch(card, /v-if="selectedDevice && deviceSwitchProgressVisible\(selectedDevice\)"/)
    const runtimeCard = card.slice(card.indexOf('overview-card--runtime'), card.indexOf('overview-card--sim'))
    assert.equal((runtimeCard.match(/class="runtime-progress /g) || []).length, 2)
    const simCard = card.slice(card.indexOf('overview-card--sim'), card.indexOf('overview-card--esim'))
    assert.doesNotMatch(simCard, /stage-row/)
    assert.match(card, /device-card-stack/)
    assert.match(card, /device-card__stages/)
    assert.match(card, /ESIM_SWITCH_STEPS/)
    assert.doesNotMatch(card, /v-if="deviceSwitchProgressVisible\(device\)"/)
    assert.doesNotMatch(card, /stagesForDevice\(device\)/)
    assert.doesNotMatch(card, /proxyFlagWatermarkStyle|deviceFlagStyle/)
    assert.doesNotMatch(card, /device-card__status/)
    assert.doesNotMatch(card, /device\.operator \|\| device\.statusText/)
    assert.doesNotMatch(card, /device-card__ip-label">IP</)
    assert.doesNotMatch(card, /device\.publicIp/)
  })

  it('paints camped cellular status in 运行状态, not on the compact device card', () => {
    const runtimeHero = card.slice(
      card.indexOf('runtime-status-hero'),
      card.indexOf('runtime-progress-stack'),
    )
    assert.match(runtimeHero, /蜂窝驻留/)
    assert.match(runtimeHero, /selectedOverview\.radioLabel/)
    assert.match(runtimeHero, /selectedOverview\.radioRegistered/)
    assert.match(card, /title="服务小区"/)
    assert.match(card, /title="注网"/)
    assert.doesNotMatch(card, /device-card__head-end[\s\S]{0,500}蜂窝驻留/)
    assert.doesNotMatch(card, /device-card__plates[\s\S]{0,280}device\.radioLabel/)
    assert.doesNotMatch(card, /stage\.key === 'access'[\s\S]{0,80}radio_registered/)
  })

  it('keeps the empty-state branch directly attached to the device list', () => {
    assert.match(card, /v-if="!devices\.length \&\& !meta\.lastError"/)
    assert.doesNotMatch(card, /v-if="devices\.length"[\s\S]*?v-else-if="!devices\.length/)
  })

  it('does not keep the old route navigation or inline device-name editor', () => {
    assert.doesNotMatch(card, /goEditDevice|name:\s*['"]device-edit['"]|device-card__name-input/)
  })

  it('puts the online pill on the same row as the device name', () => {
    assert.match(card, /device-card__head-end[\s\S]+device-card__tag--status/)
    assert.doesNotMatch(card, /<\/div>\s*<span class="device-card__tag/)
  })

  it('shows modem ME/SM SMS usage and a full-mailbox warning on the SIM panel', () => {
    assert.match(card, /title="ME 短信"/)
    assert.match(card, /title="SM 短信"/)
    assert.match(card, /selectedOverview\.smsStorage\?\.me/)
    assert.match(card, /selectedOverview\.smsStorage\?\.sm/)
    assert.match(card, /selectedOverview\.smsStorageWarning/)
    assert.match(card, /sim-sms-storage-warn/)
    assert.match(labCss, /overview-card--sim \.sim-sms-storage-warn/)
  })

  it('toggles full IMEI/ICCID/IMSI behind an eye button on the SIM panel', () => {
    assert.match(card, /revealSecrets/)
    assert.match(card, /displaySecret\(selectedOverview\.imei, revealSecrets\)/)
    assert.match(card, /displaySecret\(selectedOverview\.iccid, revealSecrets\)/)
    assert.match(card, /visibility_off/)
    assert.match(card, /显示完整号码/)
    assert.match(card, /:reveal="revealSecrets"/)
    assert.match(card, /selectedDevice\.value\?\.id[\s\S]{0,80}revealSecrets\.value = false/)
  })

  it('does not keep a duplicate selectedOverview gate on the detail pane', () => {
    assert.match(card, /v-if="selectedDevice"/)
    assert.doesNotMatch(card, /selectedDevice && selectedOverview/)
  })

  it('keeps the original device-card height with content at the top', () => {
    const shell = labCss.match(/\.onewifi-lab-shell \.device-card \{[\s\S]*?\n\}/)
    assert.ok(shell, 'device-card shell rule')
    assert.match(shell[0], /padding:\s*14px 16px/)
    assert.match(shell[0], /min-height:\s*176px/)
    assert.doesNotMatch(shell[0], /max-height:\s*260px/)
    assert.match(shell[0], /justify-content:\s*flex-start/)
    const ip = labCss.match(/\.onewifi-lab-shell \.device-card__ip \{[\s\S]*?\n\}/)
    assert.ok(ip, 'device-card ip rule')
    assert.match(ip[0], /margin-top:\s*0/)
    assert.doesNotMatch(ip[0], /margin-top:\s*auto/)
    assert.match(addCard, /justify-content:\s*flex-start/)
    assert.match(addCard, /min-height:\s*176px/)
    assert.match(labCss, /\.glass-frame > \*:not\(\.device-card__lens\)/)
    assert.match(labCss, /\.device-card > \.device-card__lens[\s\S]{0,120}position:\s*absolute !important/)
  })

  it('keeps 切卡 rows for switching and leaves profile delete to the edit dialog', () => {
    assert.match(card, /esim-row/)
    assert.match(card, /openEsimEdit/)
    assert.match(card, /onSwitchEsim/)
    assert.match(card, /deviceIsSwitching\(device\.id\)/)
    assert.match(card, /device-card__switch-hint/)
    assert.match(card, /已经是当前配置/)
    assert.doesNotMatch(card, /onDeleteEsim/)
    assert.doesNotMatch(card, /esim-item-delete/)
    assert.doesNotMatch(card, /deleteDeviceEditProfile/)
  })

  it('does not blink the refresh button or status pill on background hydrate', () => {
    assert.match(card, /class="vhi-btn" :disabled="loading"/)
    assert.match(card, /\{\{ loading \? '刷新中…' : '刷新' \}\}/)
    assert.match(card, /loading\.value \|\| \(meta\.hydrating && !connected\.value\)/)
    assert.doesNotMatch(card, /loading \|\| meta\.hydrating/)
  })

  it('shows container delete next to refresh and device delete as text in the rename dialog', () => {
    assert.match(card, /onRefresh/)
    assert.match(card, /v-if="!sameOrigin"[\s\S]{0,80}vhi-btn--danger/)
    assert.match(card, /class="vhi-btn vhi-btn--danger"[\s\S]{0,120}onRemove/)
    assert.match(card, /AddDeviceCard v-if="sameOrigin"/)
    assert.match(card, /device-card__name[\s\S]*device-card__mihomo/)
    assert.match(labCss, /\.device-card__plates[\s\S]*flex-direction:\s*column/)
    assert.match(labCss, /\.device-card__nameplate[\s\S]*text-overflow:\s*ellipsis/)
    assert.doesNotMatch(labCss, /\.device-card__nameplate[\s\S]{0,400}251,\s*231,\s*187/)
    assert.doesNotMatch(card, /device-card__remove/)
    assert.match(card, /class="device-rename-delete"/)
    assert.match(card, /onDeleteDevice\(renameTarget\)/)
    assert.match(card, /deviceDeleting === renameTarget\.id \? '删除中…' : '删除设备'/)
    assert.match(card, /deleteSelectedDevice/)
    assert.doesNotMatch(card, /deleteOnewifiDevice/)
    assert.match(card, /placeholder="6688，反代域名可留空"/)
    assert.doesNotMatch(card, /7575/)
  })

  it('exposes developer mode on the card policy panel', () => {
    assert.match(card, /onToggleDeveloper/)
    assert.match(card, /setDeveloperMode/)
    assert.match(card, /@developer="onToggleDeveloper"/)
    assert.match(card, /:developer="Boolean\(selectedDevice\?\.developer_enabled\)"/)
  })

  it('keeps 读芯片 without exposing force refresh', () => {
    assert.match(card, /@click="onReadChip"/)
    assert.match(card, /读芯片/)
    assert.doesNotMatch(card, /强制刷新|onForceRefreshChip|forceRefreshChip/)
  })

  it('opens 编辑 eSIM from the 切卡 cache and pauses polling while the dialog is open', () => {
    assert.match(card, /:cached-profiles="displayEsimProfiles"/)
    assert.match(card, /:cached-euiccs="esimHardware\[selectedDevice\?\.id\] \|\| \[\]"/)
    assert.match(card, /setPollSuspended/)
    assert.match(card, /watch\(esimDialogDeviceId/)
  })
})
