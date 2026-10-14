# Rulebook v2
R1 MDD alone owns SIM, reader leases, engine lifecycle and communications history.
R2 All clients use one MDD origin and shared contract; no legacy fallback, no universal proxy.
R3 Both mobile UIs retained; replace SSE/PCM calling with SIP/WebRTC, retain native background/push/audio ownership.
R4 Instance, hardware, reader, ICCID, SIP dialog and OS UUID identifiers are distinct and explicitly mapped.
R5 Old tokens have no management capabilities; authenticated administrator login explicitly requests named capabilities; route/method checks fail closed.
R6 Backend adapters call MDD services directly and preserve actual failures; unsupported is never reported as success.
R7 Carrier profiles retain matching specificity and explicit user overrides; eSIM uses MDD locks and only observed card state supports success/rollback.
R8 Preserve native certificate pinning/trust controls. Never accept all certificates to get tests to pass.
R9 Source/test/build/installed/runtime evidence are distinct. No real integration claim without live same-line proof.
R10 Each implementer owns assigned files/root, respects other edits, no commit/reset/stash. Shared Dart contract is authored in iOS then mirrored byte-for-byte to Android where designated.

2026-10-13 call identity amendment: engine CHANNEL(uniqueid) is inbound MDD call_id, propagated in notify call_in, persisted call record, push payload call_id and every forked SIP INVITE X-MDD-Call-ID header. Native OS UUID and SIP UA dialog ID remain separate. Never match by caller number. Late-registration pickup_uri remains conditional on verified MDD implementation and explicit advertisement; clients must not invent it.
