"""The retained Flutter DTOs require explicit fields and stable instance identity."""
import unittest

from control.app import mobile_dto


class MobileDtoTests(unittest.TestCase):
    def test_line_identity_is_instance_not_physical_hardware(self):
        line = {"id": "line-7", "name": "Work", "iccid": "8901", "imsi": "31001",
                "msisdn": "+15550000", "enabled": True}
        hardware = {"id": "reader-hash", "instance_id": "line-7", "present": True,
                    "device_type": "reader", "model": "Reader"}
        row = mobile_dto.device(line, {"state": "OK", "reason": ""}, hardware)
        self.assertEqual(row["id"], "line-7")
        self.assertEqual(row["vowifi_runtime"]["device_id"], "line-7")
        self.assertTrue(row["physical_present"])
        self.assertEqual(row["modem"]["iccid"], "8901")
        self.assertFalse(row["network_connected"])

    def test_missing_hardware_is_not_reported_healthy(self):
        row = mobile_dto.device({"id": "line-7", "enabled": True},
                                {"state": "REGISTERING"}, None)
        self.assertEqual(row["lifecycle_phase"], "missing")
        self.assertFalse(row["healthy"])
        self.assertFalse(row["physical_present"])
        self.assertFalse(row["vowifi_active"])
        self.assertTrue(row["callable"])

    def test_reader_identity_cannot_be_used_as_line(self):
        row = mobile_dto.device({"id": "reader:physical-1", "enabled": False},
                                {"state": "STOPPED"}, {"id": "physical-1", "present": True})
        self.assertFalse(row["callable"])
        self.assertEqual(row["id"], "reader:physical-1")

    def test_cellular_projection_uses_real_mdd_fields_without_fabricated_qmi_numbers(self):
        row = mobile_dto.device({"id": "line-1", "enabled": True}, {"state": "OK"}, {
            "present": True, "device_type": "modem", "cellular": {
                "registration": "roaming", "operator": "Carrier", "signal": 74,
                "apn": "internet", "ip": "10.0.0.2", "interface": "wwan0",
                "data_active": True}})
        self.assertTrue(row["radio_registered"])
        self.assertEqual(row["interface"], "wwan0")
        self.assertEqual(row["private_ip"], "10.0.0.2")
        self.assertIsNone(row["signal_dbm"])
        self.assertIsNone(row["modem"]["reg_status"])

    def test_sms_projection_does_not_claim_delivery(self):
        self.assertEqual(mobile_dto.sms_outcome({"ok": True}),
                         {"outcome": "accepted_unconfirmed", "parts_total": None,
                          "parts_accepted": None, "retry_safe": False})
        self.assertEqual(mobile_dto.sms_outcome({"ok": False}),
                         {"outcome": "failed", "parts_total": None,
                          "parts_accepted": None, "retry_safe": False})
        self.assertIsNone(mobile_dto.device({"id": "line-1"}, {}, {})["modem"]["radio_channel"])
        self.assertEqual(mobile_dto.sms_message({"id": 7, "peer": "+15550123", "body": "hi",
                                                  "direction": "in", "ts": 100})["message_id"], "mdd:7")

    def test_lpa_profiles_map_to_flutter_groups_without_dropping_aid(self):
        ses = [{"aid": "a00001", "eid": "8901", "profiles": [
            {"iccid": "8988", "profileState": "enabled", "profileNickname": "Work",
             "serviceProviderName": "Carrier", "profileName": "Plan"}]}]
        groups = mobile_dto.esim_groups(ses)
        self.assertEqual(groups[0]["aidHex"], "a00001")
        self.assertEqual(groups[0]["profiles"][0]["state"], 1)
        self.assertEqual(groups[0]["profiles"][0]["profileNickname"], "Work")

    def test_download_progress_has_terminal_done_or_error(self):
        self.assertEqual(mobile_dto.esim_progress({"event": "completed"})["step"], "done")
        self.assertEqual(mobile_dto.esim_progress({"event": "error", "error": "failed"})["step"], "error")


if __name__ == "__main__":
    unittest.main()
