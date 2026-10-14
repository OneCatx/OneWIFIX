"""Pairing tokens cannot become administrator or client credentials."""
import os
import tempfile
import unittest
from unittest.mock import patch

from control.app import authz, gate, mobile_pairing


class PairingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        p = patch.object(mobile_pairing, "PATH", os.path.join(self.temp.name, "pairing.json"))
        p.start()
        self.addCleanup(p.stop)

    def test_pairing_owns_only_its_endpoints_and_expires(self):
        secret = mobile_pairing.issue()
        self.assertTrue(mobile_pairing.verify(secret))
        token = "a" * 64
        mobile_pairing.register_sms(secret, token, "sandbox", mode="update_only")
        with patch.object(mobile_pairing.store, "get_message", return_value={"direction": "in"}):
            self.assertEqual(mobile_pairing.ack_sms(secret, token, 42), 42)
            with self.assertRaises(mobile_pairing.PairingError):
                mobile_pairing.ack_sms("wrong", token, 43)
        with patch.object(mobile_pairing.store, "get_message", return_value=None):
            with self.assertRaises(mobile_pairing.PairingError):
                mobile_pairing.ack_sms(secret, token, 100000)
        self.assertEqual(mobile_pairing.issue(rotate=True) != secret, True)
        self.assertFalse(mobile_pairing.verify(secret))
        self.assertEqual(mobile_pairing.sms_endpoints(), [])

    def test_pairing_gate_grants_exact_transport_methods_only(self):
        secret = mobile_pairing.issue()
        path = "/api/mobile/v1/onetools/ios/push-endpoint"
        source = gate.source_for({"type": "http", "path": path},
                                 {"authorization": "Bearer " + secret})
        self.assertEqual(source.name, "mobile pairing")
        who = source.resolve({"authorization": "Bearer " + secret})
        self.assertTrue(authz.allowed(who, "PUT", path))
        self.assertFalse(authz.allowed(who, "POST", path))
        self.assertFalse(authz.allowed(who, "GET", "/api/mobile/v1/devices"))

    def test_voip_endpoint_owned_by_client_not_pairing_rotation(self):
        with patch("control.app.clients.list_clients", return_value=[{"id": 17}]):
            mobile_pairing.register_call(17, "aabb", "sandbox")
            self.assertEqual(mobile_pairing.call_endpoints()[0]["client_id"], 17)
            mobile_pairing.issue(rotate=True)
            self.assertEqual(len(mobile_pairing.call_endpoints()), 1)
            mobile_pairing.remove_client(17)
            self.assertEqual(mobile_pairing.call_endpoints(), [])

    def test_update_only_activity_cas_receipt_and_tombstone(self):
        secret = mobile_pairing.issue()
        token = "a" * 64
        ordinary = mobile_pairing.register_sms(secret, token, "sandbox", "", mode="update_only")
        self.assertEqual(ordinary["live_activity_mode"], "update_only")
        self.assertEqual(ordinary["live_activity"]["state"], "none")
        import time
        now = int(time.time())
        receipt = mobile_pairing.register_activity(secret, token, "sandbox", "", {
            "activity_id": "activity-1", "update_token": "bbaa", "revision": 1,
            "started_at": now, "expires_at": now + 300, "state": "active"})
        self.assertEqual(receipt["live_activity"]["activity_id"], "activity-1")
        with self.assertRaises(mobile_pairing.PairingError):
            mobile_pairing.register_activity(secret, token, "sandbox", "", {
                "activity_id": "activity-2", "update_token": "ccdd", "revision": 1,
                "started_at": now, "expires_at": now + 300, "state": "active"})
        ended = mobile_pairing.register_activity(secret, token, "sandbox", "activity-1", {
            "activity_id": "activity-1", "update_token": "", "revision": 2,
            "started_at": now, "expires_at": now + 300, "state": "ended"})
        self.assertEqual(ended["live_activity"]["state"], "ended")
        self.assertEqual(mobile_pairing.sms_endpoints()[0]["live_activity"]["update_token"], "")


if __name__ == "__main__":
    unittest.main()
