# Android resident late-pickup implementation plan

> 设计证据，不代表当前已支持。范围只覆盖“Android 进程与用户启用的驻留服务仍存活、SIP 可能在 `call_in` 之后注册”的晚注册接起；不覆盖被系统杀死后的冷启动唤醒。

## 0. 启动自报家门

| 报告项 | 内容 |
|---|---|
| 角色 | `deep-analyst` / 首席架构师；本轮只设计 Android 驻留晚注册接起 |
| 配置模型 | 未注入 |
| 实际模型与供应商 | 未知（平台未注入） |
| 环境 | 目标仓 `E:\\GQ\\Ultra\\mdd-sim-gateway`；关联 Android 源码 `E:\\GQ\\Ultra\\ONEWIFI`；Windows/PowerShell；只读 shell 与文件写入报告 |
| 权限 | 只读实际代码；仅允许写本报告；不改生产/测试、不运行外部服务、不提交/推送 |
| 任务规模 | L：跨 MDD `/ws`、历史、Android native Telecom、Flutter SIP registry 四个边界；涉及公开事件/身份契约与终态竞态 |
| 任务描述 | 为驻留 Android 设计以 `instance_id + engine call_id + native UUID + SIP dialog` 对账的最小晚注册 pickup 闭环 |
| 本轮聚焦 | 真实取舍、身份不变量、首次 WS/历史顺序、重连和终态竞态、用户回答前不发 SIP pickup、文件级实现与可执行验证 |
| 已读取 | `task-android-resident-pickup-design.md`、`android-pickup-disposition.md`、`MIGRATION_SPEC.md`、Android `CallStandbyService`/`CallSessionRuntime`/`SipCallEventSource`/`CallCoordinator`/`AndroidSipBridge`、Flutter `SipDialogRegistry`/`SipCallService`/`MddPickupReceipt`、MDD `main.py`/`mobile_api.py`/`store.py`/`gate.py`、现有 Android 与 MDD 相关测试 |
| 未读取 | 真实设备、SIP fork/Doze/process-death、运行时服务；本报告不以静态代码替代这些证据 |
| 上游 / 下游 | 上游：`android-pickup-disposition.md` 与本轮源码取证；下游：主 Agent Execute，随后 `deep-reviewer`/L 任务 `final-audit` |

## 1. 已采纳事实与证据边界

| 事实 | 证据 | 采用方式 |
|---|---|---|
| MDD 在 `call_in` 以 `instance`、`call.call_id`、`status=ringing` 广播；重复 `call_in` 由 `add_call_deduped` 按 engine ID 合并 | `control/app/main.py` `api_engine_event`；`store.py` `add_call_deduped` | engine `call_id` 是唯一跨层关联键，禁止按号码/历史行号猜测 |
| `/ws` 是 bearer 可认证的通用事件 socket，但没有 cursor/replay/初始快照 | `control/app/main.py` `ws_endpoint`；`gate.py` bearer socket；`Hub.broadcast` | 首连和每次重连必须补查历史，socket 只做增量唤醒 |
| `GET /api/instances/{iid}/calls` 返回历史；`GET /api/mobile/v1/calls/{call_id}/pickup?device_id=` 只在 open inbound ringing 且未过 60s 时签发 receipt | `main.py` `api_calls`；`mobile_api.py` `pickup` | 历史补查只保留方向 `in`、状态 `ringing`、合法 engine ID 的记录；真正 pickup 依赖 receipt |
| Flutter registry 已能把 native UUID 绑定到 `(instance, engine call_id, dialog)`，`SipCallService.pickup` 要求 registry ownership、`mddpickup-{call_id}` 与 UUID，并发出 `X-MDD-Mobile-Pickup` | `ONEWIFI/android/lib/features/calls/data/sip_call_service.dart`、`mdd_mobile_contract.dart` | 复用现有 registry/receipt/SIP header，不新造第二套 SIP 身份表 |
| Android `CallCoordinator` 当前将 `CallKey.callId` 直接当 SIP dialog，`SipCallEventSource` 只消费 SIP 事件；`AndroidCallHost` 显式选择该 source | `ONEWIFI/android/android/app/src/main/kotlin/.../CallCoordinator.kt`、`SipCallSource.kt`、`AndroidCallHost.kt` | 增加 pending engine-call 状态和绑定转换，不能把 engine ID 假装成 dialog ID |
| `CallStandbyService` `START_STICKY`/wakelock 只保持已存活进程；没有 provider 不能从死亡进程唤醒 | `CallStandbyService.kt`、上游 disposition | killed-process wake 明确留作未支持能力；本方案不加 FCM/provider |

