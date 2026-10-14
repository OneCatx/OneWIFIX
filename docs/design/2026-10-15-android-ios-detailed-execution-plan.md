# Android / iOS 全量源码恢复、补齐与 Web 对齐执行方案

## 0. 目标与边界

本方案针对 2026-10-14 上午至 2026-10-15 当前工作区中，Android、iOS 相关的源码改动、审查发现和后续补齐工作。

目标不是重新设计产品，而是：

1. 保住当前已经写过但尚未提交的 Android/iOS 源码改动。
2. 明确哪些改动已经存在，哪些只是审查结论，哪些必须重新实现。
3. 让 Android、iOS、Web 使用同一套网关 API 和身份契约。
4. 修复“换工作区/换网关后源码改动消失”的交付流程问题。
5. 保持现有产品边界：一张卡、一条现有 Engine IMS；Web 使用 PJSIP/WebRTC；手机保留 AudioSocket PCM；不恢复已取消功能。

本方案不授权直接提交、推送、部署或发送真实电话、短信、Webhook、APNs。执行者必须先保存当前工作区，再按批次改动。

## 1. 当前事实冻结

### 1.1 源码位置

| 内容 | 路径 | 当前基线 |
|---|---|---|
| Android 主源 | `E:\GQ\Ultra\NEWWIFI\apps\android` | `0.1.42+47`，父仓库 `master`，基线 `1b26d70` |
| iOS 主源 | `E:\GQ\Ultra\NEWWIFI\apps\ios` | `0.1.28+33`，与 Android 共属 NEWWIFI |
| 独立 iOS 发布副本 | `E:\GQ\Ultra\OneWIFI-iOS` | `bbf0806`，不是主源逐字镜像 |
| Web/网关 | `E:\GQ\Ultra\mdd-sim-gateway` | `feat/onewifi-mdd-unified`，HEAD `eed8d2f` |
| 旧 OneWIFI | `E:\GQ\Ultra\ONEWIFI-6056f50` | 仅作为能力对比基线 |

### 1.2 当前手机工作区状态

NEWWIFI 当前存在：

- 28 个 Android/iOS 已跟踪文件修改。
- 2 个 Android 未跟踪新文件：`SmsCodeExtractor.kt`、`RemoteOtpWireEventTest.kt`。
- 所有这些改动都没有形成稳定提交。
- 上一轮全盘审查没有修改手机业务源码，只写审查报告和交接文档。
- 独立 iOS 发布副本存在预先 dirty 的 `test/features/auth/presentation/login_screen_test.dart`，不能撤销或覆盖。

### 1.3 10 月 14 日发生的事情

根据现有记录，10 月 14 日没有在当前三份源码中留下新的 Git commit：

- 旧 Android 工作区曾编译 debug APK，路径记录为 `E:\GQ\Ultra\ONEWIFI\android\build\app\outputs\apk\debug\app-debug.apk`，没有推 GitHub。
- 独立 iOS 发布副本曾推到 `OneCatx/OneWIFI-iOS` 并由 GitHub Actions 生成未签名 IPA；随后仓库/目录被删除，不能当作当前主源。
- 老版工作区上的 SIP 改动已经被清理，不能拿它覆盖当前 NEWWIFI 手机 PCM 主源。

因此，“换网关后丢失”的直接工程原因是工作区改动未提交、源码树被切换或覆盖，不是网关 API 将已经提交的代码删除。

## 2. 已经完成的源码改动：恢复清单

以下内容属于当前 NEWWIFI 工作区已经存在的 diff，第一批必须原样保全，不能重新猜测实现。

### 2.1 Android/iOS 共同改动一：通知多 URL

涉及文件：

- `apps/android/lib/features/settings/domain/gateway_settings.dart`
- `apps/android/lib/features/settings/data/settings_dto.dart`
- `apps/android/lib/features/settings/presentation/settings_notify_sheet.dart`
- `apps/ios/lib/features/settings/domain/gateway_settings.dart`
- `apps/ios/lib/features/settings/data/settings_dto.dart`
- `apps/ios/lib/features/settings/presentation/settings_notify_sheet.dart`

