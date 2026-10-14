# OneWIFI → MDD 统一融合交接文档

**交接对象：** Grok 或下一位执行代理  
**交接日期：** 2026-10-14（Asia/Shanghai）  
**当前结论：** 软件源冻结账本约 90% 通过；完整发布验收仍为 **FAIL**。  
**工作目录限制：** 只能读写下列三个可改工程；`NEWONE` 永远只读。

- MDD 后端 / OneBoard：`E:\GQ\Ultra\mdd-sim-gateway`
- iOS：`E:\GQ\Ultra\ONEWIFI\IOS`
- Android：`E:\GQ\Ultra\ONEWIFI\android`
- 只读参考：`E:\GQ\Ultra\NEWONE`

---

## 1. 先读什么

接手后先按下面顺序阅读，不要从旧报告或旧测试数字开始推断：

1. `E:\GQ\Ultra\mdd-sim-gateway\docs\onewifi-migration\MIGRATION_SPEC.md`
2. `E:\GQ\Ultra\mdd-sim-gateway\docs\onewifi-migration\CONSTRAINTS.md`
3. `E:\GQ\Ultra\mdd-sim-gateway\docs\onewifi-migration\RULEBOOK.md`
4. 本文件
5. `final-audit-latest.md`
6. `GAP_INVENTORY.md`
7. `RUNTIME_EVIDENCE.md`
8. `backend-final-evidence.json`
9. `ios-final-evidence.json`
10. `android-final-evidence.json`
11. `android-kotlin-final-evidence.json`
12. `source-evidence-freeze.json` 与 `source-evidence-checkpoint.json`

`final-audit.md` 已被刷新为当前终审版本；如果其他旧报告仍写着 Android 891、Analyzer 1 或 resident pickup 未实现，应以最新 receipt 和 `final-audit-latest.md` 为准。

---

## 2. 架构不变量

运行中的控制面必须只有 MDD：

```text
iOS App / Android App / OneBoard
          |
          v
MDD control（唯一控制面）
  ├─ auth / devices / reader / SIM / IMS / VoWiFi
  ├─ SMS / MMS
  ├─ call control / WebRTC / JsSIP / SIP
  ├─ eSIM / notification / APNs / QMI state
  └─ engine lifecycle
          |
          +─ MDD engine：每条线路的 IMS、注册、媒体
          +─ Asterisk / carrier consumer（只能由 MDD engine 消费）
```

必须保持以下关系：

- SIM、读卡器、IMS、VoWiFi、短信和通话归 MDD 独占。
- 手机继续使用既有界面、iOS CallKit/PushKit/Live Activity 和 Android 原生来电/通知；只换数据来源和呼叫控制入口。
- 手机通话使用 MDD authenticated WSS + SIP/WebRTC；旧 SSE/PCM 代码即使仍在树中，也不能被生产 `AndroidCallHost` 或 iOS 生产路径实例化。
- Engine 由 MDD control 创建，不能手写每张卡的 Engine。
- `engine_call_id`、SIP dialog ID、OS call UUID、mobile operation UUID 必须分开；任何跨身份猜测都应 fail-closed。
- `NEWONE` 只是能力来源和只读参考，禁止部署、运行、修改或把它作为第二套网关。

---

## 3. 已完成并有证据的部分

### 3.1 MDD 后端

最新直接 WSL 回归：

- **2097 tests discovered**
- **0 failures**
- **0 errors**
- **1 skipped**（已知 Linux Node skip）
- 用时约 276.610 秒
- 没有模块排除

证据：

- `E:\GQ\Ultra\mdd-sim-gateway\docs\onewifi-migration\backend-final-regression.log`
- `E:\GQ\Ultra\mdd-sim-gateway\docs\onewifi-migration\backend-final-evidence.json`
- `E:\GQ\Ultra\mdd-sim-gateway\docs\onewifi-migration\backend-report.md`

后端 receipt 绑定的直接命令是：