## 2. 角色化需求八维

| 维度 | 结论 |
|---|---|
| 🎯 表层需求 | 驻留 Android 在 SIP 晚注册时仍发现 MDD ringing call；先报告原生来电并保留 UUID，用户点击接听且尚无 INVITE 绑定时才拿 receipt 并发起 pickup；随后精确绑定真实 SIP dialog。 |
| 💡 深层意图 | 保持 MDD 为唯一控制面、SIP 为媒体/通话状态源，保证旧原生 UI 和普通 SIP 来电路径不被平行实现破坏；可解释、可回退。 |
| 📎 必须处理 | `/ws` 增量 + 每次连接的 history reconciliation、四种身份、幂等 reservation、receipt 校验、一个回答者、取消/过期/登出/代答、文件计划和测试矩阵。 |
| 🚀 查缺补漏 | 覆盖 socket 首包缺失、重连重复、同一 engine ID 多 fork、另一客户端先答、receipt 409/过期、媒体启动失败、generation/logout、凭据不落盘。 |
| ✨ 顺手优化 | 复用 `CallGateway` 的 bearer/超时、现有 `MddPickupReceipt` 和 `SipDialogRegistry`；在日志中只记脱敏 ID 哈希/状态迁移，提供可查询关联号。 |
| 🧠 头脑风暴 | A：native source + Flutter bridge（推荐）；B：把全部 MDD WS/history 与 pending 状态放 Flutter，再向 native 推送；不做：继续仅等 SIP INVITE。A 与现有 `CallCoordinator`/驻留生命周期最贴合，B 会让 OS UUID 生命周期依赖 Flutter engine，冷却/销毁竞态更大。 |
| 💩 屎山规避 | 不新建 push provider、云服务、WebView UI、PCM/REST answer 平行链路；不抽象通用事件总线，除非已有两个真实消费者。一个 `ResidentCallSource` 只服务 native coordinator。 |
| ⚠️ 注意事项 | `/ws` 无回放是硬约束；历史端点是最终补偿而非排序保证。不可逆外部副作用是 SIP pickup，必须延迟到用户 answer 且 receipt 成功；不能宣称 killed-process 支持。 |

## 3. 对齐信封 / 防偏移 TODO

- [x] 只分析 Android resident pickup；不扩大到 FCM、iOS、UI 重做或 PCM。
- [x] 使用现有 MDD `/ws`、历史、pickup receipt、SIP header；若需 wire 改动先列出最小契约。
- [x] 固定 engine ID、SIP dialog、native UUID、instance 的边界和状态迁移。
- [x] 明确首次连接、重连、重复事件、终态、登出/generation 的验收点。
- [x] 给出 Android/MDD/Flutter 文件级计划，生产和测试实际修改均为零。
- [x] 给出项目命令来源明确的 RED/GREEN/回归矩阵；真实设备证据标为 NOT RUN。

## 4. 调用链与数据流

**发现/展示：** `CallStandbyService` → `CallSessionRuntime.configure/restore` → 组合两个并行输入：现有 `SipCallEventSource`（SIP registration/dialog）与新增 `ResidentCallSource`（MDD `/ws` + history）→ `ResidentReconciler` 按 `(instance_id, engine_call_id)` 归并 → `SipDialogRegistry.reserveIncoming(osUuid, instance, engineCallId)` → `CallCoordinator.beginPending` → 原生 Telecom incoming UI。

