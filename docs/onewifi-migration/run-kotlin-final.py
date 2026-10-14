"""Record Android Kotlin compilation against unchanged migration source."""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess


STATE = Path(__file__).resolve().parent
ROOT = STATE.parents[2] / "ONEWIFI" / "android"
DIAG = ROOT / "build" / "mdd-jdk-diag"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inputs():
    raw = subprocess.check_output([
        "git", "-C", str(ROOT), "ls-files", "-co", "--exclude-standard", "-z",
        "--", "android", "lib", "pubspec.yaml", "pubspec.lock",
    ])
    return {name: digest(ROOT / name)
            for name in sorted(set(raw.decode("utf-8").split("\0")) - {""})
            if (ROOT / name).is_file()}


def main():
    DIAG.mkdir(parents=True, exist_ok=True)
    before = inputs()
    env = os.environ.copy()
    env["JAVA_HOME"] = "C:/Program Files/Microsoft/jdk-21.0.11.10-hotspot"
    env["JAVA_TOOL_OPTIONS"] = f"-Djdk.net.unixdomain.tmpdir={DIAG}"
    command = [str(ROOT / "android" / "gradlew.bat"),
               ":app:compileDebugKotlin", "--no-daemon"]
    log = DIAG / "kotlin-final-compile.log"
    with log.open("w", encoding="utf-8") as output:
        result = subprocess.run(command, cwd=ROOT / "android", env=env,
                                stdout=output, stderr=subprocess.STDOUT)
    after = inputs()
    artifacts = {path.relative_to(ROOT).as_posix(): digest(path)
                 for path in sorted((ROOT / "build/app/tmp/kotlin-classes/debug").rglob("*"))
                 if path.is_file()}
    record = {
        "recorded_utc": datetime.now(timezone.utc).isoformat(),
        "recorder_sha256": digest(Path(__file__)),
        "command": command, "exit_code": result.returncode,
        "log": str(log), "log_sha256": digest(log), "inputs": after,
        "source_unchanged": before == after,
        "changed_during_run": [name for name in sorted(before.keys() | after.keys())
                               if before.get(name) != after.get(name)],
        "artifacts": artifacts,
        "boundary": "Kotlin compile only; no JVM unit test/APK/device or native call proof. "
                    "Original missing gateway_selfsigned blocks resources.",
    }
    (STATE / "android-kotlin-final-evidence.json").write_text(
        json.dumps(record, indent=2) + "\n", encoding="utf-8")
    print(log.read_text(encoding="utf-8", errors="replace")[-3500:])
    print("SOURCE_UNCHANGED", before == after, "ARTIFACTS", len(artifacts), flush=True)
    if before != after:
        raise RuntimeError("Source changed during compilation; receipt is not final")
    raise SystemExit(result.returncode)


if __name__ == "__main__":
    main()