```powershell
wsl --cd /mnt/e/GQ/Ultra/mdd-sim-gateway --exec env PYTHONDONTWRITEBYTECODE=1 TMPDIR=/tmp MDD_DATA=/tmp/mdd-full-final-logged LD_LIBRARY_PATH=/mnt/e/GQ/Ultra/mdd-sim-gateway/docs/onewifi-migration/linux-pcsc/extracted/usr/lib/x86_64-linux-gnu /mnt/e/GQ/Ultra/mdd-sim-gateway/.venv-linux/bin/python docs/onewifi-migration/run-current-regression.py
```

Windows wrapper 的 `linux-tmp` guard 可能因为 DrvFS 临时目录非空而拒绝运行。只要源代码没有变化，不要重复跑同一个失败 wrapper；如果需要新鲜后端证据，使用 receipt 中记录的 WSL 命令，并记录日志和 SHA256。

已修复并覆盖的后端问题包括：

- terminal-before-start、乱序、重传、重复事件
- APNs VoIP topic
- eSIM physical ICCID 验证、补偿、reader alias reservation、取消和 terminal commitment
- OneTools canonical settings 与 false-save
- typed settings / telemetry
- SOCKS ePDG DNS ECS：EDNS0 option 8、IPv4/IPv6、无 ECS、非法 ECS、真实 SOCKS UDP 报文
- MDD mobile auth、history、pickup receipt、revocation/close contract

### 3.2 OneBoard

现有 OneBoard 在 MDD WebUI 内，不是第二套网关：

- Node tests：22/22
- Vite build：通过
- 保留 MDD 原生页面和 JsSIP
- 已有通知/APNs 设置表单、错误态和中文翻译
- 合成预览只能算视觉证据，不能算 live provider/auth/runtime 验收

receipt：

- `E:\GQ\Ultra\mdd-sim-gateway\docs\onewifi-migration\oneboard-final-evidence.json`

### 3.3 iOS

最新 Flutter 证据：

- 1086 tests passed
- 0 failures/errors
- analyzer exit 0
- MDD SIP background answer/cancel focused tests：4/4

涉及的生产路径包括：

- MDD auth、device、reader、SMS、eSIM、settings API
- authenticated WSS + SIP/WebRTC
- CallKit/PushKit bridge
- exact dialog / UUID cancellation
- legacy SSE/PCM fallback fail-closed

证据：

- `E:\GQ\Ultra\mdd-sim-gateway\docs\onewifi-migration\ios-final-evidence.json`
- `E:\GQ\Ultra\mdd-sim-gateway\docs\onewifi-migration\ios-report.md`

Windows 环境没有 Xcode、Swift toolchain、签名设备，因此下面仍然是 NOT RUN：Swift/XCTest、安装、PushKit/CallKit 真机回调、APNs 投递、WebRTC 音频。

### 3.4 Android

当前 Flutter 证据：

- 892 tests passed
- 0 failures/errors
- analyzer exit 0

当前 native 证据：

- Kotlin compile exit 0
- 73 tasks
- 216 class artifacts
- resident pickup focused tests：12/12

已完成的 resident 软件切片：

- authenticated MDD `/ws`
- `/api/instances/{iid}/calls` history reconciliation
- `(instance_id, engine_call_id)` 唯一 pending identity
- native OS UUID 与 SIP dialog 分离
- 用户 answer 后才取 pickup receipt
- `answered` 但没有 `end_ts` 时保持 active，不伪造结束时间
- SIP active 与 resident answered 合并去重
- close/logout/generation 清理
- pending resident call 不误发 engine ID 给 SIP hangup

证据：

- `E:\GQ\Ultra\mdd-sim-gateway\docs\onewifi-migration\android-final-evidence.json`
- `E:\GQ\Ultra\mdd-sim-gateway\docs\onewifi-migration\android-kotlin-final-evidence.json`
- `E:\GQ\Ultra\mdd-sim-gateway\docs\onewifi-migration\android-resident-pickup-implementation-report.md`
- `E:\GQ\Ultra\mdd-sim-gateway\docs\onewifi-migration\android-report.md`

### 3.5 契约和证据状态

最新 source checkpoint：

- MDD / iOS / Android 相对 freeze 的源漂移：0
- shared `mdd_mobile_contract.dart` parity：通过
- shared `sip_call_service.dart` parity：通过
- ASGI fixtures：11/11
- `verify-final-evidence.py`：exit 0
- 三仓 `git diff --check`：exit 0

