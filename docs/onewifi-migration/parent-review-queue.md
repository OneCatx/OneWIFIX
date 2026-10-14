# Parent integration review queue — 2026-10-13
This queue records concrete review findings on work in progress, not final verdicts. Owners must bind fixes to tests and current diffs.

## Current continuation disposition

Historical OPEN entries below are superseded where the independent reports close them. Backend call identity/APNs/eSIM cancellation and OneTools findings are closed by the sixth source review and unchanged-source 2,080-test regression. The final mobile call source review closes dial/answer cancellation and native action findings; it does not establish runtime acceptance. Current receipt verification confirms backend, OneBoard and iOS identity. Android receipts are stale only from the documented main.dart EOF cleanup and must be refreshed after the actual-handler answer tests. All three current git diff --check commands exit zero.

Actual-handler answer cancellation coverage remains in progress on both retained apps. Dependency test doubles are valid for software orchestration tests; private constructors alone are not a testability blocker when the package types expose implementable interfaces. Production test hooks are not authorized for this coverage work. Prior mobile receipts/logs are preserved as *-before-answer-handler-tests-*.

SOCKS ePDG DNS ECS and Android resident late-pickup are undergoing narrow gap disposition before final audit. AT&T/Three HK, native build/install and real hardware acceptance remain separately open. No overall completion percentage is inferred from source counts or unit tests.

- iOS: consume pending answer when CallKit audio activates after INVITE; preserve invitation when it arrives before push/native report; bind outgoing dialog using explicit originating operation identity; report actual microphone/foreground/registration state.
- Shared SIP: emit registration and transport state, refresh short-lived TURN media provisioning without destroying active dialogs, prevent old origin/token or in-flight restore resurrecting after logout.
- Android: single headless UA ownership; configure/clear generation races; pending call futures must not leak timeout failures; complete JDK loopback diagnosis and preserve existing trust intent.
- Both phones: prove retained page calls/history no longer reach old REST PCM call controls; shared contract/service parity; unprovisioned readers visible but not callable; unavailable host measurements and absent license quota are nullable.
- Backend: complete scoped late-registration pickup for background-woken phones; stable engine call_id -> fork header -> push/native identity; reader-only management mapping; core eSIM/settings/push/provider/profile/QMI work remains required.
- MDD has MAX_SIM_LINES=10 in current config; this is different from legacy OneWIFI license seats. Do not invent a seat quota or imply unlimited MDD lines.
- OneBoard implementation still pending a worker slot. All source/build/install/runtime evidence remains separate.

Initial findings sent directly to the respective workers; no production changes made by parent.

2026-10-13 Android parent review continuation (queued for worker after shared-contract freeze):
- Build blocker revised: project-local jdk.net.unixdomain.tmpdir fixes Selector.open and :app:compileDebugKotlin now passed on JDK21 with downloaded pinned native dependencies. Logs Android build/mdd-jdk-diag/compile-kotlin-online.log. Unit tests/APK running; no install/device proof.
- android_sip_entrypoint.dart _withCall outgoing currently matches any outgoing event on a line. Use the shared explicit originating operation/dialog correlation authored by iOS; concurrent/replayed events must not complete the wrong call.
- _refreshMedia / dial / answer can await across clear/new configure without generation validation. Bind each in-flight command to origin/token/generation and fail closed after logout/session replacement.
- SipCallSource SipWebRtcMedia updateTrack passes dialogId only; preserve instance identity throughout mute/action paths. Future native MDD ID vs OS UUID mapping and late pickup required.
- SIP call event start timestamp currently overwritten on every nonterminal state, unbounded calls map may grow. Preserve initial timestamp, bounded terminal lifecycle matching retained history behavior.
- Reader:<id> provisioning in retained devices screen is being authored on iOS; mirror both schema and page wiring, not just central path prefix.
- Mirror final nullable actual modem metrics and SMS parts contract; unknown metrics must not display invented values.

2026-10-13 OneBoard parent review: new t('Gateway account'), t('Main navigation'), t('Mobile navigation'), t('More pages'), t('Open menu') have no Chinese entries in i18n.jsx; add when WebUI worker resumes notification forms. Existing backend i18n coverage tests do not scan these shell literals, so 18 Node tests are not translation proof. Preserve login/native auth behavior and test-only fixture separation.

