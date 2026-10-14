# OneWIFI → MDD 收敛推进书（五窗口并行）

> 版本：2026-10-14  
> 目的：把剩余未闭环项拆成五个互不覆盖的窗口，按验收证据推进到“代码冻结”。  
> 当前主责：本窗口负责 **Android**；其它窗口由用户另开并按本文边界执行。

## 0. 总原则（五个窗口都必须遵守）

1. 只允许修改：
   - `E:\GQ\Ultra\mdd-sim-gateway`
   - `E:\GQ\Ultra\ONEWIFI\IOS`
   - `E:\GQ\Ultra\ONEWIFI\android`
2. `E:\GQ\Ultra\NEWONE` 永远只读，不运行、不修改、不部署。
3. MDD 是唯一控制面和唯一 SIM 持有者；不得把 OneWIFI 部署成第二网关。
4. 不用 mock、静态 grep、合成预览冒充真实登录、读卡、IMS、通话、短信或 eSIM 验收。
5. 不提交、不推送、不部署、不发真实通知、不拨真实电话，除非用户另行明确授权。
6. 每个窗口只改自己的文件范围；发现跨窗口契约问题，先写报告和测试，不直接改他窗文件。
7. 每个结论必须有可复跑命令、时间、输入、输出、制品路径和 SHA-256。失败必须写明原因，不能把 BLOCKED 写成 PASS。

## 1. 五窗口分工与不重叠边界

| 窗口 | 责任板块 | 允许修改范围 | 主要交付物 | 不负责 |
|---|---|---|---|---|
| W1（本窗口） | **Android：证书、APK/JVM、SIP/晚注册接听** | `E:\GQ\Ultra\ONEWIFI\android`；Android 证据只写 MDD `docs/onewifi-migration` | `android-final-evidence.json`、`android-kotlin-final-evidence.json`、APK 哈希、Android 报告 | iOS、后端业务逻辑、真实 SIM 验收 |
| W2 | MDD/Gateway 回归与接口契约 | `mdd-sim-gateway` 后端、测试、契约文档 | 2097+ 全量回归、端点/契约差异清单 | Android 原生实现、iOS UI |
| W3 | iOS 原生构建与 CallKit/PushKit | `ONEWIFI/IOS` | Flutter/analyzer、Xcode/Swift/真机结果；缺环境则 BLOCKED | Android、后端 |
| W4 | 运行时/远端主机/硬件门 | MDD 运行配置、运行证据文档；不得改 NEWONE | MDD 实际启动、reader/SIM/IMS/通话短信 eSIM 证据 | 移动端源码大改 |
| W5 | 终审、跨仓审计、制品封存 | 仅审计脚本和 `docs/onewifi-migration` 证据 | final-audit、契约审计、最终哈希、冻结清单 | 修复别的窗口代码 |

### 并行协议

- W1/W2/W3 可并行；W4 只能在后端端点和安全凭据准备后执行；W5 等 W1–W4 的最新 receipt 再终审。
- 任何窗口修改公共契约（路径、字段、错误码、SIP dialog/engine call ID 规则）必须在 `mobile-contract.md` 或对应契约文件留下变更记录，并通知其它窗口。
- 不要互相 reset/stash/覆盖未提交修改。每个窗口结束时记录 `git diff --name-only` 和状态快照。

## 2. W1 Android 详细执行单（本窗口）

### 2.1 目标顺序

1. 让 `gateway_selfsigned` 使用远端真实 HTTPS 证书，完成资源链接。
2. 修复 Android JVM 当前已暴露的 2 个真实失败，不改变生产契约：
   - `CallCoordinatorTest.residentDeclineCancelsLeaseWithoutSendingEngineIdAsSipDialog`
   - `CallTransportTest.cancellationBeforeIoResultIsDeliveredReleasesTheUnclaimedStream`
3. 跑完整 Kotlin/JVM 测试，生成 receipt。
4. 组装 debug APK，记录 APK 路径、大小、SHA-256；不得假称已签名发布。
5. 跑 Android Flutter/analyzer 与跨端 source parity。
6. 复核 Android SIP-only 路径和晚注册接听设计；没有安全实现就保持 BLOCKED，不强行接线。

### 2.2 已知输入和当前基线

- Android 工程：`E:\GQ\Ultra\ONEWIFI\android\android`
- 真实证书资源：`android/app/src/main/res/raw/gateway_selfsigned`（无扩展名，PEM）
- 资源证书必须匹配实际网关证书；禁止生成假证书、禁止放宽 TLS。
- 当前资源处理已成功；当前 JVM 仍有 109 项中 2 项失败。先复现并读 XML/stacktrace，再改代码。

### 2.3 分步命令

在 PowerShell 中执行：

