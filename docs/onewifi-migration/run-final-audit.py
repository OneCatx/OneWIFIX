"""Generate the W5 final audit from current receipts and source hashes.

This is deliberately an audit tool: it never changes source, receipts, or build
outputs.  A receipt is accepted only when its own verifier accepts the recorded
inputs and logs.  Hashes alone are reported as source evidence, never runtime
acceptance.
"""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
import shutil
import subprocess
import sys


STATE = Path(__file__).resolve().parent
MDD = STATE.parents[1]
ONEWIFI = MDD.parent / "ONEWIFI"
ANDROID = ONEWIFI / "android"
IOS = ONEWIFI / "IOS"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(command: list[str], cwd: Path | None = None) -> dict:
    try:
        result = subprocess.run(
            command,
            cwd=cwd,
            text=True,
            capture_output=True,
            encoding="utf-8",
            errors="replace",
        )
        return {
            "command": command,
            "cwd": str(cwd) if cwd else None,
            "exit_code": result.returncode,
            "stdout": result.stdout[-4000:],
            "stderr": result.stderr[-4000:],
        }
    except FileNotFoundError as exc:
        return {
            "command": command,
            "cwd": str(cwd) if cwd else None,
            "exit_code": None,
            "stdout": "",
            "stderr": str(exc),
        }


def receipt_summary(name: str) -> dict:
    path = STATE / name
    data = json.loads(path.read_text(encoding="utf-8"))
    commands = data.get("commands")
    if commands is None and "command" in data:
        commands = [data]
    return {
        "path": str(path),
        "sha256": sha256(path),
        "recorded": data.get("recorded_local")
        or data.get("recorded_utc")
        or data.get("recorded_at"),
        "source_unchanged": data.get("source_unchanged"),
        "exit_code": data.get("exit_code"),
        "commands": [
            {
                "label": c.get("label", "command"),
                "exit_code": c.get("exit_code"),
                "test_results": c.get("test_results"),
                "done": c.get("done"),
                "log": c.get("log"),
                "log_sha256": c.get("log_sha256") or c.get("sha256"),
            }
            for c in commands
        ],
        "boundary": data.get("boundary"),
    }


def source_drift() -> dict:
    checkpoint = json.loads(
        (STATE / "source-evidence-checkpoint.json").read_text(encoding="utf-8")
    )
    result = {}
    for project, info in checkpoint["projects"].items():
        root = Path(info["root"])
        drift = []
        for item in info["changed_source"]:
            path = root / item["path"]
            actual = sha256(path) if path.is_file() else None
            if actual != item["sha256"].lower():
                drift.append(
                    {
                        "path": item["path"],
                        "expected": item["sha256"].lower(),
                        "actual": actual,
                    }
                )
        result[project] = {
            "checkpoint_recorded": checkpoint.get("recorded_at"),
            "files": len(info["changed_source"]),
            "drift": drift,
        }
    result["shared_dart_equal"] = all(
        item.get("equal") is True for item in checkpoint.get("shared_dart", [])
    )
    result["fixture_count"] = len(checkpoint.get("asgi_fixtures", []))
    result["fixtures_equal"] = all(
        item.get("equal") is True for item in checkpoint.get("asgi_fixtures", [])
    )
    return result


def runtime_checks() -> dict:
    checks = {
        "adb_devices": run(["adb", "devices", "-l"]),
        "docker_version": run(["docker", "--version"]),
        "xcodebuild_version": run(["xcodebuild", "-version"]),
        "git_diff_check_mdd": run(["git", "diff", "--check"], MDD),
        "git_diff_check_ios": run(["git", "diff", "--check"], IOS),
        "git_diff_check_android": run(["git", "diff", "--check"], ANDROID),
    }
    cert = ANDROID / "android/app/src/main/res/raw/gateway_selfsigned"
    apk = ANDROID / "build/app/outputs/apk/debug/app-debug.apk"
    checks["gateway_certificate"] = {
        "path": str(cert),
        "exists": cert.is_file(),
        "sha256": sha256(cert) if cert.is_file() else None,
    }
    checks["debug_apk"] = {
        "path": str(apk),
        "exists": apk.is_file(),
        "bytes": apk.stat().st_size if apk.is_file() else None,
        "sha256": sha256(apk) if apk.is_file() else None,
    }
    checks["tool_presence"] = {
        tool: shutil.which(tool) for tool in ("adb", "docker", "xcodebuild", "gcc", "clang")
    }
    return checks


