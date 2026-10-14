"""Handset PCM framing, without a running engine or a phone."""
import unittest
import uuid

from pathlib import Path

from control.app import handset_audio
from engine.render import audiosocket_target

ROOT = Path(__file__).resolve().parents[1]


class AudioSocketFrameTests(unittest.TestCase):
    def test_frames_split_across_reads(self):
        ident = uuid.uuid4()
        packet = handset_audio.encode_packet(handset_audio.KIND_UUID, ident.bytes)
        packet += handset_audio.encode_packet(handset_audio.KIND_AUDIO, b"\x00\x01" * 160)
        parser = handset_audio.Parser()
        self.assertEqual(parser.feed(packet[:5]), [])
        frames = parser.feed(packet[5:])
        self.assertEqual(frames[0], (handset_audio.KIND_UUID, ident.bytes))
        self.assertEqual(handset_audio.audio_uuid(frames[0][1]), str(ident))
        self.assertEqual(frames[1][0], handset_audio.KIND_AUDIO)
        self.assertEqual(len(frames[1][1]), 320)

    def test_unknown_uuid_is_not_a_leg(self):
        self.assertIsNone(handset_audio.bridge.claim(str(uuid.uuid4())))

    def test_target_follows_the_control_host(self):
        self.assertEqual(audiosocket_target("https://onewifi-control:8443"),
                         ("onewifi-control", 8792))

    def test_dialplan_keeps_audio_on_this_call(self):
        dialplan = (ROOT / "engine" / "templates" / "extensions.conf.j2").read_text(encoding="utf-8")
        self.assertIn("[handset-media]", dialplan)
        self.assertIn("AudioSocket(${EXTEN},", dialplan)


if __name__ == "__main__":
    unittest.main()
