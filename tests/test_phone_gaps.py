import os
import smtplib
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from control.app import (authz, device_register, mobile_settings, notify_push, phone_calls,
                         phone_compat, vowifi_mtu)


def _mail(**extra):
    item = {
        "enabled": True,
        "smtp_host": "smtp.example.test",
        "smtp_port": 587,
        "use_ssl": False,
        "username": "box",
        "password": "secret-value",
        "from_address": "gw@example.test",
        "to_addresses": ["owner@example.test"],
    }
    item.update(extra)
    return item


class DeviceRegisterTests(unittest.TestCase):
    def test_a_reader_name_becomes_a_stopped_draft_id(self):
        spec = device_register.draft({
            "id": "ACS ACR39U ICC Reader 0",
            "name": "Desk reader",
            "control_device": "ACS ACR39U ICC Reader 0",
            "usb_path": "",
            "modem_imei": "",
        })
        self.assertEqual(spec["id"], "ACS-ACR39U-ICC-Reader-0")
        self.assertEqual(spec["provisioning_state"], "draft")
        self.assertFalse(spec["enabled"])
        self.assertEqual(spec["reader"], "ACS ACR39U ICC Reader 0")

    def test_the_same_reader_is_not_created_twice(self):
        spec = device_register.draft({
            "id": "Dot-ABCDEF01", "name": "Reader",
            "control_device": "Reader 0", "usb_path": "",
        })
        existing = {"id": "3", "name": "Old", "reader": "Reader 0"}
        self.assertEqual(device_register.match([existing], spec)["id"], "3")

    def test_a_later_card_read_fills_the_registered_draft(self):
        spec = device_register.draft({
            "id": "Dot-ABCDEF01", "name": "Reader", "control_device": "Reader 0",
        })
        self.assertEqual(device_register.claim_target([spec], "Reader 0")["id"], "Dot-ABCDEF01")
        self.assertIsNone(device_register.claim_target(
            [{**spec, "iccid": "8944"}], "Reader 0"))

    def test_a_taken_id_on_another_reader_is_refused(self):
        spec = device_register.draft({
            "id": "Dot-ABCDEF01", "control_device": "Reader B",
        })
        with self.assertRaises(ValueError):
            device_register.match([{"id": "Dot-ABCDEF01", "reader": "Reader A"}], spec)


class CallShapeTests(unittest.TestCase):
    def test_a_ringing_inbound_row_uses_the_phone_states(self):
        row = phone_calls.view({
            "id": 7, "call_id": "", "direction": "in", "peer": "+12025550100",
            "status": "ringing", "start_ts": 1712345678,
        })
        self.assertEqual(row["id"], "7")
        self.assertEqual(row["direction"], "incoming")
        self.assertEqual(row["state"], "ringing")
        self.assertIsNone(row["ended_at"])
        self.assertTrue(row["media_ready"])
        self.assertEqual(row["started_at"], "2024-04-05T19:34:38Z")

    def test_snapshot_keeps_only_open_calls_on_ready_lines(self):
        body = phone_calls.snapshot(
            [{"id": "sim1", "name": "Work", "enabled": True},
             {"id": "draft", "name": "New", "enabled": False, "provisioning_state": "draft"}],
            lambda iid: [{
                "id": 1, "direction": "out", "peer": "+1", "status": "answered", "start_ts": 10,
            }] if iid == "sim1" else [{"id": 2, "status": "ended", "end_ts": 11, "direction": "in",
                                       "peer": "+2", "start_ts": 9}])
        self.assertTrue(body["canReceiveCalls"])
        self.assertEqual(body["devices"][0]["calls"][0]["state"], "active")
        self.assertEqual(body["devices"][1]["calls"], [])
        self.assertFalse(body["devices"][1]["ready"])

    def test_media_is_the_handset_pcm_format(self):
        meta = phone_calls.media("sim1", "7")
        self.assertEqual(meta["format"], "pcm_s16le_8000_mono")
        self.assertTrue(meta["dtmf"])
        self.assertIn("/api/devices/sim1/calls/media?id=7", meta["stream"])

    def test_license_names_the_gateway_seat_without_a_key(self):
        self.assertEqual(phone_calls.license_status(), {
            "activated": True, "code": "", "edition": "", "client_kind": "gateway"})


