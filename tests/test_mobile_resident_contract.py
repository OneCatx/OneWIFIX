"""Resident clients use authenticated MDD events, native history and pickup receipts.

These tests drive the real ASGI app and SQLite history without a live engine, reader or SIM.
They establish the software wire contract only, not SIP pickup or installed-mobile evidence.
"""
import asyncio
import json
import unittest
from unittest.mock import AsyncMock, patch

from control.app import auth, clients, gate, main, mobile_pairing, store

HOST = "gateway.example.net"
PASSWORD = "correct horse battery"


class ResidentContractTests(unittest.TestCase):
    def setUp(self):
        import os
        import tempfile
        self.temp = tempfile.TemporaryDirectory()
        path = lambda name: os.path.join(self.temp.name, name)
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

    def call(self, method, path, body=None, *, token=None):
        from urllib.parse import urlsplit
        target = urlsplit(path)
        headers = [(b"host", HOST.encode()), (b"content-type", b"application/json")]
        if token:
            headers.append((b"authorization", f"Bearer {token}".encode()))
        scope = {"type": "http", "method": method, "path": target.path,
                 "raw_path": target.path.encode(), "query_string": target.query.encode(),
                 "headers": headers, "client": ("192.0.2.1", 1234),
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

    def sign_in(self):
        return self.call("POST", "/api/auth/client/login",
                         {"username": "admin", "password": PASSWORD, "name": "Phone",
                          "platform": "android", "app_version": "1.0"})

    async def open_socket(self, token):
        inbox, outgoing = asyncio.Queue(), asyncio.Queue()
        inbox.put_nowait({"type": "websocket.connect"})
        scope = {"type": "websocket", "path": "/ws", "raw_path": b"/ws",
                 "query_string": b"", "headers": [(b"host", HOST.encode()),
                 (b"authorization", f"Bearer {token}".encode())],
                 "client": ("192.0.2.1", 1234), "server": (HOST, 443),
                 "scheme": "wss", "subprotocols": [], "root_path": ""}
        task = asyncio.create_task(main.app(scope, inbox.get, outgoing.put))
        accepted = await asyncio.wait_for(outgoing.get(), 2)
        self.assertEqual(accepted["type"], "websocket.accept")
        return task, inbox, outgoing

    async def next_call(self, outgoing):
        message = await asyncio.wait_for(outgoing.get(), 2)
        self.assertEqual(message["type"], "websocket.send")
        event = json.loads(message["text"])
        self.assertEqual(event["type"], "call")
        return event

    def test_bearer_ws_history_and_receipt_preserve_same_line_engine_identity(self):
        token = self.sign_in()[1]["token"]
        instance = {"id": "sim1", "enabled": True}
        call_id = "1712345678.801"

        async def scenario():
            task, inbox, outgoing = await self.open_socket(token)
            try:
                await main.api_engine_event({"instance": "sim1", "event": "call_in",
                                             "args": ["+15550001", call_id]})
                first = await self.next_call(outgoing)
                self.assertEqual(first["instance"], "sim1")
                self.assertEqual(first["call"]["call_id"], call_id)
                self.assertEqual(first["call"]["status"], "ringing")
                await main.api_engine_event({"instance": "sim1", "event": "call_in",
                                             "args": ["+15550001", call_id]})
                replay = await self.next_call(outgoing)
                self.assertEqual(replay["call"]["id"], first["call"]["id"])
                # The native integer history ID and engine ID are distinct identifiers.
                self.assertIsInstance(first["call"]["id"], int)
                self.assertNotEqual(str(first["call"]["id"]), call_id)
                await main.hub.broadcast({"type": "hardware", "instance": "sim1",
                                          "secret": "not a client event"})
                self.assertTrue(outgoing.empty())
                return first["call"]["id"]
            finally:
                inbox.put_nowait({"type": "websocket.disconnect", "code": 1000})
                await asyncio.wait_for(task, 2)

        with patch.object(main.cfg, "get_instance", return_value=instance), \
                patch.object(main, "_dispatch_push"), \
                patch.object(main.mobile_notify, "incoming_call"):
            history_id = asyncio.run(scenario())
            status, history = self.call("GET", "/api/instances/sim1/calls", token=token)
            self.assertEqual(status, 200)
            self.assertNotIn("data", history)
            self.assertEqual(len(history["calls"]), 1)
            self.assertEqual((history["calls"][0]["id"], history["calls"][0]["call_id"]),
                             (history_id, call_id))
            status, receipt = self.call("GET", f"/api/mobile/v1/calls/{call_id}/pickup?device_id=sim1",
                                        token=token)
            self.assertEqual(status, 200)
            self.assertEqual(receipt["data"]["device_id"], "sim1")
            self.assertEqual(receipt["data"]["call_id"], call_id)
            self.assertEqual(receipt["data"]["pickup_uri"], f"mddpickup-{call_id}")

    def test_terminal_event_history_and_receipt_cannot_resurrect_a_ringing_call(self):
        token = self.sign_in()[1]["token"]
        call_id = "1712345678.802"

        async def scenario():
            task, inbox, outgoing = await self.open_socket(token)
            try:
                await main.api_engine_event({"instance": "sim1", "event": "call_result",
                    "args": ["in", "", "BUSY", "21", "", call_id]})
                terminal = await self.next_call(outgoing)
                self.assertEqual(terminal["call"]["status"], "rejected")
                self.assertIsNotNone(terminal["call"]["end_ts"])
                await main.api_engine_event({"instance": "sim1", "event": "call_in",
                                             "args": ["+15550002", call_id]})
                late = await self.next_call(outgoing)
                self.assertEqual(late["call"]["id"], terminal["call"]["id"])
                self.assertEqual(late["call"]["status"], "rejected")
            finally:
                inbox.put_nowait({"type": "websocket.disconnect", "code": 1000})
                await asyncio.wait_for(task, 2)

        with patch.object(main.cfg, "get_instance", return_value={"id": "sim1"}), \
                patch.object(main, "_dispatch_push"), \
                patch.object(main.mobile_notify, "incoming_call"):
            asyncio.run(scenario())
            status, history = self.call("GET", "/api/instances/sim1/calls", token=token)
            self.assertEqual(status, 200)
            self.assertEqual(history["calls"][0]["status"], "rejected")
            self.assertEqual(history["calls"][0]["peer"], "+15550002")
            status, receipt = self.call("GET", f"/api/mobile/v1/calls/{call_id}/pickup?device_id=sim1",
                                        token=token)
            self.assertEqual(status, 409)
            self.assertIn("error", receipt)

    def test_receipt_is_line_scoped_and_not_available_to_pairing_credentials(self):
        token = self.sign_in()[1]["token"]
        call_id = "1712345678.803"
        store.add_call("sim1", "in", "+15550003", call_id=call_id)
        with patch.object(main.cfg, "get_instance", return_value={"id": "sim2"}):
            status, _ = self.call("GET", f"/api/mobile/v1/calls/{call_id}/pickup?device_id=sim2",
                                  token=token)
            self.assertEqual(status, 409)
        from control.app import mobile_pairing
        paired = mobile_pairing.issue()
        # The pairing credential is deliberately scoped to the OneTools SMS/Push routes;
        # communication routes reject it before the handler with an unauthenticated response.
        self.assertEqual(self.call("GET", f"/api/mobile/v1/calls/{call_id}/pickup?device_id=sim1",
                                   token=paired)[0], 401)

    def test_revoked_bearer_closes_the_real_resident_socket(self):
        signed_in = self.sign_in()[1]
        token, client_id = signed_in["token"], signed_in["client"]["id"]

        async def scenario():
            task, _, outgoing = await self.open_socket(token)
            self.assertEqual(gate.revoke(f"client:{client_id}"), 1)
            closed = await asyncio.wait_for(outgoing.get(), 2)
            self.assertEqual(closed, {"type": "websocket.close", "code": gate.WS_UNAUTHENTICATED})
            await asyncio.wait_for(task, 2)
            self.assertFalse(main.hub.clients)

        asyncio.run(scenario())

    def test_legacy_call_sse_and_pcm_routes_are_refused_by_the_real_client_gate(self):
        token = self.sign_in()[1]["token"]
        for path in ("/api/calls/events", "/api/devices/sim1/calls/media?id=old",
                     "/api/devices/sim1/calls/answer", "/api/devices/sim1/calls/dial"):
            with self.subTest(path=path):
                method = "POST" if path.endswith(("answer", "dial")) else "GET"
                self.assertEqual(self.call(method, path, {"id": "old"}, token=token)[0], 403)


if __name__ == "__main__":
    unittest.main()
