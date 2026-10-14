# Actual handler answer cancellation tests

Freeze recorded: 2026-10-13 22:34:09 +08:00 (Asia/Shanghai workspace time).

## Owned files

- E:\GQ\Ultra\ONEWIFI\IOS\test\features\calls\data\mdd_sip_background_test.dart
- E:\GQ\Ultra\ONEWIFI\android\test\features\calls\data\android_sip_runtime_test.dart
- this report: E:\GQ\Ultra\mdd-sim-gateway\docs\onewifi-migration\answer-handler-tests-report.md

No production files, package versions, certificates, manifests, hooks, or native runtime code were changed. The test doubles implement the public SIPUAHelper listener boundary and the sip.Call / RTCSession dependency boundary. No SIP service, OS call, network, or hardware call is made.

## Coverage

- iOS MddSipBackground.handleCommand: cancellation while answer waits for deferred media refresh; exact old dialog is hung up once; the answer branch never calls answer; unrelated and replacement dialogs are untouched.
- iOS: cancel-before-answer prevents a later answer and hangs up the reserved old dialog.
- iOS: existing dial cancellation checks remain covered for cancellation during media refresh and while the helper call is pending.
- Android AndroidSipRuntime.handleCommand: actual start/subscription path and mocked sip_runtime MethodChannel; cancellation while answer waits for deferred media refresh; exact old dialog is hung up once; unrelated and replacement dialogs are untouched; late answer rejects.
- Android: existing dial cancellation check remains covered, including no late INVITE.

The iOS test installs a deterministic mock for com.oneims.onewifi/mdd_sip so start()'s native ready, event, and line calls cannot leak MissingPluginException asynchronous failures. The Android fake now propagates each call's MDD call ID through its fake RTC request header, preserving event identity for unrelated/replacement assertions.

## Focused verification

Commands were run serially per package; no full suite was run.

| Package | Exact command and working directory | Result | Log |
| --- | --- | --- | --- |
| iOS | `C:\Flutter\flutter\bin\flutter.bat test test/features/calls/data/mdd_sip_background_test.dart` from `E:\GQ\Ultra\ONEWIFI\IOS` | exit 0; 4 tests passed | `E:\GQ\Ultra\ONEWIFI\IOS\artifacts\answer-handler-focused-test.log` |
| Android | `C:\Flutter\flutter\bin\flutter.bat test test/features/calls/data/android_sip_runtime_test.dart` from `E:\GQ\Ultra\ONEWIFI\android` | exit 0; 2 tests passed | `E:\GQ\Ultra\ONEWIFI\android\build\mdd-jdk-diag\answer-handler-focused-test.log` |
| iOS | `C:\Flutter\flutter\bin\flutter.bat analyze test/features/calls/data/mdd_sip_background_test.dart` from `E:\GQ\Ultra\ONEWIFI\IOS` | exit 0; no issues | `E:\GQ\Ultra\ONEWIFI\IOS\artifacts\answer-handler-focused-analyze.log` |
| Android | `C:\Flutter\flutter\bin\flutter.bat analyze test/features/calls/data/android_sip_runtime_test.dart` from `E:\GQ\Ultra\ONEWIFI\android` | exit 0; no issues | `E:\GQ\Ultra\ONEWIFI\android\build\mdd-jdk-diag\answer-handler-focused-analyze.log` |

## Freeze

Source/test freeze is explicit at this point: the two owned test files and this report are complete for this bounded task. Do not modify production code or broaden to full-suite execution under this task. Parent-owned review and full-suite gates remain separate.
