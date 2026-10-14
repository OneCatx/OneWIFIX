import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from control.app import sms_inbox, store


class SmsInboxTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.patch = patch.multiple(
            store, DATA_DIR=str(root), DB_PATH=str(root / "onewifi.sqlite"),
            PREVIOUS_DB_PATH=str(root / "vowifi.sqlite"))
        self.patch.start()
        store.init()
        self.line = {"id": "line-1", "name": "Work", "iccid": "894430000000002624",
                     "imsi": "454030", "msisdn": "+85290000000"}

    def tearDown(self):
        self.patch.stop()
        self.temp.cleanup()

    def test_opening_a_thread_marks_it_read_and_a_delete_removes_one_message(self):
        first = store.add_message("line-1", "in", "+1555", "验证码 123456", ts=100)
        second = store.add_message("line-1", "in", "+1555", "later", ts=200)
        store.add_message("line-1", "in", "+1666", "other", ts=300)
        contacts = {row["peer"]: row for row in sms_inbox.list_contacts(1, [self.line])}
        self.assertEqual(contacts["+1555"]["unread_count"], 2)
        rows = sms_inbox.open_thread(1, self.line, "+1555")
        self.assertEqual([row["id"] for row in rows], [first["id"], second["id"]])
        contacts = {row["peer"]: row for row in sms_inbox.list_contacts(1, [self.line])}
        self.assertEqual(contacts["+1555"]["unread_count"], 0)
        self.assertEqual(sms_inbox.delete_message(first["id"]), 1)
        self.assertEqual(len(sms_inbox.open_thread(1, self.line, "+1555")), 1)

    def test_export_is_message_text_only_and_can_be_limited_to_one_line(self):
        store.add_message("line-1", "in", "+1555", "hello", ts=100)
        store.add_message("line-2", "out", "+1666", "away", ts=200)
        rows = sms_inbox.export_messages(
            [self.line, {"id": "line-2", "name": "Other"}], device_id="line-1")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["content"], "hello")
        self.assertNotIn("pin", rows[0])

    def test_a_changed_iccid_refuses_the_thread(self):
        with self.assertRaises(sms_inbox.SmsInboxError) as caught:
            sms_inbox.open_thread(1, self.line, "+1555", iccid="000")
        self.assertEqual(caught.exception.status, 409)


if __name__ == "__main__":
    unittest.main()
