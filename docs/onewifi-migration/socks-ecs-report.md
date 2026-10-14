# SOCKS ePDG DNS ECS repair receipt

Date: 2026-10-13 (Asia/Shanghai)

## Scope and freeze

This bounded repair is frozen for independent review. Changes are limited to the
existing ECS path in `control/app/egress.py` and `control/app/engine.py`, focused
coverage in `tests/test_country_egress.py` and `tests/test_engine_paths.py`, and
this report. No production probe, SIM, call, provider action, package, commit,
push, reset, stash, or deployment was performed. Other migration edits remain
untouched.

## What was repaired

- DNS queries sent inside the SOCKS5 UDP association now use a valid 12-byte DNS
  header. When a profile supplies an ECS hint, ARCOUNT is one and the EDNS0 OPT
  record carries option 8 with the masked IPv4/IPv6 network address, source
  prefix length, and zero scope length.
- No ECS hint leaves the ordinary DNS query shape unchanged. Invalid hints fail
  closed before opening or using the proxy.
- Engine startup resolves a hostname through the selected SOCKS exit with an ECS
  hint only when the resolved carrier profile is operationally eligible and the
  effective ePDG host exactly matches that profile's declared `dns_hosts`.
  Explicit unrelated ePDG overrides and blocked profiles withhold ECS.
- The actual SOCKS UDP packet test exercises the `resolve` response path and
  verifies `_dns_ipv4_answer` parses the returned A record.

## Focused Linux verification

Commands were run from `E:\GQ\Ultra\mdd-sim-gateway` through the documented
Linux harness (WSL Ubuntu 24.04 and `.venv-linux`):

```powershell
pwsh -NoProfile -Command "& './docs/onewifi-migration/run-linux-tests.ps1' -TestArgs 'tests.test_country_egress.UdpProbeTargetTests','-v'"
```

Exit: **0** — 13 tests, all passed.

```powershell
pwsh -NoProfile -Command "& './docs/onewifi-migration/run-linux-tests.ps1' -TestArgs 'tests.test_engine_paths.EnginePathTests','-v'"
```

Exit: **0** — 21 tests, all passed. The mocked Docker fixtures emit expected
diagnostic warnings about unreadable test network metadata; they do not fail a
test.

Additional parent-owned boundary evidence: this direct WSL command passed the
six narrowly selected ECS/engine tests (exit 0, 6/6):

```text
python -m unittest tests.test_country_egress.UdpProbeTargetTests.test_epdg_resolution_uses_the_selected_socks_udp_path tests.test_country_egress.UdpProbeTargetTests.test_epdg_resolution_rejects_invalid_ecs_before_using_the_proxy tests.test_country_egress.UdpProbeTargetTests.test_dns_query_payload_encodes_masked_ipv4_ecs tests.test_country_egress.UdpProbeTargetTests.test_socks_udp_packet_carries_the_dns_query_and_ecs_option tests.test_engine_paths.EnginePathTests.test_proxy_epdg_resolution_uses_the_profiled_ecs_hint tests.test_engine_paths.EnginePathTests.test_proxy_explicit_unprofiled_epdg_withholds_ecs
```

A broader 132-test module run had
one known pre-existing mtime-sensitive `IdleBackoff` failure; that boundary is
recorded honestly and is not attributed to this patch. No full regression was
run by this worker.

## Review notes

The initial interrupted implementation had placed ARCOUNT in the NSCOUNT slot
and inserted an extra header word. That defect was corrected before the green
receipt above. The packet fixture now includes the DNS question section so the
IPv4 answer parser is checked end to end within the SOCKS UDP composition test.
