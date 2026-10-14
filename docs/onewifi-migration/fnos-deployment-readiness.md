# FNOS deployment readiness

Updated: 2026-10-14 (Asia/Shanghai)

This is the pre-deployment status for the current OneWIFI/MDD worktree. It deliberately excludes
physical-device testing, local/mobile compilation, signing/install, and GitHub publication.

## Current verdict

**The source is ready for release-candidate packaging, but it is not yet a deployable FNOS release
artifact.** FNOS deployment should start after the source changes are frozen and one new versioned
GitHub Release (or an explicitly authorized local image build) exists. Do not deploy the old
`v1.13.2` Release as if it contained this worktree: the current candidate is `v1.14.0` and the
worktree still has uncommitted backend, mobile-contract, and WebUI changes.

## Gates already passed

| Gate | Result | Evidence |
|---|---|---|
| Backend source regression | PASS: 2097 tests, 0 failures, 0 errors, 1 skip | `backend-final-evidence.json`, `backend-final-regression.log` |
| Cross-receipt identity check | BLOCKED: backend, iOS, Android and Android Kotlin are valid; OneBoard receipt is stale only because `webui/package.json` changed for `1.14.0` | `python docs/onewifi-migration/verify-final-evidence.py` |
| NAS compatibility catalogue | PASS: 1 record validated | `python tools/validate_nas_catalog.py` |
| Compose structure | PASS: YAML parses; control/hardware/egress and required named volumes/networks are present | `runtime/compose.yaml` |
| Version consistency in source | PASS: `VERSION` and `webui/package.json` both `1.14.0`; matching release notes exist | `VERSION`, `webui/package.json`, `.github/release-notes/v1.14.0.md` |
| FNOS host/hardware preflight | PASS（只读） | FNOS `TTFN`, `aarch64`, Docker `28.5.2`, 4 EC25/QMI nodes and 3 inserted PC/SC cards; MDD images/containers are absent | 

## Remaining non-mobile blockers

1. **Release identity is selected but not published.** The candidate is now versioned `v1.14.0`; the
   worktree still has uncommitted changes and no GitHub tag/release has been created.
2. **Release assets do not exist for this worktree.** FNOS needs the versioned Compose asset plus
   same-version Control, Hardware, Egress and Engine images and `SHA256SUMS`. The local Windows host
   has no Docker CLI, so I cannot build or inspect those images here.
3. **FNOS deployment inputs are pending.** The read-only host preflight passed, but startup still
   needs a deployment source, persistent data directory, free HTTPS port, and explicit authorization.
   The remote host currently has no MDD images or containers.

## Deployment sequence once the release exists

1. On FNOS, identify exact architecture, kernel/build, Docker and Compose versions, USB nodes, and
   any host `pcscd`/ModemManager/NetworkManager services that could seize the hardware.
2. Create a dedicated persistent data directory and retain the old Compose file/images for rollback.
3. Use the versioned Compose asset from the same Release; set `MDD_DATA_DIR`, `MDD_ADVERTISE_ADDR`,
   optional `MDD_HTTP_PORT`, and `MDD_NAS_HOSTNAME`. Keep the Hardware `network_mode: host`, device
   mounts, capabilities, internal Engine network, and fixed managed labels.
4. Start only the three base services. Wait for Hardware and Egress health before Control; Control
   creates one Engine per enabled line.
5. Verify version identity, default route preservation, reader discovery, and only then perform
   the user-owned real SIM/IMS/call/SMS checks.
6. If a health check or route/device guard fails, restore the retained Compose and image set; do not
   mix component versions or reuse the old data directory without a backup.

## Commands run in this worktree

```powershell
python tools/validate_nas_catalog.py
python -c "import yaml; yaml.safe_load(open('runtime/compose.yaml', encoding='utf-8'))"
$env:PYTHONIOENCODING='utf-8'; python docs/onewifi-migration/verify-final-evidence.py
```

The first two commands exited 0. The latest aggregate verifier reports the backend, iOS, Android and
Android Kotlin receipts as identity-valid; OneBoard requires the versioned receipt refresh described
above. This report does not claim FNOS startup or real SIM/IMS/call/SMS acceptance.
