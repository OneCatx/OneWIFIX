"""One handset dial stays one call, and hangup or DTMF names only that call.

The control process imports a Unix-only module, so these tests stay on the store,
the channel list, and the audio bridge.
"""
import asyncio
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

from control.app import ami, gate, handset_audio, phone_calls, store

ROOT = Path(__file__).resolve().parents[1]


def _concise(name, context, exten, data, bridge, uniqueid):
    parts = [name, context, exten, "1", "Up", "Dial", data, "", "", "0", "1", bridge, uniqueid]
    return "!".join(parts)


class CallIdentityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.patch = patch.multiple(
            store, DATA_DIR=str(root), DB_PATH=str(root / "onewifi.sqlite"),
            PREVIOUS_DB_PATH=str(root / "vowifi.sqlite"))
        self.patch.start()
        store.init()

    def tearDown(self):
        self.patch.stop()
        self.temp.cleanup()

    def test_engine_callback_joins_the_handset_row_and_a_late_one_does_not_reopen_it(self):
        phone = str(uuid.uuid4())
        opened = store.add_call("line-1", "out", "+15551212", status="dialing", call_id=phone)
        joined = store.associate_engine_call("line-1", "out", "+15551212", "175000.1", phone)
        self.assertEqual(joined["id"], opened["id"])
        self.assertEqual(joined["engine_id"], "175000.1")
        self.assertEqual(len(store.list_calls("line-1")), 1)

        ended = store.close_engine_call(
            "line-1", "out", "+15551212", "busy", uniqueid="175000.1", business_id=phone)
        self.assertEqual(ended["id"], opened["id"])
        self.assertEqual(ended["status"], "busy")
        self.assertIsNotNone(ended["end_ts"])

        late = store.associate_engine_call("line-1", "out", "+15551212", "175000.1", phone)
        self.assertEqual(late["id"], opened["id"])
        self.assertEqual(late["status"], "busy")
        self.assertIsNotNone(late["end_ts"])
        self.assertEqual(len(store.list_calls("line-1")), 1)

    def test_result_before_start_keeps_the_handset_id_and_fills_the_peer(self):
        phone = str(uuid.uuid4())
        ended = store.close_engine_call(
            "line-1", "out", "", "busy", uniqueid="175000.2", business_id=phone)
        self.assertEqual(ended["call_id"], phone)
        self.assertEqual(ended["engine_id"], "175000.2")
        late = store.associate_engine_call("line-1", "out", "+15551212", "175000.2", phone)
        self.assertEqual(late["id"], ended["id"])
        self.assertEqual(late["peer"], "+15551212")
        self.assertEqual(late["status"], "busy")
        self.assertEqual(len(store.list_calls("line-1")), 1)

    def test_two_live_handset_calls_are_not_closed_by_a_bare_uniqueid(self):
        first = str(uuid.uuid4())
        second = str(uuid.uuid4())
        store.add_call("line-1", "out", "+15551212", status="dialing", call_id=first)
        store.add_call("line-1", "out", "+15551212", status="dialing", call_id=second)
        self.assertIsNone(store.close_engine_call(
            "line-1", "out", "+15551212", "busy", uniqueid="175000.9"))
        self.assertEqual([row["end_ts"] for row in store.list_calls("line-1")], [None, None])

        ended = store.close_engine_call(
            "line-1", "out", "+15551212", "busy", uniqueid="175000.3", business_id=first)
        rows = {row["call_id"]: row for row in store.list_calls("line-1")}
        self.assertEqual(rows[first]["status"], "busy")
        self.assertIsNotNone(rows[first]["end_ts"])
        self.assertEqual(rows[first]["engine_id"], "175000.3")
        self.assertIsNone(rows[second]["end_ts"])
        self.assertEqual(ended["id"], rows[first]["id"])

    def test_softphone_uniqueid_stays_one_row_and_does_not_take_another_peers_handset(self):
        handset = str(uuid.uuid4())
        store.add_call("line-1", "out", "+15550001", status="dialing", call_id=handset)
        soft = store.associate_engine_call("line-1", "out", "+15550002", "1712345678.001", "")
        again = store.associate_engine_call("line-1", "out", "+15550002", "1712345678.001", "")
        self.assertEqual(again["id"], soft["id"])
        self.assertNotEqual(soft["call_id"], handset)
        ended = store.close_engine_call(
            "line-1", "out", "+15550002", "busy", uniqueid="1712345678.001")
        self.assertEqual(ended["id"], soft["id"])
        self.assertEqual(ended["status"], "busy")
        still = store.associate_engine_call("line-1", "out", "+15550002", "1712345678.001", "")
        self.assertEqual(still["status"], "busy")
        rows = {row["call_id"]: row for row in store.list_calls("line-1")}
        self.assertIsNone(rows[handset]["end_ts"])
        self.assertEqual(len(rows), 2)

    def test_uniqueid_only_result_then_start_does_not_reopen_a_softphone_call(self):
        cid = "1712345678.201"
        ended = store.close_engine_call(
            "line-1", "out", "+15550001", "busy", uniqueid=cid)
        late = store.associate_engine_call("line-1", "out", "+15550001", cid, "")
        rows = store.list_calls("line-1")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["id"], ended["id"])
        self.assertEqual(late["status"], "busy")
        self.assertEqual(late["peer"], "+15550001")
        self.assertIsNotNone(late["end_ts"])

    def test_same_peer_softphone_calls_still_finalize_by_their_own_uniqueid(self):
        first = store.add_call_correlated("line-1", "out", "+15550000", call_id="1712345678.001")
        second = store.add_call_correlated("line-1", "out", "+15550000", call_id="1712345678.002")
        self.assertEqual(store.update_last_call(
            "line-1", "out", "+15550000", "failed", call_id="1712345678.001")["id"], first["id"])
        self.assertEqual(store.get_open_call_by_id("line-1", "1712345678.002")["id"], second["id"])


