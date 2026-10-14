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

    def test_att_inventory_exposes_identity_header_and_security_gaps(self):
        profile = carrier_profiles.resolve({
            "mcc": "310", "mnc": "280", "imsi": "310280123456789",
        })
        self.assertEqual(profile["operational_status"], "blocked")
        for field in (
            "ims.identity_profile",
            "ims.register_profile",
            "ims.register_options.supported_header",
            "ims.register_options.allow_header",
            "ims.register_options.include_accept_contact",
            "ims.register_options.include_p_preferred_id",
            "ims.register_options.p_visited_network_id",
            "ims.register_options.pani",
            "ims.register_options.cellular_network_info",
            "ims.register_options.contact_order",
            "ims.register_options.contact_tags",
            "ims.ipsec_encryption",
            "ims.ipsec_server_port",
        ):
            self.assertIn(field, profile["unsupported_fields"])

    def test_three_inventory_exposes_secure_handoff_and_register_gaps(self):
        profile = carrier_profiles.resolve({"mcc": "454", "mnc": "03"})
        self.assertEqual(profile["operational_status"], "blocked")
        for field in (
            "ims.security",
            "ims.initial_authorization",
            "ims.eap_material_handoff",
            "ims.disable_sec_agree",
            "ims.register_options.supported_header",
            "ims.register_options.allow_header",
            "ims.register_options.include_accept_contact",
            "ims.register_options.include_p_preferred_id",
            "ims.register_options.user_agent",
            "ims.register_options.register_expires",
            "ims.pani_enabled",
            "ims.direct_authorization",
        ):
            self.assertIn(field, profile["unsupported_fields"])

    def test_rendered_contract_carries_explicit_fail_closed_block(self):
        with tempfile.TemporaryDirectory() as tmp, \
                patch.object(config, "DATA_DIR", tmp), \
                patch.object(config, "CONFIG_PATH", str(Path(tmp) / "config.yaml")):
            rendered = config.render_instance_json(self._line(), {})
        block = rendered["carrier_block"]
        self.assertEqual(block["code"], "carrier_profile_unsupported")
        self.assertEqual(block["profile"], "att-us")
        self.assertEqual(block["status"], "blocked")
        self.assertIn("paired public/private IMS identity", block["message"])
        self.assertIn("ims.identity_profile", block["fields"])

    def test_three_rendered_contract_is_also_fail_closed(self):
        line = self._line(imsi="454030000000000", mcc="454", mnc="03",
                          iccid="89852300000")
        with tempfile.TemporaryDirectory() as tmp, \
                patch.object(config, "DATA_DIR", tmp), \
                patch.object(config, "CONFIG_PATH", str(Path(tmp) / "config.yaml")):
            rendered = config.render_instance_json(line, {})
        self.assertEqual(rendered["carrier_block"]["profile"], "three-hk")
        self.assertIn("same-session EAP handoff", rendered["carrier_block"]["message"])
        self.assertIn("ims.eap_material_handoff", rendered["carrier_block"]["fields"])


if __name__ == "__main__":
    unittest.main()
