# Android resident late-registration pickup implementation report

Date: 2026-10-14 (Asia/Shanghai)

## Decision

**PASS for the bounded Android software slice; real device/Telecom/IMS acceptance remains NOT RUN.**

The Android host now composes the existing SIP source with an authenticated MDD resident source. Events are reconciled with per-instance history, deduplicated by `(instance_id, engine call_id)`, and terminal state cannot be resurrected; `answered` without `end_ts` remains active and does not synthesize `ended_at`. Matching SIP events take dialog precedence without losing the resident lease. The coordinator keeps engine call IDs, OS/native UUIDs, and SIP dialog IDs as separate identities. A resident answer reserves the UUID, waits for user answer, obtains the existing pickup receipt, binds the returned SIP dialog, and only then answers; decline/failure uses `cancelPending` and never sends an engine ID to SIP hangup. Direct SIP incoming/outgoing behavior is retained.

## Implemented files and boundaries

- `android/app/src/main/kotlin/com/oneims/onewifi/calls/ResidentCallSource.kt`: bearer-authenticated `/ws`, enabled-instance filtering, per-line history reconciliation, strict engine ID validation, retry/backoff, terminal-aware bounded reducer, and SIP/resident merge.
- `android/app/src/main/kotlin/com/oneims/onewifi/calls/CallCoordinator.kt`: resident UUID reservation, source-key/dialog separation, receipt pickup then SIP answer, generation/terminal/decline races, and pending-lease cancellation.
- `android/app/src/main/kotlin/com/oneims/onewifi/calls/SipCallSource.kt` and `AndroidSipBridge.kt`: existing bridge adapters for `reserveIncoming`, `pickup`, and `cancelPending`, with preserved terminal error codes.
- `android/lib/features/calls/data/android_sip_entrypoint.dart`: generation-checked reserve/pickup/cancel commands, one in-flight pickup, authenticated receipt fetch, exact event matching, and timeout/terminal mapping using existing `SipCallService`/registry.
- `android/lib/features/calls/data/sip_call_service.dart`: rejects OS UUID reuse for a different resident identity.
- Focused Kotlin/Dart tests cover authentication termination, null timestamps, idempotence, bounded tombstones, source merge/deduplication (including active SIP winning resident `answered`), identity separation, resident cancel-without-engine-as-dialog (including coordinator close cleanup), UUID reuse, and pickup response shape.

No iOS, MDD production, NEWONE, new endpoint, FCM, credential persistence, TLS/certificate, package-version, or auto-answer changes were made.

## Evidence and limits

- `python E:\GQ\Ultra\mdd-sim-gateway\docs\onewifi-migration\run-kotlin-final.py`: exit code 0, `SOURCE_UNCHANGED True`, 218 current source/artifact entries; `:app:compileDebugKotlin` passed (existing Gradle/plugin deprecation warnings only).
- `flutter analyze lib/features/calls/data/android_sip_entrypoint.dart lib/features/calls/data/sip_call_service.dart`: clean (`No issues found`).
- Focused Dart tests `flutter test --no-pub test/features/calls/data/android_sip_runtime_test.dart test/features/calls/data/sip_call_service_test.dart`: 12/12 passed.
- Full Android JVM task now passes **109 tests, 0 failures, 0 errors, 0 skipped** after the actual remote `gateway_selfsigned` certificate was added. `:app:assembleDebug` also passes; structured evidence is `android-jvm-apk-evidence.json`.
- `python -m unittest tests/test_mobile_call_correlation.py` remains blocked on Windows Python import failure (`fcntl`).

Real Telecom UUID ownership, answer deadlines, Doze/process death, live MDD `/ws`/history, and IMS/SIP device behavior remain NOT RUN. APK installation/signing is not claimed. Rollback is to remove the resident source from `AndroidCallHost` and retain the existing SIP-only source.



