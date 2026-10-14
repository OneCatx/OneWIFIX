"""The settings routes export, check, and restore card policies."""

import asyncio
import json
import os
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import urlsplit

from control.app import auth, main, store


PASSWORD = "correct horse battery"
HOST = "gateway.example.net"


class CardBackupHttpTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        path = lambda name: os.path.join(self.temp.name, name)  # noqa: E731
        main.cfg._loaded = None
        for item in (
            patch.object(auth, "AUTH_PATH", path("auth.json")),
            patch.object(auth, "SESSIONS_PATH", path("sessions.json")),
            patch.object(store, "DATA_DIR", self.temp.name),
            patch.object(store, "DB_PATH", path("history.sqlite")),
            patch.object(store, "PREVIOUS_DB_PATH", path("previous.sqlite")),
            patch.object(main.cfg, "DATA_DIR", self.temp.name),
            patch.object(main.cfg, "CONFIG_PATH", path("config.yaml")),
        ):
            item.start()
            self.addCleanup(item.stop)
        self.addCleanup(lambda: setattr(main.cfg, "_loaded", None))
        store.init()
        auth._sessions.clear()
        auth._failures.clear()
        auth.setup(PASSWORD)
        self.cookie, self.csrf = auth.login("admin", PASSWORD, "192.0.2.1")
        main.cfg.upsert_instance({
            "id": "line-1", "name": "A", "iccid": "894430000000002624",
            "apn": "old", "pin": "9999", "enabled": False,
        })

    def call(self, method, path, body=None, *, raw=None):
        target = urlsplit(path)
        headers = [(b"host", HOST.encode()), (b"content-type", b"application/json"),
                   (b"cookie", f"{auth.SESSION_COOKIE}={self.cookie}".encode()),
                   (b"x-onewifi-csrf-token", self.csrf.encode())]
        scope = {"type": "http", "method": method, "path": target.path,
                 "raw_path": target.path.encode(), "query_string": target.query.encode(),
                 "headers": headers, "client": ("192.0.2.1", 1234),
                 "server": (HOST, 443), "scheme": "https", "http_version": "1.1",
                 "root_path": ""}
        payload = raw if raw is not None else (json.dumps(body).encode() if body is not None else b"")
        messages = [{"type": "http.request", "body": payload, "more_body": False}]
        sent = []

        async def receive():
            return messages.pop(0) if messages else {"type": "http.disconnect"}

        async def send(message):
            sent.append(message)

        asyncio.run(main.app(scope, receive, send))
        status = next(item["status"] for item in sent if item["type"] == "http.response.start")
        raw_body = b"".join(item.get("body", b"") for item in sent if item["type"] == "http.response.body")
        parsed = json.loads(raw_body or b"null")
        return status, parsed

    def test_export_validate_and_restore_round_trip(self):
        status, exported = self.call("GET", "/api/settings/card-backup")
        self.assertEqual(status, 200, exported)
        self.assertEqual(exported["cards"][0]["apn"], "old")
        self.assertNotIn("pin", json.dumps(exported))
        status, preview = self.call("POST", "/api/settings/card-backup/validate", exported)
        self.assertEqual(status, 200, preview)
        self.assertEqual(preview["data"]["cards"][0]["iccid_tail"], "2624")
        self.assertNotIn("894430000000002624", json.dumps(preview))
        exported["cards"][0]["apn"] = "ims"
        exported["cards"][0]["vowifi_enabled"] = True
        exported["cards"][0]["custom_phone_number"] = "+85290000000"
        status, restored = self.call("POST", "/api/settings/card-backup/restore", exported)
        self.assertEqual(status, 200, restored)
        self.assertEqual(restored["data"]["restored"], 1)
        line = main.cfg.get_instance("line-1")
        self.assertEqual(line["apn"], "ims")
        self.assertEqual(line["pin"], "9999")
        self.assertTrue(line["enabled"])

    def test_restore_refuses_a_different_device_imei(self):
        status, exported = self.call("GET", "/api/settings/card-backup?device_imei=356938035643809")
        self.assertEqual(status, 200, exported)
        status, body = self.call(
            "POST", "/api/settings/card-backup/restore?device_imei=000000000000000", exported)
        self.assertEqual(status, 400, body)
        self.assertEqual(main.cfg.get_instance("line-1")["apn"], "old")


if __name__ == "__main__":
    unittest.main()