验证命令：

```powershell
python E:\GQ\Ultra\mdd-sim-gateway\docs\onewifi-migration\verify-final-evidence.py
python E:\GQ\Ultra\mdd-sim-gateway\docs\onewifi-migration\record-source-evidence.py --label checkpoint
```

如果源代码、receipt 输入或证书状态没有变化，不要因为旧报告数字重复跑全量回归。

---

## 4. 当前未完成项和实际阻塞

### P1：Android `gateway_selfsigned` 缺失

当前 `network_security_config.xml` 引用：

```xml
<certificates src="@raw/gateway_selfsigned" />
```

实际路径：

`E:\GQ\Ultra\ONEWIFI\android\android\app\src\main\res\xml\network_security_config.xml`

目标资源路径：

`E:\GQ\Ultra\ONEWIFI\android\android\app\src\main\res\raw\gateway_selfsigned`

当前 `raw` 目录只有 `aliyun_activation.crt`。在四个允许工程和 Android Git 历史中都没有找到原始 `gateway_selfsigned`。

已经观察到的真实构建失败：

```text
Task :app:processDebugResources FAILED
AAPT: error: resource raw/gateway_selfsigned not found
```

日志：

`E:\GQ\Ultra\ONEWIFI\android\build\mdd-jdk-diag\unit-apk.log`

正确处理顺序：

1. 从受信来源取得与 MDD HTTPS 端点对应的原始公钥证书。
2. 核对 SHA256、subject、issuer、SAN、有效期和 MDD endpoint 绑定。
3. 按 Android raw resource 规则放入目标路径，保留原始内容，不改名成假证书。
4. 先跑 `:app:processDebugResources`，再跑 JVM tests 和 APK assemble。
5. 把证书 SHA256、构建日志、APK SHA256 写入新的 receipt。
6. 如果拿不到证书，继续保持 BLOCKED；禁止生成自签测试证书替代生产锚点，禁止删除该 trust anchor，禁止放宽 TLS。

构建命令（证书获得后才运行）：

```powershell
cd E:\GQ\Ultra\ONEWIFI\android
$env:JAVA_HOME='C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot'
$env:JAVA_TOOL_OPTIONS='-Djdk.net.unixdomain.tmpdir=E:\GQ\Ultra\ONEWIFI\android\build\mdd-jdk-diag'
.\gradlew.bat :app:processDebugResources --offline --no-daemon --console=plain
.\gradlew.bat :app:testDebugUnitTest --offline --no-daemon --console=plain
.\gradlew.bat :app:assembleDebug --offline --no-daemon --console=plain
```

之后才可以检查：

```powershell
adb devices -l
adb install -r <实际构建出的 APK>
```

### P1：远端 SSH 指纹冲突

目标：`8.137.155.86:1818`。用户曾提供账号和密码，但密码不应写入文档、脚本或日志。

第一次连接发生 host key mismatch：

- 新 ED25519 指纹：`SHA256:aCczQdbDa7WCjRR8PGzL7HpBq/gpFmY0o/E+//krOpY`
- 当前 known_hosts 旧指纹：`SHA256:UCsIToi7JUllVbBmlb8X5ggtsEy+tARcTTfj0fG81a8`

处理规则：

1. 通过可信的主机管理渠道核验新指纹。
2. 只在核验通过后更新对应 known_hosts 条目。
3. 使用严格 host key checking 重新连接。
4. 先做只读预检，禁止一上来覆盖远端目录。
5. 未核验前禁止 `StrictHostKeyChecking=no`、禁止删除旧 key 后盲目接受、禁止部署。

核验后只读预检示例：

```powershell
ssh -p 1818 -o StrictHostKeyChecking=yes TTFN@8.137.155.86 "hostname; uname -a; id; command -v docker || true; command -v pcsc_scan || true; command -v qmicli || true; command -v mmcli || true; ls -la"
```

部署前必须确认远端目录、备份策略、监听端口、服务管理方式和回滚方式。部署动作虽然曾被用户授权过，但 host key 未核验前仍然不能做。