**用户回答：** Telecom `answer(UUID)` → `CallCoordinator.answer(pending key)` → generation/当前状态/仍 ringing 校验 → `GET /api/mobile/v1/calls/{engine_call_id}/pickup?device_id={instance}`（3s、无自动重试）→ 严格解析 `MddPickupReceipt` → Android bridge 调 Dart `SipCallService.pickup(instance, callId, receipt.uri, osUuid)`（发 `X-MDD-Mobile-Pickup: osUuid`）→ 等待 SIP `CALL_INITIATION`，由 registry `bindPickup` 将 dialog 绑定同一 UUID/engine ID → 仅此后执行 SIP dialog answer（必要时由 existing `CallCoordinator` 完成 Telecom answer transaction）→ media start。

**终止/补偿：** `/ws` call event 或 history 看到 `answered/ended/missed/failed`、receipt 409/过期、SIP pickup 失败、系统取消、logout/generation 变化 → 原子撤销 pending lease/notification/registry；若 SIP dialog 已绑定，走现有 hangup/finish；绝不按号码再尝试。

**数据流：** MDD 事件 `{type:"call",instance,call:{call_id,status,direction,peer,start_ts...}}`；历史 `{calls:[...]}` 只读。Android 内存对象携带 `instanceId`, `engineCallId`, `nativeUuid`, `dialogId?`, `generation`, `phase`。Flutter 仅保留既有 bearer（现有 session store 规则不变）和 registry 内存映射；不新增 credential persistence。

**爆炸半径：** 单 line/单 engine call；同一 engine ID 的 Android/浏览器/iOS 共享 MDD 终态。Socket 断开只影响新发现和补查，不撤销已绑定 SIP；MDD 认证撤销/登出清空本地所有 pending、SIP registration、Telecom UI。

## 5. 方案矩阵

| 方案 | 复杂度 | 性能 | 维护性 | 项目契合 | 安全/兼容 | 验证成本 | 结论 |
|---|---|---|---|---|---|---|---|
| **A. Native `ResidentCallSource` + history reconciliation；Dart registry/pickup 作为 SIP adapter** | 中 | 高：一个 WS，重连按 line 串行 GET，单 call 仅一次 receipt | 高：OS UUID 留 native，SIP 身份仍由既有 registry 管 | 高：复用 `CallSessionRuntime`/`CallCoordinator`/原生 UI 与现有 SIP UA | 高：bearer、receipt、generation、UUID 所有权明确 | 中：需覆盖竞态和 Kotlin↔Dart bridge | **推荐** |
| B. Flutter 负责 WS/history/pending，再通过 channel 驱动 native | 中高 | 中：Flutter engine 重启/后台回调增加延迟 | 中低：两端生命周期和状态机重复 | 中：复用 Dart 网络但驻留 native 仍需反向通知 | 中：engine 销毁会丢 OS lease，需额外恢复协议 | 高：需测 isolate/engine/Telecom 交错 | 不选；只有在 native 网络栈无法使用时重审 |
| 不做/继续 SIP-only | 低 | 高（但丢晚注册） | 高（短期） | 低于原始 acceptance | 低：会错过窗口且无法诚实接起 | 低 | 不满足需求，仅可作为回滚开关下的旧行为 |

选 A 的原因是状态所有权与生命周期均在现有 native resident runtime；Flutter 只承接已存在的 SIP registry、pickup header 和媒体。B 的主要失败域是 Flutter engine 被销毁时 UUID 与用户回答回调分裂。

## 6. 架构不变量与状态机

