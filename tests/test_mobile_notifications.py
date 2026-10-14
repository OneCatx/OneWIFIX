"""Native notification settings and real provider envelopes."""
import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException

from control.app import mobile_settings, notify_push, mobile_apns


class MobileNotificationTests(unittest.TestCase):
    def test_masked_values_survive_save_without_disclosing_credentials(self):
        existing = {
            "telegram": {"enabled": True, "bot_token": "private-bot", "chat_id": "123",
                         "events": {"incoming_sms": False}},
            "wecom": {"enabled": True, "urls": [
                "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=private-key"]},
        }
        with patch.object(mobile_settings.cfg, "get_settings", return_value=existing), \
                patch.object(mobile_settings.cfg, "update_settings") as save:
            result = mobile_settings.update({
                "telegram": {"enabled": True, "bot_token": "********", "chat_id": "456"},
                "wecom": {"enabled": True, "urls": ["********"]},
                "email": {"enabled": False},
            })
        patch_data = save.call_args.args[0]
        self.assertEqual(patch_data["telegram"]["bot_token"], "private-bot")
        self.assertEqual(patch_data["telegram"]["events"], {"incoming_sms": False})
        self.assertEqual(patch_data["wecom"]["urls"], existing["wecom"]["urls"])
        self.assertEqual(result["wecom"]["urls"], ["********"])
        self.assertEqual(result["telegram"]["bot_token"], "********")

    def test_telegram_proxy_url_is_masked_and_can_be_retained(self):
        existing = {"telegram": {"enabled": True, "bot_token": "private-bot",
                                 "chat_id": "123", "proxy_url": "https://user:pass@proxy.example/",
                                 "base_url": "https://token@example.test/api"}}
        projected = mobile_settings.view(existing)
        self.assertEqual(projected["telegram"]["proxy"], "********")
        self.assertEqual(projected["telegram"]["base_url"], "********")
        with patch.object(mobile_settings.cfg, "get_settings", return_value=existing), \
                patch.object(mobile_settings.cfg, "update_settings") as save:
            mobile_settings.update({"telegram": {"enabled": True, "proxy": "********",
                                                 "base_url": "********"}})
        self.assertEqual(save.call_args.args[0]["telegram"]["proxy_url"],
                         existing["telegram"]["proxy_url"])
        self.assertEqual(save.call_args.args[0]["telegram"]["base_url"],
                         existing["telegram"]["base_url"])

    def test_invalid_or_unimplemented_enabled_channel_is_not_persisted(self):
        with patch.object(mobile_settings.cfg, "get_settings", return_value={}), \
                patch.object(mobile_settings.cfg, "update_settings") as save:
            for body, status in (({"email": {"enabled": True}}, 501),
                                 ({"wecom": {"enabled": True, "urls": ["https://evil.test/"]}}, 422),
                                 ({"webhook": {"enabled": True,
                                               "urls": ["https://a.test", "https://b.test"]}}, 501)):
                with self.assertRaises(HTTPException) as error:
                    mobile_settings.update(body)
                self.assertEqual(error.exception.status_code, status)
        save.assert_not_called()

    def test_masked_multi_url_delete_or_insert_cannot_retarget_destination(self):
        existing = {"wecom": {"enabled": True, "urls": [
            "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=first",
            "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=second"]}}
        with patch.object(mobile_settings.cfg, "get_settings", return_value=existing), \
                patch.object(mobile_settings.cfg, "update_settings") as save:
            for urls in (["********"], ["********", "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=third"],
                         ["********", "********", "********"]):
                with self.assertRaises(HTTPException) as error:
                    mobile_settings.update({"wecom": {"enabled": True, "urls": urls}})
                self.assertEqual(error.exception.status_code, 409)
        save.assert_not_called()

    def test_wecom_and_bark_check_application_status(self):
        payload = notify_push.build_payload(notify_push.EV_INCOMING_SMS,
                                            {"id": "sim1", "name": "Work"}, "+123", "hello")
        response = Mock(status_code=200)
        response.raise_for_status.return_value = None
        with patch.object(notify_push.requests, "post", return_value=response) as post:
            response.json.return_value = {"errcode": 0}
            notify_push.send_wecom({"urls": [
                "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=private-key"]}, payload)
            self.assertEqual(post.call_args.kwargs["json"]["msgtype"], "text")
            response.json.return_value = {"code": 200}
            notify_push.send_bark({"urls": ["https://api.day.app/private-key"],
                                   "level": "active"}, payload)
            self.assertIn("hello", post.call_args.kwargs["json"]["body"])
            response.json.return_value = {"code": 400}
            with self.assertRaisesRegex(RuntimeError, "Bark rejected"):
                notify_push.send_bark({"urls": ["https://api.day.app/private-key"]}, payload)

    def test_dispatch_splits_endpoints_for_independent_retries(self):
        payload = {"id": "sim1", "name": "Work"}
        urls = ["https://api.day.app/key1", "https://api.day.app/key2"]
        with patch.object(notify_push._DELIVERY_EXECUTOR, "submit") as submit:
            notify_push.dispatch({"bark": {"enabled": True, "urls": urls}},
                                 notify_push.EV_INCOMING_SMS, payload, "+123", "hello")
        self.assertEqual(submit.call_count, 2)
        self.assertEqual([call.args[3]["urls"] for call in submit.call_args_list],
                         [[urls[0]], [urls[1]]])

    def test_admin_view_masks_new_provider_credentials_and_round_trips(self):
        settings = {"wecom": {"enabled": True, "urls": [
            "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=private"]},
            "bark": {"enabled": False, "urls": ["https://api.day.app/key"]},
            "apns": {"enabled": False, "auth_key_path": "/private/AuthKey.p8"}}
        view = mobile_settings.native_view(settings)
        self.assertEqual(view["wecom"]["urls"], ["********"])
        self.assertEqual(view["bark"]["urls"], ["********"])
        self.assertEqual(view["apns"]["auth_key_path"], "********")
        patch_data = {key: dict(value) for key, value in view.items()}
        mobile_settings.prepare_native(patch_data, settings)
        self.assertEqual(patch_data["wecom"]["urls"], settings["wecom"]["urls"])
        self.assertEqual(patch_data["apns"]["auth_key_path"], "/private/AuthKey.p8")

    def test_native_provider_save_rejects_invalid_enabled_config(self):
        for channel, value in (("wecom", {"enabled": True, "urls": ["https://bad.test/"]}),
                               ("bark", {"enabled": True, "urls": ["http://api.day.app/key"]}),
                               ("apns", {"enabled": True, "environment": "sandbox"})):
            with self.assertRaises(HTTPException) as error:
                mobile_settings.prepare_native({channel: value}, {})
            self.assertEqual(error.exception.status_code, 400)
