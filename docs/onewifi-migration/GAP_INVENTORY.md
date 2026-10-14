# Remaining acceptance gaps

This is an explicit gap inventory, not a declaration that the migration is complete.
Source test results do not discharge deployment or hardware acceptance.

## Software scope still incomplete

- **Android late registration pickup:** resident foreground-service SIP incoming calls are wired. No Android wake delivery/OS UUID reservation entrypoint reaches the pickup receipt and SIP pickup operation. The original app also lacked an FCM killed-process wake transport. Shared primitive tests do not establish this acceptance path; adding an actual wake contract or narrowing that acceptance requires an explicit architectural decision.
- **AT&T:** complete paired public/private identity, REGISTER/Contact headers and security/port consumers are not implemented. Automatic profile defaults remain withheld. A realm-only mapping is insufficient.
- **Three HK:** secure same-session EAP-to-Asterisk material handoff, direct REGISTER authorization, disabled sec-agree and full headers are not implemented. Automatic defaults remain withheld; null IPsec is not disabled security.
- **SOCKS ePDG DNS ECS:** closed in source: the selected operational carrier profile now supplies a validated ECS prefix to SOCKS DNS, with IPv4/IPv6 EDNS encoding, explicit-host/blocked suppression and packet-level regression coverage. Runtime DNS and carrier behavior remain unverified.
- **Optional retained legacy helpers:** catalog nameplates, automation/log history, old gateway update/security/developer/HTTPS controls, MTU and per-card policy lack equivalent MDD operations. Unsupported routes return explicit errors; do not count these as migrated functions.

## Closed correctness findings and final validation

- Mobile call cancellation/native command timeout now terminates the correlated pending operation and late dialog in the reviewed source. iOS bound-answer cancellation and Android answer timeout leases are repaired; independent finite call source review passes. Actual-handler deferred-media answer cancellation now has software tests in both apps using public SIP dependency boundaries; Swift/XCTest and device behavior remain unverified.
- OneTools false-save mismatch is repaired in both presentations/DTOs and backend rejection. Full settings tests and independent non-call contract review pass on both apps.
- Backend cancellation/terminal repairs passed independent source review and the 2,080-test whole-suite run (one Node environment skip separately passed on Windows). No remaining backend correctness finding from that review; live hardware remains unverified.

The independent review reports and progress ledger supersede this checkpoint as fixes close.

## Build and installation evidence gaps

- Asterisk O2/Ultra patch applies idempotently to pinned source, but no complete C build, engine image or installed consumer is verified. Enabled new Sorcery fields require rebuilding the engine.
- Android original `@raw/gateway_selfsigned` resource is missing. Kotlin compiles, while normal JVM tests and APK resources remain blocked. No certificate substitution or TLS relaxation is permitted.
- Windows cannot establish Xcode/Swift compilation, signed iOS installation or XCTest/device behavior. Flutter tests are separate evidence.

## Runtime acceptance not performed

No authorized MDD runtime origin, reader/SIM, IMS registration, real call destination or installed signed mobile devices have been supplied. Running control-plane identity, sole SIM ownership, real login/read/call/SMS/MMS/eSIM, SIP fork/pickup, audio/TURN and provider/APNs delivery all remain unverified. Follow ACCEPTANCE_PROTOCOL.md only with the actual environment and explicit authorization for external effects.
