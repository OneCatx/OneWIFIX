"""An inbound SMS goes to the manager only, not also to the browser softphone.

The softphone has no SIP MESSAGE handler and answered every forwarded text with 405 Method Not
Allowed; the WebUI shows texts from the manager's store, so the forward did nothing but fail.
"""
import unittest
from pathlib import Path

from jinja2 import Environment, FileSystemLoader

ROOT = Path(__file__).resolve().parent.parent
CTX = dict(webrtc_enable=True, webrtc_user="webrtc", ring_timeout=35, msisdn="+15550100",
           realm="ims.mnc240.mcc310.3gppnetwork.org", vm_ring_seconds=25, vm_max_seconds=120)


def section(text: str, name: str) -> str:
    start = text.index(f"[{name}]")
    end = text.find("\n[", start + 1)
    return text[start:end if end != -1 else None]


class InboundSmsTests(unittest.TestCase):
    def setUp(self):
        env = Environment(loader=FileSystemLoader(str(ROOT / "engine" / "templates")),
                          trim_blocks=True, lstrip_blocks=True, keep_trailing_newline=True)
        self.dialplan = env.get_template("extensions.conf.j2").render(**CTX)

    def test_the_manager_gets_it_and_the_softphone_does_not(self):
        inbound = section(self.dialplan, "volte_ims_msg")
        self.assertIn("notify.py sms_in", inbound)
        self.assertNotIn("MessageSend(", inbound)

    def test_outgoing_sms_still_leaves_through_the_carrier(self):
        self.assertIn("MessageSend(pjsip:volte_ims/${EXTEN}@volte_ims",
                      section(self.dialplan, "msg-from-local"))

    def test_incoming_call_forks_to_all_current_contacts(self):
        inbound = section(self.dialplan, "volte_ims")
        self.assertIn("Set(BROWSER_CONTACTS=${PJSIP_DIAL_CONTACTS(webrtc)})", inbound)
        self.assertIn("Dial(${BROWSER_CONTACTS},${BROWSER_PICKUP_REMAINING},b(mdd-inbound-headers^s^1)U(mdd-inbound-answer))", inbound)
        self.assertNotIn("Dial(PJSIP/webrtc,", inbound)

    def test_engine_call_id_is_sent_to_manager_and_each_sip_branch(self):
        inbound = section(self.dialplan, "volte_ims")
        self.assertIn("Set(_MDD_CALL_ID=${CHANNEL(uniqueid)})", inbound)
        self.assertIn('notify.py call_in "${CALLERID(num)}" "${MDD_CALL_ID}"', inbound)
        self.assertIn('b(mdd-inbound-headers^s^1)', inbound)
        self.assertIn('PJSIP_HEADER(add,X-MDD-Call-ID)=${MDD_CALL_ID}',
                      section(self.dialplan, "mdd-inbound-headers"))

    def test_late_answer_pickup_is_line_local_and_marked_only_on_called_leg(self):
        pickup = section(self.dialplan, "from-local")
        self.assertIn("exten => _mddpickup-.,1", pickup)
        self.assertIn("Pickup(${PICKUP_CALL_ID}@PICKUPMARK)", pickup)
        self.assertIn("U(mdd-inbound-answer)", self.dialplan)
        self.assertIn('notify.py call_answer "${MDD_CALL_ID}"', self.dialplan)
        self.assertIn("Set(MDD_OUTBOUND_CALL=1)", pickup)
        self.assertIn('ExecIf($["${MDD_OUTBOUND_CALL}"="1"]?TrySystem(', pickup)
        self.assertIn("Set(PICKUPMARK=${MDD_CALL_ID})",
                      section(self.dialplan, "mdd-inbound-headers"))
        self.assertIn("app_directed_pickup.so", (ROOT / "engine" / "asterisk-keep-modules.txt").read_text(encoding="utf-8"))

    def test_outbound_callbacks_carry_same_caller_channel_uniqueid(self):
        outgoing = section(self.dialplan, "from-local")
        self.assertIn('notify.py call_out "${EXTEN}" "${CHANNEL(uniqueid)}"', outgoing)
        self.assertIn('notify.py call_result out "${CALLPEER}" "${ST}" "${CS}" '
                      '"${GOSUB_RETVAL}" "${CHANNEL(uniqueid)}"', outgoing)


if __name__ == "__main__":
    unittest.main()