| # | 不变量 | 理由 | 破坏后果 |
|---:|---|---|---|
| 1 | MDD `instance_id` 是 line identity；engine `call_id` 必须匹配 `^[0-9]+\\.[0-9]+$`，跨边界按字符串传输 | MDD/store/push/pickup 的唯一关联键 | 错线接听或串线 |
| 2 | native UUID 只标识一次 OS incoming reservation；SIP dialog 只在 SIP UA 发来后生成；两者不可互换 | 系统回调先于 INVITE，且 dialog 可能 late | answer/hangup 送到错误 fork |
| 3 | `(instance, engineCallId)` 在本进程最多一个 active pending；重复 WS/history/SIP event 幂等 | `/ws` 无回放、fork/retransmit 重复 | 重复 Telecom UI 或重复 pickup |
| 4 | receipt 必须同时满足 `device_id`, `call_id`, `pickup_uri`, `expires_at > now`；receipt 失败不发 SIP | receipt 是 MDD 对当前 ringing 的授权 | 未授权/已结束电话被接起 |
| 5 | SIP `X-MDD-Mobile-Pickup` UUID 与 registry lease 精确相等，且绑定到相同 engine ID | 防伪 header、跨 call 复用 | 错误 dialog 绑定 |
| 6 | 只有用户 answer 事件可触发 pickup；展示、预留、WS/history 都不能自动 answer | 原始需求禁止 unconditional auto-answer | 隐私/业务破坏 |
| 7 | 终态单向：`discovered → reserved → ringing → pickup_in_flight → dialog_bound → answering → active`；任一 `cancelled/expired/answered_elsewhere/failed` 为终态，禁止回到 ringing | 可重放、可解释、可回滚 | late event resurrects call |
| 8 | generation/logout 使旧 callback、UUID pending、receipt response 全部失效；token 不新增持久化 | 现有 `CallSessionRuntime` generation 语义 | 登出后旧通知接管新会话 |
| 9 | 单一 SIP answer owner：若 MDD history/WS 显示非 ringing 或 SIP 已有另一客户端 active，native 只清理本地 UI | one-answer cancellation | 双方同时接通 |

**重连顺序：** `connect WS → 标记 connecting（不创建新 UUID）→ 对每条已配置 line GET history → 仅纳入当前 ringing/open 合法 call_id → 合并 WS 缓冲 → emit connected`。WS 断线期间保留已展示 pending，但超过本地 lease（建议 25s，与 Dart registry 现有 timer 对齐）或 history 证实终态即清理；恢复不得重复 reservation。

## 7. 最小契约设计

| 契约项 | 当前 | 目标/实现要求 | 兼容策略 | 消费方 |
|---|---|---|---|---|
| `/ws` auth | bearer socket 已被 gate 接受 | Android 发送现有 `Authorization: Bearer <token>`；读取 `type=call`；忽略未知 type | MDD 不改路径；旧浏览器照常收事件 | Android, WebUI |
| call event | `{type:"call",instance,call:{call_id,status,...}}` | 只接受 `instance`、`call.call_id`、`direction:"in"`、`status:"ringing"`；未知字段忽略；缺字段丢弃并计 protocol error | **无需 wire 改动**；若未来改名必须版本化 | Android, WebUI, iOS |
| history | `GET /api/instances/{iid}/calls` 返回 `{calls:[...]}` | 重连/首连读取；筛选 open ringing inbound；按 `call_id` 串行合并 | 既有响应保持；不把 history 行号当身份 | Android |
| pickup | `GET /api/mobile/v1/calls/{call_id}/pickup?device_id={iid}` | 使用现有 receipt；3s timeout；不自动重试；409/400 映射 terminal/expired | 既有 iOS/Dart contract 不变 | Android native adapter / Dart |
| SIP pickup | existing `SipCallService.pickup(instance, callId, target, osUuid)` + `X-MDD-Mobile-Pickup` | 仅用户 answer 后调用；等待 matching `CALL_INITIATION`/`bindPickup` | 普通 inbound INVITE、outgoing dial unchanged | Android bridge, Dart SIP |
| native channel | 现有 `configure/event/dial/answer/hangup/...` | 增加窄方法：`reserveIncoming`（UUID/instance/engine ID）、`pickup`（同字段）、`pickupBound`/`cancelPending`；结果必须带 instance, engineCallId, dialogId | 只增方法；未知 method 仍 notImplemented | Kotlin ↔ Dart |

若实现中发现 native 无法可靠等待 Dart `bindPickup`，允许**唯一**最小 wire 扩展：Dart `event` 在 pickup `CALL_INITIATION` 时回传 `mddCallId`、`dialogId`、`osUuid`；不增加 MDD endpoint。不得引入新服务或 FCM。

