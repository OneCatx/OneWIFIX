"""Bound an unchanged local-only Git fixture and expose its blocking subprocess.

This diagnostic does not replace Git, alter hooks, or contact a network remote.
It is not part of the product or a substitute for the unmodified test suite.
"""
from pathlib import Path
import subprocess
import sys
import time
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
original_run = subprocess.run


def diagnostic_run(*args, **kwargs):
    command = args[0] if args else kwargs.get("args")
    print(f"START {command!r}", flush=True)
    start = time.monotonic()
    kwargs.setdefault("timeout", 12)
    try:
        result = original_run(*args, **kwargs)
        print(f"END {result.returncode} {time.monotonic() - start:.3f}s", flush=True)
        if result.returncode:
            print(f"STDERR {result.stderr!r}", flush=True)
        return result
    except subprocess.TimeoutExpired as exc:
        print(f"TIMEOUT stdout={exc.stdout!r} stderr={exc.stderr!r}", flush=True)
        raise


if __name__ == "__main__":
    subprocess.run = diagnostic_run
    suite = unittest.defaultTestLoader.loadTestsFromName(
        "tests.test_pre_push_privacy_hook.PrePushPrivacyHookTests."
        "test_a_check_that_cannot_run_refuses_without_inventing_a_finding"
    )
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    raise SystemExit(0 if result.wasSuccessful() else 1)
