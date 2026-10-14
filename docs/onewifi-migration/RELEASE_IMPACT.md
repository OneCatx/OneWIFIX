# Release impact for the FNOS candidate

Recorded: 2026-10-14 (Asia/Shanghai)

The candidate worktree is intentionally dirty because the migration windows have not committed or
published their changes. `git status --short` reports 34 modified tracked files and 25 untracked
paths. The current source impact is:

| Area | Impact | Release risk | Required gate |
|---|---|---|---|
| MDD auth/gate/client capabilities | New bearer, pairing and capability paths; admin/session boundaries changed | High | Full backend regression + negative authz tests |
| Mobile API and DTO adapters | New `/api/mobile/v1` facade, typed settings, eSIM/SMS/call adapters | High | Contract inventory + ASGI tests + cross-receipt verifier |
| eSIM/reader identity | Reader association, post-switch proof, transaction/cancellation ownership | High | Full backend regression; hardware proof remains user-owned |
| SMS/MMS/call correlation | Delivery-unknown semantics, inbound correlation and SIP call-ID handling | High | Full backend regression; carrier/SIP hardware proof remains pending |
| APNs/notification settings | Separate SMS/VoIP provider settings, pairing ownership and masking | Medium | Provider construction/ownership tests; real delivery pending |
| Carrier profiles and Asterisk templates | AT&T/Three HK explicit blocked contracts; supported profile rendering changes | High | Carrier blocker tests + Asterisk render/source tests |
| Runtime/Compose/CI | Versioned four-image release and Compose asset generation | High | Release workflow on GitHub; image digest and Compose config verification |
| WebUI | Settings and notification surfaces consume the new backend contract | Medium | WebUI tests/build in the release workflow |

## Evidence snapshot

- Backend: 2097 tests, 0 failures, 0 errors, 1 skipped; source unchanged during receipt.
- Aggregate receipt verifier: all five current receipts identity-valid after the local 1.14.0
  WebUI Node/Vite refresh.
- Compose YAML parses locally; Docker image build/inspect is **NOT RUN** because this host has no
  Docker CLI.
- FNOS startup, host architecture/kernel/device nodes, and real SIM/IMS behavior are **NOT RUN**.

## Release decision

The code can proceed to release-candidate packaging after a version is selected and the worktree is
frozen. Do not point FNOS at the existing `v1.13.2` Release for this candidate. The release tag,
versioned Compose file, four component images, offline archives and `SHA256SUMS` must all carry one
new version before deployment.
