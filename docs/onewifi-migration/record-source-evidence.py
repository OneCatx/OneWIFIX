"""Record source/artifact identity without treating hashes as acceptance evidence.

Only the three writable migration projects are inspected. Generated caches,
baseline copies and diagnostics are not source inputs. No Git state is changed.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess


MDD = Path(__file__).resolve().parents[2]
ULTRA = MDD.parent
STATE = MDD / "docs" / "onewifi-migration"
PROJECTS = {
    "mdd": (MDD, ["control", "engine", "tests", "webui/src", "webui/public",
                   "webui/tests", ".github", "hooks"]),
    "ios": (ULTRA / "ONEWIFI" / "IOS", ["lib", "ios", "test"]),
    "android": (ULTRA / "ONEWIFI" / "android", ["lib", "android", "test"]),
}
SHARED = ["lib/core/config/mdd_mobile_contract.dart",
          "lib/features/calls/data/sip_call_service.dart"]


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def git(root: Path, *args: str) -> bytes:
    return subprocess.check_output(["git", "-C", str(root), *args])


def source_record(root: Path, untracked_roots: list[str]) -> dict:
    tracked = git(root, "diff", "HEAD", "--name-only", "-z").decode("utf-8").split("\0")
    untracked = git(root, "ls-files", "--others", "--exclude-standard", "-z",
                    "--", *untracked_roots).decode("utf-8").split("\0")
    entries = []
    for relative in sorted(set(tracked + untracked) - {""}):
        path = root / relative
        if not path.is_file():
            entries.append({"path": relative, "state": "absent"})
        else:
            entries.append({"path": relative, "sha256": digest(path),
                            "bytes": path.stat().st_size})
    return {"root": str(root), "head": git(root, "rev-parse", "HEAD").decode().strip(),
            "changed_source": entries}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--label", choices=["checkpoint", "freeze"], required=True)
    args = parser.parse_args()
    report = {
        "label": args.label,
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "acceptance": "NOT IMPLIED: hashes do not prove tests, builds, installation or runtime",
        "projects": {name: source_record(*config) for name, config in PROJECTS.items()},
        "shared_dart": [], "asgi_fixtures": [], "webui_build": [],
    }
    for relative in SHARED:
        hashes = {name: digest(PROJECTS[name][0] / relative) for name in ("ios", "android")}
        report["shared_dart"].append({"path": relative, **hashes,
                                      "equal": len(set(hashes.values())) == 1})
    for source in sorted((STATE / "contracts").glob("*.json")):
        hashes = {"mdd": digest(source)}
        for name in ("ios", "android"):
            target = PROJECTS[name][0] / "test" / "fixtures" / "mdd" / source.name
            hashes[name] = digest(target) if target.is_file() else None
        report["asgi_fixtures"].append({"name": source.name, **hashes,
                                       "equal": len(set(hashes.values())) == 1})
    for artifact in sorted((MDD / "webui" / "dist").rglob("*")):
        if artifact.is_file():
            report["webui_build"].append({"path": artifact.relative_to(MDD).as_posix(),
                                           "sha256": digest(artifact)})
    original_tls = PROJECTS["android"][0] / "android/app/src/main/res/xml/network_security_config.xml"
    report["preserved_android_tls"] = {
        "sha256": digest(original_tls),
        "matches_original_dirty_baseline": digest(original_tls) ==
            "be1801eb668e90134a911e68bcd5266a727929a1d7e13a1de6335961ababc400",
    }
    output = STATE / f"source-evidence-{args.label}.json"
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Recorded {args.label}: {output}")
    print(f"Shared Dart equal: {all(row['equal'] for row in report['shared_dart'])}")
    print(f"ASGI fixture parity: {sum(row['equal'] for row in report['asgi_fixtures'])}"
          f"/{len(report['asgi_fixtures'])}")


if __name__ == "__main__":
    main()
