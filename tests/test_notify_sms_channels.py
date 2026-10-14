import hashlib
import hmac
import unittest
from unittest.mock import patch

from control.app import notify_push


BARK = {"urls": ["https://api.day.app/token"], "level": "active"}
WECOM = {
    "urls": ["https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=abc"],
    "payload_template": '{"msgtype":"text","text":{"content":"{{text}}"}}',
}


class NotifySmsChannelTests(unittest.TestCase):
    def test_bark_skips_an_sms_that_is_not_a_verification_code(self):
        with patch.object(notify_push.requests, "post") as post:
            result = notify_push.send_bark(BARK, {
                "event": notify_push.EV_INCOMING_SMS,
                "text": "明天开会",
                "sim_name": "Work",
            })
        post.assert_not_called()
        self.assertEqual(result["skipped"], "not_verification_code")

    def test_bark_sends_the_sms_text_when_it_contains_a_code(self):
        with patch.object(notify_push.requests, "post") as post:
            post.return_value.status_code = 200
            post.return_value.json.return_value = {"code": 200}
            post.return_value.raise_for_status.return_value = None
            notify_push.send_bark(BARK, {
                "event": notify_push.EV_INCOMING_SMS,
                "text": "验证码 123456",
                "sim_name": "Work",
            })
        body = post.call_args.kwargs["json"]
        self.assertEqual(body["title"], "验证码 123456")
        self.assertEqual(body["body"], "来自 Work")

    def test_wecom_posts_a_rendered_json_template(self):
        with patch.object(notify_push.requests, "post") as post:
            post.return_value.status_code = 200
            post.return_value.json.return_value = {"errcode": 0}
            post.return_value.raise_for_status.return_value = None
            notify_push.send_wecom(WECOM, {
                "event": notify_push.EV_INCOMING_SMS,
                "text": "验证码 123456",
                "instance": "line-1",
            })
        body = post.call_args.kwargs["json"]
        self.assertEqual(body["msgtype"], "text")
        self.assertIn("123456", body["text"]["content"])

    def test_webhook_signs_the_json_body_for_each_android_url(self):
        payload = {"event": notify_push.EV_INCOMING_SMS, "text": "验证码 654321",
                   "instance": "line-1", "source": "+100"}
        with patch.object(notify_push.requests, "request") as request:
            request.return_value.status_code = 200
            request.return_value.raise_for_status.return_value = None
            notify_push.send_webhook({
                "urls": ["https://phone.example/hook", "https://phone.example/copy"],
                "secret": "android-secret",
                "timeout_ms": 4000,
                "method": "POST",
            }, payload)
        self.assertEqual(request.call_count, 2)
        raw = request.call_args_list[0].kwargs["data"]
        headers = request.call_args_list[0].kwargs["headers"]
        digest = "sha256=" + hmac.new(b"android-secret", raw, hashlib.sha256).hexdigest()
        self.assertEqual(headers["X-OneWIFI-Signature"], digest)
        self.assertEqual(headers["X-ONWIFI-Signature"], digest)
        self.assertEqual(request.call_args_list[0].kwargs["timeout"], 4)
        self.assertEqual(request.call_args_list[1].args[1], "https://phone.example/copy")


if __name__ == "__main__":
    unittest.main()
