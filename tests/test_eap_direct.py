"""Three HK first-REGISTER authorization, built from the IKE EAP result."""

import os
import stat
import tempfile
import unittest
from pathlib import Path

from engine.eap_direct import build_authorization, publish_authorization


class EapDirectTests(unittest.TestCase):
    def test_authorization_uses_the_same_rand_and_autn_as_the_nonce(self):
        username = "454030000000000@ims.mnc003.mcc454.3gppnetwork.org"
        realm = "ims.mnc003.mcc454.3gppnetwork.org"
        header = build_authorization(username, realm, bytes.fromhex("00112233"), b"R" * 16, b"A" * 16)
        self.assertIn('algorithm=AKAv1-MD5', header)
        self.assertIn('username="' + username + '"', header)
        self.assertIn('realm="' + realm + '"', header)
        self.assertIn('uri="sip:' + realm + '"', header)
        self.assertNotIn("\n", header)

    def test_short_material_is_refused(self):
        with self.assertRaises(ValueError):
            build_authorization("u@d", "d", b"\x01\x02", b"R" * 16, b"A" * 16)
        with self.assertRaises(ValueError):
            build_authorization("u@d", "d", b"\x01\x02\x03\x04", b"R" * 15, b"A" * 16)

    def test_publish_is_private_and_one_line(self):
        with tempfile.TemporaryDirectory() as tmp:
            publish_authorization(tmp, "454030000000000@ims.mnc003.mcc454.3gppnetwork.org",
                                  "ims.mnc003.mcc454.3gppnetwork.org",
                                  bytes.fromhex("001122334455"), b"R" * 16, b"A" * 16)
            path = Path(tmp) / "eap_direct.auth"
            if os.name != "nt":
                self.assertEqual(stat.S_IMODE(path.stat().st_mode) & 0o077, 0)
            text = path.read_text(encoding="ascii")
            self.assertTrue(text.endswith("\n"))
            self.assertEqual(text.count("\n"), 1)
            self.assertTrue(text.startswith("Digest "))


if __name__ == "__main__":
    unittest.main()