## 8. 文件级计划（主 Agent Execute 顺序）

| 顺序 | 文件/模块 | 动作 | 关键点 | 风险 | 回滚点 |
|---:|---|---|---|---|---|
| 1 | `ONEWIFI/android/android/app/src/main/kotlin/.../ResidentCallSource.kt`（新） | 实现 bearer `/ws` OkHttp 长连、指数退避、每次成功握手后的 per-line history GET、协议校验、增量 snapshot 输出 | 不持有 Telecom；按 call_id 去重；禁止日志泄露 token/号码 | WS race/线程泄漏 | source factory 切回 `SipCallEventSource` |
| 2 | `.../ResidentCallReconciler.kt`（新，或并入 source；仅在两个真实调用方前不抽公共框架） | 管理 `(instance,engineCallId)` lease、UUID、generation、终态与 WS/history 合并 | 终态优先；历史晚到不能复活；同 key 单 reservation | 状态机复杂度 | 关闭 resident source，保留 SIP-only |
| 3 | `CallEventSnapshot.kt` / `CallSessionRuntime.kt` | 扩展 pending native call 元数据与 generation 传播；source 更新为 resident + SIP 双输入归并 | `mddCallId` 永远保留；不得把 engine ID 写入 dialog-only API | 两个 source 顺序/竞态 | feature gate 关闭 reconciliation |
| 4 | `CallCoordinator.kt`、`CallActions.kt`、`SipCallActions` | 将 pending incoming 的 answer 分支改为 `pickupAndAwaitDialog`；receipt/pickup 未成功不调用 answer/media；现有 SIP dialog answer 保持不变 | system answer deadline 内完成 bounded receipt+SIP start；失败清理 Telecom | OS callback deadline | 回退原 SIP-only answer path |
| 5 | `AndroidSipBridge.kt`、Dart `android_sip_entrypoint.dart` | 增加窄 channel 转发到既有 `SipDialogRegistry`/`SipCallService.pickup`；转发 dialog binding 与取消 | 不在 Kotlin 重写 SIP；不持久化 credential/UUID | channel engine 已销毁 | 返回 `call_session_closed` 并清 pending |
| 6 | Dart `sip_call_service.dart`、`mdd_mobile_contract.dart`（Android；随后 IOS 只做 contract parity review） | 暴露/复用严格 reserve/pickup/bind 结果；保持 UUID、engine ID、dialog 三者校验；未知事件安全忽略 | 普通 incoming/outgoing 行为不变 | Android/IOS 漂移 | contract fixture 对照 |
| 7 | `AndroidCallHost.kt`、manifest/依赖（仅已有 OkHttp） | 组合 resident source；确保 standby/foreground 共享一个 runtime；不新增 provider | capability/权限语义不变 | 重复 SIP engine | existing singleton/generation gate |
| 8 | 文档 `docs/onewifi-migration/android-resident-pickup-plan.md` 及 evidence | 更新 acceptance/gap、记录真实设备 NOT RUN 与 feature gate | 本报告是唯一已写文件 | 证据过期 | 报告可修订，不影响运行 |

**MDD 生产代码建议：** 本方案不要求修改 `mdd-sim-gateway` 代码或 wire；若测试证明 `/ws` 无法被移动端 bearer 连接，先修 gate/route contract，再执行 Android。不得用 SSE `/api/calls/events`，该端点当前不存在。

## 9. 失败域、回滚与不可逆点

