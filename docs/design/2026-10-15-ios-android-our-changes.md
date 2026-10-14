# 14–15 日安卓与苹果改动记录

本侧 2026-10-14 到 2026-10-15 对安卓、苹果的改动。Codex 的记录另算。

15 日的源码改动已收进恢复分支，避免再被工作区切换清掉。

- 仓库：`E:\GQ\Ultra\NEWWIFI`
- 分支：`mobile-recovery-20261015`
- 提交：`6340201758a6113f975350cdeba3473ea917c637`
- 基线：`master` 的 `1b26d70`
- 范围：28 个已跟踪文件和 2 个安卓新文件，共 30 个。`gateway/newwifi_control` 里原有的未提交改动没有放进这次提交。

`E:\GQ\Ultra\OneWIFI-iOS` 已经删除，它原先那个未提交的登录测试没法单独保存。

## 10 月 14 日

这一天没有新提交。

- 本机编了安卓 debug 包，未推 GitHub。路径 `E:\GQ\Ultra\ONEWIFI\android\build\app\outputs\apk\debug\app-debug.apk`。
- 建了公开库并编了未签名苹果包：`https://github.com/OneCatx/OneWIFI-iOS/actions/runs/38553522829`。仓库和本地 `E:\GQ\Ultra\OneWIFI-iOS`（提交 `bbf0806`）后来删除，源码不在现有树上。
- 老版上未提交的 SIP 改动已清掉。老版仍是 13 日的提交：安卓 `7c87fb1`，苹果 `1194ec7`。

## 10 月 15 日文件记录

都在 `E:\GQ\Ultra\NEWWIFI`。安卓 `apps/android`，苹果 `apps/ios`。文件时间 02:42–02:55。

### 安卓

| 文件 | 记录 |
|---|---|
| `android/app/src/main/kotlin/com/oneims/onewifi/SmsCodeExtractor.kt` | 新文件。从短信正文提取验证码，对齐 Dart 提取规则。 |
| `android/app/src/test/kotlin/com/oneims/onewifi/RemoteOtpWireEventTest.kt` | 新文件。覆盖 JSON 转义、中文验证码、英文验证码。测试没跑成，缺 `raw/gateway_selfsigned`。 |
| `android/app/src/main/kotlin/com/oneims/onewifi/RemoteOtpService.kt` | 推送正文先用 `JSONObject` 解开，再交给 `SmsCodeExtractor`。 |
| `lib/features/settings/domain/gateway_settings.dart` | `kBoardPackageVersion` 从 `0.1.41` 改为 `0.1.42`。增加掩码 `********` 和混合列表判断。 |
| `lib/features/settings/presentation/settings_screen.dart` | 去掉「应用更新」按钮和 `applyUpdateKey`。检查更新、APK 下载还在。 |
| `lib/features/settings/data/settings_dto.dart` | Webhook 测试带上 `secret`、`timeout_ms`。掩码和明文混在一起时抛错，不保存。 |
| `lib/features/settings/presentation/settings_notify_sheet.dart` | Bark、企微、Webhook 地址改成多行，一行一个。混合列表在界面上拒绝。 |
| `lib/core/http/http_transport.dart` | `{detail}` 按 HTTP 状态处理。401、429、503 不再当成无法识别的协议。不把原始 `detail` 抄进界面。 |
| `lib/core/state/state_failure.dart` | 429 的提示带上要等的秒数。 |
| `lib/features/esim/domain/esim.dart` | 切卡结果增加 `deviceId`、`readerId`。 |
| `lib/features/esim/data/esim_api.dart` | 切卡要求非空 `device_id`、`reader_id`，并随结果返回。 |
| `lib/features/esim/state/esim_controller.dart` | 切到另一台设备时回调新设备号，不再读取旧线路库存。 |
| `lib/app/android_oneims_shell.dart` | 接到新设备号后刷新列表；列表里有就打开，没有就回到列表。失败不改当前设备。 |
| `test/features/settings/state/settings_controller_test.dart` | 版本号与 `pubspec.yaml` 里 `+` 前的名字对照。 |
| `test/features/settings/presentation/settings_screen_test.dart` | 断言界面上没有「应用更新」。 |
| `test/core/http/http_transport_test.dart` | 401、429、503 的 `detail` 分类。 |
| `test/features/esim/state/esim_controller_test.dart` | 新设备号重绑，且不读旧线路。 |
| `test/app/devices_flow_test.dart` | 切卡夹具补上 `device_id`、`reader_id`。 |

### 苹果

| 文件 | 记录 |
|---|---|
| `ios/Runner/Calls/CallKitCoordinator.swift` | 来电推送成功后调用 `startEvents()`。第一次配置登录时保留已经响着的来电，并重新武装推送绑定。登录过期仍结束这通来电。 |
| `lib/features/sms/state/remote_otp_controller.dart` | SSE 只前进本地游标，不再在这条流上确认送达。确认仍由 APNs 系统事件完成。 |
| `lib/features/settings/domain/gateway_settings.dart` | 只有掩码常量和混合列表判断。这个文件没有安卓那个版本号常量。 |
| `lib/features/settings/data/settings_dto.dart` | 与安卓相同：Webhook 测试带密钥和超时，混合地址拒绝保存。 |
| `lib/features/settings/presentation/settings_notify_sheet.dart` | 与安卓相同：地址改成多行。 |
| `lib/core/http/http_transport.dart` | 与安卓相同：`detail` 按状态分类。 |
| `lib/core/state/state_failure.dart` | 与安卓相同：429 带秒数。 |
| `lib/features/esim/domain/esim.dart` | 与安卓相同：切卡结果带设备号和读卡器号。 |
| `lib/features/esim/data/esim_api.dart` | 与安卓相同。 |
| `lib/features/esim/state/esim_controller.dart` | 与安卓相同。这个控制器的切卡方法仍返回 `Future<bool>`。 |
| `lib/app/android_oneims_shell.dart` | 与安卓相同：按新设备号重绑。 |
| `test/app/devices_flow_test.dart` | 切卡夹具补上 `device_id`、`reader_id`。 |

15 日没有用这批文件重新打安装包，也没有装到手机上。