### P1：真实 MDD / reader / SIM / IMS / mobile 验收

当前 `adb devices -l` 为空，Windows 没有 Xcode，且没有可确认的 MDD origin、读卡器、SIM、IMS 注册状态、授权号码或签名设备。

因此以下都必须重新实测，不能用 Flutter、Kotlin、Node、mock 或静态 grep 代替：

1. MDD 登录和 token/capability。
2. 设备和线路列表。
3. 读卡器探测、reader lease、ICCID/IMSI 读取。
4. IMS/VoWiFi 注册和状态。
5. 同一条线路的一次真实主叫或被叫。
6. 来电在浏览器、iOS、Android 的事件和身份一致性。
7. 接听后 SIP dialog、engine call ID、OS UUID 对应正确。
8. 挂断和乱序/重传后的终态不复活。
9. SMS/MMS 收发。
10. eSIM 下载、切换、补偿和回滚。
11. APNs/VoIP push 和 Android 通知。
12. WebRTC 双向音频、听筒、蓝牙、后台/进程恢复。

每条真实验收记录至少要写：时间、MDD origin、脱敏 instance ID、脱敏 line/device ID、脱敏 call ID、动作、观察到的端点响应、媒体方向、最终状态、日志路径和制品哈希。不要把完整 token、手机号、ICCID、IMSI、APNs key 或密码写进交接报告。

### P1：Asterisk C / image / module 实际验证

当前环境没有 Docker、GCC、Clang，仓库也没有完整 vendored Asterisk C source。现有内容是 patch、模板、保持模块清单和静态/idempotence 测试。

需要在具备依赖的构建环境中完成：

1. 固定 Asterisk source revision。
2. 应用 `engine/patches/asterisk/zz_carrier_register_profiles.py`。
3. 验证重复应用幂等。
4. 编译 C source。
5. 构建 engine image。
6. 加载实际模块。
7. 生成一条 MDD engine profile。
8. 做最小 REGISTER/INVITE/SMS consumer 检查。
9. 保存 source revision、patch hash、image digest、模块列表和 SIP 日志。

没有 C 源码或 Docker 时，状态必须是 BLOCKED，不能写成 Asterisk 已打通。

### P1：iOS 原生构建和真机

需要 macOS/Xcode 和签名设备：

1. `xcodebuild` 编译 Runner 和 RunnerTests。
2. 安装到测试设备。
3. 验证 PushKit 冷启动/后台唤醒。
4. 验证 CallKit incoming、answer、decline、hangup。
5. 验证 SIP WSS、WebRTC offer/answer、双向音频。
6. 验证 Live Activity 和通知权限。
7. 保存 `.xcresult`、安装版本、设备型号、系统版本和日志摘要。

Windows 上的 Flutter receipt 不能替代这些结果。

### P1：AT&T / Three HK 完整消费者

当前安全策略是 fail-closed，不做半实现。

AT&T 仍缺：

- paired public/private identity
- 完整 REGISTER/Contact header 消费
- P-Preferred-Identity
- P-Visited-Network-ID
- PANI
- Cellular-Network-Info
- Accept-Contact
- 18400 expiry
- AES-CBC/SHA1 和 server port 6000 的真实消费者

Three HK 仍缺：

- 同一会话内 EAP RAND/AUTN/RES 安全交接
- direct first REGISTER Authorization
- explicit no-sec-agree 分支
- Supported/Allow/Accept-Contact
- P-Preferred-Identity/User-Agent/expiry/PANI
- Asterisk consumer 的真实 wire 证明

没有运营商真实契约、测试号码、凭据和 Asterisk consumer 环境时，保持 blocker；不要只改 profile JSON 或增加静态字段后宣称完成。

---

## 5. 推荐执行顺序

### 阶段 A：接手自检

```powershell
$roots=@('E:\GQ\Ultra\mdd-sim-gateway','E:\GQ\Ultra\ONEWIFI\IOS','E:\GQ\Ultra\ONEWIFI\android')
foreach($p in $roots){ git -C $p diff --check }
python E:\GQ\Ultra\mdd-sim-gateway\docs\onewifi-migration\verify-final-evidence.py
python E:\GQ\Ultra\mdd-sim-gateway\docs\onewifi-migration\record-source-evidence.py --label checkpoint
```