class CallChannelTests(unittest.TestCase):
    def test_hangup_and_dtmf_name_only_the_matching_ims_leg(self):
        first = str(uuid.uuid4())
        second = str(uuid.uuid4())
        text = "\n".join((
            _concise(f"Local/{first}@handset-media-0000001a;1", "from-local", "+15551111",
                     "PJSIP/+15551111@volte_ims", "bridge-a", "175000.11"),
            _concise("PJSIP/volte_ims-000000a", "from-local", "+15551111", "",
                     "bridge-a", "175000.12"),
            _concise(f"Local/{second}@handset-media-0000001b;1", "from-local", "+15552222",
                     "PJSIP/+15552222@volte_ims", "bridge-b", "175000.21"),
            _concise("PJSIP/volte_ims-000000b", "from-local", "+15552222", "",
                     "bridge-b", "175000.22"),
        ))
        chosen = ami.select_call_channels(ami.parse_concise_channels(text), "175000.12", first)
        self.assertEqual(chosen["carrier"], "PJSIP/volte_ims-000000a")
        self.assertEqual(ami.target_channel(chosen, "dtmf"), "PJSIP/volte_ims-000000a")
        self.assertEqual(ami.target_channel(chosen, "hangup"), "PJSIP/volte_ims-000000a")
        other = ami.select_call_channels(ami.parse_concise_channels(text), "", second)
        self.assertEqual(other["carrier"], "PJSIP/volte_ims-000000b")
        missing = ami.select_call_channels(ami.parse_concise_channels(text), "175000.99", "")
        self.assertEqual(ami.target_channel(missing, "dtmf"), "")
        self.assertEqual(ami.target_channel(missing, "hangup"), "")

    def test_dialplan_appends_the_handset_id_after_the_uniqueid(self):
        dialplan = (ROOT / "engine" / "templates" / "extensions.conf.j2").read_text(encoding="utf-8")
        self.assertIn(
            'notify.py call_out "${EXTEN}" "${CHANNEL(uniqueid)}" "${ONEWIFI_CALL_ID}"',
            dialplan)
        self.assertIn(
            '"${GOSUB_RETVAL}" "${CHANNEL(uniqueid)}" "${ONEWIFI_CALL_ID}"',
            dialplan)
        self.assertNotIn(
            '"${GOSUB_RETVAL}" "${ONEWIFI_CALL_ID}" "${CHANNEL(uniqueid)}"',
            dialplan)


class CallReleaseTests(unittest.TestCase):
    def test_drop_by_audio_id_closes_the_phone_and_both_indexes(self):
        bridge = handset_audio.Bridge()
        phone_id, audio_id = bridge.prepare("line-1")

        class Phone:
            def __init__(self):
                self.closed = False

            def close(self, code=1000):
                self.closed = True

        phone = Phone()
        bridge.leg(phone_id).phone = phone
        bridge.drop(audio_id)
        self.assertTrue(phone.closed)
        self.assertIsNone(bridge.leg(phone_id))
        self.assertIsNone(bridge.claim(audio_id))
        bridge.drop(audio_id)

    def test_release_record_is_idempotent(self):
        bridge = handset_audio.Bridge()
        phone_id, _audio = bridge.prepare("line-1")
        bridge.release_record({"call_id": phone_id, "engine_id": "175000.1"})
        bridge.release_record({"call_id": phone_id, "engine_id": "175000.1"})
        self.assertIsNone(bridge.leg(phone_id))

    def test_revoke_wakes_a_registered_call_stream(self):
        async def scenario():
            entry = gate._live.add("client:call-stream-identity")
            try:
                gate.revoke("client:call-stream-identity")
                await asyncio.sleep(0)
                self.assertTrue(entry[1].is_set())
                self.assertTrue(await phone_calls.until_revoked(entry[1], 30))
            finally:
                gate._live.discard("client:call-stream-identity", entry)

        asyncio.run(scenario())

    def test_dial_result_names_its_own_record(self):
        own = {"id": 4, "call_id": "own"}
        self.assertEqual(phone_calls.dialed_record({"record": own})["id"], 4)
        self.assertIsNone(phone_calls.dialed_record({"ok": True}))

    def test_find_accepts_the_engine_id(self):
        rows = [{"id": 7, "call_id": "phone-uuid", "engine_id": "175000.4"}]
        self.assertEqual(phone_calls.find(rows, "175000.4")["id"], 7)
        self.assertEqual(phone_calls.find(rows, "phone-uuid")["id"], 7)


if __name__ == "__main__":
    unittest.main()