当前行为：

- Bark、企微、Webhook 支持一行一个 URL。
- DTO 将首 URL 和 `extraUrls` 合并。
- 读取到掩码 URL 时保留掩码，不伪造明文。
- 掩码地址与明文地址混合时拒绝保存，避免把不可恢复的掩码当真实 URL 写回网关。
- Webhook 测试请求带 `secret` 和 `timeout_ms`。

必须保留的安全边界：

- 不允许为了让保存成功而删除掩码尾项。
- 不允许把网关返回的掩码当作真实 secret 或 URL。
- 不新增 PushPlus、企微、飞书以外的通知通道。
- 不恢复 eSIM 通知重试或 Telegram 回复机器人。

后续补齐：

- Android、iOS、Web 三端统一 `urls`、`secret`、`timeout_ms` DTO。
- 测试和保存共用同一份 webhook 字段。
- 多 URL 必须支持“完整替换”或明确的“单项 patch”二选一，不能由客户端拼接混合掩码列表。

### 2.2 Android/iOS 共同改动二：登录与接口错误

涉及文件：

- `apps/android/lib/core/http/http_transport.dart`
- `apps/android/lib/core/state/state_failure.dart`
- `apps/ios/lib/core/http/http_transport.dart`
- `apps/ios/lib/core/state/state_failure.dart`
- Android 测试：`apps/android/test/core/http/http_transport_test.dart`

当前改动意图：

- 网关返回 `{detail}` 时按 HTTP status 分类。
- 401 归类认证失败。
- 429 保留等待秒数和 `Retry-After`。
- 503 归类服务不可用。
- 原始后端 detail 不直接作为用户界面文案。

需要补齐的契约：

- 主源 `/api/auth/login` 的 root `detail` 与 mobile facade 的 `data/error` 形状必须由 transport 统一适配。
- Android 和融合 iOS 不能只接受 `{error:{code,message}}`。
- 独立 iOS 发布副本已使用 `/api/auth/client/login` 和 `nativeResponse`，不能把主源缺陷错误复制到该副本。
- 所有失败必须保留 status、retry-after、结构化 error kind，界面只显示本地化文本。

### 2.3 Android/iOS 共同改动三：eSIM 切卡身份

涉及文件：

- `lib/features/esim/domain/esim.dart`
- `lib/features/esim/data/esim_api.dart`
- `lib/features/esim/state/esim_controller.dart`
- `lib/app/android_oneims_shell.dart`
- `test/app/devices_flow_test.dart`
- Android 另有 `test/features/esim/state/esim_controller_test.dart`

当前改动意图：

- `EsimSwitchResult` 保留 `deviceId`、`readerId`。
- 切卡成功后校验返回的设备身份。
- 目标身份发生变化时，通知外层刷新设备列表并切换详情。
- 切卡失败不重绑旧线路。

必须补齐的跨端规则：

- `instance_id` 是当前网关内部线路 ID，不能跨网关直接复用。
- `hardware_id`、IMEI、reader serial、ICCID 是跨网关匹配候选。
- Web、Android、iOS 的 switch response 字段必须统一为 `device_id`、`reader_id`、`instance_id`、`iccid`，不能一端使用 `aidHex`、另一端使用 `aid_hex` 而无适配。
- 切卡后的下一次 profile、policy、overview 请求必须使用新身份。

### 2.4 Android 独有改动一：中文验证码

涉及文件：

- `apps/android/android/app/src/main/kotlin/com/oneims/onewifi/SmsCodeExtractor.kt`
- `apps/android/android/app/src/test/kotlin/com/oneims/onewifi/RemoteOtpWireEventTest.kt`
- `apps/android/android/app/src/main/kotlin/com/oneims/onewifi/RemoteOtpService.kt`

当前改动意图：

- 先将 SSE JSON 解码成对象。
- 再从解码后的 `content`、sender、device 字段提取验证码。
- 兼容网关 `json.dumps()` 产生的中文 Unicode 转义。

已知验证限制：

