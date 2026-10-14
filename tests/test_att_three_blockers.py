"""Source-level contract for the deliberately blocked AT&T and Three HK profiles."""

import unittest
import tempfile
from pathlib import Path
from unittest.mock import patch

from control.app import carrier_profiles, config


class BlockedCarrierContractTests(unittest.TestCase):
    def _line(self, **overrides):
        return {"id": "carrier-block-test", "index": 0,
                "imsi": "310280123456789", "mcc": "310", "mnc": "280",
                "iccid": "89014100000", "reader": "imsi:310280123456789",
                "ami_secret": "test-ami",
                "sip": {"webrtc": {"password": "test-web"}}, **overrides}

    def test_att_identity_is_applied_to_the_engine_contract(self):
        profile = carrier_profiles.resolve({
            "mcc": "310", "mnc": "280", "imsi": "310280123456789",
        })
        self.assertEqual(profile["operational_status"], "mapped")
        self.assertEqual(profile["ims"]["public_realm"], "one.att.net")
        self.assertEqual(profile["ims"]["private_realm"], "private.att.net")
        self.assertEqual(profile["ims"]["register_expires"], 18400)
        self.assertEqual(profile["ims"]["ipsec_server_port"], 6000)

    def test_rendered_att_contract_keeps_the_paired_identity(self):
        with tempfile.TemporaryDirectory() as tmp, \
                patch.object(config, "DATA_DIR", tmp), \
                patch.object(config, "CONFIG_PATH", str(Path(tmp) / "config.yaml")):
            rendered = config.render_instance_json(self._line(), {})
        self.assertIsNone(rendered["carrier_block"])
        self.assertEqual(rendered["carrier_profile"], "att-us")
        self.assertEqual(rendered["carrier_operational_status"], "mapped")
        self.assertEqual(rendered["epdg"], "epdg.epc.att.net")
        self.assertEqual(rendered["sip"]["ims_public_realm"], "one.att.net")
        self.assertEqual(rendered["sip"]["ims_private_realm"], "private.att.net")
        self.assertTrue(rendered["sip"]["volte_att_register"])

    def test_three_profile_is_applied(self):
        profile = carrier_profiles.resolve({"mcc": "454", "mnc": "03"})
        self.assertEqual(profile["operational_status"], "mapped")
        self.assertEqual(profile["ims"]["security"], "disabled")
        self.assertEqual(profile["ims"]["initial_authorization"], "eap_direct")
        self.assertEqual(profile["ims"]["register_expires"], 7200)
        self.assertFalse(profile["ims"]["pani_enabled"])

    def test_three_rendered_contract_uses_the_direct_register(self):
        line = self._line(imsi="454030000000000", mcc="454", mnc="03",
                          iccid="89852300000")
        with tempfile.TemporaryDirectory() as tmp, \
                patch.object(config, "DATA_DIR", tmp), \
                patch.object(config, "CONFIG_PATH", str(Path(tmp) / "config.yaml")):
            rendered = config.render_instance_json(line, {})
        self.assertIsNone(rendered["carrier_block"])
        self.assertEqual(rendered["carrier_profile"], "three-hk")
        self.assertEqual(rendered["epdg"], "wlan.three.com.hk")
        self.assertEqual(rendered["sip"]["security"], "disabled")
        self.assertTrue(rendered["sip"]["volte_three_register"])
        self.assertFalse(rendered["sip"]["pani_enabled"])

    def test_rendered_contract_carries_explicit_fail_closed_block(self):
        line = self._line(imsi="460001234567890", mcc="460", mnc="00",
                          iccid="89860000000")
        with tempfile.TemporaryDirectory() as tmp, \
                patch.object(config, "DATA_DIR", tmp), \
                patch.object(config, "CONFIG_PATH", str(Path(tmp) / "config.yaml")):
            rendered = config.render_instance_json(line, {})
        block = rendered["carrier_block"]
        self.assertEqual(block["code"], "carrier_profile_unsupported")
        self.assertEqual(block["profile"], "china-mainland")
        self.assertEqual(block["status"], "blocked")
        self.assertIn("+86", block["message"])

    def test_three_rendered_contract_is_also_fail_closed(self):
        line = self._line(imsi="454030000000000", mcc="454", mnc="03",
                          iccid="89852300000")
        with tempfile.TemporaryDirectory() as tmp, \
                patch.object(config, "DATA_DIR", tmp), \
                patch.object(config, "CONFIG_PATH", str(Path(tmp) / "config.yaml")):
            rendered = config.render_instance_json(line, {})
        self.assertIsNone(rendered["carrier_block"])
        self.assertEqual(rendered["carrier_profile"], "three-hk")
        self.assertEqual(rendered["sip"]["security"], "disabled")
        self.assertTrue(rendered["sip"]["volte_three_register"])


if __name__ == "__main__":
    unittest.main()