记录是否相对 `source-evidence-freeze.json` 发生 drift。若 drift 只来自文档/receipt，不要误判为生产源变化；若来自 Dart/native/backend 生产源码，先重新审查再跑对应测试。

### 阶段 B：证书和 Android 构建

只有拿到真实 `gateway_selfsigned` 后执行。先资源链接，再 JVM，再 APK，再设备安装。每一步失败都要保存原始日志，不用 mock 证书补洞。

### 阶段 C：后端漂移门

如果 B 阶段改动了 backend 或共享移动契约，才重新跑：

```powershell
wsl --cd /mnt/e/GQ/Ultra/mdd-sim-gateway --exec env PYTHONDONTWRITEBYTECODE=1 TMPDIR=/tmp MDD_DATA=/tmp/mdd-full-final-logged LD_LIBRARY_PATH=/mnt/e/GQ/Ultra/mdd-sim-gateway/docs/onewifi-migration/linux-pcsc/extracted/usr/lib/x86_64-linux-gnu /mnt/e/GQ/Ultra/mdd-sim-gateway/.venv-linux/bin/python docs/onewifi-migration/run-current-regression.py
```

共享 Dart 发生改变时，分别跑：

```powershell
python E:\GQ\Ultra\mdd-sim-gateway\docs\onewifi-migration\run-mobile-final.py ios
python E:\GQ\Ultra\mdd-sim-gateway\docs\onewifi-migration\run-mobile-final.py android
python E:\GQ\Ultra\mdd-sim-gateway\docs\onewifi-migration\run-kotlin-final.py
```

### 阶段 D：安全核验和远端只读预检

先核验 SSH 新指纹，再连远端。只读预检通过后再由明确授权者决定部署。部署 MDD 后，先检查服务健康、监听、reader lease、PC/SC、QMI、ModemManager、SIM 和 IMS；不要先触发拨号或写卡。

### 阶段 E：三端真实验收

按同一个 MDD origin 和同一条线路执行：

1. 登录。
2. 设备/线路读取。
3. reader/SIM 读取。
4. IMS 注册。
5. 浏览器来电或主叫建立基线。
6. iOS 来电/主叫。
7. Android 来电/主叫。
8. 接听、挂断、重传、乱序、logout。
9. SMS/MMS。
10. eSIM 下载/切换/回滚。
11. APNs/通知。
12. 双向音频和后台恢复。

任何一端只通过 mock 或单测时，状态写 `software PASS / runtime NOT RUN`，不能写“手机端已打通”。

### 阶段 F：最终终审

必须更新并核对：

- `final-audit-latest.md`
- `final-audit.md`
- `GAP_INVENTORY.md`
- `progress.md`
- `STATE_VERSION.tsv`
- backend/mobile/Kotlin receipts
- runtime evidence

终审只有在真实运行证据覆盖完成、Android APK/JVM 通过、Asterisk 实际 consumer 通过、iOS 原生和 Android 真机证据存在时，才可以把完整发布从 FAIL 改为 PASS。否则保留 FAIL，并逐项说明 blocker。

---

## 6. 验收账本

| 项目 | 当前状态 | 证据 | 下一步 |
|---|---|---|---|
| MDD 后端回归 | PASS | backend receipt；2097/0/0/1 skip | 源漂移时重跑 |
| OneBoard | PASS（软件） | 22 Node + Vite | live auth/provider |
| iOS Flutter/契约 | PASS（软件） | 1086 + analyzer 0 | Xcode/签名真机 |
| Android Flutter/契约 | PASS（软件） | 892 + analyzer 0 | 证书后 APK/JVM |
| Android Kotlin | PASS（compile） | 216 artifacts | 资源/JVM/APK |
| Android gateway cert | BLOCKED | `unit-apk.log` | 取得真实原始证书 |
| Android real device | NOT RUN | `adb devices` empty | 接入设备 |
| AT&T | BLOCKED | `carrier-att-three-report.md` | 完整契约/凭据/consumer |
| Three HK | BLOCKED | `carrier-att-three-report.md` | 完整契约/凭据/consumer |
| Asterisk C/image | BLOCKED | patch receipt only | 构建环境/source |
| iOS native | NOT RUN | Windows 无 Xcode | macOS/Xcode/签名 |
| Remote host | BLOCKED | SSH host-key mismatch | 核验新指纹 |
| MDD/SIM/IMS runtime | NOT RUN | `RUNTIME_EVIDENCE.md` | origin + hardware |
| 完整发布终审 | FAIL | `final-audit-latest.md` | 所有 P1 gate 通过 |

