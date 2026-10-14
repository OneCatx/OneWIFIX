"""Offline guard tests for the pinned Asterisk carrier REGISTER patch."""

import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = (Path(__file__).resolve().parents[1] / "engine" / "patches" / "asterisk"
          / "zz_carrier_register_profiles.py")
spec = importlib.util.spec_from_file_location("onewifi_asterisk_carrier_patch", SCRIPT)
carrier_patch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(carrier_patch)


REGISTER = (
    "\t/*! \\brief VoLTE support */\n\tunsigned int volte;\n"
    "\t/*! \\brief Enable IPSec encryption support for VoLTE */\n"
    "\t/*! \\brief VoLTE support */\n\tunsigned int volte;\n"
    "\t/*! \\brief Current state of registration process */\n"
    "/*! \\brief Helper function which sends a message and cleans up, if needed, on failure */\n"
    "static pj_status_t registration_client_send(\n"
    "\tstatus = pjsip_regc_send(client_state->client, tdata);\n"
    "\t\tcontact_header_params = volte_add_contact_params(registration->imei, registration->accesstype, registration->receive_sms);\n"
    "\tstate->client_state->support_outbound = registration->support_outbound;\n"
    '\tast_sorcery_object_field_register(ast_sip_get_sorcery(), "registration", "volte", "no", OPT_BOOL_T, 1, FLDSET(struct sip_outbound_registration, volte));\n'
)
VOLTE = (
    "const char *volte_add_contact_params(const char *imei, const char *accesstype, pj_bool_t sms_enabled)\n"
    '\tsprintf(contact, "+g.3gpp.icsi-ref=\\"urn%%3Aurn-7%%3A3gpp-service.ims.icsi.mmtel\\";audio");\n'
    '\tif (accesstype[0])\n\t\tsprintf(strchr(contact, \'\\0\'), ";+g.3gpp.accesstype=\\"%s\\"", accesstype);\n'
    '\tif (sms_enabled)\n\t\tsprintf(strchr(contact, \'\\0\'), ";+g.3gpp.smsip");\n\n\treturn contact;\n'
)
HEADER = "const char *volte_add_contact_params(const char *imei, const char *accesstype, pj_bool_t sms_enabled);\n"


class CarrierPatchTests(unittest.TestCase):
    def _source_tree(self, root):
        register = root / "res" / "res_pjsip_outbound_registration.c"
        volte = root / "res" / "res_pjsip_outbound_registration" / "volte.c"
        header = root / "res" / "res_pjsip_outbound_registration" / "volte.h"
        for path, content in ((register, REGISTER), (volte, VOLTE), (header, HEADER)):
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)
        return register, volte, header

    def test_o2_headers_and_ultra_contact_are_in_actual_c_send_paths(self):
        with tempfile.TemporaryDirectory() as temp:
            paths = self._source_tree(Path(temp))
            with patch.multiple(carrier_patch, REGISTER=paths[0], VOLTE=paths[1],
                                HEADER=paths[2]):
                carrier_patch.main()
                initial = [path.read_text() for path in paths]
                carrier_patch.main()
                self.assertEqual(initial, [path.read_text() for path in paths])
        registration, volte, header = initial
        self.assertIn('"registration", "volte_o2_register", "no"', registration)
        self.assertIn('"registration", "volte_ultra_contact", "no"', registration)
        self.assertLess(registration.index("add_o2_register_headers(client_state, tdata)"),
                        registration.index("status = pjsip_regc_send"))
        self.assertLess(registration.index("add_att_register_headers(client_state, tdata)"),
                        registration.index("status = pjsip_regc_send"))
        self.assertIn("if (add_o2_register_headers(client_state, tdata)\n"
                      "\t\t\t|| add_att_register_headers(client_state, tdata)\n"
                      "\t\t\t|| add_three_register_headers(client_state, tdata)) {\n"
                      "\t\tpjsip_tx_data_dec_ref(tdata);\n"
                      "\t\tpjsip_tx_data_dec_ref(tdata);\n", registration)
        self.assertIn("Security-Client", registration)
        self.assertIn("eap_direct.auth", registration)
        self.assertIn('"path,sec-agree,gruu"', registration)
        self.assertIn('P-Visited-Network-ID', registration)
        self.assertIn('3102800000000', registration)
        self.assertIn('"path, gruu, outbound, sec-agree, 100rel, timer"', registration)
        self.assertIn('"P-Preferred-Identity", preferred', registration)
        self.assertIn('registration->receive_sms, registration->volte_ultra_contact', registration)
        self.assertIn('icsi.mmtel,urn%%3Aurn-7%%3A3gpp-service.ims.icsi.sms', volte)
        self.assertIn('else if (ultra_mobile)', volte)
        self.assertIn('smsip-msisdnless;+g.3gpp.smsip-msisdn-less', volte)
        self.assertIn('pj_bool_t sms_enabled, pj_bool_t ultra_mobile', header)

    def test_anchor_drift_fails_before_any_file_is_written(self):
        with tempfile.TemporaryDirectory() as temp:
            paths = self._source_tree(Path(temp))
            paths[2].write_text(HEADER.replace("sms_enabled", "changed"))
            before = [path.read_bytes() for path in paths]
            with patch.multiple(carrier_patch, REGISTER=paths[0], VOLTE=paths[1],
                                HEADER=paths[2]):
                with self.assertRaisesRegex(ValueError, "Contact declaration"):
                    carrier_patch.main()
            self.assertEqual(before, [path.read_bytes() for path in paths])

    def test_partial_previous_application_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            paths = self._source_tree(Path(temp))
            paths[0].write_text(REGISTER + carrier_patch.MARKER)
            before = [path.read_bytes() for path in paths]
            with patch.multiple(carrier_patch, REGISTER=paths[0], VOLTE=paths[1],
                                HEADER=paths[2]):
                with self.assertRaisesRegex(ValueError, "partial carrier REGISTER patch"):
                    carrier_patch.main()
            self.assertEqual(before, [path.read_bytes() for path in paths])

    def test_markers_without_consumers_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            paths = self._source_tree(Path(temp))
            for path in paths:
                path.write_text(path.read_text() + carrier_patch.MARKER)
            before = [path.read_bytes() for path in paths]
            with patch.multiple(carrier_patch, REGISTER=paths[0], VOLTE=paths[1],
                                HEADER=paths[2]):
                with self.assertRaisesRegex(ValueError, "without complete consumers"):
                    carrier_patch.main()
            self.assertEqual(before, [path.read_bytes() for path in paths])