```powershell
$root = 'E:\GQ\Ultra\ONEWIFI\android'
$android = Join-Path $root 'android'
$diag = Join-Path $root 'build\mdd-jdk-diag'
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot'
$env:JAVA_TOOL_OPTIONS = "-Djdk.net.unixdomain.tmpdir=$diag"
Set-Location $android

# 1) 资源门
.\gradlew.bat :app:processDebugResources --offline --no-daemon --console=plain

# 2) 先跑两个失败的定向测试（保留 stacktrace）
.\gradlew.bat :app:testDebugUnitTest --offline --no-daemon --console=plain `
  --tests 'com.oneims.onewifi.calls.CallCoordinatorTest.residentDeclineCancelsLeaseWithoutSendingEngineIdAsSipDialog' `
  --tests 'com.oneims.onewifi.calls.CallTransportTest.cancellationBeforeIoResultIsDeliveredReleasesTheUnclaimedStream' `
  --stacktrace

# 3) 全 Kotlin/JVM
.\gradlew.bat :app:testDebugUnitTest --offline --no-daemon --console=plain

# 4) APK（资源链接成功后才执行）
.\gradlew.bat :app:assembleDebug --offline --no-daemon --console=plain

# 5) Android Flutter/analyzer 与 Kotlin receipt
Set-Location $root
python ..\mdd-sim-gateway\docs\onewifi-migration\run-kotlin-final.py
python ..\mdd-sim-gateway\docs\onewifi-migration\run-mobile-final.py android
```

> 若 `run-kotlin-final.py` 的相对路径在当前环境不适配，改用绝对路径；不要改脚本逻辑来掩盖失败。

### 2.4 两个 JVM 失败的修复原则

#### A. Resident decline 双取消

- 先确认失败断言是否为 `api.cancelled.size == 1`。
- `CallCoordinator.hangup()` 和 `finish()` 目前都可能调用 `cancelPending`；必须保证一次用户拒绝只产生一个取消请求。
- 修复必须同时保持：
  - 不把 MDD engine call ID 当 SIP dialog 发送 `hangup`；
  - `close()` 仍能取消尚未处理的 resident lease；
  - 重复 terminal/重复 hangup 幂等。
- 先加/保留回归断言，再做最小状态清理或一次性标记，不重写 coordinator。

#### B. NativePcmSession 取消时释放未认领音频流

- 读取 XML/stacktrace，确认失败的是“未播放”还是“设备未关闭”。
- 追踪 `NativePcmSession.open()` 的 `unclaimed`、`withContext(Dispatchers.IO)`、WebSocket listener、`close()` 和 coroutine cancellation 的先后关系。
- 目标：调用方在 IO 结果交付前取消时，已创建但尚未返回的 `PcmDevice` 必须关闭；不能泄漏 reader/writer/socket 线程。
- 只做最小修复，保持正常 answer/capture/mute/close 行为和现有 WebSocket 协议不变。

### 2.5 晚注册接听：只实现安全链路，不做伪完成

只有同时满足以下条件才可把该项标为 PASS：

1. native `/ws` 已认证连接 MDD，并处理首连/重连；
2. 读取 `/api/instances/{iid}/calls` 做 history reconciliation；
3. `(instance_id, engine_call_id)` 唯一去重，native UUID 与 SIP dialog 分离；
4. OS UUID reservation 在用户操作前只保留来电，不自动 pickup；
5. 用户 answer 后取得 receipt，再调用 Dart `SipDialogRegistry` / `SipCallService.pickup`；
6. logout、generation、terminal、wrong-line、重传、乱序均有测试；
7. 有真实 MDD 运行端点和设备证据。

缺任一项就保留 `BLOCKED`，更新 `android-resident-pickup-implementation-report.md`，不得声称“杀进程后来电已接通”。

### 2.6 Android 验收账本

| 验收项 | 状态起点 | PASS 证据 | 当前判定规则 |
|---|---|---|---|
| `gateway_selfsigned` 资源 | 已过资源门 | Gradle `processDebugResources` 成功 + cert hash 对照 | 证书不匹配即 FAIL |
| Android JVM 109 项 | 2 失败 | Gradle 全量 0 failures/errors | 任何失败不得绿灯 |
| APK debug 组装 | 未确认 | `assembleDebug` 成功 + APK SHA-256 | 不等于签名/真机 |
| Flutter/analyzer | 892 通过 | 新 receipt | analyzer warning 不能冒充错误 |
| SIP-only 呼叫状态 | 已有单测 | Kotlin focused tests + source parity | 不等于真实通话 |
| 晚注册 pickup | BLOCKED | 端到端 MDD/OS/receipt 证据 | 无真实链路保持 BLOCKED |
| 真机来电/去电/短信 | NOT RUN | 实机与授权号码日志 | 无设备保持 NOT RUN/BLOCKED |

### 2.7 W1 结束时必须写入的文件

- `docs/onewifi-migration/android-report.md`：新增本轮命令、时间、PASS/FAIL/BLOCKED。
- `docs/onewifi-migration/android-final-evidence.json`：只由脚本生成，不手改结果数字。
- `docs/onewifi-migration/android-kotlin-final-evidence.json`：包含测试总数、失败数、跳过数、APK/资源证据。
- `docs/onewifi-migration/android-resident-pickup-implementation-report.md`：如仍未实现，明确阻塞原因和下一步。
- `docs/onewifi-migration/STATE_VERSION.tsv`：记录新文件哈希和来源。

## 3. 其它四窗口的最小交付清单

### W2：Gateway/MDD 回归

- 重跑 `run-backend-final.py` 和 `verify-final-evidence.py`。
- 审计 auth、calls、SMS/MMS、reader、eSIM、APNs、typed settings/telemetry、Asterisk consumer。
- 对 AT&T/Three HK 只做 fail-closed gap，不做无证据半实现。
- 交付：`backend-final-evidence.json`、`backend-report.md`、端点契约差异表。

### W3：iOS

- 跑 Flutter/analyzer；有 Mac 才跑 Xcode/Swift/XCTest、签名安装、CallKit/PushKit。
- 检查生产路径无旧 OneWIFI/SSE/PCM fallback。
- 无 Mac/设备时明确 `BLOCKED/NOT RUN`，不把 Flutter 单测写成真机通过。

### W4：远端运行时

- 仅在用户明确授权后操作远端；先备份配置、列出容器/端口/证书/设备状态。
- 启动 MDD 唯一控制面，确认没有 OneWIFI 第二网关占用 SIM。
- 逐项记录真实登录、读卡、IMS、主叫/被叫、短信、eSIM/APNs；失败保留原始日志。
- 不因有 `8.137.155.86:1818` 就虚构已接入 MDD；当前主机没有现成 MDD 运行态时必须先部署前置和回滚方案。

### W5：终审与封存

- 读取 W1–W4 最新 receipts，不采信口头 PASS。
- 复核源→生成→安装→运行四面一致、SHA-256、跨仓契约、六字真言（真实、可复现、可回滚、可解释、可观测、可审计）。
- 输出 `final-audit-latest.md`：PASS/FAIL/BLOCKED/NOT RUN ledger、P0/P1/P2、上线与回滚结论。

## 4. 冻结门（全部满足才可称“代码冻结”）

1. W1 Android 资源、JVM、APK、Flutter receipt 均为最新且可复跑。
2. W2 后端全量回归为 0 failures/errors，且无模块排除。
3. W3 iOS 共享契约和生产路径通过；真机缺失则明确阻塞。
4. W4 真实运行项逐项有日志；未具备硬件/号码的项目明确 NOT RUN，不得包装。
5. W5 独立终审没有未处理 P0/P1；所有阻塞都有责任边界和回滚方案。

## 5. 窗口交接格式

每个窗口只需贴以下格式，避免长篇口头汇报：

```text
窗口：W1/W2/W3/W4/W5
完成度：按验收项（例如 4/7），不按文件数
本轮实际修改：绝对路径列表
测试命令与结果：命令、时间、pass/fail/error/skip
制品与哈希：路径、SHA-256
阻塞：硬件/凭据/环境/实现，写明复现证据
下一步：一个可执行动作
```

## 6. W1 当前执行状态（本窗口维护）

- `gateway_selfsigned`：PASS。资源文件使用远端实际 443 leaf，DER SHA-256 为 `f87cd8d79fddf38c4be74a368005baad455bb17c6693f3cf867c25d50b5d6f5c`；没有生成假证书或放宽 TLS。
- Android JVM：PASS。`109 tests / 0 failures / 0 errors / 0 skipped`。
- Android debug APK：PASS（仅组装）。`E:\GQ\Ultra\ONEWIFI\android\build\app\outputs\apk\debug\app-debug.apk`，SHA-256 `e210cbd3b4a0f335b8ef1a8d0d81b07a494d13cba96ddb6b5b610a20e1003098`。
- Flutter/analyzer：PASS。`892 tests`，analyzer exit 0。
- 晚注册 pickup：软件 slice `PASS`（已接 `/ws`、history、UUID lease、receipt、SIP bind）；真机 Telecom、MDD live、Doze/被杀进程恢复仍为 `BLOCKED/NOT RUN`，不能用软件证据替代。
- 真机安装、MDD 登录、SIM/IMS、SIP fork/pickup、短信、APNs：仍为 `BLOCKED/NOT RUN`。
- 结构化证据：`E:\GQ\Ultra\mdd-sim-gateway\docs\onewifi-migration\android-jvm-apk-evidence.json`。

