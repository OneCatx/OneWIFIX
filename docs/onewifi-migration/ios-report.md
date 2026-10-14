# iOS migration checkpoint (2026-10-13)

## Supplemental source freeze

- The Android continuation worker completed the explicitly authorized iOS supplement: ordinary SIP dial has a required originating operation UUID/header/event, CallKit binds only that operation, background media refresh and dial reject stale session generations, and verified eSIM switch results relocate the retained shell to the exact newly observed MDD device/reader after refreshing inventory.
- Earlier supplemental validation: `flutter test --no-pub --reporter compact` **1,078 passed, zero failed, exit 0** (execution session 27440, final chunk 866f8a); `flutter analyze --no-pub` **No issues found, exit 0** (chunk 30f1c2). These command receipts were preserved by the executing worker in android-report.md. The original 1,077-test JSON log below predates the supplement and must not be substituted for its verification.
- Canonical `mdd_mobile_contract.dart` SHA256: `123BB65EBAD1DB1D694608C74D9B55E13ED5BB5303E798BFDFF5BFA5D8AC4F42`; `sip_call_service.dart`: `3285687365AA94A6BE57DE2560D7F51C3D4B52357E84D82769AB28BA571DEE18`. Parent `source-evidence-checkpoint.json` independently records both cross-app shared hashes and all eleven matching backend fixtures. Independent mobile review is still pending; Swift/Xcode and device/runtime remain unverified.

Latest post-reader-only-shell correction validation: `flutter test --no-pub --reporter compact` **1,078 passed, zero failed, exit 0** (session 79427, final chunk a2f35c); `flutter analyze --no-pub` **No issues found, exit 0** (chunk 1365b6). Reader-only post-switch results return to the device list. These are tool receipts, not a persisted full-suite log; final evidence will bind reviewed source and durable logs.

## Implemented source

- Preserved retained Flutter pages and native CallKit/PushKit/Live Activity entry points. Production dependencies route page APIs to MDD `/api/mobile/v1/*` and keep native MDD auth/instances unwrapped. Login/status/logout request/check management capabilities; bearer logout/revocation clears SIP and push state. The old native SSE/PCM call path is no longer instantiated by the production call host.
- A process-owned Flutter SIP engine uses per-instance `sip_ua` contacts and `flutter_webrtc` media, bearer WSS and current MDD ICE provisioning. CallKit audio activation gates answer/dial/microphone. Push immediately reports a native call, queues early answer, binds engine `X-MDD-Call-ID` to the same instance and OS UUID, then tries bounded receipt-verified SIP pickup only when a normal INVITE has not bound. Ordinary outgoing attempts include `X-MDD-Mobile-Operation`; late pickup attempts use the separate `X-MDD-Mobile-Pickup` marker; wrong line, expired receipt, cancellation and stale restore are fail-closed. History reads native `/api/instances/{iid}/calls`; UI call actions are SIP-scoped.
- Reader-only device rows cannot call. Detection/provision resolves a fresh, exact PC/SC name and refuses stale/ambiguous lists. Null backend host/network/signal/quota fields render unavailable rather than healthy zero. SMS multipart counts remain unknown when unconfirmed; paired OTP uses MDD credentials and no old origin fallback. Notification masks and `onetools` parse/round-trip; unsupported email, MTU and card-policy controls are disabled in production. Legacy product license remains stored, but legacy gateway license read is skipped.

## Evidence and files

