"""Run every current-tree unittest with documented filesystem selection.

The original Git-hook hang was traced to a CRLF shebang and corrected without
changing hook logic. No modules are excluded. This validation helper does not
establish installed or live-hardware acceptance.
"""
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests"))

# These unchanged tests fail on the 256 MiB tmpfs for reasons independently
# reproduced on the original checkout (TOOL_EVIDENCE.md). Keep running them,
# using the real project filesystem where their original assumptions hold.
# Other tests retain tmpfs so their Unix permission checks remain meaningful.
PROJECT_FILESYSTEM_CASES = frozenset({
    "test_container_update.ContainerUpdateRollbackTests.test_failed_base_recreation_restores_the_original_compose",
    "test_container_update.ContainerUpdateRollbackTests.test_the_rollback_drill_fails_once_after_the_switch_and_restores_everything",
    "test_country_egress.IdleBackoffTests.test_waiting_ends_early_when_an_input_document_changes",
})


class ProjectFilesystemSuite(unittest.TestSuite):
    def run(self, result, debug=False):
        directory = ROOT / "docs" / "onewifi-migration" / "tmp"
        directory.mkdir(parents=True, exist_ok=True)
        previous = tempfile.tempdir
        tempfile.tempdir = str(directory)
        try:
            for test in self:
                print(f"FILESYSTEM: {test.id()} -> {directory}", flush=True)
            return super().run(result, debug=debug)
        finally:
            tempfile.tempdir = previous


def cases(suite):
    for test in suite:
        if isinstance(test, unittest.TestSuite):
            yield from cases(test)
        else:
            yield test


if __name__ == "__main__":
    all_tests = list(cases(unittest.defaultTestLoader.discover(str(ROOT / "tests"))))
    print(f"CURRENT SOURCE: {ROOT}", flush=True)
    print(f"RUNNING ALL {len(all_tests)} discovered tests; NO MODULE EXCLUSIONS", flush=True)
    suite = unittest.TestSuite(
        ProjectFilesystemSuite([test]) if test.id() in PROJECT_FILESYSTEM_CASES else test
        for test in all_tests
    )
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    raise SystemExit(0 if result.wasSuccessful() else 1)