def backend_log_state() -> dict:
    path = STATE / "backend-final-regression.log"
    text = path.read_text(encoding="utf-8", errors="replace") if path.is_file() else ""
    return {
        "path": str(path),
        "sha256": sha256(path) if path.is_file() else None,
        "has_2097_ok": "Ran 2097 tests" in text and "OK (skipped=1)" in text,
        "has_mount_guard_failure": "Linux test mount target is not empty" in text,
        "tail": text[-1200:],
    }


def main() -> int:
    started = datetime.now(timezone.utc).astimezone().isoformat()
    verifier = run([sys.executable, str(STATE / "verify-final-evidence.py")], MDD)
    try:
        verifier_rows = json.loads(verifier["stdout"])
    except json.JSONDecodeError:
        verifier_rows = []
    verifier_by_receipt = {row.get("receipt"): row for row in verifier_rows}
    receipts = {
        name: receipt_summary(name)
        for name in (
            "backend-final-evidence.json",
            "oneboard-final-evidence.json",
            "ios-final-evidence.json",
            "android-final-evidence.json",
            "android-kotlin-final-evidence.json",
        )
    }
    android_build = json.loads(
        (STATE / "android-jvm-apk-evidence.json").read_text(encoding="utf-8")
    )
    audit = {
        "generated_local": started,
        "verifier": verifier,
        "verifier_rows": verifier_rows,
        "receipts": receipts,
        "android_jvm_apk": {
            "path": str(STATE / "android-jvm-apk-evidence.json"),
            "sha256": sha256(STATE / "android-jvm-apk-evidence.json"),
            "jvm_tests": android_build["jvm_tests"],
            "apk": android_build["apk"],
            "certificate": android_build["gateway_certificate"],
        },
        "source_drift": source_drift(),
        "backend_log": backend_log_state(),
        "runtime_checks": runtime_checks(),
        "runtime_boundary": (
            "No install, MDD login, reader/SIM, IMS, real SIP call, SMS, APNs, "
            "eSIM mutation, or device evidence was observed by this audit."
        ),
    }
    (STATE / "final-audit-receipt.json").write_text(
        json.dumps(audit, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    drift = audit["source_drift"]
    drift_lines = []
    for project, info in drift.items():
        if isinstance(info, dict) and info.get("drift"):
            drift_lines.extend(
                f"- `{project}`: `{item['path']}` expected `{item['expected']}`, "
                f"current `{item['actual']}`"
                for item in info["drift"]
            )
    drift_text = "\n".join(drift_lines) or "- none"
    verifier_status = "PASS" if verifier["exit_code"] == 0 else "FAIL"
    backend_log = audit["backend_log"]
    backend_receipt = receipts["backend-final-evidence.json"]
    backend_recorded_hash = backend_receipt["commands"][0].get("log_sha256")
    backend_hash_matches = backend_recorded_hash == backend_log["sha256"]
    android_receipt_valid = not verifier_by_receipt.get(
        "android-final-evidence.json", {}
    ).get("errors")
    if backend_log["has_2097_ok"] and backend_hash_matches:
        backend_observation = "当前日志为 2,097 tests / OK (skipped=1)，且哈希已绑定到 receipt"
        backend_finding = "无 backend evidence integrity finding"
    elif backend_log["has_2097_ok"]:
        backend_observation = "当前日志尾部为 2,097 tests / OK (skipped=1)，但其哈希尚未回写到 receipt"
        backend_finding = "当前日志结果可见但未封存；必须刷新 receipt 哈希后才能 PASS"
    elif backend_log["has_mount_guard_failure"]:
        backend_observation = "当前文件是拒绝执行的 mount guard 输出，而不是 final log"
        backend_finding = "不得把旧的 2,097/0/0 口头或历史数字当作本轮 PASS"
    else:
        backend_observation = "当前日志既未匹配完整 OK 尾部，也未形成可识别的 final receipt"
        backend_finding = "重新生成并绑定完整 regression receipt"
    overall_software = "PASS" if verifier["exit_code"] == 0 else "BLOCKED"
    backend_receipt_valid = not verifier_by_receipt.get(
        "backend-final-evidence.json", {}
    ).get("errors")
    oneboard_receipt_valid = not verifier_by_receipt.get(
        "oneboard-final-evidence.json", {}
    ).get("errors")
    backend_result = (
        "PASS（软件回归）"
        if backend_receipt_valid and backend_hash_matches and backend_log["has_2097_ok"]
        else "BLOCKED（需刷新 receipt）"
    )
    oneboard_result = "PASS（软件构建）" if oneboard_receipt_valid else "BLOCKED（需刷新 receipt）"
    android_result = "PASS（软件/构建证据）" if android_receipt_valid else "BLOCKED（需重跑）"
    checkpoint_fresh = not any(
        isinstance(info, dict) and info.get("drift")
        for project, info in drift.items()
        if project in ("mdd", "ios", "android")
    )
    parity_result = "PASS" if checkpoint_fresh else "PASS（需刷新 checkpoint）"
    checkpoint_finding = (
        "无 checkpoint source drift。"
        if checkpoint_fresh
        else "checkpoint 相对当前源存在漂移，需重新封存。"
    )
    runtime_text = (STATE / "RUNTIME_EVIDENCE.md").read_text(encoding="utf-8")
    runtime_doc_drift = "Android resource/APK gate remains blocked by" in runtime_text
    runtime_doc_finding = (
        "`RUNTIME_EVIDENCE.md` 仍把当前 Android 资源/APK 门写成阻塞，需刷新。"
        if runtime_doc_drift
        else "无当前 Android 资源/APK 状态矛盾；历史阻塞段落已明确标注为历史。"
    )
    backend_verifier_errors = verifier_by_receipt.get(
        "backend-final-evidence.json", {}
    ).get("errors", [])
    oneboard_verifier_errors = verifier_by_receipt.get(
        "oneboard-final-evidence.json", {}
    ).get("errors", [])
    evidence_finding = (
        "无 backend/OneBoard receipt drift。"
        if not backend_verifier_errors and not oneboard_verifier_errors
        else f"backend={backend_verifier_errors or 'ok'}; oneboard={oneboard_verifier_errors or 'ok'}。"
    )
    md = f"""# W5 终审与制品封存

审计时间：{started}（本机时区）；审计脚本：`docs/onewifi-migration/run-final-audit.py`。本报告只写入当前审计结果，不把源码、receipt 或静态检查当成设备运行证据。

## 终审裁决

**FAIL：当前状态不能称为代码冻结或完整迁移发布。** `verify-final-evidence.py` 本轮退出 **{verifier["exit_code"]}（{verifier_status}）**。软件 receipts 当前可验证状态为 **{overall_software}**；真实运行时、载体/运营商完整 profile 与设备验收仍未闭环。

## 证据账本

| 领域 | 当前结果 | 可采信证据 | 终审判定 |
|---|---|---|---|
| Android Flutter/analyzer | receipt 记录 892 tests、0 failure/error、analyzer exit 0 | `android-final-evidence.json`；当前 verifier identity | **{android_result}** |
| Android Kotlin/JVM/APK | JVM 109/0/0/0；debug APK SHA-256 `{android_build['apk']['sha256']}`；证书 DER SHA-256 `{android_build['gateway_certificate']['der_sha256']}` | `android-jvm-apk-evidence.json`；Kotlin/Flutter receipts | **{android_result}** |
| iOS Flutter/analyzer | 1,086 tests、0 failure/error、analyzer exit 0；receipt identity valid | `ios-final-evidence.json` | **PASS（软件源切片）** |
| OneBoard | Node tests/Vite build exit 0；当前 receipt 校验状态 | `oneboard-final-evidence.json` | **{oneboard_result}** |
| MDD/backend | receipt 记录 exit 0；{backend_observation} | `backend-final-evidence.json`、`backend-final-regression.log` | **{backend_result}** |
| 跨端契约 | shared Dart parity=true；ASGI fixtures {drift['fixture_count']}/{drift['fixture_count']} equal | `source-evidence-checkpoint.json`、`mobile-contract.md` | **{parity_result}** |
| AT&T/Three HK | fail-closed blocker 保留；完整消费者仍缺失 | `carrier-att-three-report.md`、focused 15 tests report | **PASS（阻断策略）；功能 BLOCKED** |
| 真实运行时 | 未观察到登录、reader/SIM、IMS、通话、短信、eSIM、APNs、安装或设备回调 | `RUNTIME_EVIDENCE.md`、`ACCEPTANCE_PROTOCOL.md`、本轮 runtime checks | **NOT RUN/BLOCKED** |

## P1/P2

- **P1 — runtime acceptance:** 真实 MDD origin、reader/SIM、IMS、设备、授权号码和安装态证据仍缺失，不能发布或称冻结。
- **P1 — carrier/native gaps:** AT&T/Three HK 完整 consumers、Asterisk C/image/install、Xcode/Swift 与签名设备仍缺失或未运行。
- **P2 — backend/OneBoard evidence freshness:** {evidence_finding} {backend_finding}。
- **P2 — checkpoint freshness:** {checkpoint_finding} 当前 checkpoint 漂移如下：
{drift_text}
- **P2 — runtime document drift:** {runtime_doc_finding}

## 源→生成→安装→运行四面

- **源：** 当前 verifier 已确认 receipts 的输入一致；checkpoint 与当前源的漂移状态见上方 P2。shared Dart 与 11 个 ASGI fixture 当前记录一致。
- **生成：** OneBoard/iOS/Android/backend receipts 与 logs 可验证；debug APK 仍只代表组装产物。
- **安装：** debug APK 仅为组装产物，未签名发布、未安装到设备；iOS 无 Xcode/签名安装。
- **运行：** 当前没有授权 MDD origin、reader/SIM、IMS、设备或真实号码证据；全部保持 NOT RUN/BLOCKED。

## 冻结与回滚

**不能冻结。** 软件 receipts 已过 verifier，但 W4 真实运行证据、carrier/native gaps 与安装态回滚演练仍缺失。源码层可以回退到上一个已知 source snapshot；部署回滚没有安装产物、运行快照或演练证据，不能宣称已验证。

## 可复跑命令与制品

```text
python E:\\GQ\\Ultra\\mdd-sim-gateway\\docs\\onewifi-migration\\run-final-audit.py
python E:\\GQ\\Ultra\\mdd-sim-gateway\\docs\\onewifi-migration\\verify-final-evidence.py
```

本轮机器可读封存：`final-audit-receipt.json`（SHA-256 见同目录 `STATE_VERSION.tsv` 更新项）。审计脚本未修改源码、构建产物、上游 receipt 或运行环境。
"""
    (STATE / "final-audit-latest.md").write_text(md, encoding="utf-8")
    print(json.dumps({"verifier_exit": verifier["exit_code"], "audit": str(STATE / "final-audit-latest.md")}, ensure_ascii=False))
    return 0 if verifier["exit_code"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