2026-10-13 Android native state-machine review:
- CallCoordinator.hangup still treats ringing inbound calls as merely remotely observed fleet entries, skipping api.hangup when ownsRemoteCall=false. With SipCallEventSource each event is this UA's actual local SIP dialog, so local decline must reject its own SIP branch without unconditional gateway/all-client hangup. Adapt ownership semantics and add decline-vs-other-client-answer regression; do not leave hidden ringing dialogs after native dismiss.
- CallCoordinator invokes api.dial/answer before startAudio(capture...). WebRTC opens native mic during SIP operation, so old PCM gate occurs late. Ensure WebRTC sender/native audio starts gated by actual Telecom/audio activation and mute state; propagate media command failures instead of SipWebRtcMedia.runCatching silently reporting audioReady=true. Actual device audio remains unverified, but code must not assume PCM lifecycle still controls native WebRTC.

2026-10-13 second continuation, findings assigned before final freeze:
- Shared SIP: configure awaits helper.start without rejecting a removed/stopped line after completion; late startup after clear/replace must force-stop the obsolete helper. A single pending pickup slot must not consume an unrelated outgoing call initiation. Every call action must resolve instance+dialog, not search all lines by dialog alone. iOS owns shared fixes and Android mirrors after freeze.
- Notification URL masks: positional restoration cannot safely represent deletion/reordering. Backend now permits unchanged all-mask same-length arrays or explicit full replacement only; partial/mixed masks fail 409 including send-test. Existing forms must explain re-entry and not silently retain the wrong destination.
- Notification native provider schema is ready for OneBoard continuation; see task-oneboard-continuation.md. APNs accepted is not delivered, and synthetic VoIP test remains unsupported without a real call.
- Backend SMS parts_total/parts_accepted and modem radio_channel must remain null when the underlying system has no measurement. Mobile parsers/renderers must not invent values.
- Backend facade eSIM switch must not return verified already_active solely from cached hub.cards. Verify inventory/identity under the MDD reader lock, coordinate with native compensation implementation.
- Mobile PushPlus notification test needs manage_settings allowlist entry and an actual bearer route test, not only an administrator test.
- Retired gateway license fetch must be disabled alongside local license activation in MDD mode. Settings/preferences, system/info and actual SMS storage policy have real MDD mappings being added; legacy MTU toggle and per-card APN/MBN/voice policy lack equivalent runtime behavior and must have explicit disabled/unsupported UI.
- Current-tree regression started in isolated WSL tmpfs. It excludes only the independently reproduced hung original Git-hook fixture module and is intermediate while workers still edit; not final verification.

## Current queue disposition after third backend review

Historical items above are not all open. Current source receipt details live in worker/review reports.

- CLOSED for inspected source: result-before-start terminal call persistence, separate VoIP topic, native physical ICCID success validation, same-reader enable transaction serialization. Fresh full backend regression remains pending the next fixes.
- OPEN P1 backend: download reservation must cover sibling readers of one physical modem; native and SSE cancellation must await actual cancellation and handle queued pre-start work with exact operation ownership. backend_worker owns these.
- FROZEN iOS source: canonical operation identity and shell reader-only relocation verified by durable 1,078-test run and clean analyzer, source unchanged in ios-final-evidence.json. Independent review pending.
- FROZEN Android calls/eSIM source: explicit operation lease/receipt, resident SIP events and native decline ownership, media errors, target eSIM parsing. Non-call page/test owner still active. Microphone is muted before SIP getUserMedia; it is not true that acquisition waits for Telecom. Independent review must assess actual capture/activation sequence.
- Android late pickup is not integrated into a native OS-UUID wake path: no baseline FCM/push transport exists; shared pickup primitives alone do not establish this feature. Resident foreground-service inbound SIP path remains the implemented behavior, subject to device proof.
- FROZEN OneBoard: notification/APNs forms, translations, 22 tests/build and hashes; browser preview is synthetic only.
- Carrier O2/Ultra current pinned source application/idempotence receipt checked by independent reviewer; no C build/image/runtime. AT&T/Three HK consumers and SOCKS ECS remain known software gaps.

OPEN P1 independent mobile review: iOS pending dial cancellation only clears registry/pending slot while awaited media provisioning and SIP initiation can continue under unchanged session generation. Native end before dialog binding may cause untracked late outgoing INVITE. Require exact operation cancellation ownership before and after awaits plus regression of deferred media/SIP start; shared service mirror and final tests must be refreshed after repair. Android continuation owner assigned pending available slot.

OPEN P2 cross-contract: OneTools view is canonical enabled=true/public_base_url empty, but backend ignores updates and both apps expose enabled toggle; Android additionally exposes editable address. Backend owner will reject unsupported noncanonical writes; mobile settings owner will disable unsupported editing and explain MDD-origin pairing. GET fixture shape unchanged.
