"""Provider contract with a mocked HTTP/2 transport: no Apple hardware claim."""
import json
import unittest
from unittest.mock import MagicMock, patch

from control.app import mobile_apns


class APNsTests(unittest.TestCase):
    def test_voip_payload_uses_real_call_identity_and_short_expiration(self):
        settings = {"enabled": True, "environment": "sandbox", "bundle_id": "example.mdd",
                    "key_id": "KEY123", "team_id": "TEAM123", "auth_key_path": "/secret.p8"}
        response = MagicMock(status_code=200, http_version="HTTP/2")
        client = MagicMock()
        client.post.return_value = response
        with patch.object(mobile_apns, "provider_authorization", return_value="signed.jwt"):
            mobile_apns.send_voip(settings, "aabb", {"call_id": "1712345678.001",
                                                     "instance": "sim1", "pickup_uri":
                                                     "mddpickup-1712345678.001"}, client=client)
        args, kwargs = client.post.call_args
        self.assertIn("api.sandbox.push.apple.com/3/device/aabb", args[0])
        self.assertEqual(kwargs["headers"]["apns-topic"], "example.mdd.voip")
        self.assertEqual(kwargs["headers"]["apns-push-type"], "voip")
        self.assertGreater(int(kwargs["headers"]["apns-expiration"]), 1700000000)
        self.assertEqual(kwargs["headers"]["authorization"], "bearer signed.jwt")
        self.assertEqual(kwargs["json"]["call_id"], "1712345678.001")
        self.assertEqual(kwargs["json"]["pickup_uri"], "mddpickup-1712345678.001")

    def test_sms_and_live_activity_use_distinct_topics_and_protocol(self):
        settings = {"enabled": True, "environment": "sandbox", "bundle_id": "example.mdd",
                    "key_id": "KEY123", "team_id": "TEAM123", "auth_key_path": "/secret.p8"}
        client = MagicMock()
        client.post.return_value = MagicMock(status_code=200, http_version="HTTP/2")
        event = {"id": 7, "content": "Your code is 123456", "number": "+15550000",
                 "deviceLabel": "Work"}
        with patch.object(mobile_apns, "provider_authorization", return_value="signed.jwt"):
            mobile_apns.send_sms(settings, "a" * 64, event, client=client)
            mobile_apns.send_live_activity_update(settings, "bbaa", event, client=client)
        calls = client.post.call_args_list
        self.assertEqual(calls[0].kwargs["headers"]["apns-push-type"], "alert")
        self.assertEqual(calls[0].kwargs["json"]["protocol_version"], 1)
        self.assertEqual(calls[1].kwargs["headers"]["apns-topic"],
                         "example.mdd.push-type.liveactivity")
        self.assertNotIn("attributes-type", calls[1].kwargs["json"]["aps"])
        self.assertEqual(calls[1].kwargs["json"]["aps"]["event"], "update")