- `flutter analyze --no-pub` (2026-10-13): **No issues found**, exit 0.
- `flutter test --no-pub --reporter json > artifacts/ios-migration-flutter-test-current.jsonl` (2026-10-13): **1,077 passed, 0 failed**, final `success:true`, exit 0. Includes reader detect/provision widget/API, call registry/late pickup/retired helper, route/auth, SMS/OTP, notification masked multi-URL and generated fixture parser tests. JSON log is under `IOS/artifacts/`.
- All 11 `IOS/test/fixtures/mdd/*.json` are byte-for-byte SHA256 matches to frozen backend `docs/onewifi-migration/contracts/*.json`. The generated contract test traverses actual Overview/Device/eSIM/SMS/Settings API and DTO parsing, not a standalone JSON decoder.
- Direct package pins: `sip_ua 1.1.0`, `flutter_webrtc 1.6.2+hotfix.4`, `logger 2.8.0` in `IOS/pubspec.yaml` and lockfile. Shared mirror signatures, fixture names and Android page checklist are in `mobile-contract.md`.
- Principal source areas: `IOS/lib/core/config/mdd_mobile_contract.dart`, `lib/core/http/http_transport.dart`, `lib/app/app_dependencies.dart`, `lib/features/calls/data/{sip_call_service,mdd_sip_background}.dart`, `lib/features/devices/data/reader_provision_api.dart`, page API/DTO/UI files under `lib/features/{auth,calls,devices,overview,settings,sms}`, `IOS/ios/Runner/{AppDelegate.swift,APNsBridge.swift,Calls/CallKitCoordinator.swift,Calls/CallPushRegistry.swift,Calls/CallSessionChannel.swift}`. Tests live under corresponding `IOS/test/` areas. Existing dirty work was preserved; no commit/reset.

## Not run and integration risks

- **NOT RUN:** Xcode/Swift compile, simulator/device install, PushKit cold/background wake, CallKit callbacks/audio routing, APNs/Live Activity provider delivery, actual MDD login, reader/SIM/IMS/eSIM, native WebRTC codec/TURN, SIP multi-contact fork/late pickup and bidirectional speech. This Windows host has no Mac/Xcode, iOS device, authorized MDD origin or reader. Flutter source tests cannot stand in for those observations.
- Outgoing SIP pickup header is checked against `call.session.request` in source; its visibility at `CALL_INITIATION` in the pinned package and the server's `Pickup()` execution need an instrumented real call. If it is missing, the binding fails closed rather than assigning an arbitrary outgoing dialog to a pushed OS UUID. Current TURN refresh affects subsequent offers only; existing connections are not ICE-restarted. Runtime acceptance remains open under `ACCEPTANCE_PROTOCOL.md`.

## Parent durable frozen-source verification

After the reader-only shell correction and worker freeze, parent reran `flutter test --no-pub --reporter json`: **1,078 passed, 0 failed, exit 0, final success:true**, durable log `IOS/artifacts/ios-final-flutter-test.jsonl`; `flutter analyze --no-pub`: **No issues found, exit 0**, log `IOS/artifacts/ios-final-flutter-analyze.log`. `ios-final-evidence.json` binds all relevant source/native/test/manifest hashes before and after both commands (unchanged), and command-log hashes. This supersedes earlier session-only Flutter receipts as the source-test receipt. Independent mobile review remains pending and may invalidate it through repairs; Swift/Xcode/device and live MDD acceptance are not proven.

## Parent final source receipt (2026-10-13 22:38 +08:00)

- `run-mobile-final.py ios`: 1,086 Flutter tests passed, 0 failed/error, terminal success true, exit 0; analyzer exit 0.
- Actual-handler deferred answer cancellation focused test: 4/4 pass and file analyzer clean. `verify-final-evidence.py` exit 0.
- Swift/Xcode/XCTest, signed install, PushKit/CallKit runtime and live MDD/SIP remain unavailable on this Windows host.

## W3 execution receipt (2026-10-14 13:24 +08:00)

### Scope and source boundary

- Window: **W3 — iOS native build and CallKit/PushKit**.
- Modified paths in this W3 pass: this report, the generated receipt, the production-path audit log, and `STATE_VERSION.tsv`. No iOS source, Android source, backend code, or `NEWONE` files were changed by the validation commands.
- The validation ran from `E:\GQ\Ultra\ONEWIFI\IOS` against the retained MDD-only source tree. The generated receipt includes the exact input inventory and source identity.

### Fresh commands and results

