"""Check durable validation receipts against current inputs, logs and artifacts.

This checks identity and recorded exits. It does not execute tests or establish
installed, hardware or call acceptance. Android's documented baseline info lint
remains a nonzero analyzer exit and is never silently converted to exit zero.
"""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys


STATE = Path(__file__).resolve().parent
MDD = STATE.parents[1]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def module(name):
    spec = importlib.util.spec_from_file_location(name, STATE / (name + ".py"))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def check(name, root, current=None):
    receipt = json.loads((STATE / name).read_text(encoding="utf-8"))
    errors = []
    if receipt.get("source_unchanged") is not True:
        errors.append("source changed during run")
    for path, expected in receipt["inputs"].items():
        actual = root / path
        if not actual.is_file() or digest(actual) != expected.lower():
            errors.append("input drift: " + path)
    if current is not None and current != receipt["inputs"]:
        errors.append("current input inventory differs from receipt")
    for path, expected in receipt.get("artifacts", {}).items():
        actual = root / path
        if not actual.is_file() or digest(actual) != expected.lower():
            errors.append("artifact drift: " + path)
    commands = receipt.get("commands", [receipt])
    summaries = []
    for command in commands:
        label = command.get("label", "command")
        log = Path(command["log"])
        expected = command.get("log_sha256", command.get("sha256"))
        if not log.is_file() or digest(log) != expected.lower():
            errors.append("log drift: " + label)
        summaries.append({key: command[key] for key in
                          ("label", "exit_code", "test_results", "done")
                          if key in command})
        baseline_info = name == "android-final-evidence.json" and label == "flutter-analyze"
        if command["exit_code"] != 0:
            text = log.read_text(encoding="utf-8", errors="replace") if log.is_file() else ""
            lines = [line.strip() for line in text.splitlines()
                     if any(line.strip().startswith(level + " - ")
                            for level in ("info", "warning", "error"))]
            known_info = (len(lines) == 1 and lines[0].startswith("info - ")
                          and "lib\\features\\proxy\\data\\wifi_pin_store.dart:7:57" in lines[0]
                          and lines[0].endswith("prefer_initializing_formals"))
            if not (baseline_info and command["exit_code"] == 1 and known_info):
                errors.append("nonzero exit: " + label)
        if "test_results" in command:
            counts = command["test_results"]
            if counts["failure"] or counts["error"] or not counts["success"]:
                errors.append("non-green tests: " + label)
            if not command.get("done") or any(e.get("success") is not True
                                              for e in command["done"]):
                errors.append("missing/failed terminal test event: " + label)
    return {"receipt": name, "identity_valid": not errors,
            "errors": errors, "commands": summaries}


def main():
    backend = module("run-backend-final")
    mobile = module("run-mobile-final")
    kotlin = module("run-kotlin-final")
    webroot = MDD / "webui"
    raw = subprocess.check_output([
        "git", "-C", str(MDD), "ls-files", "-co", "--exclude-standard", "-z",
        "--", "webui/src", "webui/public", "webui/tests", "webui/index.html",
        "webui/package.json", "webui/package-lock.json", "webui/vite.config.js",
    ])
    webinputs = {str(Path(path).relative_to("webui")): digest(MDD / path)
                 for path in set(raw.decode("utf-8").split("\0")) - {""}
                 if (MDD / path).is_file()}
    rows = [check("backend-final-evidence.json", MDD, backend.inputs()),
            check("oneboard-final-evidence.json", webroot, webinputs)]
    for platform in ("ios", "android"):
        root = MDD.parent / "ONEWIFI" / ("IOS" if platform == "ios" else "android")
        rows.append(check(platform + "-final-evidence.json", root,
                          mobile.inputs(root, platform)))
    rows.append(check("android-kotlin-final-evidence.json", kotlin.ROOT, kotlin.inputs()))
    print(json.dumps(rows, indent=2))
    return 0 if all(row["identity_valid"] for row in rows) else 1


if __name__ == "__main__":
    sys.exit(main())
