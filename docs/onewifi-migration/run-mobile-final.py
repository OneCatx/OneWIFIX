"""Run retained-app Flutter validation with source identity and exact test counts."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess


STATE = Path(__file__).resolve().parent
ULTRA = STATE.parents[2]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inputs(root, native):
    raw = subprocess.check_output([
        "git", "-C", str(root), "ls-files", "-co", "--exclude-standard", "-z",
        "--", "lib", native, "test", "pubspec.yaml", "pubspec.lock",
        "analysis_options.yaml",
    ])
    return {name: digest(root / name)
            for name in sorted(set(raw.decode("utf-8").split("\0")) - {""})
            if (root / name).is_file()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("platform", choices=("ios", "android"))
    args = parser.parse_args()
    root = ULTRA / "ONEWIFI" / ("IOS" if args.platform == "ios" else "android")
    artifacts = root / ("artifacts" if args.platform == "ios" else "build/mdd-jdk-diag")
    artifacts.mkdir(parents=True, exist_ok=True)
    before = inputs(root, args.platform)
    commands = []
    for label, options in (("flutter-test", ["test", "--no-pub", "--reporter", "json"]),
                           ("flutter-analyze", ["analyze", "--no-pub"])):
        command = ["C:/Flutter/flutter/bin/flutter.bat", *options]
        suffix = ".jsonl" if label == "flutter-test" else ".log"
        log = artifacts / f"{args.platform}-final-{label}{suffix}"
        with log.open("w", encoding="utf-8") as output:
            result = subprocess.run(command, cwd=root, stdout=output, stderr=subprocess.STDOUT)
        receipt = {"label": label, "command": command, "exit_code": result.returncode,
                   "log": str(log), "sha256": digest(log)}
        text = log.read_text(encoding="utf-8", errors="replace")
        if label == "flutter-test":
            events = []
            for line in text.splitlines():
                try:
                    events.append(json.loads(line))
                except ValueError:
                    pass
            completed = [e for e in events if e.get("type") == "testDone" and not e.get("hidden")]
            receipt["test_results"] = {key: sum(e.get("result") == key for e in completed)
                                       for key in ("success", "failure", "error")}
            receipt["done"] = [e for e in events if e.get("type") == "done"]
            print(receipt["test_results"], receipt["done"], flush=True)
        else:
            print(text[-2000:], flush=True)
        print(label, "exit", result.returncode, flush=True)
        commands.append(receipt)
    after = inputs(root, args.platform)
    record = {
        "recorded_utc": datetime.now(timezone.utc).isoformat(),
        "recorder_sha256": digest(Path(__file__)), "inputs": after,
        "source_unchanged": before == after, "commands": commands,
        "changed_during_run": [name for name in sorted(before.keys() | after.keys())
                               if before.get(name) != after.get(name)],
        "boundary": "Flutter software validation only; no Swift/Xcode build, "
                    "APK/device, native OS callback, MDD login, IMS or call proof. "
                    "Analyzer nonzero exits are preserved, including baseline lint infos.",
    }
    (STATE / f"{args.platform}-final-evidence.json").write_text(
        json.dumps(record, indent=2) + "\n", encoding="utf-8")
    if before != after:
        raise RuntimeError("Source changed during validation; receipt is not final")
    raise SystemExit(next((r["exit_code"] for r in commands if r["exit_code"]), 0))


if __name__ == "__main__":
    main()
