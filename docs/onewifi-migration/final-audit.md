# 顶级终审报告 · final-audit

审计时间：2026-10-14 Asia/Shanghai；角色：final-audit / 终审裁决者。范围：E:\GQ\Ultra\mdd-sim-gateway、E:\GQ\Ultra\ONEWIFI\android、E:\GQ\Ultra\ONEWIFI\IOS、只读参考 E:\GQ\Ultra\NEWONE。权限：只读，本文件为唯一写入物。

## 终审结论

**FAIL（不能作为完整迁移发布）。** Android resident 软件切片已修复，最新 Flutter 892/0/0 + analyzer 0、Kotlin compile 216 artifacts；但 AT&T/Three HK 仍 blocked，Android JVM/APK 仍被原始证书资源阻塞，远端 SSH host-key mismatch 阻断真实部署/runtime probe，且无真实 MDD/reader/IMS/device 验收。

## 终审三问

- **能否上线：不能。** 完整验收需要 carrier/eSIM/IMS/call 与同线移动端；AT&T/Three 缺完整消费者，Asterisk C/image/install 未证实，Android JVM/APK 不可过资源链接，真实环境未运行。
- **能否回滚：源代码层面可以，部署层面未证明。** 移除 AndroidCallHost 的 resident source 可回 SIP-only；carrier block 不自动启用半套 profile；无安装产物、灰度或线上回滚演练。
- **能否解释：软件链路可以，生产链路不完整。** identity、receipt、generation、close/cleanup 有源码和 focused tests；没有 origin、reader/SIM、IMS、签名设备、APNs 或真实 SIP 时间线。

## 范围与验收

IN：MDD sole control plane/SIM authority；Android resident /ws+history+pickup；engine ID/SIP dialog/OS UUID；close/logout/generation；Combined 去重；旧 SSE/PCM 可达性；MDD authz/DTO/receipt；carrier blocked；hash/build/runtime evidence。  
OUT：真实拨号、eSIM 写入、APNs 外发、生产部署（本轮无授权环境，均 NOT RUN/BLOCKED）。  
原始要求：docs/onewifi-migration/MIGRATION_SPEC.md、CONSTRAINTS.md、task-final-audit.md。  
标准：MDD 唯一控制面；移动端只经 MDD；同线 ID 分离；只有用户 answer 触发 pickup；旧 SSE/PCM 不可由生产入口实例化；不完整 carrier fail-closed；源→派生→安装→运行证据一致。

## 原始需求追踪账本

| # | 要求 | 当前实现/入口 | 证据 | 状态 |
|---:|---|---|---|---|
| 1 | MDD 唯一控制面/SIM authority，NEWONE 只读 | control/app/gate.py、authz.py、mobile_api.py；AndroidCallHost/AppDependencies | route/auth 静态核对，无 NEWONE runtime entry | PASS（源） |
| 2 | resident history+/ws 发现，用户 answer 后 receipt→SIP | ResidentCallSource.kt、CallCoordinator.kt、android_sip_entrypoint.dart | implementation report；Kotlin 216 artifacts；Dart focused 12/12 | PASS（软件切片） |
| 3 | engine ID、SIP dialog、OS UUID 分离 | CallKey、SipCallActions、registry reserve/bind/cancel | Kotlin/Dart identity tests | PASS（源/focused） |
| 4 | close/logout/generation 清理 lease、Telecom、迟到 callback | CallSessionBinding.clear、SessionController.signOut、CallSessionRuntime.stopResources、CallCoordinator.close | focused cleanup tests；无设备 | PASS（源）；runtime NOT RUN |
| 5 | Combined 按 (instance, engine ID) 去重、终态不复活 | ResidentCallReconciler、CombinedCallEventSource | active SIP wins resident answered 最新 test | PASS（源/focused） |
| 6 | 旧 SSE/PCM 不可达，生产走 SIP/WebRTC/Telecom | AndroidCallHost 只组 SIP+resident；CallsApi 旧 action/media UnsupportedError | 静态搜索；MDD 无 /api/calls/events | PASS（可达性源） |
| 7 | auth/route/DTO/receipt 契约一致 | gate/authz/mobile_api；两端 mdd_mobile_contract.dart | 11 fixtures；Windows contract test受 fcntl阻断 | PASS（静态）；runtime NOT RUN |
| 8 | AT&T/Three 不完整时必须 blocked | carrier_profiles.py、config.py carrier_block | blocker+carrier focused 15/15 | PASS（fail-closed）；功能仍未实现 |
| 9 | 证据与当前源一致 | android-final-evidence、android-kotlin-final-evidence、source-evidence-freeze | Android full 892/0/0 analyzer0 inputs match；Kotlin 216 artifacts receipt identity valid；source-freeze 当前 MDD/Android drift 0；verify-final-evidence exit 0 | PASS（软件证据） |
| 10 | 构建/安装/真实同线 call | Gradle、MDD runtime、设备 | testDebugUnitTest resource link fail；无 origin/reader/IMS/device | BLOCKED/NOT RUN |

