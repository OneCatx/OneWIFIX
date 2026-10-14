"""Inbound engine identity must survive event/store/push without peer-number matching."""
import os
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

from control.app import store, notify_push
from control.app import main


class CallCorrelationTests(unittest.TestCase):
    def test_push_payload_carries_same_engine_call_id_only_for_inbound_call(self):
        instance = {"id": "line-1", "name": "Work"}
        payload = notify_push.build_payload(notify_push.EV_INCOMING_CALL, instance,
                                            "+15550000", None, call_id="1712345678.001")
        self.assertEqual(payload["call_id"], "1712345678.001")
        self.assertEqual(payload["pickup_uri"], "mddpickup-1712345678.001")
        self.assertEqual(payload["instance"], "line-1")
        sms = notify_push.build_payload(notify_push.EV_INCOMING_SMS, instance,
                                        "+15550000", "hello", call_id="1712345678.001")
        self.assertNotIn("call_id", sms)

    def test_invalid_engine_id_never_advertises_a_non_callable_pickup(self):
        for bad in ("", "engine.001", "123.4;Hangup", "../123.4"):
            payload = notify_push.build_payload(notify_push.EV_INCOMING_CALL,
                                                {"id": "line-1"}, "", None, call_id=bad)
            self.assertNotIn("pickup_uri", payload)

    def test_anonymous_first_call_schedules_one_push_and_closed_call_cancels_it(self):
        with patch.object(main.store, "get_open_call_by_id", return_value={
                "id": 3, "peer": "", "call_id": "1712345678.001", "status": "ringing"}), \
                patch.object(main, "_dispatch_push") as generic, \
                patch.object(main.mobile_notify, "incoming_call") as apns, \
                patch.object(main.cfg, "get_instance", return_value={"id": "sim1"}), \
                patch.object(main.cfg, "get_settings", return_value={"apns_voip": {"enabled": True}}), \
                patch.object(main.asyncio, "sleep", new=AsyncMock()):
            import asyncio
            asyncio.run(main._push_anonymous_call("sim1", "1712345678.001", 3))
        generic.assert_called_once()
        apns.assert_called_once()

    def test_answered_call_cannot_advertise_pickup_or_delayed_anonymous_push(self):
        with patch.object(main.store, "get_open_call_by_id", return_value={
                "id": 3, "peer": "", "call_id": "1712345678.001", "status": "answered"}), \
                patch.object(main, "_dispatch_push") as generic, \
                patch.object(main.mobile_notify, "incoming_call") as apns, \
                patch.object(main.asyncio, "sleep", new=AsyncMock()):
            import asyncio
            asyncio.run(main._push_anonymous_call("sim1", "1712345678.001", 3))
        generic.assert_not_called()
        apns.assert_not_called()

    def test_distinct_inbound_ids_never_coalesce_even_with_same_peer(self):
        with tempfile.TemporaryDirectory() as temp:
            path = os.path.join(temp, "history.sqlite")
            with patch.multiple(store, DATA_DIR=temp, DB_PATH=path,
                                PREVIOUS_DB_PATH=os.path.join(temp, "none.sqlite")):
                store.init()
                first = store.add_call_deduped("line-1", "in", "+15550000",
                                               call_id="engine.001")
                again = store.add_call_deduped("line-1", "in", "+15550000",
                                               call_id="engine.001")
                second = store.add_call_deduped("line-1", "in", "+15550000",
                                                call_id="engine.002")
                self.assertEqual(first["id"], again["id"])
                self.assertNotEqual(first["id"], second["id"])
                closed = store.update_last_call("line-1", "in", "+15550000", "missed",
                                                call_id="engine.001")
                self.assertEqual(closed["call_id"], "engine.001")
                self.assertEqual(store.get_open_call_by_id("line-1", "engine.002")["id"],
                                 second["id"])

    def test_same_peer_outgoing_calls_finalize_by_engine_id_in_reverse_order(self):
        with tempfile.TemporaryDirectory() as temp:
            path = os.path.join(temp, "history.sqlite")
            with patch.multiple(store, DATA_DIR=temp, DB_PATH=path,
                                PREVIOUS_DB_PATH=os.path.join(temp, "none.sqlite")):
                store.init()
                first = store.add_call_correlated("line-1", "out", "+15550000",
                                                  call_id="1712345678.001")
                second = store.add_call_correlated("line-1", "out", "+15550000",
                                                   call_id="1712345678.002")
                self.assertEqual(store.add_call_correlated("line-1", "out", "+15550000",
                                                           call_id="1712345678.001")["id"], first["id"])
                self.assertEqual(store.update_last_call("line-1", "out", "+15550000", "failed",
                                                        call_id="1712345678.001")["id"], first["id"])
                self.assertEqual(store.get_open_call_by_id("line-1", "1712345678.002")["id"],
                                 second["id"])
                self.assertEqual(store.update_last_call("line-1", "out", "+15550000", "ended",
                                                        call_id="1712345678.002")["id"], second["id"])
                rows = {row["call_id"]: row for row in store.list_calls("line-1")}
                self.assertEqual(rows["1712345678.001"]["status"], "failed")
                self.assertEqual(rows["1712345678.002"]["status"], "ended")

    def test_ended_inbound_retransmission_does_not_reopen_a_call(self):
        with tempfile.TemporaryDirectory() as temp:
            path = os.path.join(temp, "history.sqlite")
            with patch.multiple(store, DATA_DIR=temp, DB_PATH=path,
                                PREVIOUS_DB_PATH=os.path.join(temp, "none.sqlite")):
                store.init()
                first = store.add_call_deduped("line-1", "in", "+15550000",
                                               call_id="1712345678.003")
                store.update_last_call("line-1", "in", "+15550000", "missed",
                                       call_id="1712345678.003")
                replay = store.add_call_deduped("line-1", "in", "+15550000",
                                                call_id="1712345678.003")
                self.assertEqual(replay["id"], first["id"])
                self.assertEqual(replay["status"], "missed")
                self.assertEqual(len(store.list_calls("line-1")), 1)

    def test_answer_callback_before_call_in_creates_answered_identity_without_push(self):
        with tempfile.TemporaryDirectory() as temp:
            path = os.path.join(temp, "history.sqlite")
            with patch.multiple(store, DATA_DIR=temp, DB_PATH=path,
                                PREVIOUS_DB_PATH=os.path.join(temp, "none.sqlite")), \
                    patch.object(main.hub, "broadcast", new=AsyncMock()), \
                    patch.object(main, "_dispatch_push") as generic:
                store.init()
                import asyncio
                cid = "1712345678.004"
                asyncio.run(main.api_engine_event({"instance": "line-1", "event": "call_answer",
                                                   "args": [cid]}))
                asyncio.run(main.api_engine_event({"instance": "line-1", "event": "call_in",
                                                   "args": ["+15550000", cid]}))
                rows = store.list_calls("line-1")
                self.assertEqual(len(rows), 1)
                self.assertEqual(rows[0]["status"], "answered")
                self.assertEqual(rows[0]["peer"], "+15550000")
                generic.assert_not_called()

    def test_terminal_result_before_start_persists_past_retry_for_both_directions(self):
        with tempfile.TemporaryDirectory() as temp:
            path = os.path.join(temp, "history.sqlite")
            with patch.multiple(store, DATA_DIR=temp, DB_PATH=path,
                                PREVIOUS_DB_PATH=os.path.join(temp, "none.sqlite")), \
                    patch.object(main.hub, "broadcast", new=AsyncMock()) as broadcast, \
                    patch.object(main.asyncio, "sleep", new=AsyncMock()), \
                    patch.object(main, "_push_missed_call", new=AsyncMock()), \
                    patch.object(main, "_dispatch_push") as push, \
                    patch.object(main.mobile_notify, "incoming_call") as voip:
                store.init()
                import asyncio
                for direction, cid, peer, disposition in (
                        ("out", "1712345678.201", "+15550001", "busy"),
                        ("in", "1712345678.202", "+15550002", "missed")):
                    result = {"instance": "line-1", "event": "call_result", "args": [
                        direction, peer, "BUSY" if direction == "out" else "NOANSWER",
                        "17" if direction == "out" else "19", "", cid]}
                    asyncio.run(main.api_engine_event(result))
                    asyncio.run(main.api_engine_event(result))
                    rows = [row for row in store.list_calls("line-1") if row["call_id"] == cid]
                    self.assertEqual(len(rows), 1)
                    self.assertEqual(rows[0]["status"], disposition)
                    self.assertIsNotNone(rows[0]["end_ts"])
                    if direction == "in":
                        asyncio.run(main.api_engine_event({"instance": "line-1",
                            "event": "call_answer", "args": [cid]}))
                    asyncio.run(main.api_engine_event({"instance": "line-1",
                        "event": "call_out" if direction == "out" else "call_in",
                        "args": [peer, cid]}))
                    rows = [row for row in store.list_calls("line-1") if row["call_id"] == cid]
                    self.assertEqual(len(rows), 1)
                    self.assertEqual(rows[0]["peer"], peer)
                    self.assertEqual(rows[0]["status"], disposition)
                    self.assertIsNotNone(rows[0]["end_ts"])
                self.assertFalse(any(event.args[0]["call"]["status"] == "ringing"
                                     for event in broadcast.call_args_list))
                push.assert_not_called()
                voip.assert_not_called()

    def test_terminal_result_without_peer_is_enriched_by_late_start_not_reopened(self):
        with tempfile.TemporaryDirectory() as temp:
            path = os.path.join(temp, "history.sqlite")
            with patch.multiple(store, DATA_DIR=temp, DB_PATH=path,
                                PREVIOUS_DB_PATH=os.path.join(temp, "none.sqlite")), \
                    patch.object(main.hub, "broadcast", new=AsyncMock()), \
                    patch.object(main, "_dispatch_push") as push:
                store.init()
                import asyncio
                cid = "1712345678.203"
                asyncio.run(main.api_engine_event({"instance": "line-1", "event": "call_result",
                    "args": ["out", "", "BUSY", "17", "", cid]}))
                asyncio.run(main.api_engine_event({"instance": "line-1", "event": "call_out",
                    "args": ["+15550003", cid]}))
                rows = [row for row in store.list_calls("line-1") if row["call_id"] == cid]
                self.assertEqual(len(rows), 1)
                self.assertEqual((rows[0]["status"], rows[0]["peer"]), ("busy", "+15550003"))
                self.assertIsNotNone(rows[0]["end_ts"])
                push.assert_not_called()


if __name__ == "__main__":
    unittest.main()
