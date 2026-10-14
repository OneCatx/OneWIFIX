"""Per-ICCID card settings can be exported, checked, and restored without secrets."""

import json
import os
import tempfile
import unittest
from unittest.mock import patch

from control.app import card_backup as backup
from control.app import config as cfg


def _policy(**extra):
    row = {
        "iccid": "894430000000002624",
        "network_enabled": False,
        "vowifi_enabled": True,
        "airplane_enabled": False,
        "apn": "ims",
        "ip_version": "IPV4V6",
        "custom_phone_number": "+85290000000",
        "mbn_profile": "",
        "voice_path": "vowifi",
        "pin": "1234",
    }
    row.update(extra)
    return row


class CardBackupTests(unittest.TestCase):
    def test_round_trip_keeps_settings_and_drops_secrets(self):
        raw = backup.export_backup([_policy()], source="onewifi", device_imei="350000000000001")
        self.assertLessEqual(len(raw), backup.MAX_BYTES)
        document = backup.parse_backup(raw)
        self.assertEqual(document["schema_version"], 1)
        self.assertEqual(document["device_imei"], "350000000000001")
        card = document["cards"][0]
        self.assertEqual(card["apn"], "ims")
        self.assertEqual(card["voice_path"], "vowifi")
        self.assertEqual(card["ip_version"], "IPV4V6")
        self.assertNotIn("pin", card)
        self.assertNotIn("pin", json.dumps(document))

    def test_rejects_empty_unknown_duplicate_and_bad_fields(self):
        with self.assertRaises(backup.CardBackupError):
            backup.parse_backup(b"")
        with self.assertRaises(backup.CardBackupError):
            backup.parse_backup(b'{"schema_version": 2, "cards": []}')
        with self.assertRaises(backup.CardBackupError):
            backup.export_backup([_policy(), _policy(apn="other")])
        duplicate = json.dumps({
            "schema_version": 1,
            "cards": [_policy(), _policy(apn="other")],
        }).encode()
        with self.assertRaises(backup.CardBackupError):
            backup.parse_backup(duplicate)
        with self.assertRaises(backup.CardBackupError):
            backup.parse_backup(backup.export_backup([_policy(ip_version="IPV4")]))
        with self.assertRaises(backup.CardBackupError):
            backup.parse_backup(backup.export_backup([_policy(voice_path="ims")]))

    def test_refuses_a_document_over_64kib(self):
        rows = [_policy(iccid=f"890141032111{index:04d}", apn="a" * 80) for index in range(400)]
        with self.assertRaises(backup.CardBackupError):
            backup.export_backup(rows)

    def test_preview_shows_only_the_iccid_tail(self):
        preview = backup.preview(backup.parse_backup(backup.export_backup([_policy()])))
        self.assertEqual(preview["card_count"], 1)
        self.assertEqual(preview["cards"][0]["iccid_tail"], "2624")
        self.assertNotIn("894430000000002624", json.dumps(preview))

    def test_restore_refuses_a_different_device_and_keeps_other_cards(self):
        document = backup.parse_backup(backup.export_backup(
            [_policy()], device_imei="350000000000001"))
        with self.assertRaises(backup.CardBackupError):
            backup.plan_restore(document, "000000000000000", {}, [])
        stored = {"8901": _policy(iccid="8901", apn="old")}
        policies, updates = backup.plan_restore(document, "", stored, [
            {"id": "line-1", "iccid": "894430000000002624", "apn": "old",
             "pin": "9999", "enabled": False},
            {"id": "line-2", "iccid": "8901", "apn": "stay", "pin": "1111"},
        ])
        self.assertEqual(policies["8901"]["apn"], "old")
        self.assertEqual(policies["894430000000002624"]["apn"], "ims")
        self.assertEqual(updates, [{
            "id": "line-1", "apn": "ims", "enabled": True,
            "cellular_enabled": False, "flight_mode": False,
            "msisdn": "+85290000000",
        }])
        self.assertNotIn("pin", updates[0])

    def test_export_uses_the_live_line_and_keeps_cards_that_are_not_inserted(self):
        stored = {"8901": _policy(iccid="8901", apn="saved")}
        cards = backup.policies_for_export(stored, [{
            "id": "line-9", "iccid": "894430000000002624", "apn": "live",
            "enabled": True, "msisdn": "+1", "pin": "0000",
        }])
        by_iccid = {card["iccid"]: card for card in cards}
        self.assertEqual(by_iccid["894430000000002624"]["apn"], "live")
        self.assertEqual(by_iccid["8901"]["apn"], "saved")
        self.assertNotIn("pin", by_iccid["894430000000002624"])


class CardBackupStoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        cfg._loaded = None
        for item in (
            patch.object(cfg, "DATA_DIR", self.tmp.name),
            patch.object(cfg, "CONFIG_PATH", os.path.join(self.tmp.name, "config.yaml")),
        ):
            item.start()
            self.addCleanup(item.stop)
        self.addCleanup(lambda: setattr(cfg, "_loaded", None))

    def test_restore_rewrites_the_matching_line_and_keeps_its_pin(self):
        cfg.upsert_instance({
            "id": "line-1", "name": "A", "iccid": "894430000000002624",
            "apn": "old", "pin": "9999", "enabled": False,
        })
        cfg.upsert_instance({
            "id": "line-2", "name": "B", "iccid": "8901",
            "apn": "stay", "pin": "1111", "enabled": True,
        })
        document = backup.parse_backup(backup.export_backup([_policy()]))
        policies, updates = backup.plan_restore(
            document, "", cfg.list_card_policies(), cfg.list_instances())
        cfg.replace_card_policies(policies)
        for update in updates:
            cfg.upsert_instance(update)
        line = cfg.get_instance("line-1")
        self.assertEqual(line["apn"], "ims")
        self.assertEqual(line["msisdn"], "+85290000000")
        self.assertEqual(line["pin"], "9999")
        self.assertTrue(line["enabled"])
        other = cfg.get_instance("line-2")
        self.assertEqual(other["apn"], "stay")
        self.assertEqual(other["pin"], "1111")
        self.assertIn("894430000000002624", cfg.list_card_policies())
        self.assertNotIn("8901", cfg.list_card_policies())

    def test_a_new_line_picks_up_a_remembered_card(self):
        cfg.replace_card_policies({"894430000000002624": _policy()})
        created = cfg.upsert_instance({
            "id": "new", "name": "N", "iccid": "894430000000002624",
        })
        self.assertEqual(created["apn"], "ims")
        self.assertEqual(created["msisdn"], "+85290000000")
        self.assertTrue(created["enabled"])
        self.assertNotIn("pin", created)


class CardPolicyViewTests(unittest.TestCase):
    def test_live_line_overlays_remembered_apn_and_number(self):
        stored = {"894430000000002624": _policy(apn="old", custom_phone_number="")}
        view = backup.policy_view(stored, "894430000000002624", {
            "id": "line", "iccid": "894430000000002624", "enabled": False,
            "apn": "live", "msisdn": "+85290000000",
        })
        self.assertEqual(view["apn"], "live")
        self.assertFalse(view["vowifi_enabled"])
        self.assertEqual(view["custom_phone_number"], "+85290000000")
        self.assertEqual(view["ip_version"], "IPV4V6")

    def test_patch_keeps_unmentioned_fields_and_only_updates_named_line_fields(self):
        policies = backup.merge_policy(
            {"894430000000002624": _policy(apn="ims", mbn_profile="keep")},
            "894430000000002624", {"apn": "internet"})
        self.assertEqual(policies["894430000000002624"]["apn"], "internet")
        self.assertEqual(policies["894430000000002624"]["mbn_profile"], "keep")
        update = backup.instance_update_from_patch(
            {"id": "line", "iccid": "894430000000002624"},
            policies["894430000000002624"], {"apn": "internet"})
        self.assertEqual(update, {"id": "line", "apn": "internet"})
        grounded_policies = backup.merge_policy(
            policies, "894430000000002624", {"airplane_enabled": True})
        grounded = backup.instance_update_from_patch(
            {"id": "line"}, grounded_policies["894430000000002624"],
            {"airplane_enabled": True})
        self.assertFalse(grounded["enabled"])
        self.assertTrue(grounded["flight_mode"])

    def test_a_finished_switch_applies_the_remembered_line(self):
        updates = backup.updates_for_iccid(
            {"894430000000002624": _policy(apn="ims", vowifi_enabled=False,
                                           custom_phone_number="+85290000000")},
            [{"id": "line", "iccid": "894430000000002624"},
             {"id": "other", "iccid": "8900000000000000000"}],
            "894430000000002624")
        self.assertEqual(updates, [{
            "id": "line", "apn": "ims", "enabled": False,
            "cellular_enabled": False, "flight_mode": False,
            "msisdn": "+85290000000",
        }])

    def test_bad_ip_version_is_refused(self):
        with self.assertRaises(backup.CardBackupError):
            backup.merge_policy({}, "894430000000002624", {"ip_version": "IPV4"})


if __name__ == "__main__":
    unittest.main()
