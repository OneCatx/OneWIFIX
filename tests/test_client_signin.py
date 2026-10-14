"""A client app signs in, works, is audited by name, and is thrown off -- through the real app."""
import asyncio
import json
import os
import tempfile
import time
import unittest
from urllib.parse import urlsplit
from unittest.mock import AsyncMock, patch

from control.app import auth, clients, main, store, mobile_pairing

PASSWORD = "correct horse battery"
HOST = "gateway.example.net"


class ClientSignInTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        path = lambda name: os.path.join(self.temp.name, name)  # noqa: E731
        for p in (
            patch.object(auth, "AUTH_PATH", path("auth.json")),
            patch.object(auth, "SESSIONS_PATH", path("sessions.json")),
            patch.object(clients, "CLIENTS_PATH", path("clients.json")),
            patch.object(main.cfg, "DATA_DIR", self.temp.name),
            patch.object(mobile_pairing, "PATH", path("pairing.json")),
            patch.multiple(store, DATA_DIR=self.temp.name, DB_PATH=path("history.sqlite"),
                           PREVIOUS_DB_PATH=path("previous.sqlite")),
            patch.object(main.cfg, "get_settings", return_value={}),
            patch.object(main.cfg, "list_instances", return_value=[
                {"id": "sim1", "name": "Work", "msisdn": "+61400000000", "enabled": True,
                 "pin": "1234", "sip": {"webrtc": {"password": "secret"}}}]),
        ):
            p.start()
            self.addCleanup(p.stop)
        store.init()
        auth._sessions.clear()
        auth._failures.clear()
        clients._load()
        self.addCleanup(clients._load)
        auth.setup(PASSWORD)
        self.cookie, self.csrf = auth.login("admin", PASSWORD, "192.0.2.1")

    def call(self, method, path, body=None, *, token=None, browser=False):
        target = urlsplit(path)
        headers = [(b"host", HOST.encode()), (b"content-type", b"application/json")]
        if token:
            headers.append((b"authorization", f"Bearer {token}".encode()))
        if browser:
            headers.append((b"cookie", f"{auth.SESSION_COOKIE}={self.cookie}".encode()))
            headers.append((b"x-onewifi-csrf-token", self.csrf.encode()))
        scope = {"type": "http", "method": method, "path": target.path,
                 "raw_path": target.path.encode(),
                 "query_string": target.query.encode(), "headers": headers, "client": ("192.0.2.1", 1234),
                 "server": (HOST, 443), "scheme": "https", "http_version": "1.1",
                 "root_path": ""}
        payload = json.dumps(body).encode() if body is not None else b""
        messages = [{"type": "http.request", "body": payload, "more_body": False}]
        sent = []

        async def receive():
            return messages.pop(0) if messages else {"type": "http.disconnect"}

        async def send(message):
            sent.append(message)

        asyncio.run(main.app(scope, receive, send))
        status = next(m["status"] for m in sent if m["type"] == "http.response.start")
        body = b"".join(m.get("body", b"") for m in sent if m["type"] == "http.response.body")
        return status, json.loads(body or b"null")

    def sign_in(self, **extra):
        return self.call("POST", "/api/auth/client/login",
                         {"username": "admin", "password": PASSWORD, "name": "Phone",
                          "platform": "ios", "app_version": "1.0", **extra})

    def audit(self):
        with open(os.path.join(self.temp.name, "audit", "operations.jsonl"),
                  encoding="utf-8") as handle:
            return [json.loads(line) for line in handle]

    def test_sign_in_needs_the_administrator_password(self):
        status, _ = self.call("POST", "/api/auth/client/login",
                              {"username": "admin", "password": "wrong password"})
        self.assertEqual(status, 401)
        status, body = self.sign_in()
        self.assertEqual(status, 200)
        self.assertTrue(body["token"].startswith(clients.TOKEN_PREFIX))
        self.assertEqual(body["client"]["name"], "Phone")

    def test_status_tells_a_client_it_is_signed_in_and_what_the_gateway_offers(self):
        token = self.sign_in()[1]["token"]
        status, body = self.call("GET", "/api/auth/status", token=token)
        self.assertEqual(status, 200)
        self.assertEqual((body["authenticated"], body["kind"]), (True, "client"))
        self.assertEqual(body["csrf"], "")
        self.assertIn("client_tokens", body["features"])

    def test_capability_grant_requires_password_and_is_reported_on_restore(self):
        status, _ = self.sign_in(password="wrong", capabilities=["manage_esim"])
        self.assertEqual(status, 401)
        status, body = self.sign_in(capabilities=["manage_esim"])
        self.assertEqual(status, 200)
        self.assertEqual(body["client"]["capabilities"], ["manage_esim"])
        status, restored = self.call("GET", "/api/auth/status", token=body["token"])
        self.assertEqual(status, 200)
        self.assertEqual(restored["client"]["capabilities"], ["manage_esim"])
        self.assertEqual(self.call("GET", "/api/readers", token=body["token"])[0], 403)
        self.assertNotEqual(self.call("GET", "/api/esim/status", token=body["token"])[0], 403)
        self.assertEqual(self.sign_in(capabilities=["admin"])[0], 400)

    def test_facade_permissions_instance_identity_and_error_envelope(self):
        old = self.sign_in()[1]["token"]
        denied, payload = self.call("GET", "/api/mobile/v1/devices", token=old)
        self.assertEqual((denied, payload["error"]["code"]), (403, "forbidden"))
        token = self.sign_in(capabilities=["manage_devices", "manage_esim"])[1]["token"]
        hardware = [{"id": "physical-1", "instance_id": "sim1", "present": True,
                     "reader": "Reader A", "device_type": "reader", "model": "PCSC"}]
        with patch.object(main, "_unified_devices", new=AsyncMock(return_value=hardware)):
            status, body = self.call("GET", "/api/mobile/v1/devices", token=token)
            self.assertEqual(status, 200, body)
            self.assertEqual(body["data"]["devices"][0]["id"], "sim1")
            self.assertEqual(body["data"]["device_limit"], 64)
            status, body = self.call("GET", "/api/mobile/v1/devices/sim1/overview", token=token)
            self.assertEqual(status, 200, body)
            self.assertEqual(body["data"]["devices"][0]["vowifi_runtime"]["device_id"], "sim1")

    def test_pairing_http_activity_cas_terminal_and_sms_receipt(self):
        client = self.sign_in(capabilities=["manage_settings"])[1]["token"]
        status, pair = self.call("GET", "/api/mobile/v1/settings/notifications/onetools/pairing",
                                 token=client)
        self.assertEqual(status, 200, pair)
        secret = pair["data"]["json"]
        pair_token = json.loads(secret)["t"]
        token = "a" * 64
        base = "/api/mobile/v1/onetools/ios/push-endpoint"
        status, registered = self.call("PUT", base, {"device_token": token,
            "environment": "sandbox", "push_to_start_token": "", "live_activity_mode": "update_only"},
            token=pair_token)
        self.assertEqual(status, 200, registered)
        self.assertEqual(registered["data"]["live_activity"]["state"], "none")
        now = int(time.time())
        active = {"device_token": token, "environment": "sandbox",
                  "expected_activity_id": "", "activity_id": "activity-1",
                  "update_token": "bbaa", "revision": 1, "started_at": now,
                  "expires_at": now + 300, "state": "active"}
        status, receipt = self.call("PUT", base + "/live-activity", active, token=pair_token)
        self.assertEqual(status, 200, receipt)
        self.assertEqual(receipt["data"]["live_activity"]["revision"], 1)
        self.assertNotIn("update_token", receipt["data"]["live_activity"])
        self.assertEqual(self.call("PUT", base + "/live-activity", active, token=pair_token)[0], 409)
        ended = {**active, "expected_activity_id": "activity-1", "update_token": "",
                 "revision": 2, "state": "ended"}
        self.assertEqual(self.call("PUT", base + "/live-activity", ended, token=pair_token)[0], 200)
        revived = {**active, "expected_activity_id": "activity-1", "revision": 3}
        self.assertEqual(self.call("PUT", base + "/live-activity", revived, token=pair_token)[0], 409)
        with patch.object(store, "get_message", return_value={"direction": "in"}):
            status, ack = self.call("POST", base + "/ack", {"device_token": token, "sms_id": 42},
                                    token=pair_token)
        self.assertEqual((status, ack["data"]["sms_id"]), (200, 42))
        self.assertEqual(self.call("GET", "/api/mobile/v1/devices", token=pair_token)[0], 401)

    def test_esim_facade_resolves_the_bound_reader_without_unrelated_card(self):
        token = self.sign_in(capabilities=["manage_esim"])[1]["token"]
        hardware = [{"id": "physical-1", "instance_id": "sim1", "present": True,
                     "reader": "Reader A", "device_type": "reader"}]
        with patch.object(main, "_unified_devices", new=AsyncMock(return_value=hardware)), \
                patch.object(main.cfg, "get_instance", return_value={"id": "sim1", "iccid": "8901"}), \
                patch.dict(main.hub.cards, {"Reader A": {"iccid": "8901"}}, clear=True), \
                patch.object(main, "_esim_resolve_reader", return_value=("Reader A", 2)), \
                patch.object(main, "api_esim_chip_cached", new=AsyncMock(return_value={
                    "cached": True, "ses": [{"eid": "8901", "aid": "a000", "profiles": []}]})) as cached:
            status, body = self.call("GET", "/api/mobile/v1/devices/sim1/esim", token=token)
        self.assertEqual(status, 200, body)
        self.assertEqual(body["data"]["chipInfo"]["eids"][0]["eid"], "8901")
        cached.assert_awaited_once_with(reader_index=2, reader="Reader A")

    def test_esim_facade_denies_unknown_or_different_bound_card(self):
        token = self.sign_in(capabilities=["manage_esim"])[1]["token"]
        hardware = [{"id": "physical-1", "instance_id": "sim1", "present": True,
                     "reader": "Reader A"}]
        for observed in ("", "different"):
            with self.subTest(observed=observed), \
                    patch.object(main, "_unified_devices", new=AsyncMock(return_value=hardware)), \
                    patch.object(main.cfg, "get_instance", return_value={"id": "sim1", "iccid": "8901"}), \
                    patch.dict(main.hub.cards, {"Reader A": {"iccid": observed}}, clear=True), \
                    patch.object(main, "api_esim_chip_cached", new=AsyncMock()) as cached:
                status, body = self.call("GET", "/api/mobile/v1/devices/sim1/esim", token=token)
            self.assertEqual((status, body["error"]["code"]), (409, "http_error"))
            cached.assert_not_awaited()

    def test_esim_switch_returns_new_line_identity_without_reusing_old_iid(self):
        token = self.sign_in(capabilities=["manage_esim"])[1]["token"]
        hardware = [{"id": "physical-1", "instance_id": "sim1", "present": True,
                     "reader": "Reader A"}]
        records = {"sim1": {"id": "sim1", "iccid": "8901"},
                   "sim2": {"id": "sim2", "iccid": "8902"}}

        async def enabled(iccid, args):
            self.assertEqual((iccid, args["reader"]), ("8902", "Reader A"))
            main.hub.cards["Reader A"] = {"iccid": "8902", "matched": "sim2"}
            hardware[0]["instance_id"] = "sim2"
            return {"ok": True, "card": {"iccid": "8902", "matched": "sim2"},
                    "recovery": {"instance_id": "sim2"}}

        with patch.object(main, "_unified_devices", new=AsyncMock(side_effect=lambda: hardware)), \
                patch.object(main.cfg, "get_instance", side_effect=records.get), \
                patch.dict(main.hub.cards, {"Reader A": {"iccid": "8901", "matched": "sim1"}}, clear=True), \
                patch.object(main, "_esim_resolve_reader", return_value=("Reader A", 2)), \
                patch.object(main, "api_esim_enable", new=AsyncMock(side_effect=enabled)):
            status, body = self.call("POST", "/api/mobile/v1/devices/sim1/esim/actions/switch",
                                     {"iccid": "8902"}, token=token)
            self.assertEqual(status, 200, body)
            self.assertEqual(body["data"]["device_id"], "sim2")
            self.assertEqual(body["data"]["reader_id"], "physical-1")
            self.assertEqual(self.call("GET", "/api/mobile/v1/devices/sim1/esim", token=token)[0], 409)
            with patch.object(main, "api_esim_chip_cached", new=AsyncMock(return_value={"cached": False})):
                self.assertEqual(self.call("GET", "/api/mobile/v1/devices/sim2/esim", token=token)[0], 200)

    def test_esim_switch_returns_reader_when_new_profile_has_no_line(self):
        token = self.sign_in(capabilities=["manage_esim"])[1]["token"]
        hardware = [{"id": "physical-1", "instance_id": "sim1", "present": True,
                     "reader": "Reader A"}]

        async def enabled(*_):
            main.hub.cards["Reader A"] = {"iccid": "8902", "matched": None}
            hardware[0]["instance_id"] = None
            return {"ok": True, "card": {"iccid": "8902"}}

        with patch.object(main, "_unified_devices", new=AsyncMock(side_effect=lambda: hardware)), \
                patch.object(main.cfg, "get_instance", return_value={"id": "sim1", "iccid": "8901"}), \
                patch.dict(main.hub.cards, {"Reader A": {"iccid": "8901"}}, clear=True), \
                patch.object(main, "_esim_resolve_reader", return_value=("Reader A", 2)), \
                patch.object(main, "api_esim_enable", new=AsyncMock(side_effect=enabled)):
            status, body = self.call("POST", "/api/mobile/v1/devices/sim1/esim/actions/switch",
                                     {"iccid": "8902"}, token=token)
            self.assertEqual(status, 200, body)
            self.assertEqual(body["data"]["device_id"], "reader:physical-1")
            self.assertEqual(body["data"]["reader_id"], "physical-1")
            self.assertEqual(self.call("GET", "/api/mobile/v1/devices/sim1/esim", token=token)[0], 409)
            with patch.object(main, "api_esim_chip_cached", new=AsyncMock(return_value={"cached": False})):
                self.assertEqual(self.call("GET", "/api/mobile/v1/devices/reader:physical-1/esim",
                                           token=token)[0], 200)

    def test_esim_switch_refuses_stale_post_switch_line_association(self):
        token = self.sign_in(capabilities=["manage_esim"])[1]["token"]
        hardware = [{"id": "physical-1", "instance_id": "sim1", "present": True,
                     "reader": "Reader A"}]

        async def enabled(*_):
            main.hub.cards["Reader A"] = {"iccid": "8902", "matched": "sim2"}
            return {"ok": True, "card": {"iccid": "8902", "matched": "sim2"},
                    "recovery": {"instance_id": "sim2"}}

        with patch.object(main, "_unified_devices", new=AsyncMock(return_value=hardware)), \
                patch.object(main.cfg, "get_instance", return_value={"id": "sim1", "iccid": "8901"}), \
                patch.dict(main.hub.cards, {"Reader A": {"iccid": "8901"}}, clear=True), \
                patch.object(main, "_esim_resolve_reader", return_value=("Reader A", 2)), \
                patch.object(main, "api_esim_enable", new=AsyncMock(side_effect=enabled)):
            status, body = self.call("POST", "/api/mobile/v1/devices/sim1/esim/actions/switch",
                                     {"iccid": "8902"}, token=token)
            self.assertEqual(status, 503, body)
            self.assertNotIn("data", body)

    def test_native_download_cancel_awaits_signal_and_returns_boolean(self):
        token = self.sign_in(capabilities=["manage_esim"])[1]["token"]
        main.hub.esim_download_ops["Reader A"] = "op-active"
        main.hub.esim_download_started.add("op-active")
        with patch.object(main, "_esim_resolve_reader", return_value=("Reader A", 0)), \
                patch.object(main.lpa, "cancel_download", new=AsyncMock(return_value=True)) as cancel:
            try:
                status, body = self.call("POST", "/api/esim/download/cancel",
                                         {"reader": "Reader A", "operation_id": "op-active"}, token=token)
            finally:
                main.hub.esim_download_ops.pop("Reader A", None)
                main.hub.esim_download_started.discard("op-active")
        self.assertEqual(status, 200, body)
        self.assertIs(body["cancelled"], True)
        cancel.assert_awaited_once_with("Reader A")

    def test_native_download_cancel_inactive_and_wrong_operation_do_not_signal(self):
        token = self.sign_in(capabilities=["manage_esim"])[1]["token"]
        with patch.object(main, "_esim_resolve_reader", return_value=("Reader A", 0)), \
                patch.object(main.lpa, "cancel_download", new=AsyncMock()) as cancel:
            inactive = self.call("POST", "/api/esim/download/cancel",
                                 {"reader": "Reader A", "operation_id": "old"}, token=token)
            main.hub.esim_download_ops["Reader A"] = "new"
            try:
                obsolete = self.call("POST", "/api/esim/download/cancel",
                                     {"reader": "Reader A", "operation_id": "old"}, token=token)
            finally:
                main.hub.esim_download_ops.pop("Reader A", None)
        self.assertEqual((inactive[0], inactive[1]["cancelled"]), (200, False))
        self.assertEqual((obsolete[0], obsolete[1]["cancelled"]), (200, False))
        cancel.assert_not_awaited()

    def test_pairing_endpoint_uses_separate_credential_and_rejects_client_token(self):
        token = self.sign_in(capabilities=["manage_settings"])[1]["token"]
        status, body = self.call("GET", "/api/mobile/v1/settings/notifications/onetools/pairing",
                                 token=token)
        self.assertEqual(status, 200, body)
        self.assertTrue(body["data"]["uri"].startswith("onetools://onewifi?"))
        secret = mobile_pairing.issue()
        path = "/api/mobile/v1/onetools/ios/push-endpoint"
        data = {"device_token": "a" * 64, "environment": "sandbox",
                "live_activity_mode": "update_only"}
        self.assertEqual(self.call("PUT", path, data, token=token)[0], 403)
        status, body = self.call("PUT", path, data, token=secret)
        self.assertEqual(status, 200, body)
        self.assertEqual(body["data"]["last_confirmed_sms_id"], 0)
        self.assertEqual(self.call("GET", "/api/mobile/v1/devices", token=secret)[0], 401)
        self.call("POST", "/api/mobile/v1/settings/notifications/onetools/pairing",
                  token=token)
        self.assertEqual(self.call("PUT", path, data, token=secret)[0], 401)

    def test_call_push_endpoint_is_removed_on_client_logout(self):
        token = self.sign_in()[1]["token"]
        status, body = self.call("POST", "/api/mobile/v1/calls/push-endpoint",
                                 {"device_token": "aabb", "environment": "sandbox"}, token=token)
        self.assertEqual(status, 200, body)
        self.assertEqual(len(mobile_pairing.call_endpoints()), 1)
        self.assertEqual(self.call("POST", "/api/auth/client/logout", token=token)[0], 200)
        self.assertEqual(mobile_pairing.call_endpoints(), [])

    def test_voip_registration_topic_uses_separate_voip_provider(self):
        token = self.sign_in()[1]["token"]
        path = "/api/mobile/v1/calls/push-endpoint"
        with patch.object(main.cfg, "get_settings", return_value={
                "apns": {"bundle_id": "example.sms"},
                "apns_voip": {"bundle_id": "example.calls"}}):
            status, body = self.call("POST", path, {"device_token": "aabb",
                "environment": "sandbox"}, token=token)
        self.assertEqual(status, 200, body)
        self.assertEqual(body["data"]["voipTopic"], "example.calls.voip")
        with patch.object(main.cfg, "get_settings", return_value={
                "apns_voip": {"bundle_id": "example.calls"}}):
            status, body = self.call("POST", path, {"device_token": "bbcc",
                "environment": "sandbox"}, token=token)
        self.assertEqual(status, 200, body)
        self.assertEqual(body["data"]["voipTopic"], "example.calls.voip")

    def test_pickup_provision_refuses_ended_and_wrong_line(self):
        token = self.sign_in()[1]["token"]
        with patch.object(main.store, "get_open_call_by_id", return_value=None), \
                patch.object(main.cfg, "get_instance", return_value={"id": "sim1"}):
            status, body = self.call("GET", "/api/mobile/v1/calls/1712345678.001/pickup?device_id=sim1",
                                     token=token)
        self.assertEqual(status, 409, body)

    def test_pickup_provision_advertises_only_still_ringing_call(self):
        token = self.sign_in()[1]["token"]
        with patch.object(main.store, "get_open_call_by_id", return_value={
                "id": 7, "call_id": "1712345678.001", "start_ts": 1712345678,
                "status": "ringing", "direction": "in"}), \
                patch.object(main.cfg, "get_instance", return_value={"id": "sim1"}), \
                patch.object(main.time, "time", return_value=1712345680):
            status, body = self.call("GET", "/api/mobile/v1/calls/1712345678.001/pickup?device_id=sim1",
                                     token=token)
        self.assertEqual(status, 200, body)
        self.assertEqual(body["data"]["pickup_uri"], "mddpickup-1712345678.001")

    def test_notifications_reject_unsupported_enabled_and_keep_secrets_redacted(self):
        token = self.sign_in(capabilities=["manage_settings"])[1]["token"]
        self.assertEqual(self.call("PUT", "/api/mobile/v1/settings/notifications",
                                   {"email": {"enabled": True}}, token=token)[0], 422)
        with patch.object(main.cfg, "get_settings", return_value={
                "telegram": {"enabled": True, "bot_token": "tg-private-123", "chat_id": "123"},
                "wecom": {"enabled": True, "urls": ["https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=wx-private-123"]}}):
            status, body = self.call("GET", "/api/mobile/v1/settings/notifications", token=token)
        self.assertEqual(status, 200, body)
        self.assertNotIn("tg-private-123", json.dumps(body))
        self.assertNotIn("wx-private-123", json.dumps(body))
        self.assertEqual(body["data"]["telegram"]["bot_token"], "********")

    def test_onetools_settings_save_enablement_and_public_address(self):
        token = self.sign_in(capabilities=["manage_settings"])[1]["token"]
        path = "/api/mobile/v1/settings/notifications"
        self.assertEqual(self.call("PUT", path, {"email": {"enabled": True}}, token=token)[0], 422)
        with patch.object(main.cfg, "update_settings") as save:
            status, response = self.call("PUT", path, {
                "email": {"enabled": False},
                "onetools": {"enabled": True, "public_base_url": "https://gw.example.test/"},
                "webhook": {"enabled": True, "urls": ["https://hook.example.test/sms"],
                            "secret": "android-secret", "timeout_ms": 5000},
                "bark": {"enabled": True, "urls": ["https://api.day.app/device-key"],
                         "group": "OneWIFI", "icon": "", "level": "active"},
            }, token=token)
            self.assertEqual(status, 200, response)
            self.assertEqual(response["data"]["onetools"], {
                "enabled": True, "public_base_url": "https://gw.example.test"})
            self.assertEqual(response["data"]["webhook"]["urls"], ["********"])
            self.assertEqual(response["data"]["bark"]["urls"], ["********"])
            saved = save.call_args.args[0]
            self.assertEqual(saved["onetools"]["public_base_url"], "https://gw.example.test")
            self.assertEqual(saved["webhook"]["urls"], ["https://hook.example.test/sms"])
            self.assertEqual(saved["webhook"]["secret"], "android-secret")
            self.assertEqual(saved["bark"]["urls"], ["https://api.day.app/device-key"])
            status, response = self.call("PUT", path, {
                "onetools": {"enabled": False, "public_base_url": ""},
            }, token=token)
            self.assertEqual(status, 200, response)
            self.assertFalse(response["data"]["onetools"]["enabled"])
            bad, detail = self.call("PUT", path, {
                "onetools": {"enabled": True, "public_base_url": "ftp://files.example"},
            }, token=token)
            self.assertEqual(bad, 422, detail)

    def test_unbound_reader_uses_card_snapshot_but_is_never_callable(self):
        token = self.sign_in(capabilities=["manage_devices"])[1]["token"]
        hardware = {"id": "physical-2", "present": True, "instance_id": None,
                    "reader": "PC/SC Reader B", "device_type": "reader"}
        with patch.object(main, "_unified_devices", new=AsyncMock(return_value=[hardware])), \
                patch.dict(main.hub.cards, {"PC/SC Reader B": {"iccid": "8902"}}, clear=True):
            status, body = self.call("GET", "/api/mobile/v1/devices", token=token)
        self.assertEqual(status, 200, body)
        reader = next(row for row in body["data"]["devices"] if row["id"] == "reader:physical-2")
        self.assertEqual(reader["reader"], "PC/SC Reader B")
        self.assertEqual(reader["modem"]["iccid"], "8902")
        self.assertFalse(reader["callable"])

    def test_admin_apns_test_uses_only_registered_endpoint(self):
        self.assertEqual(self.call("POST", "/api/notifications/apns/test", {}, browser=True)[0], 409)
        settings = {"apns": {"enabled": True, "environment": "sandbox",
                             "bundle_id": "example.mdd", "team_id": "TEAM123456",
                             "key_id": "KEY1234567", "auth_key_path": "/private/Key.p8"}}
        with patch.object(main.cfg, "get_settings", return_value=settings), \
                patch.object(main.mobile_pairing, "sms_endpoints", return_value=[
                    {"device_token": "a" * 64, "environment": "sandbox"}]), \
                patch.object(main.mobile_apns, "send_sms") as sender:
            status, body = self.call("POST", "/api/notifications/apns/test", {}, browser=True)
        self.assertEqual(status, 200, body)
        self.assertEqual(body["accepted"], 1)
        self.assertEqual(sender.call_args.args[1], "a" * 64)

    def test_mobile_notification_test_reaches_sender_only_with_settings_grant(self):
        grant = self.sign_in(capabilities=["manage_settings"])[1]["token"]
        no_grant = self.sign_in()[1]["token"]
        path = "/api/mobile/v1/settings/notifications/pushplus/test"
        with patch.object(main.notify_push, "send_pushplus", return_value={"ok": True}) as sender:
            self.assertEqual(self.call("POST", path, {"token": "x"}, token=no_grant)[0], 403)
            status, body = self.call("POST", path, {"token": "x"}, token=grant)
        self.assertEqual(status, 200, body)
        self.assertEqual(body["data"], {"ok": True})
        sender.assert_called_once()

    def test_settings_preferences_info_and_modem_storage_have_real_mdd_mapping(self):
        token = self.sign_in(capabilities=["manage_settings"])[1]["token"]
        with patch.object(main.cfg, "get_settings", return_value={
                "ui_language": "en", "cellular_sms_storage": "keep"}), \
                patch.object(main.cfg, "update_settings") as save:
            self.assertEqual(self.call("GET", "/api/mobile/v1/settings/preferences", token=token),
                             (200, {"data": {"language": "en"}}))
            self.assertEqual(self.call("PUT", "/api/mobile/v1/settings/preferences",
                                       {"language": "zh"}, token=token)[0], 200)
            save.assert_called_with({"ui_language": "zh"})
            self.assertEqual(self.call("GET", "/api/mobile/v1/settings/sms", token=token),
                             (200, {"data": {"auto_clear_modem_storage": False}}))
            self.assertEqual(self.call("PUT", "/api/mobile/v1/settings/sms",
                                       {"auto_clear_modem_storage": True}, token=token)[0], 200)
            save.assert_called_with({"cellular_sms_storage": "delete"})
            info = self.call("GET", "/api/mobile/v1/system/info", token=token)
            status, body = self.call("PUT", "/api/mobile/v1/settings/vowifi",
                                     {"mtu_compatibility": True}, token=token)
            self.assertEqual(status, 200, body)
            self.assertEqual(body["data"], {"mtu_compatibility": True})
            save.assert_any_call({"vowifi": {"mtu_compatibility": True}})
        self.assertEqual(info[0], 200, info)
        self.assertEqual(info[1]["data"]["version"], main.VERSION)

    def test_unknown_sms_submit_reports_one_part_and_failure_reports_zero(self):
        token = self.sign_in()[1]["token"]
        with patch.object(main.cfg, "get_instance", return_value={"id": "sim1"}), \
                patch.object(main, "send_sms_on_line", new=AsyncMock(return_value={"ok": True})):
            status, body = self.call("POST", "/api/mobile/v1/sms/send",
                                     {"device_id": "sim1", "phone": "+15550000",
                                      "message": "x" * 500}, token=token)
        self.assertEqual(status, 200, body)
        self.assertEqual(body["data"]["outcome"], "accepted_unconfirmed")
        self.assertEqual(body["data"]["parts_total"], 1)
        self.assertEqual(body["data"]["parts_accepted"], 1)
        with patch.object(main.cfg, "get_instance", return_value={"id": "sim1"}), \
                patch.object(main, "send_sms_on_line", new=AsyncMock(return_value={
                "ok": False, "error": "carrier rejected"})):
            status, body = self.call("POST", "/api/mobile/v1/sms/send",
                                     {"device_id": "sim1", "phone": "+15550000",
                                      "message": "x" * 500}, token=token)
        self.assertEqual(status, 502, body)
        self.assertEqual(body["data"]["outcome"], "failed")
        self.assertEqual(body["data"]["parts_total"], 0)
        self.assertEqual(body["data"]["parts_accepted"], 0)


    def test_a_client_sees_a_cut_of_each_line(self):
        token = self.sign_in()[1]["token"]
        with patch.object(main, "_cached_line_status", return_value={
                "state": "REGISTERED", "label": "Registered", "reason_code": "ok",
                "reason": "", "detail": {"internal": "x"}}):
            status, body = self.call("GET", "/api/instances", token=token)
        self.assertEqual(status, 200)
        (line,) = body["instances"]
        self.assertEqual(set(line), {"id", "name", "msisdn", "enabled", "status"})
        self.assertNotIn("detail", line["status"])

    def test_a_client_keeps_the_administrators_address_book_and_read_marks(self):
        token = self.sign_in()[1]["token"]
        status, body = self.call("POST", "/api/contacts",
                                 {"name": "Alice", "numbers": ["+61491570006"]}, token=token)
        self.assertEqual(status, 200, body)
        status, body = self.call("GET", "/api/contacts", browser=True)
        self.assertEqual([c["name"] for c in body["contacts"]], ["Alice"])
        status, body = self.call("POST", "/api/instances/sim1/messages/read", {"all": True},
                                 token=token)
        self.assertEqual((status, body["ok"]), (200, True))
        self.assertEqual(self.call("GET", "/api/messages/unread", token=token)[0], 200)

    def test_a_client_is_told_whether_a_line_works_not_why(self):
        token = self.sign_in()[1]["token"]
        full = {"state": "REGISTERED", "label": "Registered", "reason_code": "ok", "reason": "",
                "detail": {"pcscf": "10.0.0.1"}}
        with patch.object(main.cfg, "get_instance", return_value={"id": "sim1"}), \
                patch.object(main, "_cached_line_status", return_value=full):
            _, mine = self.call("GET", "/api/instances/sim1/status", token=token)
            _, admins = self.call("GET", "/api/instances/sim1/status", browser=True)
        self.assertNotIn("detail", mine)
        self.assertEqual(admins["detail"], {"pcscf": "10.0.0.1"})

    def test_a_client_cannot_read_filed_binary_messages(self):
        token = self.sign_in()[1]["token"]
        self.assertEqual(self.call("GET", "/api/instances/sim1/messages/binary", token=token)[0],
                         403)

    def test_resetting_the_administrator_ends_every_sign_in(self):
        token = self.sign_in()[1]["token"]
        # `install.sh reset-admin` moves auth.json away and restarts nothing.
        os.rename(auth.AUTH_PATH, auth.AUTH_PATH + ".reset")
        self.assertEqual(self.call("GET", "/api/instances/sim1/status", token=token)[0], 401)
        self.assertEqual(self.call("GET", "/api/auth/clients", browser=True)[0], 401)
        status, _ = self.call("POST", "/api/auth/setup",
                              {"username": "admin", "password": "a brand new password"})
        self.assertEqual(status, 200)
        self.assertEqual(self.call("GET", "/api/auth/status", token=token)[0], 401)
        self.assertEqual(clients.list_clients(), [])
        self.assertIsNone(auth.session(self.cookie))

    def test_the_administrator_lists_and_revokes_clients(self):
        token = self.sign_in()[1]["token"]
        status, body = self.call("GET", "/api/auth/clients", browser=True)
        (listed,) = body["clients"]
        self.assertEqual(self.call("GET", "/api/auth/clients", token=token)[0], 403)
        status, _ = self.call("DELETE", f"/api/auth/clients/{listed['id']}", browser=True)
        self.assertEqual(status, 200)
        self.assertEqual(self.call("GET", "/api/instances", token=token)[0], 401)
        self.assertEqual(self.call("DELETE", f"/api/auth/clients/{listed['id']}",
                                   browser=True)[0], 404)

    def test_a_client_signs_itself_out_and_the_audit_names_it(self):
        body = self.sign_in()[1]
        status, _ = self.call("POST", "/api/auth/client/logout", {}, token=body["token"])
        self.assertEqual(status, 200)
        self.assertEqual(self.call("GET", "/api/auth/status", token=body["token"])[0], 401)
        actors = {(record["path"], record["actor"]) for record in self.audit()}
        self.assertIn(("/api/auth/client/logout", f"client:{body['client']['id']}"), actors)
        self.assertIn(("/api/auth/client/login", "anonymous"), actors)

    def test_changing_the_password_signs_every_client_out(self):
        token = self.sign_in()[1]["token"]
        status, _ = self.call("POST", "/api/auth/password",
                              {"current_password": PASSWORD,
                               "new_password": "another long password"}, browser=True)
        self.assertEqual(status, 200)
        self.assertEqual(self.call("GET", "/api/instances", token=token)[0], 401)
        self.assertEqual(clients.list_clients(), [])
        self.assertIn(("/api/auth/password", "admin"),
                      {(record["path"], record["actor"]) for record in self.audit()})


if __name__ == "__main__":
    unittest.main()
