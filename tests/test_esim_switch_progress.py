"""The eleven eSIM switch phases keep the five-step card and name the failure."""

import unittest

from control.app import esim_switch_progress as progress


class EsimSwitchPhaseTests(unittest.TestCase):
    def setUp(self):
        progress._progress.clear()

    def test_catalog_has_the_eleven_reference_phases(self):
        keys = [phase["key"] for phase in progress.PHASES]
        self.assertEqual(keys, [
            "radio_held", "identity_generation", "if_token", "ims_begin_issued",
            "switch_after", "switch_callbacks", "degraded_with_error", "failed",
            "failed_internal", "failed_with_error", "failure_ims_recovery",
        ])
        self.assertFalse(next(phase for phase in progress.PHASES
                              if phase["key"] == "failed_internal")["recoverable"])

    def test_running_switch_names_the_step_phase(self):
        progress.begin("reader:one")
        self.assertEqual(progress.snapshot("reader:one")["phase"], "radio_held")
        progress.advance(3, "reader:one")
        shot = progress.snapshot("reader:one")
        self.assertEqual(shot["phase"], "switch_after")
        self.assertTrue(shot["steps"][2]["pending"])
        self.assertTrue(shot["active"])
        self.assertEqual(len(shot["phases"]), 11)

    def test_write_or_check_rejection_is_not_recoverable(self):
        progress.begin("reader:one")
        progress.advance(3, "reader:one")
        progress.fail("write_rejected", "reader:one")
        shot = progress.snapshot("reader:one")
        self.assertEqual(shot["phase"], "failed_internal")
        self.assertFalse(shot["recoverable"])
        self.assertEqual(shot["fail_reason"], "write_rejected")

        progress.begin("reader:two")
        progress.advance(4, "reader:two")
        progress.fail("identity_mismatch", "reader:two")
        self.assertEqual(progress.snapshot("reader:two")["phase"], "failed_internal")
        self.assertFalse(progress.snapshot("reader:two")["recoverable"])

    def test_recovery_failure_stays_retryable_unless_identity_is_wrong(self):
        progress.begin("reader:one")
        progress.advance(5, "reader:one")
        progress.fail("rolled_back", "reader:one")
        shot = progress.snapshot("reader:one")
        self.assertEqual(shot["phase"], "failure_ims_recovery")
        self.assertTrue(shot["recoverable"])

        progress.fail("identity_mismatch", "reader:one")
        shot = progress.snapshot("reader:one")
        self.assertEqual(shot["phase"], "failed_internal")
        self.assertFalse(shot["recoverable"])

    def test_success_lands_on_switch_callbacks(self):
        progress.begin("reader:one")
        progress.complete("reader:one")
        shot = progress.snapshot("reader:one")
        self.assertEqual(shot["status"], "done")
        self.assertEqual(shot["phase"], "switch_callbacks")
        self.assertFalse(shot["active"])
        self.assertTrue(shot["steps"][-1]["ready"])

    def test_step_five_identity_mismatch_cannot_be_retried(self):
        progress.begin("reader:one")
        progress.advance(5, "reader:one")
        progress.fail("identity_mismatch", "reader:one")
        shot = progress.snapshot("reader:one")
        self.assertEqual(shot["phase"], "failed_internal")
        self.assertFalse(shot["recoverable"])

    def test_idle_snapshot_still_lists_the_catalog(self):
        shot = progress.snapshot("missing")
        self.assertFalse(shot["active"])
        self.assertEqual(len(shot["phases"]), 11)
        self.assertEqual(len(shot["steps"]), 5)


if __name__ == "__main__":
    unittest.main()