| Command | Result | Evidence |
|---|---|---|
| `python E:\GQ\Ultra\mdd-sim-gateway\docs\onewifi-migration\run-mobile-final.py ios` | **PASS** — Flutter test `1086 success / 0 failure / 0 error`, terminal `success:true`, exit 0 | `E:\GQ\Ultra\ONEWIFI\IOS\artifacts\ios-final-flutter-test.jsonl`; SHA-256 `142c88c20a9f6ff179f1ac57d1ed388ca212461e02335f6723f1884a44227faf` |
| same command, analyzer phase | **PASS** — `No issues found!`, exit 0 | `E:\GQ\Ultra\ONEWIFI\IOS\artifacts\ios-final-flutter-analyze.log`; SHA-256 `687ec766334cbefb8e2179676ab2c0f4d0b6455a7f33eabdf8076358e1a8ac03` |
| `python E:\GQ\Ultra\mdd-sim-gateway\docs\onewifi-migration\verify-final-evidence.py` | **W3 row PASS** — `ios-final-evidence.json` identity valid; overall command exit 1 because an unrelated W2 backend receipt reports `log drift: command` | iOS row in command output; backend issue is handed to W2/W5 and does not invalidate the iOS receipt |

Generated iOS receipt: `E:\GQ\Ultra\mdd-sim-gateway\docs\onewifi-migration\ios-final-evidence.json`, recorded `2026-10-14T13:24:31.332407+08:00`, SHA-256 `20c79006744304f3a5d301b26e36b7d0f84ae85703668dc158c910a87ffddc44`, with `source_unchanged: true`.

The current shared Dart mirror check is byte-identical: `mdd_mobile_contract.dart` SHA-256 `123bb65ebad1db1d694608c74d9b55e13ed5bb5303e798bfdff5bfa5d8ac4f42`; `sip_call_service.dart` SHA-256 `d14a4044a8c08cf6beaf325b0e12c9e388ec05c979d25b1fc337f66c932f892b` in both iOS and Android. Earlier hashes in the historical sections above are preserved as prior receipts.

### Production-path audit

- `ios/Runner/AppDelegate.swift` owns `MddCallKitCoordinator`, `CallPushRegistry`, and the headless `mdd_sip` Flutter engine. The production call path sends MDD SIP commands (`dial`, `answer`, `hangup`, `mute`, `dtmf`, `pickup`) through the `call_session` bridge.
- The historical `CallKitCoordinator`/`CallGatewayClient`/`CallEventStream`/`CallPCMTransport` and `CallAudioBridge` classes remain in the project for isolated native regression tests. `AppDelegate` does not register `call_audio` and does not instantiate the historical coordinator; this is source-retention evidence, not a Swift build or runtime proof.
- `CallsController` selects `SilentCallHandset` whenever `IOSNativeCallSession`/iOS is active. The retained `ChannelCallHandset`/`call_audio` path therefore remains available only to non-iOS legacy paths and tests; it is not selected by the iOS production composition. The rerunnable audit and native-toolchain probe are in `E:\GQ\Ultra\ONEWIFI\IOS\artifacts\ios-w3-production-audit.log` (SHA-256 `7e5132294e733f044dba269fe7965863bf9e11e12acf7323a5c6a0782e5d10a0`).
- Flutter iOS production call dependencies use the MDD SIP/WebRTC service and MDD routes. No old gateway or permissive TLS fallback is reachable from the iOS entry; the retained non-iOS PCM helper is not evidence of iOS runtime use.

### Native and runtime boundary

- **BLOCKED / NOT RUN:** Swift/Xcode compilation, XCTest execution, signed installation, CallKit system callbacks, PushKit cold/background wake, APNs delivery, AVAudioSession routing, native WebRTC codec/TURN, live MDD login, IMS registration, SIP fork/late pickup, and bidirectional speech. This Windows host has no Xcode, iOS device, authorized MDD origin, reader, or test number.
- Flutter tests and analyzer are software evidence only and must not be promoted to native/runtime PASS. The next executable action is to run the Mac/Xcode and authorized-device steps from `ACCEPTANCE_PROTOCOL.md`, then attach build ID, install version, device logs, MDD instance ID, and redacted call receipts.
