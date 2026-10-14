# Android / iOS 源码改动恢复与 Web 对齐方案

## 1. 结论先行

本次丢失的是**未提交的源码工作区改动**，不是网关 API 自动删除了手机数据。当前已经核对到：

- Android / iOS 源码位于 `E:\GQ\Ultra\NEWWIFI`，分支 `master`，基线提交 `1b26d70`。
- 手机改动仍在该工作区的未提交 diff 中：Android、iOS 及测试文件共 33 个已修改文件，另有 2 个 Android 新文件。
- Web / 网关位于 `E:\GQ\Ultra\mdd-sim-gateway`，是独立工作区和分支，不能通过切换网关地址自动带回手机源码。
- 上一轮审查没有修改业务源码，只写了审查和交接文档；因此不能把审查报告当作已完成的手机补丁。

恢复原则：先冻结并保存当前手机 diff，再按共享 API 契约恢复 Android/iOS，最后让 Web 使用同一套网关契约。不要在未保存 diff 前切分支、重置、重新拉取或覆盖 `NEWWIFI`。

## 2. 当前已经改过的源码

### Android 与 iOS 共同改动

1. **通知地址编辑与保存**
   - `E:\GQ\Ultra\NEWWIFI\apps\android\lib\features\settings\domain\gateway_settings.dart`
   - `E:\GQ\Ultra\NEWWIFI\apps\android\lib\features\settings\data\settings_dto.dart`
   - `E:\GQ\Ultra\NEWWIFI\apps\android\lib\features\settings\presentation\settings_notify_sheet.dart`
   - iOS 对应目录同名文件
   - 行为：多 URL 一行一个；掩码 URL 与明文混合时拒绝不安全保存；Webhook 测试携带 `secret` 和 `timeout_ms`。

2. **鉴权错误契约**
   - `lib/core/http/http_transport.dart`
   - `lib/core/state/state_failure.dart`
   - 行为：按 HTTP 状态处理 `{detail}`；401、429、503 不再被误判为协议错误；原始 detail 不直接作为界面文案。

3. **eSIM 切卡后的身份重绑定**
   - `lib/features/esim/domain/esim.dart`
   - `lib/features/esim/data/esim_api.dart`
   - `lib/features/esim/state/esim_controller.dart`
   - `lib/app/android_oneims_shell.dart`
   - 行为：保留后端返回的 `device_id`、`reader_id`；切到不同设备后刷新设备列表并进入新设备；失败不重绑旧线路。

4. **对应测试**
   - `test/app/devices_flow_test.dart`
   - Android 另有 `test/features/esim/state/esim_controller_test.dart`
   - Android HTTP 错误测试：`test/core/http/http_transport_test.dart`

### Android 独有改动

1. **后台验证码解析**
   - 新增 `E:\GQ\Ultra\NEWWIFI\apps\android\android\app\src\main\kotlin\com\oneims\onewifi\SmsCodeExtractor.kt`
   - 新增 `...\RemoteOtpWireEventTest.kt`
   - 修改 `RemoteOtpService.kt`
   - 行为：先解 JSON，再提取验证码，兼容中文 Unicode 转义。
   - 当前限制：Kotlin 测试因原有 `raw/gateway_selfsigned` 资源缺失未运行，不得标记为完整通过。

2. **隐藏网关 apply 更新按钮**
   - `lib/features/settings/presentation/settings_screen.dart`
   - 保留检查更新和 APK 下载；网关 `apply` 继续拒绝。

3. **APK 版本显示修正**
   - `lib/features/settings/domain/gateway_settings.dart`
   - `test/features/settings/state/settings_controller_test.dart`
   - 从 `0.1.41` 对齐到 `pubspec.yaml` 的 `0.1.42`。

### iOS 独有改动

1. **后台 VoIP 来电事件流恢复**
   - `E:\GQ\Ultra\NEWWIFI\apps\ios\ios\Runner\Calls\CallKitCoordinator.swift`
   - 推送来电上报后重开事件流；同一网关首次恢复登录时不清除尚未绑定的来电；网关切换或会话撤销仍清理旧来电。