- Kotlin 测试因为原有 `raw/gateway_selfsigned` 资源缺失没有运行。
- 不能把离线等价正则复现当作 Kotlin 服务已通过。
- 仍需真机验证 Android 13/14/15 后台、通知权限拒绝、重连、游标推进和取消。

### 2.5 Android 独有改动二：更新入口

涉及文件：

- `apps/android/lib/features/settings/presentation/settings_screen.dart`
- `apps/android/lib/features/settings/domain/gateway_settings.dart`
- `apps/android/test/features/settings/presentation/settings_screen_test.dart`
- `apps/android/test/features/settings/state/settings_controller_test.dart`

当前改动意图：

- 移除网关“应用更新”按钮。
- 保留检查更新和 APK 下载。
- 版本号从 `0.1.41` 修正为 `0.1.42`。
- 网关 `POST /api/system/update/apply` 继续拒绝手机调用。

不能改成：

- 不能为了让 Android 按钮成功而放开网关 apply。
- 不能把网关控制器更新和 GitHub APK OTA 混成一个流程。
- iOS 不新增更新 API。

### 2.6 iOS 独有改动一：CallKit 温后台来电

涉及文件：

- `apps/ios/ios/Runner/Calls/CallKitCoordinator.swift`

当前改动意图：

- VoIP 推送上报 CallKit 后重新启动通话事件流。
- 同一网关首次恢复登录时，不清理已经上报但尚未绑定的来电。
- 登录过期、网关切换、凭据撤销仍然结束旧来电。

必须补齐：

- 温后台推送、冷启动推送、前台恢复、重复推送、接听超时要分别验证。
- 主源使用手机 facade + SSE + PCM；独立 iOS 发布副本使用 SIP/WebRTC 后台 owner，不能把两者测试结果混用。

### 2.7 iOS 独有改动二：短信 SSE/APNs 游标

涉及文件：

- `apps/ios/lib/features/sms/state/remote_otp_controller.dart`

当前改动意图：

- SSE 只推进本地读取游标。
- APNs 系统事件负责送达确认和展示确认。
- 防止 SSE 先 ACK 导致 APNs 横幅或 Live Activity 被跳过。

必须补齐：

- 用 mock 控制 ACK 先于 APNs、APNs 先于 SSE、重复事件三种顺序。
- 仍然保持一次性去重，不新增通知重试产品能力。

## 3. 10 月 15 日全盘审查发现：不是已完成补丁

以下是审查中确认的问题。它们写入报告，但没有因此修改生产源码，执行者必须单独安排修复。

### 3.1 Android AND-01 至 AND-07

#### AND-01：中文验证码原生解析

- 旧问题：`RemoteOtpService.kt` 对未解码 JSON 做正则匹配。
- 影响：中文验证码无法提取，游标也可能不推进。
- 当前工作区已有修复方向和新 Kotlin 文件，但 Kotlin 测试未执行。
- 完成标准：中文 Unicode 转义、英文验证码、引号/换行、非验证码消息、后台重连全部通过。

#### AND-02：网关 apply 按钮仍可达

- 旧问题：设置页可出现“应用更新”，调用 `/api/system/update/apply`。
- 后端拒绝是设计，不是后端 bug。
- 完成标准：available=true 时 Android 没有 apply 按钮、没有 apply 请求；GitHub APK OTA 仍可用。

#### AND-03：APK 版本常量过期

- 旧问题：常量 0.1.41，pubspec 为 0.1.42+47。
- 影响：错误显示可升级或重复下载。
- 完成标准：current 0.1.42 对 latest 0.1.42 不提示升级；latest 0.1.43 才提示。

#### AND-04：多 URL 掩码冲突

- 旧问题：界面只编辑首项，尾部掩码保留，形成真实 URL + MASK 混合列表。
- 网关合理返回 409，不能强行放宽后端校验。
- 完成标准：原样保存、完整替换、单项 patch 三种语义明确；不能静默删除尾项。

#### AND-05：Webhook 草稿测试丢 secret/timeout

- 旧问题：保存 DTO 有 `secret/timeout_ms`，测试 DTO 只有 `enabled/urls`。
- 影响：用户修改 secret 后直接测试，测试仍使用旧 secret。
- 完成标准：stub 能确认测试使用当前 draft 的 URL、secret、timeout 和 HMAC；不发送真实通知。