class MtuTests(unittest.TestCase):
    def test_compatibility_lowers_the_tunnel_unless_the_operator_set_one(self):
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("SWU_TUN_MTU", None)
            self.assertEqual(vowifi_mtu.tunnel_mtu({}), "1400")
            self.assertEqual(vowifi_mtu.tunnel_mtu({"vowifi": {"mtu_compatibility": True}}), "1280")
        with patch.dict(os.environ, {"SWU_TUN_MTU": "1300"}):
            self.assertEqual(vowifi_mtu.tunnel_mtu({"vowifi": {"mtu_compatibility": True}}), "1300")

    def test_the_flag_is_the_only_accepted_field(self):
        saved = vowifi_mtu.patch({"vowifi": {"other": 1}}, {"mtu_compatibility": True})
        self.assertEqual(saved["vowifi"], {"other": 1, "mtu_compatibility": True})
        with self.assertRaises(ValueError):
            vowifi_mtu.patch({}, {"mtu_compatibility": "yes"})


class EmailChannelTests(unittest.TestCase):
    def test_a_complete_mailbox_is_saved_and_the_password_is_masked(self):
        with patch.object(mobile_settings.cfg, "get_settings", return_value={}), \
                patch.object(mobile_settings.cfg, "update_settings") as save:
            view = mobile_settings.update({"email": _mail()})
        stored = save.call_args.args[0]["email"]
        self.assertEqual(stored["password"], "secret-value")
        self.assertEqual(stored["to_addresses"], ["owner@example.test"])
        self.assertEqual(view["email"]["password"], "********")
        self.assertNotIn("secret-value", str(view))

    def test_a_masked_password_keeps_the_saved_one(self):
        previous = {"email": _mail()}
        with patch.object(mobile_settings.cfg, "get_settings", return_value=previous), \
                patch.object(mobile_settings.cfg, "update_settings") as save:
            mobile_settings.update({"email": _mail(password="********")})
        self.assertEqual(save.call_args.args[0]["email"]["password"], "secret-value")

    def test_turning_email_off_does_not_require_a_server(self):
        with patch.object(mobile_settings.cfg, "get_settings", return_value={}), \
                patch.object(mobile_settings.cfg, "update_settings") as save:
            view = mobile_settings.update({"email": {"enabled": False}})
        self.assertFalse(save.call_args.args[0]["email"]["enabled"])
        self.assertFalse(view["email"]["enabled"])

    def test_smtp_failure_does_not_repeat_the_password(self):
        class Refused:
            def __init__(self, *args, **kwargs):
                raise smtplib.SMTPException("secret-value")

        with patch.object(notify_push.smtplib, "SMTP", Refused):
            with self.assertRaises(RuntimeError) as error:
                notify_push.send_email(_mail(), {"event": "incoming_sms", "text": "code 1234"})
        self.assertNotIn("secret-value", str(error.exception))

    def test_dispatch_queues_email_beside_the_other_channels(self):
        queued = []

        def capture(fn, *args, **kwargs):
            queued.append(args)
            return None

        with patch.object(notify_push._DELIVERY_EXECUTOR, "submit", capture):
            notify_push.dispatch({"email": _mail()}, notify_push.EV_INCOMING_SMS,
                                 {"id": "sim1", "name": "Work"}, "+100", "code 1234")
        self.assertEqual(queued[0][0], "email")
        self.assertIs(queued[0][1], notify_push.send_email)

    def test_an_enabled_mailbox_without_a_host_is_rejected(self):
        with patch.object(mobile_settings.cfg, "get_settings", return_value={}), \
                patch.object(mobile_settings.cfg, "update_settings") as save:
            with self.assertRaises(HTTPException) as error:
                mobile_settings.update({"email": {"enabled": True}})
        self.assertEqual(error.exception.status_code, 422)
        save.assert_not_called()


class ClientPermissionTests(unittest.TestCase):
    def test_a_phone_client_can_register_call_restart_and_read_the_seat(self):
        phone = SimpleNamespace(kind="client", capabilities=frozenset({
            "manage_devices", "manage_settings", "manage_esim"}))
        checks = (
            ("POST", "/api/mobile/v1/devices"),
            ("POST", "/api/devices"),
            ("POST", "/api/mobile/v1/devices/sim1/actions/reboot"),
            ("PUT", "/api/mobile/v1/settings/vowifi"),
            ("GET", "/api/mobile/v1/license"),
            ("GET", "/api/mobile/v1/devices/sim1/calls"),
            ("POST", "/api/mobile/v1/devices/sim1/calls/dial"),
            ("GET", "/api/mobile/v1/calls/events"),
            ("WEBSOCKET", "/api/devices/sim1/calls/media"),
            ("POST", "/api/mobile/v1/settings/notifications/email/test"),
        )
        for method, path in checks:
            self.assertTrue(authz.allowed(phone, method, path), path)
        self.assertEqual(phone_compat.socket_token("id=7&access_token=mdd_c1_phone"), "mdd_c1_phone")
        self.assertEqual(phone_compat.socket_token("access_token=not-a-client"), "")


if __name__ == "__main__":
    unittest.main()
