"""Bind the complete current backend regression to unchanged source and tools.

This runs local tests only. A green receipt is not deployment or hardware proof.
"""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil
import subprocess


ROOT = Path(__file__).resolve().parents[2]
STATE = Path(__file__).resolve().parent


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inputs():
    raw = subprocess.check_output([
        "git", "-C", str(ROOT), "ls-files", "-co", "--exclude-standard", "-z",
        "--", "control", "engine", "tests", "hooks", ".gitattributes",
        ".github", "webui/src", "webui/tests", "VERSION",
    ])
    paths = set(raw.decode("utf-8").split("\0")) - {""}
    paths.update("docs/onewifi-migration/" + name for name in (
        "run-backend-final.py", "run-current-regression.py", "run-linux-tests.ps1",
    ))
    return {name: digest(ROOT / name) for name in sorted(paths)
            if (ROOT / name).is_file()}


def main():
    before = inputs()
    shell = shutil.which("pwsh") or shutil.which("powershell")
    if not shell:
        raise RuntimeError("PowerShell is required for the documented WSL wrapper")
    command = [shell, "-NoProfile", "-File", str(STATE / "run-linux-tests.ps1"),
               "-CurrentRegression"]
    log = STATE / "backend-final-regression.log"
    print("Running every discovered current-tree test; no module exclusions", flush=True)
    with log.open("w", encoding="utf-8") as output:
        result = subprocess.run(command, cwd=ROOT, stdout=output, stderr=subprocess.STDOUT)
    after = inputs()
    text = log.read_text(encoding="utf-8", errors="replace")
    print("\n".join(text.splitlines()[-30:]), flush=True)
    record = {
        "recorded_utc": datetime.now(timezone.utc).isoformat(),
        "command": command,
        "exit_code": result.returncode,
        "source_unchanged": before == after,
        "inputs": after,
        "changed_during_run": [name for name in sorted(before.keys() | after.keys())
                               if before.get(name) != after.get(name)],
        "log": str(log), "log_sha256": digest(log),
        "boundary": "WSL software regression only. Documented three-case filesystem "
                    "split remains active. Linux Node skip must retain separate Windows "
                    "evidence. No installed engine, SIM, IMS, mobile or provider proof.",
    }
    (STATE / "backend-final-evidence.json").write_text(
        json.dumps(record, indent=2) + "\n", encoding="utf-8")
    if before != after:
        raise RuntimeError("Source changed during regression; receipt is not final")
    raise SystemExit(result.returncode)


if __name__ == "__main__":
    main()