#### AND-06：登录 detail 误归类协议错误

- 旧问题：客户端 transport 只识别 error envelope，网关 login 的 401/429 使用 detail。
- 独立 iOS 发布副本已有 nativeResponse 兼容；Android 和融合 iOS 主源仍需统一。
- 完成标准：401、429、503、成功响应分别进入正确 UI 状态。

#### AND-07：切卡丢新 device_id

- 旧问题：切卡返回新身份，但客户端只保留 status/verified，继续使用旧设备 ID。
- 当前工作区已经加入新身份字段和重绑定回调。
- 完成标准：A→B 后下一次请求全部使用 B；already_active 同 ID 不重建；失败不重绑。

### 3.2 iOS IOS-01 至 IOS-03 和 DRIFT-01

#### IOS-01：温后台来电没有重开 SSE

- 主源 `CallKitCoordinator` 停止 idle SSE 后，推送唤醒没有确保重新 start events。
- 影响：CallKit 已响，但接听前没有 fresh snapshot，可能超时结束。
- 当前工作区已有修复方向；必须真机确认系统调度和音频。

#### IOS-02：冷启动首次 configure 清除推送来电

- PushKit 先上报来电，Flutter 登录恢复后首次 configure 清理 local call。
- 影响：冷启动来电被错误结束。
- 完成标准：同身份恢复保留；无凭据、撤销、切换网关才清理。

#### IOS-03：短信 SSE ACK 可能压掉 APNs

- 两份 iOS 源码都存在 SSE 消费先于 APNs 展示确认的时序风险。
- 当前工作区只改了主源 remote OTP controller；独立副本需确认同等逻辑后补测试。

#### DRIFT-01：独立发布副本通话 owner 与主源不一致

- 主源：CallKit + facade HTTP/SSE + AudioSocket PCM。
- 独立发布副本：后台 FlutterEngine + SIP UA + WebRTC。
- 这不是简单复制几个文件可以解决的问题，必须先决定发布 owner。
- 当前产品边界要求手机 PCM 保留，因此发布入口、Engine 能力和签名 IPA 必须重新核对。

### 3.3 手机可达的共享后端问题

以下不是 Android/iOS 各自重复计数，而是手机调用能触达的网关根因：

- B01/BE-04：手机 UUID 与 Engine Uniqueid 未建立稳定映射，可能出现重复/僵尸通话。
- B02/BE-03：旧 call ID 的 hangup/DTMF 可能按整条线路操作，误伤新通话。
- B03：自然结束没有统一释放 AudioSocket handset bridge。
- B04：任务保存了 profile/environment/duration/retry/notify，但执行没有兑现。
- B05：任务 timezone 保存但调度按 UTC。
- B06：积压任务反复补跑，手动执行消费计划且无原子 claim。
- B08/BE-06：关闭 trusted proxy 后旧 trusted_proxies 仍生效。
- B09：反代 ACL 可能判断代理 peer 而不是真实客户端，需结合 Linux Uvicorn 配置验收。
- B10/BE-05：通话 SSE 建连后不复查 revoke，吊销后仍可能收到快照。
- B11：HTTPS 关闭开关与实际 TLS listener 语义不一致。
- B12：非法通知测试输入可能变成 500，而不是 422。

这些问题必须由网关先冻结正确契约，再让手机和 Web 适配；不能只在客户端加 try/catch。

## 4. Android/iOS/Web 统一 API 方案

### 4.1 统一身份模型

必须明确以下 ID：

| ID | 作用 | 生命周期 |
|---|---|---|
| `gateway_id` | 网关安装/数据集身份 | 同一网关换 IP、端口、重启不变 |
| `hardware_id` | 物理 modem/reader 身份 | 硬件不变时稳定 |
| `reader_id` | 读卡器身份 | 读卡器不变时稳定 |
| `instance_id` | 网关内线路/Engine 配置 ID | 只在当前网关内有效 |
| `iccid` | SIM/eSIM profile 身份 | 跨网关迁移主要匹配键 |
| `imei` | modem 身份辅助键 | 设备不更换时稳定 |
| `call_id` | 单次通话业务 ID | 一次通话生命周期 |