2. **短信 SSE 与 APNs 送达游标分离**
   - `lib/features/sms/state/remote_otp_controller.dart`
   - SSE 只推进本地读取游标，不代替 APNs 的送达确认。

## 3. 还没有完成、必须重新补回的源码改动

这些不是“已经丢失的旧补丁”，而是下一阶段必须实现的工作。

### P0：源码保存与恢复机制

1. 将当前手机工作区建立专用恢复分支，例如 `mobile-recovery-20261015`。
2. 将 Android/iOS 的已修改文件和 Android 新文件纳入一次提交或补丁包。
3. Web/网关使用独立分支保存，不允许用切换网关地址代替 Git 分支切换。
4. 每次交付记录四项：基线 commit、手机 commit、网关 commit、构建产物版本。
5. 后续操作前必须先执行 `git status --short` 和 `git diff --stat`，确认没有未保存改动。

建议保存顺序：

```powershell
Set-Location E:\GQ\Ultra\NEWWIFI
git status --short
git diff --stat
git switch -c mobile-recovery-20261015
git add apps/android apps/ios
git commit -m "chore: preserve Android and iOS gateway contract changes"
```

如果暂时不允许提交，至少把 `git diff --binary` 和两个 Android 新文件保存为外部补丁；不能只复制已跟踪文件，因为新文件不会出现在普通 `git diff` 中。

### P1：新增网关切换的源码保护

当前 Android/iOS 的 `SessionController.changeOrigin()` 会：

- 取消所有请求；
- 清理会话资源；
- 清理旧、 新网关 token；
- 写入单一的 `service_origin`；
- 销毁当前控制器。

这对“注销”是合理的，但对“更换网关地址/切换工作区”不够。需要新增 `GatewayProfile`，至少保存：

- `gateway_id`
- 当前 `origin`
- 显示名称
- 最后连接时间
- 对应 token 引用
- 最近选中的 `hardware_id`、`instance_id`、ICCID
- 迁移状态和 schema 版本

改造范围：

- Android：`lib/core/config/base_url_store.dart`、`lib/features/auth/state/session_controller.dart`、`lib/core/security/secure_token_store.dart`、`lib/app/session_gate.dart`
- iOS：对应同名文件
- 不再用单一 `service_origin` 覆盖所有状态。
- `instance_id` 只允许在当前网关内部使用；跨网关必须按 ICCID、IMEI、reader serial 或稳定硬件身份重新绑定。
- 切换失败时保留旧网关 profile，不能清空旧 profile、旧选择、旧缓存。
- token 不跨网关复制；同一网关只是地址变化时，重新认证或经身份确认后恢复；不同网关必须重新登录。

## 4. 与 Web 端同步的正确方式

Web 不应从 Android/iOS 读取数据，Android/iOS 也不应复制 Web 的本地状态。三端都以网关 API 为唯一权威。

### 网关新增统一身份接口

建议新增或扩展：

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

`gateway_id` 必须在同一网关改 IP、改端口、重启后保持不变；只有重新安装且没有恢复数据时才生成新的 ID。

### 三端统一 bootstrap 契约

建议统一使用：

```text
GET /api/mobile/v1/bootstrap
```

或将同样的数据并入 Web 使用的 dashboard/bootstrap API。返回内容至少包括：

- 网关身份和 API/schema 版本
- 设备列表及 `hardware_id` / `instance_id` / `reader_id`
- ICCID、IMSI、线路名称和能力
- 通知配置摘要，敏感字段继续掩码
- eSIM 当前目标和可用 profile 摘要
- 自动任务和设置的 revision
- 需要重新认证、重新绑定或重新同步的原因

Android、iOS、Web 都消费同一 DTO，不在各端复制字段和猜测 ID。

### 网关迁移接口

如果是“旧网关换成新网关”，仅切换 URL 无法恢复旧网关数据库，必须有明确的导出/导入：

```text
POST /api/gateway/migration/export
POST /api/gateway/migration/prepare
POST /api/gateway/migration/commit
```

