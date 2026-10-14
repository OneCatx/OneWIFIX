import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dialog = readFileSync(join(here, 'EsimEditDialog.vue'), 'utf8')
const adapter = readFileSync(join(here, '../api/deviceEdit.adapter.js'), 'utf8')

describe('eSIM edit dialog', () => {
  it('toggles ICCID/IMEI behind an eye button', () => {
    assert.match(dialog, /revealSecrets/)
    assert.match(dialog, /displaySecret\(identity\.iccid/)
    assert.match(dialog, /visibility_off/)
    assert.match(dialog, /显示完整号码/)
  })

  it('uses a modal dialog with card management and download, not a separate policy page', () => {
    assert.match(dialog, /role="dialog"/)
    assert.match(dialog, /aria-modal="true"/)
    assert.match(dialog, /编辑 eSIM/)
    assert.match(dialog, /卡片管理/)
    assert.match(dialog, /下载 Profile/)
    assert.match(dialog, /esim-profile-grid/)
    assert.doesNotMatch(dialog, /section === 'policy'/)
    assert.doesNotMatch(dialog, />卡策略</)
    assert.doesNotMatch(dialog, /savePolicy/)
  })

  it('loads and saves an independent ICCID policy on every profile card', () => {
    assert.match(dialog, /OneWifiOverviewPolicyCard/)
    assert.match(dialog, /compact/)
    assert.match(dialog, /loadDeviceCardPolicy/)
    assert.match(dialog, /applyDeviceEditCardPolicy/)
    assert.match(dialog, /policiesByIccid\[profile\.iccid\]/)
    assert.match(dialog, /policyLoadingByIccid\[profile\.iccid\]/)
    assert.match(dialog, /policySavingByIccid\[profile\.iccid\]/)
    assert.match(dialog, /onPatchPolicy\(profile, \$event\)/)
    assert.doesNotMatch(dialog, /defineEmits\(\['close', 'patch-policy'\]\)/)
    assert.doesNotMatch(dialog, /:policy="policy"/)
  })

  it('groups the profile cards by both physical eUICCs on ESTKme Max', () => {
    assert.match(dialog, /const profileGroups = computed/)
    assert.match(dialog, /v-for="group in profileGroups"/)
    assert.match(dialog, />eUICC \{\{ group\.index \+ 1 \}\}</)
    assert.match(dialog, /group\.nameplate \|\| group\.chipMaker \|\| group\.manufacturer/)
    assert.match(dialog, /group\.freeNvram/)
    assert.match(dialog, /v-for="profile in group\.profiles"/)
  })

  it('guards a late policy save from writing into a reopened or different-device dialog', () => {
    assert.match(dialog, /let dialogSessionId = 0/)
    assert.match(dialog, /const sessionId = dialogSessionId/)
    assert.match(dialog, /function isDialogSessionCurrent\(sessionId, deviceId\)/)
    assert.match(dialog, /if \(!isDialogSessionCurrent\(sessionId, deviceId\)\) return/)
    assert.match(dialog, /dialogSessionId \+= 1/)
  })

  it('bounds per-profile policy loading and cancels the batch when the dialog session changes', () => {
    assert.match(dialog, /let policyLoadController = null/)
    assert.match(dialog, /loadDeviceCardPolicy\(iccid,\s*\{\s*signal:\s*controller\.signal,\s*ctx:\s*apiCtx\(\)\s*\}\)/)
    assert.match(dialog, /卡策略.*加载超时/)
    assert.match(dialog, /policyLoadController\?\.abort\(\)/)
    assert.match(dialog, /policyLoadingByIccid\.value = \{\}/)
  })

  it('guards late profile actions from clearing or repainting a newer dialog session', () => {
    assert.match(dialog, /let profileActionRunId = 0/)
    assert.match(dialog, /const runId = \+\+profileActionRunId/)
    assert.match(dialog, /isProfileActionCurrent\(runId, sessionId, deviceId\)/)
    assert.match(dialog, /profileActionRunId \+= 1/)
  })

  it('skips the duplicate current-card policy read and explains live versus stored policy behavior', () => {
    assert.match(dialog, /includePolicy:\s*false/)
    assert.match(dialog, /policyEffectHint\(profile\)/)
    assert.match(dialog, /当前在线卡：改动立即生效/)
    assert.match(dialog, /未激活卡：改动将在此卡激活后生效/)
  })

  it('uses the existing eSIM and ICCID policy adapters', () => {
    assert.match(dialog, /loadDeviceEdit/)
    assert.match(dialog, /renameDeviceEditProfile/)
    assert.match(dialog, /toggleDeviceEditProfile/)
    assert.match(dialog, /deleteDeviceEditProfile/)
    assert.match(dialog, /downloadDeviceEditProfile/)
    assert.match(adapter, /\/esim\/profiles\//)
    assert.match(adapter, /\/esim\/actions\/download/)
    assert.match(adapter, /cardApi\(iccid, '\/policy'\)/)
    assert.match(adapter, /onewifiAdapterRequest/)
    assert.match(adapter, /editFetch/)
  })

  it('gives each profile card a delete control that refuses the enabled profile', () => {
    assert.match(dialog, /runProfileAction\(profile, 'delete'\)/)
    assert.match(dialog, /canDeleteEsimProfile\(profile\)/)
    assert.match(dialog, /esimDeleteConfirmMessage/)
    assert.match(dialog, /esim-profile-card__delete/)
  })

  it('defines busy, error, empty and cancellation states', () => {
    assert.match(dialog, /status === 'loading'/)
    assert.match(dialog, /status === 'error'/)
    assert.match(dialog, /暂无可编辑 Profile/)
    assert.match(dialog, /AbortController/)
    assert.match(dialog, /取消下载/)
  })

  it('renders download as a contained card with persistent, accessible feedback', () => {
    assert.match(dialog, /class="esim-download-card glass-frame glass-frame--compact"/)
    assert.match(dialog, /role="progressbar"/)
    assert.match(dialog, /aria-live="polite"/)
    assert.match(dialog, /downloadFeedback/)
    assert.match(dialog, /esim-download-help/)
    assert.match(dialog, /确认码/)
    assert.match(dialog, /confirmationCode/)
    assert.match(dialog, /confirmationCode:\s*confirmationCode\.value/)
    assert.match(dialog, /下载成功，但卡片列表刷新失败/)
    assert.match(dialog, /downloadPercent/)
    assert.match(dialog, /下载成功，Profile 已写入 eUICC 并显示在卡片列表中/)
    assert.match(dialog, /downloadFeedback\.value\?\.completed/)
    assert.match(dialog, /showToast\('eSIM Profile 下载成功', 'success'\)/)
  })

  it('opens from the cache, refreshes only after download, and bounds foreground loading', () => {
    assert.match(dialog, /loadDeviceEdit\(id,\s*\{\s*refresh,\s*signal:\s*controller\.signal,\s*includePolicy:\s*false,\s*ctx:\s*apiCtx\(\)\s*\}\s*\)/)
    assert.match(dialog, /apiCtx/)
    assert.match(dialog, /api-ctx|apiCtx/)
    assert.match(dialog, /applyCachedPaint/)
    assert.match(dialog, /cachedProfiles/)
    assert.match(dialog, /load\(\{\s*background:\s*true,\s*refresh:\s*true\s*\}\)/)
    assert.match(dialog, /void load\(\{\s*background:\s*seeded\s*\}\)/)
    assert.match(dialog, /if \(result\.profiles\.length \|\| !seeded\)/)
    assert.doesNotMatch(dialog, /void load\(\{\s*refresh:\s*true\s*\}\)/)
    assert.match(dialog, /loadController/)
    assert.match(dialog, /读取 eSIM 数据超时/)
  })

  it('previews country and estimated size from the activation-code SM-DP+ before download', () => {
    assert.match(dialog, /previewLpaActivation/)
    assert.match(dialog, /formatSmdpPreview/)
    assert.match(dialog, /lpaPreviewCopy/)
    assert.match(dialog, /esim-download-preview/)
    assert.match(dialog, /lpaPreviewCopy\.warning/)
  })

  it('lets ESTKme Max downloads choose either target eUICC instead of borrowing the active profile AID', () => {
    assert.match(dialog, /targetAidHex/)
    assert.match(dialog, /v-for="euicc in euiccs"/)
    assert.match(dialog, />eUICC \{\{ euicc\.index \+ 1 \}\}/)
    assert.match(dialog, /aidHex:\s*targetAidHex\.value/)
    assert.doesNotMatch(dialog, /const aidHex = currentProfile\.value\?\.aidHex/)
  })

  it('keeps the tall modal vertically scrollable with wheel and touch input', () => {
    assert.match(dialog, /\.esim-dialog\s*\{[^}]*overflow-y:\s*auto\s*!important/s)
    assert.match(dialog, /\.esim-dialog\s*\{[^}]*overflow-x:\s*hidden/s)
    assert.match(dialog, /\.esim-dialog\s*\{[^}]*overscroll-behavior:\s*contain/s)
    assert.match(dialog, /\.esim-dialog\s*\{[^}]*touch-action:\s*pan-y/s)
    assert.match(dialog, /\.esim-dialog\s*\{[^}]*-webkit-overflow-scrolling:\s*touch/s)
    assert.match(dialog, /\.esim-dialog::-webkit-scrollbar/)
  })

  it('does not blur the page under the eSIM dialog', () => {
    assert.doesNotMatch(dialog, /\.esim-dialog-overlay\s*\{[^}]*backdrop-filter/s)
    assert.match(dialog, /\.esim-dialog\s*\{[^}]*backdrop-filter:\s*none\s*!important/s)
    assert.match(dialog, /\.esim-dialog :deep\(\.glass-frame\)\s*\{[^}]*backdrop-filter:\s*none\s*!important/s)
    assert.match(dialog, /\[data-theme='dark'\] \.esim-dialog-overlay \.glass-frame\.glass-frame--compact/)
    assert.match(dialog, /:global\(\[data-theme='light'\] \.esim-dialog\)\s*\{[^}]*backdrop-filter:\s*none\s*!important/s)
  })

  it('keeps the download card compact, keyboard-visible and motion-safe', () => {
    assert.match(dialog, /\.esim-dialog__section--download\s*\{[^}]*min-height:\s*0/s)
    assert.match(dialog, /\.esim-download-card__field input:focus-visible/)
    assert.match(dialog, /\.esim-download-card__fill\s*\{[^}]*transition:\s*transform/s)
    assert.match(dialog, /@media \(prefers-reduced-motion: reduce\)/)
    assert.match(dialog, /min-height:\s*44px/)
  })

  it('gives the teleported dialog an explicit readable light-theme surface', () => {
    assert.match(dialog, /:global\(\[data-theme='light'\] \.esim-dialog\)\s*\{[^}]*background:/s)
    assert.match(dialog, /:global\(\[data-theme='light'\] \.esim-download-card\)\s*\{[^}]*background:/s)
    assert.match(dialog, /\.esim-download-card \.esim-download-card__field input\s*\{[^}]*var\(--bg-input/s)
  })

  it('does not leak an activation code or download result into another device', () => {
    assert.match(dialog, /function resetDownloadState\(\)/)
    assert.match(dialog, /downloadRunId \+= 1/)
    assert.match(dialog, /activationCode\.value = ''/)
    assert.match(dialog, /downloadFeedback\.value = null/)
    assert.match(dialog, /downloadProgress\.value = null/)
    assert.match(dialog, /runId !== downloadRunId/)
    assert.match(dialog, /deviceId !== previousDeviceId/)
    assert.match(dialog, /createLatestRequestGuard/)
    assert.match(dialog, /deviceLoadGuard\.begin\(id\)/)
    assert.match(dialog, /deviceLoadGuard\.isCurrent\(request, props\.deviceId\)/)
    assert.match(dialog, /deviceLoadGuard\.invalidate\(\)/)
  })
})
