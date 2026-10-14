# Runtime evidence — 2026-10-13 Asia/Shanghai
Read-only checks before migration:
- Native Windows host. Python C:/Python314/python.exe; Go C:/Program Files/Go/bin/go.exe; Node D:/MINE/Node/node.exe; Flutter/Dart C:/Flutter/flutter/bin; adb installed.
- Docker command not found on PATH. WSL distribution Ubuntu-24.04 is installed (no claim Docker works there).
- No listener on MDD default 8443/10443; unrelated 127.0.0.1:8000 listener identity not established.
- `adb devices -l`: empty device list.
- MDD `data` has only .gitkeep, no provisioned lines/configuration there.
- Runtime docs contain examples, not evidence of this working tree deployed. They must not be counted as current SIM/IMS/call verification.
- No actual login, reader, IMS, call, push receipt or eSIM mutation has been performed by this task.
Outstanding acceptance: authorized MDD runtime address and operator credentials; attached reader/SIM; reachable test handset and explicitly authorized call destination; iOS build/sign/device environment. Continue code work independently.

## Priority gate refresh — 2026-10-14 (superseded by current receipts)
- The earlier Android resource/APK failure is historical. The current W1 receipt records `processDebugResources`, 109 JVM tests, and `assembleDebug` as successful; the real remote 443 leaf is bound to `gateway_selfsigned` and the debug APK SHA-256 is `e210cbd3b4a0f335b8ef1a8d0d81b07a494d13cba96ddb6b5b610a20e1003098`. This is still software/build evidence only and does not prove installation or device behavior.
- Android device gate: `adb devices -l` is empty. iOS native gate: `xcodebuild` is unavailable on this Windows host. Docker/GCC/Clang are unavailable for Asterisk C/image verification.
- Remote deployment gate: the user confirmed the current FNOS ED25519 fingerprint; deployment is still not attempted.
- Source checkpoint: MDD/IOS/Android drift from freeze is 0; shared SIP Dart parity is true; ASGI fixture parity is 11/11. Existing final receipts remain identity-valid; no regression rerun was needed because source inputs did not drift.
- Runtime acceptance remains **NOT RUN/BLOCKED**; no login, reader/SIM, IMS, call, SMS, eSIM, APNs or deployment claim is made.

## Phase A refresh — 2026-10-14 11:37 Asia/Shanghai
- `git diff --check` exit 0 on MDD, iOS, and Android.
- `verify-final-evidence.py` exit 0. Checkpoint versus freeze drift is 0 for all three projects. Shared Dart equal. ASGI fixtures 11/11.
- Recursive search of `E:\GQ\Ultra` found no `gateway_selfsigned` file.
- `adb devices -l` is empty. Windows PATH has no docker, gcc, clang, or xcodebuild.
- WSL Ubuntu has gcc 13.3.0, and does not have docker or clang. No `asterisk.c` exists in the four allowed trees.
- Stored host key for `[8.137.155.86]:1818` is still `SHA256:UCsIToi7JUllVbBmlb8X5ggtsEy+tARcTTfj0fG81a8`. No SSH connection was made.
- Complete release remains FAIL.

## W4 local preflight refresh — 2026-10-14 13:21 Asia/Shanghai

- Local host `Halo` is Windows 11. `docker` is unavailable; no Docker process/service was found.
- No local listener exists on MDD ports `8443` or `10443`; no MDD control plane was started.
- `adb devices -l` returned an empty device list. No local `pcscd` or `ModemManager` service was present.
- The current `known_hosts` entry for `[8.137.155.86]:1818` resolves to `SHA256:aCczQdbDa7WCjRR8PGzL7HpBq/gpFmY0o/E+//krOpY`; the user confirmed this is the latest FNOS key. No key was replaced and no host-key bypass was used.
- W4 runtime gates remain `BLOCKED/NOT RUN`: remote preflight, MDD startup, single-gateway/SIM ownership, reader/SIM, IMS, calls, SMS/MMS, eSIM and APNs. No remote deployment or real communication was performed.
- Structured receipt: `w4-runtime-evidence.json`; detailed command ledger: `w4-runtime-report.md`.

## W4 remote read-only preflight — 2026-10-14 13:45 Asia/Shanghai

- Strict SSH connection to `TTFN@8.137.155.86:1818` succeeded using the current `known_hosts` entry; no host-key bypass was used.
- Remote host: `TTFN`, Linux `aarch64`, Docker Server `28.5.2`; approximately `5.0GiB` memory available and `186G` free under `/vol1/1000`.
- No MDD control/engine/hardware/egress containers or local MDD images exist. Existing unrelated containers were only listed and not modified.
- Hardware preflight found four Quectel EC25 modems, four QMI nodes, three PC/SC readers, and three inserted cards. No complete ICCID/IMSI/IMEI was recorded.
- MDD startup and all real IMS/call/SMS/eSIM/APNs gates remain `BLOCKED/NOT RUN` until deployment source, data directory/port, target line and authorized test destination are confirmed.
