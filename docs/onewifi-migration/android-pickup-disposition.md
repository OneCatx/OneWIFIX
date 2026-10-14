# Android late-registration pickup disposition (2026-10-13; superseded by 2026-10-14 software implementation)

> **Current superseding status (2026-10-14):** the Android software slice described below is now implemented in `ResidentCallSource`, `CombinedCallEventSource`, `CallCoordinator`, `AndroidSipBridge`, and `android_sip_entrypoint.dart`. Authenticated `/ws` + per-line history reconciliation, bounded dedupe, resident UUID reservation, receipt-verified pickup, SIP dialog binding, and cancellation paths are wired and covered by focused tests. The remaining limitation is runtime-only: Telecom/device/Doze/process-death/live MDD/IMS/SIP behavior is still **NOT RUN**, so this document must not be read as a claim that a killed-process call has been accepted.

## 结论

**架构缺口，范围限定为 Android 的晚注册来电接管；不是“没有 FCM 就绝对不可能”。**

- `CallStandbyService` 使用 `START_STICKY`，在用户显式开启待机后持有 partial wakelock，并通过 `CallSessionRuntime` 恢复 `SipCallEventSource`/`AndroidSipBridge`。因此进程和驻留服务仍在运行时，SIP 重新注册本身可以继续发生；“无 FCM”主要阻断的是进程死亡/系统回收后的冷启动唤醒。
- 但是当前驻留路径只消费 SIP registration/call 事件。`SipCallEventSource` 从 `AndroidSipBridge` 接收 `event(kind=call)`，没有订阅 MDD 的通用认证 `/ws`，也没有在 SIP 尚未收到 INVITE 时读取 MDD 的 ringing call 记录。因此 SIP 晚注册后，当前实现没有可靠入口发现已经存在的 MDD ringing call 并主动 pickup。
- 共享 `SipCallService.pickup(instanceId, callId, target, osUuid)`、`SipDialogRegistry.reserveIncoming/bindPickup` 和 MDD `GET /api/mobile/v1/calls/{call_id}/pickup` 已提供底层 receipt/身份校验，但 Android production composition 没有把它们连到 `CallCoordinator` 的 OS incoming UUID reservation。现有 Android 入口不能声称已支持晚注册 pickup。

## 实际调用链

1. MDD engine `call_in` 以稳定 engine `call_id` 写入 ringing 记录并广播 `{type:"call", instance, call:{call_id,...}}`；同时 `_push_ringing_call` 仅通过已注册的 VoIP APNs endpoint 发送含 `call_id`/`pickup_uri` 的通知。
2. Android `CallStandbyService` → `CallSessionRuntime` → `SipCallEventSource` → `AndroidSipBridge` 只启动/恢复 SIP lines。SIP 事件到达后，`SipCallEventSource.accept` 才创建 `CallKey(instanceId, dialogId)` 并让 `CallCoordinator` 建立 Telecom incoming call。
3. 若 SIP registration 在 `call_in` 之后才建立，当前 Android 没有 MDD event consumer、ringing-call reconciliation、OS UUID reservation 或 `pickup` command，因此不会从已存在的 `call_id` 走到 `MddPickupReceipt.parse` 和 `SipCallService.pickup`。
4. MDD generic `/ws` 对 bearer client 已被 authz 允许，且现有广播 payload 包含 `instance` 与 `call.call_id`；但 Android 未连接此 socket。当前 `CallEventMonitor` 也不能作为解决方案：它请求的 `/api/calls/events` 在 MDD 当前源码中没有对应 endpoint，且生产 `AndroidCallHost` 使用的是 `SipCallEventSource`。

## 最小可行连接（需要架构决策/新增契约）

不引入新的云推送时，最小闭环应是驻留服务内的 MDD authenticated event/reconciliation consumer：

1. Android standby runtime 使用现有 bearer credential 连接一个有明确契约的 call-event stream。可以复用 generic `/ws`，但必须明确 `type:"call"`、`call.direction:"in"`、`call.status:"ringing"`、稳定 engine `call.call_id`、`instance` 和可重连后的 reconciliation 语义；当前 `/ws` 没有 cursor/replay 保证，因此至少要在重连后查询每条 line 的 open ringing calls，避免错过事件。
2. 对每个 `(instance_id, call_id)` 只执行一次本地 OS UUID reservation，并把该 UUID、line、engine call ID 绑定到 runtime lease。未知/缺失/格式错误的 `call_id` 必须拒绝，不能用 peer number、dialog ordinal 或数据库自增记录 ID 替代。
3. 在 reservation 成功且 call 仍处于 ringing 窗口时，调用现有 mobile pickup receipt endpoint，校验 `device_id`, `call_id`, `expires_at`，再调用现有 `SipCallService.pickup(..., osUuid)`。SIP pickup event 必须由 `X-MDD-Mobile-Pickup` 与 registry lease 精确绑定，随后才交给 `CallCoordinator` 建立 Telecom incoming call。
4. 事件重复、重连、另一客户端先接听、过期或取消都必须按 `(instance_id, call_id, osUuid)` 幂等处理；终态/409/过期需撤销 lease、结束本地 notification，并不得再次 pickup。进程死亡仍需要独立 wake transport（FCM 或系统允许的等价机制）；generic `/ws` 不能唤醒已死亡进程。

这不是本次只读复核可直接假定完成的“顺手接线”：它新增 Android runtime 与 MDD event/replay 的公开契约。若产品接受“Android 仅支持驻留 SIP registration、进程死亡晚 pickup 不在范围内”，应把 acceptance 明确收窄并保留当前 GAP；否则需要先冻结上述事件/reconciliation/UUID 契约，再实现和测试。

## 证据边界

- 已读取：`GAP_INVENTORY.md`, `MIGRATION_SPEC.md`, Android `CallStandbyService`, `CallSessionRuntime`, `SipCallEventSource`, `AndroidSipBridge`, `android_sip_entrypoint.dart`, shared `SipDialogRegistry`/`SipCallService`, MDD `main.py`, `mobile_api.py`, `notify_push.py`, `mobile_pairing.py`, `authz.py`。
- 静态结论：当前实现支持驻留 SIP incoming/reconnect 的基础服务生命周期，但不证明晚注册 pickup 已闭环；无 FCM 只直接影响 killed-process wake。
- NOT RUN：真实 SIP fork/registration timing、Android Telecom/notification、Doze/process-death、APNs/FCM、live MDD origin and device. No production/test files were changed.

## 判定

**BLOCKED for claiming Android late-registration pickup acceptance; PASS for the narrower claim that a user-enabled resident service can keep the SIP runtime alive and reconnect while the process remains alive.** The missing piece is an explicit MDD event/reconciliation consumer plus Android UUID-to-pickup wiring, not merely an FCM package.