禁止：

- 用 `instance_id` 跨网关恢复线路。
- 用列表顺序猜测设备对应关系。
- 用“当前最新通话”兜底匹配旧 call ID。
- 让 Web 使用 physical ID、手机使用 instance ID 而没有适配层。

### 4.2 Gateway identity

新增或扩展：

```text
GET /api/system/identity
```

返回：

```json
{
  "gateway_id": "stable-installation-uuid",
  "api_version": 1,
  "schema_version": 14,
  "build_version": "1.14.0",
  "capabilities": ["devices", "esim", "sms", "calls", "notifications"],
  "data_revision": 123
}
```

`gateway_id` 应存放在网关持久化配置中，并随网关配置备份迁移。手机不能只用 URL 判断网关，因为 IP 和端口会变化。

### 4.3 统一 bootstrap

新增或扩展统一返回：

```text
GET /api/mobile/v1/bootstrap
```

Web 可调用同一服务的 Web 兼容路径，但 DTO 必须相同。返回至少包括：

- gateway identity、API/schema、build、data revision。
- 设备 roster：hardware、reader、instance、ICCID、IMEI、能力和绑定状态。
- 当前 active eSIM profile 及 reader。
- 通知设置摘要和掩码字段。
- 自动任务摘要、settings revision。
- 需要重新认证、重新选择设备或重新同步的原因。

手机启动顺序：

1. 读取本地 gateway profile。
2. 请求 identity。
3. 比对 gateway_id。
4. 成功认证。
5. 请求 bootstrap。
6. 用 stable identity 将本地选择映射到新 `instance_id`。
7. 创建控制器。

失败时不能直接显示“全部为空”；必须区分：网关不可达、需要登录、身份改变、数据为空、权限不足。

### 4.4 Gateway profile 本地存储

Android 和 iOS 都要替换当前单值存储：

- 当前：`service_origin` 只有一个值。
- 目标：`gateway_profiles` 列表 + `active_gateway_id`。

每个 profile 保存：

- `gateway_id`
- `origin`
- `display_name`
- `last_seen_at`
- token key reference
- TLS fingerprint reference
- last selected `hardware_id` / `reader_id` / `iccid`
- schema version
- migration state

Token 仍然按 gateway profile 隔离。不同 gateway 不复制 bearer token；同一 gateway 只是地址变化，可以在身份确认后重新认证或绑定新 origin。

需要修改的文件：

- `apps/android/lib/core/config/base_url_store.dart`
- `apps/android/lib/features/auth/state/session_controller.dart`
- `apps/android/lib/core/security/secure_token_store.dart`
- `apps/android/lib/core/security/gateway_trust_store.dart`
- `apps/android/lib/app/session_gate.dart`
- iOS 对应同名文件

### 4.5 网关迁移协议

真正更换网关而不是改地址时，必须提供迁移，不可能只靠修改 URL 恢复旧网关数据库：

```text
POST /api/gateway/migration/export
POST /api/gateway/migration/prepare
POST /api/gateway/migration/commit
```

建议流程：

1. 手机或 Web 在旧网关认证。
2. 旧网关生成一次性迁移会话和摘要。
3. 用户在新网关认证并确认目标设备。
4. 新网关返回 target gateway_id 和接受 nonce。
5. 旧网关只导出用户勾选的范围。
6. 新网关校验 checksum、schema、source/target identity。
7. 新网关先写 staging，不直接覆盖当前配置。
8. 预览映射结果：设备、线路、ICCID、通知、任务、历史。
9. 用户确认后 commit。
10. 返回新的 `data_revision`，三端重新 bootstrap。

可迁移：

- 设备名称、线路配置、ICCID/IMEI/reader 映射。
- eSIM 策略和 profile metadata。
- 通知配置、Webhook 多 URL、任务配置。
- 联系人、短信/MMS 历史、必要的调用历史。
- Web/手机共用的用户偏好。

不可直接迁移：