## 上游报告复核

- android-resident-pickup-implementation-report：当前源一致；answered 无 end_ts 保持 active，snapshot 不伪造 endedAt。
- android-report：旧 891 evidence 已由最新 android-final-evidence 892/0/0 analyzer0 替换；当前输入匹配。
- backend-contract/contract-audit：/ws bearer、/api/instances/{iid}/calls history、pickup route 与旧 SSE/PCM 禁止语义和当前源一致；Windows contract test因 fcntl无法导入。
- carrier-att-three-report：当前 blocker code 与 15/15 focused tests 一致；AT&T/Three 仍 blocked。
- final-audit.md：Android resident 未实现段落过期；本报告以当前源与最新 evidence 为准。

## 全链路

Android signed-in configure → CallSessionRuntime/CallGateway Bearer → AndroidCallHost 的 SIP WSS + MDD /ws。Resident source 按 enabled line 读取 native history，reconciler 用 (instance, engine call ID) 合并，Combined 与 SIP snapshot 以同一身份去重。用户/system answer → Dart receipt（device_id、call_id、URI、expiry）→ SIP pickup header X-MDD-Mobile-Pickup: osUuid → 精确 instance+engine ID+incoming+dialog 绑定 → SIP answer/WebRTC media。logout/clear 先失效 generation，再关闭 source/bridge、cancelPending 或所属 dialog hangup。MDD gate 只允许 client bearer 的 /ws、history、pickup；旧 /api/calls/events 不存在，Dart legacy action/media fail closed。carrier blocked 时 engine 使用 standard fallback，不注入缺失身份、安全、EAP、REGISTER defaults。

## ST 场景模拟

| # | 场景 | 审计结果 |
|---:|---|---|
| 1 | resident ringing→answer→receipt→dialog→active | PASS 源/focused；真实设备 NOT RUN |
| 2 | 空 history/配置/line | PASS 空态/connecting，不自动 answer |
| 3 | malformed/超长/非法 engine ID | PASS 丢弃或 fail-closed |
| 4 | 403/过期/revoked bearer | PASS 源；live runtime NOT RUN |
| 5 | ws/history/SIP duplicate | PASS 单 reservation、最多一次 pickup |
| 6 | receipt 400/409/expired | PASS 不发 SIP、取消 lease |
| 7 | close/logout/in-flight | PASS focused；设备 NOT RUN |
| 8 | answered 无 end_ts | PASS 保持 active，不伪造 endedAt |
| 9 | SIP active + resident answered | PASS SIP dialog 优先 |
| 10 | old SSE/PCM/REST action | PASS Unsupported/route 不存在 |
| 11 | AT&T/Three | PASS block；完整功能 FAIL |
| 12 | APK/JVM/MDD/reader/IMS/device | BLOCKED/NOT RUN |

## 发现与修正

