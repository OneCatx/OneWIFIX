# Cross repository mobile contract audit

Date: 2026-10-14

The MDD wire surface required by the resident Android design is present in the control
plane. `GET /ws` accepts a bearer client token, projects `call` events with the line id and
the engine `call_id`, and closes the socket on client-token revocation. Native call history is
the unwrapped `GET /api/instances/{iid}/calls` response (`{"calls":[...]}`); each history row
retains the engine `call_id` separately from the integer history row id. The authenticated
`GET /api/mobile/v1/calls/{call_id}/pickup?device_id={iid}` route issues a receipt only for
the same line's still-ringing inbound call and refuses a terminal, expired, wrong-line, or
pairing credential request.

The MDD app has no `/api/calls/events` SSE endpoint and no JSON PCM call-media endpoint. The
client gate rejects those legacy paths (and their old dial/answer routes) before an untrusted
mobile bearer reaches an application handler. Mobile production composition therefore uses
the SIP/WebRTC path; old SSE/PCM classes in the retained app sources are not a MDD server
contract and are covered only by source reachability audits.

The backend contract had one stale sentence naming `/api/mobile/v1/devices/{iid}/calls` as
history. It now documents the actual `/api/instances/{iid}/calls` route and explicitly states
that no mobile-prefixed alias exists. Both mobile clients already request the native route.

## Evidence

Command:

```text
wsl --cd /mnt/e/GQ/Ultra/mdd-sim-gateway --exec env PYTHONDONTWRITEBYTECODE=1 TMPDIR=/mnt/e/GQ/Ultra/mdd-sim-gateway/docs/onewifi-migration/linux-tmp MDD_DATA=/mnt/e/GQ/Ultra/mdd-sim-gateway/docs/onewifi-migration/linux-tmp/contract-audit-3 /mnt/e/GQ/Ultra/mdd-sim-gateway/.venv-linux/bin/python -m unittest tests.test_mobile_resident_contract -v
```

Result: **5 tests, 34.999 seconds, OK, exit 0**. No reader, SIM, engine, SIP peer, APNs
provider, installed app, deployment, notification, or telephone was used. This evidence
proves software contract behavior only; Android late registration still requires production
ResidentCallSource/Telecom/Dart pickup composition and a real runtime test.