---

## 7. 严格禁止事项

- 不修改、运行、部署 `E:\GQ\Ultra\NEWONE`。
- 不部署第二套 OneWIFI gateway。
- 不让 OneWIFI 和 MDD 同时持有同一张 SIM。
- 不新增平行 App 或重写 iOS/Android UI。
- 不重新引入生产 SSE/PCM fallback。
- 不生成假 `gateway_selfsigned`，不删除 trust anchor，不放宽 TLS。
- 不使用 mock、静态 grep、合成预览或单测结果冒充真实端到端打通。
- 不绕过 SSH host key mismatch。
- 不提交、不推送、不发送真实通知、不拨打真实电话，除非收到新的明确授权。
- 不把旧报告里的 891/Analyzer 1/2090 数字当成当前最终结果。

---

## 8. 交接完成定义

Grok 只有在下面条件全部有新鲜证据时，才能把完整发布标为 PASS：

1. Android 原始证书已核验，JVM 和 APK 构建通过，APK 有 SHA256。
2. MDD 后端和共享契约若有漂移，重新完成对应全量回归，receipt 与当前源一致。
3. SSH 新指纹已可信核验，远端只读预检和部署日志完整。
4. 至少一条线路真实读卡并完成 IMS 注册。
5. 至少一次真实主叫或被叫，浏览器和至少一个手机端有可追踪的同线证据。
6. SMS/MMS、eSIM、通知按授权范围有真实端点结果。
7. Asterisk C/image/module/consumer 有构建和 wire 证据。
8. iOS 原生和 Android 真机门有设备证据。
9. `final-audit-latest.md` 将每项从 BLOCKED/NOT RUN 更新为 PASS，并通过最终审查。

在这些条件满足之前，正确状态是“软件源冻结可用，完整发布 FAIL”。

---

## 9. 当前文件索引

| 文件 | 用途 |
|---|---|
| `backend-final-evidence.json` | 后端回归 receipt |
| `backend-final-regression.log` | 后端原始日志 |
| `oneboard-final-evidence.json` | OneBoard Node/Vite receipt |
| `ios-final-evidence.json` | iOS Flutter/analyzer receipt |
| `android-final-evidence.json` | Android Flutter/analyzer receipt |
| `android-kotlin-final-evidence.json` | Kotlin compile receipt |
| `android-resident-pickup-implementation-report.md` | Android resident 软件切片说明 |
| `android-report.md` | Android 全量历史与当前 receipt |
| `ios-report.md` | iOS 全量历史与当前 receipt |
| `carrier-att-three-report.md` | AT&T/Three blocker 说明 |
| `RUNTIME_EVIDENCE.md` | 真实运行环境观察 |
| `GAP_INVENTORY.md` | 未完成项总表 |
| `final-audit-latest.md` | 当前终审裁决 |
| `STATE_VERSION.tsv` | 证据和文档哈希索引 |
| `source-evidence-freeze.json` | freeze 源哈希 |
| `source-evidence-checkpoint.json` | 当前 checkpoint 源哈希 |
| `MACHINE_TEST_RUNBOOK.md` | 有设备后执行的实机测试手册 |

---

## 10. 交接摘要

当前已经把“代码、契约、单测和软件证据”收口到可审计状态，但“真实证书、构建产物、远端部署、读卡器/SIM/IMS、真机和运营商实际消费者”仍没有证据。接手者应该从 Android 原始证书和 SSH 指纹两个外部输入开始，任何一个输入未到位都不应伪造成功；拿到后按阶段 B→F 推进，每一步都更新 receipt 和终审账本。