| 失败域 | 行为 |
|---|---|
| 单 socket/网络 | 标记 offline，history 重连；已绑定 SIP 不被 WS 断开；指数退避上限 30s；不重复 receipt |
| 单 line/history | 该 line 暂不可接起并保留其他 line；解析失败不使用 peer/record id 猜测 |
| MDD auth/revocation | status unauthorized/expired，停止 source，清 registry、SIP、Telecom，复用 runtime logout；不保存新 token |
| 另一端先 answer/cancel | WS/history 非 ringing 或 SIP terminal → `answered_elsewhere`，清 native UUID；不发 pickup/不 hangup 未拥有的远端 dialog |
| receipt 400/409/expiry | 进入 terminal，结束本地 incoming；不触发 SIP；用户看到现有 call failure/ended 文案 |
| SIP pickup timeout/failed | 清 `pickup_in_flight`、撤销 registry lease、Telecom disconnect；同一 UUID 不自动重试，需新事件/用户重新接听 |
| media/answer failure after dialog bind | 按现有 `CallCoordinator.fail` hangup owned dialog、关闭 media；记录 `call_hangup_unconfirmed` 如无法确认 |
| logout/generation | `stopResources` 先增 generation 再关资源；所有迟到 source/channel callback 丢弃 |

**回滚：** 代码以 resident source/answer feature gate 为边界；关闭 gate 立即回到现有 SIP-only（驻留 SIP INVITE 仍工作）。配置无迁移；数据无回填；内存 UUID/lease 只随进程存在。不可逆动作仅 SIP pickup，前置 receipt、line/call/UUID 所有权和用户 answer 校验，失败以 hangup/Telecom disconnect 补偿。无 cloud/provider 外部副作用。

## 10. 验证矩阵

命令必须取自项目既有脚本/构建配置；以下为执行计划，当前均 `NOT RUN`。

| 验证 | 命令/来源 | 通过标准 | 不能证明什么 |
|---|---|---|---|
| MDD call identity/receipt 回归 | `python -m unittest tests/test_mobile_call_correlation.py`（现有测试文件）及新增 receipt/event contract tests | duplicate `call_in`、late answer、invalid ID、receipt expiry 均保持单 identity | 不能证明真实 SIP/Android UI |
| Android unit | 在 `ONEWIFI/android/android` 读取现有 Gradle wrapper 后执行对应 `./gradlew test`（以项目 wrapper task 为准） | resident source/reconciler、coordinator pending answer、generation/duplicate/terminal tests 全绿 | 不证明真实 Telecom deadline/Doze |
| Android static | 同仓既有 `./gradlew lint`/`analyze` task（先以 `gradlew tasks` 确认） | 无泄露 token、无未关闭 socket/executor、channel contract 编译 | 不证明服务器事件时序 |
| Dart targeted | `flutter test`（`ONEWIFI/android` 项目既有测试脚本/锁文件为准） | registry reserve/bind/cancel/pickup receipt cases 与 IOS contract fixtures 对齐 | 不证明 native bridge 与设备 SIP |
| Protocol fixture | Mock OkHttp WS frames + history JSON：initial history before WS, WS before history, duplicate, terminal-before-answer, malformed/unknown event | 所有序列最终得到同一 pending/terminal；最多一次 receipt 与 pickup | mock 不证明 TLS/auth server |
| SIP adapter fixture | mock `SipBridge.invoke`: no dialog → pickup → `CALL_INITIATION` exact mdd ID/UUID → answer；wrong ID/fork rejected | 不发 INVITE before user answer；wrong UUID/call rejected；普通 SIP path unchanged | 不证明 carrier/IMS |
| instrumented Android | existing Android instrumentation task（先从 wrapper tasks 取名） | Telecom UUID visible, cancel/answer race, notification cleanup, logout callback drop | 不能替代真实设备长驻/厂商后台策略 |
| real device/runtime | MDD + Android handset，记录关联 ID、状态迁移、history/WS timestamps | SIP delayed registration can be answered once; other client cancellation closes local UI | 当前无设备，`NOT RUN`；不能声称支持 |

## 11. Claim → Evidence 映射

