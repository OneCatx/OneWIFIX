# Android resident late-registration pickup contract addendum

## Decision

Implement the smallest Android-only bridge: MDD wire stays unchanged; native owns the OS UUID and `CallKey(instanceId, engineCallId)`, while Dart owns the SIP pickup lease and real dialog. Never use engine call ID as a SIP dialog ID, and never send SIP pickup before a user/system answer and a valid MDD receipt.

## Existing primitives

- Dart `SipDialogRegistry` already has `reserveIncoming`, `bindPickup`, `owns`, `cancel` and a 25-second lease.
- `SipCallService.pickup(instanceId, callId, target, osUuid)` validates the tuple and sends `X-MDD-Mobile-Pickup: <osUuid>`.
- `MddPickupReceipt.parse` validates device, call, expiry and URI, but `AndroidSipRuntime` has no receipt/pickup command.
- `CallCoordinator.answer` currently passes `CallKey.callId` directly to `CallActions.answer`; resident answer must first obtain the real SIP dialog.

## Dart command contract (`android_sip_entrypoint.dart`)

Add commands handled by the existing runtime and existing service registry; all commands check configuration/generation.

### `reserveIncoming`

Input: `{osUuid, instanceId, callId}`. Call the existing registry (do not create another registry). Same tuple is idempotent; a UUID already owned by another tuple returns `call_state`. Return `{instanceId, callId, osUuid, dialogId: null}`.

### `pickup`

Input: `{osUuid, instanceId, callId}`. Require exact registry ownership. GET `/api/mobile/v1/calls/{callId}/pickup?device_id={instanceId}` with current bearer and certificate pin, 3 second timeout, no retry. Parse with `MddPickupReceipt.parse`; 400/404/409/expiry produce `call_terminal` or `call_expired` and must not call SIP. Then call `SipCallService.pickup(instanceId, callId, 'mddpickup-$callId', osUuid)`. Wait up to 8 seconds for an event with exact `instanceId`, `mddCallId == callId`, incoming direction and a real `dialogId`; call `registry.bindPickup` and return `{instanceId, callId, osUuid, dialogId}`. Timeout cancels the registry lease and returns `pickup_timeout`. Keep one in-flight operation per call; duplicate commands cannot fetch a second receipt or send a second INVITE.

### `cancelPending`

Input: `{osUuid, instanceId, callId}`. If ownership matches, cancel the existing registry lease and waiter; operation is idempotent. Logout, clear and generation invalidation cancel every pending lease. A bound dialog is cleaned by existing coordinator ownership rules.

Runtime event forwarding must preserve both `mddCallId` and `dialogId`; no matching by phone number, recent event or dialog alone. Missing `mddCallId` cannot bind a pickup.

## Native contract (`AndroidSipBridge.kt`, `CallCoordinator.kt`)

- Resident `CallActions.answer` receives `CallKey(instanceId, engineCallId)`, reserves once when the Telecom incoming UUID is created, and invokes `pickup` only from the system/user answer callback.
- Store `PendingPickup(instanceId, engineCallId, nativeUuid, dialogId, generation)` in the bridge. After pickup, all SIP answer/media calls use the returned real `dialogId`; never pass `engineCallId` to SIP answer.
- State is `ringing -> answering -> pickup_in_flight -> dialog_bound -> connecting_audio -> active`. Any receipt, transport or dialog timeout fails and cleans Telecom/registry without retry.
- Preserve `engineCallId` for MDD history/hangup and `dialogId` only for SIP operations. Ordinary SIP paths remain unchanged.
- Preserve pickup errors (`call_terminal`, `call_expired`, `pickup_failed`, `pickup_timeout`) through `AndroidSipBridge.invoke`; failure must issue `cancelPending`.

## File ownership

1. `android/lib/features/calls/data/android_sip_entrypoint.dart`: commands, receipt GET, one in-flight map, exact event waiter, generation/clear cancellation.
2. `android/lib/features/calls/data/sip_call_service.dart`: only narrow registry accessors if required; do not change pickup/header semantics.
3. `android/android/app/.../AndroidSipBridge.kt`: wrappers, result parsing, pending UUID/engine/dialog record, error preservation.
4. `android/android/app/.../CallCoordinator.kt`: resident answer branch and cleanup; generic answer must not consume engine ID as dialog.
5. `ResidentCallSource.kt`/`AndroidCallHost.kt`: discovery and snapshot only; no receipt or SIP ownership.

## Ownership, failure and rollback

MDD source owns discovery/terminal status; native owns Telecom UUID; Dart owns SIP lease/dialog binding. Terminal MDD state, logout, generation change, reject or platform disconnect cancels once; late events cannot resurrect. Receipt is not persisted. Socket failure affects discovery only and does not tear down a bound dialog. Receipt failure has no SIP side effect. SIP pickup timeout cancels lease and disconnects Telecom without retry. Disabling the resident feature gate returns to existing SIP-only behavior; no migration is needed.

## Verification and evidence

Add Dart tests for identity mismatch, duplicate pickup, receipt rejection/expiry, exact dialog binding and cancellation. Add Kotlin tests for engine/dialog separation, generation/logout and no auto-answer. Run existing targeted Dart call tests and `gradlew.bat :app:testDebugUnitTest --tests com.oneims.onewifi.calls.CallCoordinatorTest` plus `ResidentCallSourceTest`. Real Telecom/IMS late-registration remains NOT RUN until hardware is available.

## Verdict

PASS as an executable software contract. Production implementation, device behavior and Telecom deadline remain NOT RUN.