可迁移内容：

- 设备/线路配置、名称、ICCID/IMEI/reader 映射
- eSIM 策略和 profile 元数据
- 通知配置、Webhook 多 URL、任务配置
- 联系人、短信/MMS 历史和必要的调用历史，可按用户选择迁移
- Web 与手机都使用的用户偏好

不可直接迁移：

- bearer token、Cookie、CSRF、TLS pin
- 正在进行的通话、SSE 游标、临时状态
- 仅代表旧网关当前硬件状态的 observed 数据
- 不能确认归属的 instance_id

迁移包必须带版本、来源 gateway_id、目标 gateway_id、checksum、创建时间和一次性 nonce。敏感 secret 不应以明文导出；优先由旧网关到新网关建立一次性授权通道，次选是端到端加密迁移包。

## 5. Web 端需要同步的现有问题

源码恢复后，以下 Web/API 问题仍需与手机共同对齐：

1. 设备物理 ID 与线路 instance ID 混用：Web、Android、iOS 统一稳定身份模型。
2. eSIM `aid_hex` / `aidHex` 命名和切卡返回字段统一。
3. 通知多 URL 的掩码往返规则统一，不能让 Web 能保存而手机保存失败，或反过来。
4. Webhook 测试统一提交 `urls + secret + timeout_ms`。
5. 登录失败统一保留 HTTP status、detail、429 retry-after。
6. Web 通话继续只走 PJSIP/WebRTC；手机继续走规定的 AudioSocket PCM，不互相复制媒体实现。
7. Web 设备重命名、代理管理和 `/status` 路由必须与手机调用的网关契约一致。

## 6. 推荐执行批次

### 批次 A：保全源码

- 冻结当前工作区。
- 保存 Android/iOS diff 和两个新 Android 文件。
- 建恢复分支并提交。
- 记录当前 Web/网关分支和 commit。

### 批次 B：恢复已完成手机改动

- 先恢复通知、鉴权错误、eSIM 切卡三组共同改动。
- 再恢复 Android OTP、更新按钮/版本。
- 再恢复 iOS CallKit/SSE 改动。
- 运行静态检查和对应 Dart 测试；Kotlin/Xcode 缺环境要明确记录。

### 批次 C：新增网关 profile

- 加 `gateway_id` 和 profile 列表。
- 改 origin 切换，不再删除全部本地状态。
- 做同网关改地址、不同网关、旧网关不可达三条路径。

### 批次 D：统一 Web/API

- 后端先冻结 identity/bootstrap/migration DTO。
- Web、Android、iOS 按同一 DTO 改适配器。
- 用不同的物理 ID、线路 ID、ICCID fixtures，禁止用相同字符串测试掩盖错误。

### 批次 E：真实验收

- 同一网关改 IP/端口：登录状态、设备列表、设置、eSIM、短信历史不能丢。
- 旧网关迁移到新网关：迁移前后设备/线路/通知/任务/历史按选择保留。
- Web 改动后，手机重新 bootstrap 得到同一份配置；手机修改后 Web 刷新得到同一份配置。
- Android 后台 OTP、iOS 冷/温后台来电、真实 Engine、签名 APK/IPA 单独验收。

## 7. 禁止事项

- 不要把未提交 diff 当成已经交付。
- 不要用复制整个 `shared_preferences` 或 Secure Storage 解决跨网关迁移。
- 不要复制 bearer token 到新网关。
- 不要把旧 `instance_id` 直接写入新网关。
- 不要为了让 Web/手机“看起来有数据”而伪造设备、短信或通话状态。
- 不要恢复已经明确取消的网关 apply、强制刷新、FCM、Telegram 回复机器人等功能。

## 8. 最终交付物

Grok 或后续执行者完成后必须留下：

1. 手机恢复分支及 commit。
2. 网关/Web 对应 commit。
3. API DTO/路由变更清单。
4. Android、iOS、Web 各自测试结果。
5. 同网关改地址和跨网关迁移两套验收记录。
6. 未能在 Windows 或无真机环境验证的项目清单。