- bearer、Cookie、CSRF、TLS pin。
- 正在进行的通话、SSE cursor、临时状态。
- 只代表旧硬件现场状态的 observed 数据。
- 无法稳定映射的旧 `instance_id`。

迁移包需要：version、source gateway_id、target gateway_id、created_at、nonce、checksum、schema version。secret 不明文导出；优先旧网关到新网关一次性授权，次选端到端加密 bundle。

## 5. 按文件和责任边界的执行顺序

### 批次 A：立即保全，不改业务逻辑

责任：源码维护者。

1. 停止切换分支、清理工作区、重新拉取和覆盖 NEWWIFI。
2. 保存 `git status --short`、`git diff --stat`、基线 commit。
3. 建恢复分支，例如 `mobile-recovery-20261015`。
4. 纳入 28 个已修改文件和 2 个 Android 新文件。
5. 提交后记录 commit hash。
6. 单独保存 `OneWIFI-iOS` 的预存 dirty 文件状态，不混入主源恢复提交。

### 批次 B：恢复已有手机补丁

责任：Android/iOS 维护者。

顺序：

1. 共同通知 DTO/UI。
2. 共同 transport/state failure。
3. 共同 eSIM switch identity。
4. Android OTP、更新按钮和版本。
5. iOS CallKit、冷/温后台、SSE/APNs。
6. 补齐两端对应测试。

完成条件：源码 diff 与当前记录一致，不能只复制 Dart 文件而漏掉 Kotlin、Swift、测试夹具。

### 批次 C：先修网关契约，再修客户端

责任：网关维护者。

1. 冻结 identity/bootstrap DTO。
2. 统一 `device_id/reader_id/instance_id/iccid/aid_hex` 命名。
3. 统一错误 envelope 和 HTTP status。
4. 修 mobile API 的通知、eSIM、call、SSE、任务状态语义。
5. 为迁移 bundle 增加 staging、checksum、revision。
6. 网关测试不能依赖客户端字符串匹配。

### 批次 D：Android/iOS GatewayProfile

责任：两端共同维护者。

1. 引入 profile store。
2. 将 token、TLS trust、selected device 按 gateway_id 分区。
3. 改 `SessionController.changeOrigin()` 为 `switchGateway()`。
4. 同一网关改地址：保留 profile，更新 origin。
5. 不同网关：新建 profile，不清空旧 profile。
6. 旧网关不可达：保留本地记录并提示离线，不显示成空数据。
7. 认证成功后 bootstrap，再创建各业务 controller。

### 批次 E：Web 对齐

责任：Web/网关维护者。

1. Web 设备页统一 physical/hardware 与 instance 选择。
2. Web eSIM 使用统一 `aid_hex` 和 switch response。
3. Web 通知与手机共用 URL mask/secret/timeout DTO。
4. Web 登录错误与手机共用 status/detail/retry-after 语义。
5. Web 通话继续只使用 WebRTC，不接手机 PCM fallback。
6. Web 设备重命名、代理、status 路由与 mobile facade 同源。

### 批次 F：制品和现场验证

责任：发布维护者。

- Android：Gradle、Kotlin 测试、APK 安装、后台 OTP、权限拒绝、网络切换、通话 PCM。
- iOS：Flutter test、Xcode build、签名 IPA、PushKit/CallKit、后台恢复、PCM 音频。
- 网关：Linux 服务、Engine、AMI/AudioSocket、SSE revoke、真实反代链。
- Web：npm test、build、浏览器 WebRTC、麦克风拒绝、断网重连。

## 6. 必须写入测试的场景

### 源码保全测试

- 恢复分支包含所有 tracked diff。
- 两个 Android 新文件未被漏掉。
- 重新 checkout 后文件 hash 一致。
- Web/网关和手机 commit 可追溯。

### 同一网关改地址

- IP 变化，gateway_id 不变。
- 端口变化，gateway_id 不变。
- 旧 origin 不可达但新 origin 可达。
- token 失效时要求重新登录，但不删除 gateway profile。
- 设备列表、设置、通知、eSIM、短信历史不显示为空。

### 真正跨网关迁移

