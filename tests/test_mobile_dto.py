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
        self.assertEqual(len(row["esim_switch"]["phases"]), 11)
        self.assertEqual(len(row["esim_switch"]["steps"]), 5)
        self.assertTrue(row["esim_switch"]["recoverable"])

    def test_missing_hardware_is_not_reported_healthy(self):
        row = mobile_dto.device({"id": "line-7", "enabled": True},
                                {"state": "REGISTERING"}, None)
        self.assertEqual(row["lifecycle_phase"], "missing")
        self.assertFalse(row["healthy"])
        self.assertFalse(row["physical_present"])
        self.assertFalse(row["vowifi_active"])
        self.assertIs(row["radio_registered"], False)
        self.assertIs(row["radio_live_ok"], False)
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
        self.assertEqual(row["signal_dbm"], 0)
        self.assertEqual(row["modem"]["signal_dbm"], 0)
        self.assertEqual(row["modem"]["reg_status"], 0)
        measured = mobile_dto.device({"id": "line-1", "enabled": True}, {"state": "OK"}, {
            "present": True, "cellular": {"signal_dbm": -91, "signal_sinr": 12, "reg_status": 5}})
        self.assertEqual(measured["signal_dbm"], -91)
        self.assertEqual(measured["modem"]["reg_status"], 5)

    def test_sms_projection_does_not_claim_delivery(self):
        self.assertEqual(mobile_dto.sms_outcome({"ok": True}),
                         {"outcome": "accepted_unconfirmed", "parts_total": 1,
                          "parts_accepted": 1, "retry_safe": False})
        self.assertEqual(mobile_dto.sms_outcome({"ok": False}),
                         {"outcome": "failed", "parts_total": 0,
                          "parts_accepted": 0, "retry_safe": False})
        self.assertEqual(mobile_dto.sms_outcome(
            {"ok": True, "parts_total": 2, "parts_accepted": 2})["parts_total"], 2)
        self.assertEqual(mobile_dto.device({"id": "line-1"}, {}, {})["modem"]["radio_channel"], 0)
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

    def test_unknown_esim_profile_state_is_shown_as_disabled(self):
        groups = mobile_dto.esim_groups([{"aid": "a", "eid": "1", "profiles": [
            {"iccid": "8988", "profileState": "unexpected"}]}])
        self.assertEqual(groups[0]["profiles"][0]["state"], 0)

    def test_inserted_card_without_a_readable_iccid_still_counts_as_present(self):
        row = mobile_dto.device(
            {"id": "line-1", "enabled": True},
            {"state": "STOPPED"},
            {"present": True, "sim": {"present": True}})
        self.assertTrue(row["modem"]["sim_inserted"])
        self.assertFalse(row["vowifi_active"])

    def test_a_different_live_card_does_not_keep_the_old_registration(self):
        row = mobile_dto.device(
            {"id": "line-1", "enabled": True, "iccid": "1111", "msisdn": "+1555", "imsi": "310"},
            {"state": "OK", "label": "Registered"},
            {"present": True, "card_iccid": "2222", "sim": {"present": True, "iccid": "2222"}})
        self.assertFalse(row["vowifi_active"])
        self.assertEqual(row["vowifi_runtime"]["phase"], "idle")
        self.assertEqual(row["vowifi_runtime"]["local_phone"], "")
        self.assertEqual(row["modem"]["iccid"], "2222")
        self.assertEqual(row["modem"]["phone_number"], "")
        self.assertTrue(row["modem"]["sim_inserted"])

    def test_download_progress_has_terminal_done_or_error(self):
        self.assertEqual(mobile_dto.esim_progress({"event": "completed"})["step"], "done")
        self.assertEqual(mobile_dto.esim_progress({"event": "error", "error": "failed"})["step"], "error")


if __name__ == "__main__":
    unittest.main()