| # | 将要声称的话 | 谁能证伪 | 证据形式 | 拿不到证据时的降级说法 |
|---:|---|---|---|---|
| 1 | Android resident source 使用 bearer `/ws` 并在重连补查 ringing history | `ResidentCallSource`/MDD route tests | 代码 + mock protocol logs + installed APK source hash | “设计已规定；实现/运行未证实” |
| 2 | 同一 `(instance, engine call_id)` 只产生一个 UUID reservation | reconciler duplicate tests | unit test trace + state transition log | “静态代码意图如此” |
| 3 | OS 展示期间不会自动 SIP pickup | coordinator answer gating test | unit trace showing zero bridge pickup before answer | “尚未验证自动接起约束” |
| 4 | 用户 answer 且 receipt 有效时，pickup 使用同一 UUID/call_id 并绑定真实 dialog | bridge/registry contract tests | Dart/Kotlin test + SIP event fixture | “receipt/SIP 绑定设计完成，未证明运行” |
| 5 | receipt 409/终态/另一客户端 answer 不会发送 SIP pickup | race/negative tests | mock call count + terminal state | “失败路径尚需验证” |
| 6 | logout/generation 丢弃迟到 event，且不新增凭据持久化 | runtime generation tests + store diff | unit trace + source diff | “沿用现有 generation 语义，未验证” |
| 7 | 普通 SIP incoming/outgoing path 保持兼容 | existing Android coordinator/SIP regression | existing test suite + diff review | “兼容性未证实” |
| 8 | killed-process late pickup 不在支持范围 | process-death experiment | explicit acceptance text; no provider code | 只能说“驻留进程存活场景设计覆盖” |
| 9 | MDD wire 无需变更 | endpoint/route tests and payload fixtures | source + contract tests | “需先验证 `/ws` bearer 与 payload；不能称已兼容” |

## 12. 六字真言与重审条件

- **简洁**：A 只新增一个 resident source、一个 pending 状态分支，复用现有 receipt/registry；中高，避免第二套 SIP。
- **强大**：覆盖 WS 丢事件、history 补查、late SIP、竞态终态；高，边界由测试矩阵约束。
- **高效**：单 socket、重连按 line 批量 history、单 call 单 receipt；高；不得用轮询替代 WS。
- **稳定**：generation、lease、终态单向、无自动重试副作用；中高，需真实 Android/IMS 验证。
- **易维护**：MDD wire 不改，普通 SIP path 不改；中高；native/Flutter channel 仍需 contract fixture。
- **易阅读**：engine/dialog/UUID 命名分离，日志只记录状态与脱敏关联；高。

触发重审：MDD `/ws` 无法 bearer 握手或 payload 不含稳定 `call_id`；history 无法判断 open/ringing；SIP UA 无法以 `X-MDD-Mobile-Pickup` 发起并回传同一 call ID；Telecom answer deadline 小于 receipt+SIP 建链预算；需要 killed-process wake；第二个真实消费者要求共享 resident 状态机。

## 13. 统一交付总结

- **状态：PASS（设计交付）**；生产实现、测试、真实设备均 `NOT RUN`，因此不宣称功能已生效。
- **范围：** 已覆盖 Android resident native chain、Flutter SIP registry、MDD `/ws`、history、pickup receipt、auth/generation、普通 SIP path；未覆盖真实设备/IMS/Doze/process death。
- **核心裁决：** 选 A（native source + history reconciliation + Dart SIP adapter）；不选 Flutter 全托管；不做基线仅保留回滚开关；killed-process wake 单独重审。
- **涉及文件：** 实际修改仅本报告；建议修改清单见第 8 节。
- **兼容与回滚：** 增量 channel 方法、MDD wire 不改、普通 SIP 路径不改；feature gate 关闭可退 SIP-only；无数据回填/凭据迁移。
- **剩余风险：** 真实 Telecom deadline、SIP fork/header 回执、厂商后台策略、MDD live auth/网络均未运行验证；历史 endpoint 当前为全量列表，需限制响应大小/按 line 串行避免大账本。
- **下游待办：** 先实现并测试 source/reconciler → 再接 coordinator/bridge/registry → 跑 MDD、Android、Dart targeted → deep-reviewer 审查身份/竞态/副作用 → final-audit 复核证据新鲜度与真实设备缺口。

### 结论

**PASS（仅对设计方案与交接完整性）；NOT RUN 生产实现与运行支持。**