| 严重度 | 位置 | finding | 复验/状态 |
|---|---|---|---|
| P1 | AT&T profile consumers | paired identity、headers、security/port consumers 缺失 | 15/15 blocker tests；未修，发布阻塞 |
| P1 | Three HK consumers | secure EAP handoff/direct auth/no-sec-agree consumers 缺失 | 15/15 blocker tests；未修，发布阻塞 |
| P1 | Android resource/JVM/APK | network_security_config.xml:22 引用缺少 res/raw/gateway_selfsigned | 本轮 testDebugUnitTest 明确 processDebugResources FAILED；BLOCKED |
| P1 | Remote deploy/runtime | 远端 SSH host-key mismatch 阻断部署/runtime probe | 不绕过校验；BLOCKED |
| P1 | Runtime acceptance | 无授权 MDD origin、reader/SIM、IMS、签名设备、destination | 无 live evidence；BLOCKED |
| P2 | Source hygiene/dead helpers | 旧 SSE/PCM/CallHttpActions 保留但生产不可达；source-evidence-freeze 当前无 drift | 本轮只读；可在后续清理 dead code 后再审 |
| P2 | 兼容运行 | Swift/Xcode/CallKit/PushKit 与 Android Telecom/Doze/process death 未在设备运行 | NOT RUN |

## 六字真言

| 简洁 | 强大 | 高效 | 稳定 | 易维护 | 易阅读 |
|---|---|---|---|---|---|
| PASS：resident 单 source/bridge | PARTIAL：identity/race 覆盖，carrier/runtime 缺口 | PASS：bounded receipt/retry/lease | PARTIAL：后台/IMS 未证明 | PARTIAL：dead helper/manifest debt | PASS：instance/engine/dialog/UUID 清晰 |

## 验证矩阵

| 类别 | 命令/来源 | 结果 |
|---|---|---|
| Android full Flutter | android-final-evidence.json | PASS：892 tests，0 failure，0 error；analyzer exit 0；inputs match |
| Android targeted Dart | flutter test --no-pub android_sip_runtime_test.dart sip_call_service_test.dart mdd_pickup_contract_test.dart | PASS：12/12 |
| Kotlin compile | android/gradlew.bat :app:compileDebugKotlin --offline --no-daemon；android-kotlin-final-evidence | PASS：exit0、216 artifacts、receipt identity valid |
| JVM/APK | android/gradlew.bat :app:testDebugUnitTest --offline --no-daemon --console=plain | FAIL/BLOCKED：缺 raw/gateway_selfsigned |
| Carrier focused | python -m unittest tests.test_att_three_blockers tests.test_onewifi_carrier_profiles -v | PASS：15/15 |
| MDD resident contract | python unittest / WSL wrapper | PASS：backend final 2097 discovered tests、0 failure/error、skipped=1；Windows 单测仍缺 fcntl |
| Backend full | run-backend-final.py/documented WSL wrapper | PASS：2097 tests、0 failure/error、skipped=1；无安装/硬件证明 |
| Runtime/deploy | MDD origin + reader + IMS + signed devices | BLOCKED：SSH host-key mismatch；无硬件/授权环境 |

## 兼容、回滚与解释

普通 SIP incoming/outgoing 仍走 SIP bridge；关闭 resident source 可回 SIP-only。MDD wire 无新增 endpoint；旧 classes 保留但生产 AndroidCallHost 未实例化 CallEventMonitor、CallHttpActions、NativePcmSession，Dart legacy actions/media 也 fail closed。没有安装 APK、engine image、Asterisk C build、签名设备或 live state timeline，不能声称安装态加载当前源，也没有真实 rollback drill。最短复验路径：保持 source/hash manifest 与 2097 backend receipt；保留原始 trusted cert 通过 Android JVM/APK；解决 SSH host-key mismatch 后按 ACCEPTANCE_PROTOCOL.md 跑同线 MDD+reader+IMS+Android/iOS。

## 终审裁决

**FAIL。** resident slice 可作为受限 source handoff；不能称完整迁移完成、可部署或真实通话已验收。回退 Execute/Plan：完成 AT&T/Three 范围决策与实现、清理/刷新 manifests、修复 cert/build/SSH blockers，再重新进入 final-audit。




