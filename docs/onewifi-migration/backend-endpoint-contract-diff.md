# W2 backend endpoint contract audit

Audit date: 2026-10-14 (Asia/Shanghai). Source tree: `E:\GQ\Ultra\mdd-sim-gateway`.

The documented contract is `backend-contract.md`; the implementation inventory was generated
from the route decorators in `control/app/main.py` and `control/app/mobile_api.py` and is saved as
`backend-endpoint-route-inventory.txt`. The table records whether the documented surface has a
real implementation and whether the remaining gap is deliberately fail-closed.

| Surface | Contract expectation | Current implementation | Evidence / disposition |
|---|---|---|---|
| Auth and capability gate | Native client login/logout; bearer capabilities cannot become browser admin; pairing credentials are separate | `/api/auth/client/login|logout`, one gate in `gate.py`, allow-list in `authz.py`; pairing source is checked before bearer source | `tests.test_auth`, `tests.test_authz`, `tests.test_client_signin`; PASS |
| Calls | Native instance history and SIP actions; no mobile calls alias; engine call ID stays distinct from SIP dialog | `/api/instances/{iid}/calls`, `/call`, `/hangup`, softphone WebSocket; mobile only exposes history-backed pickup and VoIP endpoint registration | `tests.test_mobile_call_correlation`, `tests.test_mobile_resident_contract`, `tests.test_authz`; PASS for source contract, live SIP/hardware NOT RUN |
| SMS/MMS | Typed send/read/thread/ack; MMS media and download; unknown delivery stays unknown | Legacy instance routes cover SMS, MMS, attachments and parts; mobile facade exposes contacts/thread/send; 502 keeps a `data` outcome and timeout is unknown | `tests.test_client_signin`, `tests.test_cellular_sms`, `tests.test_mms_transport`, `tests.test_sms_inbound_dialplan`; PASS in software, carrier delivery NOT RUN |
| Reader and device identity | Reader inventory is authoritative; unbound reader identity is non-callable; stale ICCID must fail | `/api/readers`, unified physical-device lookup, `reader:<id>` facade rows, live ICCID checks before eSIM operations | `tests.test_authz`, `tests.test_engine_reader_binding`, `tests.test_esim_profile_switch`; PASS in software, physical reader NOT RUN |
| eSIM | Switch/disable/delete/nickname/download with post-switch identity proof and cancellation ownership | Native eSIM routes plus mobile adapters; switch requires observed ICCID and refreshed reader association; download SSE cancellation is exact-operation scoped | `tests.test_esim_profile_switch`, `tests.test_client_signin`; PASS in software, eUICC/LPA/network NOT RUN |
| APNs / OneTools | SMS and VoIP providers remain separate; endpoint ownership/revoke and update-only Live Activity | Admin APNs routes and mobile SMS/VoIP registration routes use `apns` vs `apns_voip`; pairing token is distinct; activity CAS rejects stale/terminal revival | `tests.test_mobile_apns`, `tests.test_mobile_pairing`, `tests.test_client_signin`; PASS for request construction and ownership, APNs/device delivery NOT RUN |
| Typed settings / telemetry | Persist only supported typed settings; unknown values remain explicit; unsupported source-only controls must not return fake success | Preferences and SMS storage map to typed MDD fields; `system/info` leaves unknown build time empty; host perf unknowns remain null; unsupported mobile routes hit 501 catch-all | `tests.test_mobile_dto`, `tests.test_client_signin`, `tests.test_mobile_notifications`; PASS |
| Asterisk consumer | Rendered engine must consume only supported carrier settings and preserve call/SMS correlation | Rendered PJSIP/dialplan includes multi-contact/call-ID and SMS/MMS consumers; Asterisk source patch fixtures are checked in | `tests.test_onewifi_asterisk_patch`, `tests.test_sms_inbound_dialplan`, `tests.test_engine_paths`; PASS for render/source checks, installed Asterisk/IMS NOT RUN |
| AT&T / Three HK | Match identity but fail closed when required IMS/security consumers are absent | `carrier_profiles.resolve()` returns `operational_status=blocked` and `carrier_block` with unsupported fields; renderer withholds unsafe defaults | `tests.test_att_three_blockers`; PASS (no half-enabled profile) |

## Contract differences and explicit gaps

1. `/api/mobile/v1/settings/vowifi` and `/api/mobile/v1/cards/{iccid}/policy` are intentionally
   not concrete handlers. They are capability-gated and terminate in the mobile catch-all with
   HTTP 501 `unsupported`, matching the contract's no-runtime-equivalent rule.
2. No telemetry write or provider-delivery endpoint was added. The existing typed status and
   dashboard fields report `unknown`/`null` when MDD cannot measure them; this is a deliberate
   information-preserving result, not a zero estimate.
3. The route and unit evidence is software-only. No claim is made for a physical SIM/eUICC,
   IMS registration, Asterisk installation, APNs acceptance, SMS/MMS carrier delivery, or mobile
   device behavior.

## Reproduction

The full regression receipt is `backend-final-evidence.json`; its direct WSL command ran
`run-current-regression.py` with 2097 tests, 0 failures, 0 errors, and 1 skip. Receipt identity
was checked with:

```powershell
$env:PYTHONIOENCODING='utf-8'
python docs/onewifi-migration/verify-final-evidence.py
```

That verifier reports this backend receipt as identity-valid. The aggregate verifier still reports
Android receipt drift owned by W1 (`ResidentCallSourceTest.kt`), so the aggregate result is not a
W2 failure and is not relabelled as a global PASS.

