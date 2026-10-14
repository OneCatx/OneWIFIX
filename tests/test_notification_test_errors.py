"""A notification test rejects a bad channel before it sends, and does not answer 500."""
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from control.app import mobile_settings


class NotificationTestErrorTests(unittest.TestCase):
    def test_invalid_bark_url_is_422_and_sends_nothing(self):
        with patch.object(mobile_settings.cfg, "get_settings", return_value={}), \
                patch.object(mobile_settings.notify_push.requests, "post") as post:
            with self.assertRaises(HTTPException) as caught:
                mobile_settings.test("bark", {"urls": ["http://api.day.app/secret-token"]})
        self.assertEqual(caught.exception.status_code, 422)
        self.assertNotIn("secret-token", str(caught.exception.detail))
        post.assert_not_called()

    def test_invalid_wecom_template_and_empty_webhook_send_nothing(self):
        with patch.object(mobile_settings.cfg, "get_settings", return_value={}), \
                patch.object(mobile_settings.notify_push.requests, "post") as post:
            with self.assertRaises(HTTPException) as caught:
                mobile_settings.test("wecom", {
                    "urls": ["https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=abc"],
                    "payload_template": ["not", "text"],
                })
            self.assertEqual(caught.exception.status_code, 422)
            with self.assertRaises(HTTPException) as empty:
                mobile_settings.test("webhook", {})
            self.assertEqual(empty.exception.status_code, 422)
        post.assert_not_called()

    def test_delivery_failure_is_502_without_the_channel_secret(self):
        with patch.object(mobile_settings.cfg, "get_settings", return_value={}), \
                patch.object(mobile_settings.notify_push, "send_bark",
                             side_effect=RuntimeError("Bark request failed https://api.day.app/SECRET")):
            with self.assertRaises(HTTPException) as caught:
                mobile_settings.test("bark", {"urls": ["https://api.day.app/SECRET"]})
        self.assertEqual(caught.exception.status_code, 502)
        self.assertEqual(caught.exception.detail, "notification was not delivered")
        self.assertNotIn("SECRET", str(caught.exception.detail))


if __name__ == "__main__":
    unittest.main()
