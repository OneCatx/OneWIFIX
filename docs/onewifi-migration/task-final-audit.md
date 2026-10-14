# Final integration audit after source reviews

Read-only independent SOL-6 audit. Authorized roots are MDD, existing iOS and Android, with NEWONE read-only source. Own only final-audit.md in this state directory. No production edits, devices, external sends, commits, push or deployment. Do not substitute prior PASS for independent assessment.

Only begin after parent confirms backend/mobile reviews are closed against final source. Read original requirements in MIGRATION_SPEC.md and CONSTRAINTS.md, current progress and review reports, source-evidence-freeze.json and fresh full regression/build logs. Verify their hashes still match files. Reject intermediate logs, missing test errors and source drift as final green evidence.

Trace the sole-control-plane invariant and same-line identity across auth, reader detect/provision, calls/history, SMS and eSIM on OneBoard, iOS and Android. Confirm MDD creates engines and owns SIM; no NEWONE gateway deployment or old native SSE/PCM fallback is reachable. Check contract/service parity and generated DTO fixtures against real adapters, caller routing, server authorization and exact OS UUID/dialog/engine call identity. Findings require a reachable trigger, file/line and impact. Static route inventory is only navigation aid.

Review final eSIM transaction/cancel boundaries: physical-reader aliases share reservation, verify/compensation cannot race LPA writes, disconnect cancellation awaits actual work, stale operation cannot cancel replacement. Check tests hit native handlers and streaming cleanup, not only isolated helpers.

Carrier O2/Ultra patch application receipt is source evidence only; no C build/image/SIP proof exists. AT&T/Three HK and SOCKS DNS ECS remain explicit software gaps. Android uses resident foreground-service SIP, with no baseline FCM killed-process wake transport; do not invent such support. Missing original gateway_selfsigned blocks APK/JVM tests, and no fake trust material may have been added. iOS Flutter green does not prove Swift/Xcode/CallKit/PushKit device behavior.

Deliver software acceptance-item ledger with PASS/FAIL/BLOCKED/NOT RUN and exact evidence. Separate software gaps, build/toolchain gaps and runtime acceptance. Report whether code can freeze, whether it can be deployed as fully accepted, and whether observed state supports rollback. No live acceptance without MDD origin+reader+IMS+authorized call and both mobile same-line login/call proof.