- source gateway A、target gateway B 的 ID 不同。
- 只导出设备配置，不导出 token。
- ICCID 相同、instance_id 不同能够正确映射。
- ICCID 不同不能自动覆盖线路。
- 同名设备和不同硬件 ID 不会误合并。
- 迁移校验失败时 staging 不影响目标现有配置。
- commit 后 Web、Android、iOS bootstrap revision 一致。

### Android

- 中文 Unicode 转义验证码。
- 英文验证码。
- 引号/换行和非验证码短信。
- Android 13/14/15 后台通知。
- update available 时无 apply 按钮。
- 版本比较 0.1.42/0.1.43。
- eSIM A→B 后 profile/policy/overview 使用 B。
- webhook draft secret/timeout 进入 test body。

### iOS

- 温后台 PushKit → CallKit → SSE → 接听。
- 冷启动 PushKit → 登录恢复 → 保留同一 call UUID。
- 网关切换/凭据撤销结束旧来电。
- SSE 与 APNs 事件乱序不丢横幅。
- 主源 PCM owner 与发布副本 SIP owner 分开验收。
- 两份 iOS 的 auth、eSIM、通知差异分别记录。

### Web

- 短信页初始化不再 ReferenceError。
- physical ID / instance ID 绑定错误不能发生。
- WebRTC 注册失败显示不可用，不回落手机 PCM。
- eSIM status/AID 路由真实存在并保持字段一致。
- 多 URL 掩码保存、替换、测试一致。
- 重命名使用实际支持的 PATCH/PUT 契约。

## 7. 已知不能宣称完成的事项

- 没有在本轮用当前手机源码重新生成 APK/IPA。
- 没有安装到真实 Android/iPhone。
- 没有执行 Kotlin OTP 测试，原因是原有证书资源缺失。
- 没有在 Windows 上执行 Xcode/iOS 构建。
- 没有启动真实 Linux 网关、Engine、AMI/AudioSocket。
- 没有发送真实短信、电话、APNs、Webhook。
- 已发布 v1.14.0 Engine 不包含后续未发布 AudioSocket、AT&T、Three HK、eap_direct 变更。
- 独立 iOS 发布副本是否等于用户安装 IPA 尚未证明。

## 8. 交付检查表

完成前必须留下：

- [ ] 手机恢复 commit。
- [ ] Android 28 个 tracked 改动和 2 个新文件均可追溯。
- [ ] iOS 主源改动与发布副本差异记录。
- [ ] 网关 identity/bootstrap/migration API 契约。
- [ ] Web、Android、iOS 共同 DTO。
- [ ] 同网关改地址测试。
- [ ] 跨网关迁移测试。
- [ ] Android 测试和 APK 结果。
- [ ] iOS 测试、签名 IPA 和真机结果。
- [ ] Web 测试和 WebRTC 结果。
- [ ] 未验证项目清单。
- [ ] 未恢复已明确取消的功能。

## 9. 参考材料

- [14–15 日安卓与苹果改动记录](E:/GQ/Ultra/mdd-sim-gateway/docs/design/2026-10-15-ios-android-our-changes.md)
- [源码改动恢复与 Web 对齐方案](E:/GQ/Ultra/mdd-sim-gateway/docs/design/2026-10-15-mobile-source-change-recovery-plan.md)
- [Android 全量审查](E:/GQ/Ultra/mdd-sim-gateway/.xj-cursor/audit-20261015-android.md)
- [iOS 全量审查](E:/GQ/Ultra/mdd-sim-gateway/.xj-cursor/audit-20261015-ios.md)
- [Android API 清单](E:/GQ/Ultra/mdd-sim-gateway/.xj-cursor/audit-20261015-android-api-inventory.txt)
- [iOS API 清单](E:/GQ/Ultra/mdd-sim-gateway/.xj-cursor/audit-20261015-ios-api-inventory.txt)
- [Android/iOS/Web 全盘审查交接](E:/GQ/Ultra/mdd-sim-gateway/docs/design/2026-10-15-full-audit-grok-handoff.md)
- [10 月 14 日产品边界交接](E:/GQ/Ultra/mdd-sim-gateway/docs/design/2026-10-14-final-check-handoff.md)

