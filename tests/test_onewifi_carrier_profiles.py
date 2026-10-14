"""OneWIFI profile matching and MDD engine-consumer contract tests."""
import ast
import ipaddress
import os
import socket
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from control.app import carrier_profiles, config, egress


ENGINE = Path(__file__).resolve().parents[1] / "engine"


def _line(**overrides):
    return {"id": "7", "index": 0, "imsi": "204047616000000", "mcc": "204", "mnc": "04",
            "iccid": "8963662600000000000", "reader": "imsi:204047616000000",
            "carrier_identity": {"spn": "DITO"}, "ami_secret": "test-ami",
            "sip": {"webrtc": {"password": "test-web"}}, **overrides}


class OneWifiCarrierResolverTests(unittest.TestCase):
    def test_mvno_beats_host_and_matching_is_constrained(self):
        identity = carrier_profiles.identity_from_instance(_line())
        self.assertEqual(carrier_profiles.resolve(identity)["id"], "dito-ph")
        not_dito = {**identity, "iccid": "893104999999", "spn": "OTHER"}
        self.assertEqual(carrier_profiles.resolve(not_dito)["id"], "vodafone-netherlands")
        ultra = {"mcc": "310", "mnc": "260", "gid1": "354dffffffff"}
        self.assertEqual(carrier_profiles.resolve(ultra)["id"], "ultra-mobile-us")
        self.assertEqual(carrier_profiles.resolve({**ultra, "gid1": "no"})["id"], "standard-3gpp")

    def test_mnc_width_and_home_plmn_semantics(self):
        self.assertEqual(carrier_profiles.resolve({"mcc": "454", "mnc": "03"})["id"], "three-hk")
        self.assertEqual(carrier_profiles.resolve({"mcc": "454", "mnc": "003"})["id"], "standard-3gpp")
        self.assertEqual(carrier_profiles.resolve({"mcc": "262", "mnc": "02"})["id"],
                         carrier_profiles.resolve({"mcc": "262", "mnc": "002"})["id"])

    def test_incomplete_profiles_report_gaps_without_auto_applying(self):
        three = carrier_profiles.resolve({"mcc": "454", "mnc": "03"})
        self.assertEqual(three["id"], "three-hk")
        self.assertEqual(three["operational_status"], "mapped")
        self.assertEqual(three["ims"]["initial_authorization"], "eap_direct")
        self.assertEqual(three["ims"]["security"], "disabled")
        att = carrier_profiles.resolve({"mcc": "310", "mnc": "280", "imsi": "310280123456789"})
        self.assertEqual(att["id"], "att-us")
        self.assertEqual(att["operational_status"], "mapped")
        self.assertEqual(att["ims"]["public_realm"], "one.att.net")
        self.assertEqual(att["ims"]["private_realm"], "private.att.net")
        self.assertEqual(carrier_profiles.resolve({"mcc": "262", "mnc": "03"})
                         ["operational_status"], "mapped")
        self.assertEqual(carrier_profiles.resolve({"mcc": "310", "mnc": "260",
                                                  "gid1": "354DFFFF"})
                         ["operational_status"], "mapped")

    def test_known_failures_stay_blocked(self):
        self.assertEqual(carrier_profiles.resolve({"mcc": "460", "mnc": "00"})["id"],
                         "china-mainland")
        self.assertEqual(carrier_profiles.resolve({"mcc": "460", "mnc": "01"})
                         ["operational_status"], "blocked")
        self.assertEqual(carrier_profiles.resolve({"mcc": "248", "mnc": "01"})["id"], "estonia")
        self.assertEqual(carrier_profiles.resolve({"mcc": "248", "mnc": "02"})
                         ["operational_status"], "blocked")
        csl = carrier_profiles.resolve({"mcc": "454", "mnc": "00"})
        self.assertEqual(csl["id"], "csl-hk")
        self.assertEqual(csl["operational_status"], "blocked")
        self.assertEqual(carrier_profiles.resolve({"mcc": "454", "mnc": "03"})["id"], "three-hk")

    def test_sponsor_rewrite_only_changes_presentation(self):
        line = _line()
        profile = carrier_profiles.resolve(carrier_profiles.identity_from_instance(line))
        self.assertEqual(carrier_profiles.presented_subscriber(line, profile),
                         ("515661015000000", "515", "66"))
        self.assertEqual(line["imsi"], "204047616000000")
        self.assertEqual(line["iccid"], "8963662600000000000")

    def test_pre_render_egress_uses_route_country_and_epdg(self):
        line = _line()
        self.assertEqual(egress.line_country(line), "ph")
        self.assertEqual(egress.epdg_for(line),
                         "epdg.epc.mnc066.mcc515.pub.3gppnetwork.org")
        desired = egress.desired_document([line], {"proxy": {}})["lines"][0]
        self.assertEqual(desired["country"], "ph")
        self.assertEqual(desired["epdg"], egress.epdg_for(line))
        self.assertEqual((line["mcc"], line["mnc"], line["imsi"]),
                         ("204", "04", "204047616000000"))
        self.assertEqual(egress.line_country({**line, "proxy_country": "nl"}), "nl")
        self.assertEqual(egress.epdg_for({**line, "epdg": "operator.example"}),
                         "operator.example")

    def test_dns_ecs_scoped_to_profiled_hostname(self):
        profile = carrier_profiles.resolve({"mcc": "262", "mnc": "02"})
        self.assertEqual(carrier_profiles.dns_client_subnet(
            profile, "EPDG.EPC.MNC002.MCC262.PUB.3GPPNETWORK.ORG."), "109.192.0.0/24")
        self.assertEqual(carrier_profiles.dns_client_subnet(profile, "other.example"), "")

    def test_more_specific_rule_does_not_inherit_prior_match_fields(self):
        broad = {"id": "broad", "match": {"home_plmns": ["23410"]},
                 "route": {"mcc": "999", "mnc": "99"},
                 "epdg": {"hostname": "broad.example"},
                 "identity": {"subscriber_imsi_rewrite": {
                     "from_prefix": "23410", "to_prefix": "99999"}}}
        specific = {"id": "specific", "match": {"home_plmns": ["23410"],
                                                   "spns": ["Special"]}}
        with patch.object(carrier_profiles, "_rules", return_value=(broad, specific)):
            profile = carrier_profiles.resolve({"mcc": "234", "mnc": "10", "spn": "Special"})
        self.assertEqual(profile["id"], "specific")
        self.assertNotIn("route", profile)
        self.assertNotIn("epdg", profile)
        self.assertNotIn("identity", profile)


class OneWifiCarrierEngineTests(unittest.TestCase):
    def test_rendered_identity_route_and_explicit_overrides(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(config, "DATA_DIR", tmp), \
                patch.object(config, "CONFIG_PATH", str(Path(tmp) / "config.yaml")):
            cfg = config.render_instance_json(_line(), {})
            self.assertEqual(cfg["imsi"], "204047616000000")
            self.assertEqual(cfg["subscriber_imsi"], "515661015000000")
            self.assertEqual((cfg["mcc"], cfg["mnc"]), ("515", "66"))
            self.assertEqual(cfg["reader"], "imsi:204047616000000")
            self.assertEqual(cfg["carrier_ike"]["proposal"], "legacy-sha1-modp1024")
            from engine import render
            ctx = render.build_context({**cfg, "local_addr": "172.17.0.3"})
            self.assertEqual(ctx["imsi"], "515661015000000")
            self.assertEqual(ctx["reader"], "imsi:204047616000000")
            self.assertIn("mnc066.mcc515", ctx["nai"])
            self.assertIn("mnc066.mcc515", ctx["realm"])
            overridden = config.render_instance_json(_line(
                epdg="198.51.100.8", smsc="+123", carrier_ike={"proposal": "modern"},
                sip={"transport": "tcp", "webrtc": {"password": "test-web"}}), {})
            self.assertEqual(overridden["epdg"], "198.51.100.8")
            self.assertEqual(overridden["smsc"], "+123")
            self.assertEqual(overridden["carrier_ike"]["proposal"], "modern")
            self.assertEqual(overridden["sip"]["transport"], "tcp")

    def test_register_and_ike_field_reach_engine_consumers(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(config, "DATA_DIR", tmp), \
                patch.object(config, "CONFIG_PATH", str(Path(tmp) / "config.yaml")):
            hong_kong = config.render_instance_json(_line(
                imsi="454030000000000", mcc="454", mnc="03", iccid="89852300000",
                carrier_identity={}, pcscf="192.0.2.10"), {})
            from engine import render
            ctx = render.build_context({**hong_kong, "local_addr": "172.17.0.3"})
            self.assertFalse(ctx["pani_enabled"])
            self.assertEqual(ctx["register_expires"], 7200)
            self.assertEqual(ctx["ims_security"], "disabled")
            self.assertTrue(ctx["volte_three_register"])
            from jinja2 import Environment, FileSystemLoader
            template = Environment(loader=FileSystemLoader(str(ENGINE / "templates")))
            rendered = template.get_template("pjsip.conf.j2").render(**ctx)
            self.assertIn("expiration=7200", rendered)
            self.assertIn("sec_encryption=no", rendered)
            self.assertIn("volte_three_register=yes", rendered)
            self.assertIn("iOS 26.6", rendered)
            self.assertNotIn("p_access_network_info=", rendered)
            self.assertEqual(hong_kong["epdg"], "wlan.three.com.hk")
            self.assertEqual(hong_kong["carrier_operational_status"], "mapped")
            att = config.render_instance_json(_line(
                imsi="310280123456789", mcc="310", mnc="280", iccid="89014100000",
                carrier_identity={}, pcscf="192.0.2.10"), {})
            self.assertEqual(att["epdg"], "epdg.epc.att.net")
            self.assertEqual(att["carrier_operational_status"], "mapped")
            self.assertEqual(att["sip"]["ims_public_realm"], "one.att.net")
            self.assertEqual(att["sip"]["ims_private_realm"], "private.att.net")
            self.assertTrue(att["sip"]["volte_att_register"])
            att_ctx = render.build_context({**att, "local_addr": "172.17.0.3"})
            att_rendered = template.get_template("pjsip.conf.j2").render(**att_ctx)
            self.assertIn("client_uri=sip:310280123456789@one.att.net", att_rendered)
            self.assertIn("username=310280123456789@private.att.net", att_rendered)
            self.assertIn("expiration=18400", att_rendered)
            self.assertIn("sec_port_s_min=6000", att_rendered)
            self.assertIn("volte_att_register=yes", att_rendered)
            self.assertIn("SimAdmin VoWiFi", att_rendered)
            ultra_line = _line(imsi="310260123456789", mcc="310", mnc="260",
                               iccid="89012600000", carrier_identity={"gid1": "354DFFFF"})
            ultra = config.render_instance_json(ultra_line, {})
            self.assertEqual((ultra["mcc"], ultra["mnc"]), ("310", "240"))
            self.assertEqual(egress.epdg_for(ultra_line),
                             "epdg.epc.mnc240.mcc310.pub.3gppnetwork.org")
            o2 = config.render_instance_json(_line(
                imsi="262030000000000", mcc="262", mnc="03", iccid="89490300000",
                carrier_identity={}, pcscf="192.0.2.10"), {})
            self.assertFalse(o2["carrier_ike"]["advertise_eap_only"])
            self.assertEqual(carrier_profiles.resolve({"mcc": "262", "mnc": "03"})
                             ["ims"]["ipsec_encryption"], "null")
            self.assertEqual(o2["sip"]["security"], "required")
            o2_ctx = render.build_context({**o2, "local_addr": "172.17.0.3"})
            o2_rendered = template.get_template("pjsip.conf.j2").render(**o2_ctx)
            self.assertIn("sec_encryption=no", o2_rendered)
            self.assertIn("sec_port_c_min=5062\nsec_port_c_max=5062", o2_rendered)
            self.assertIn("sec_port_s_min=5063\nsec_port_s_max=5063", o2_rendered)
            self.assertIn("volte_o2_register=yes", o2_rendered)
            o2_override = config.render_instance_json(_line(
                imsi="262030000000000", mcc="262", mnc="03", iccid="89490300000",
                carrier_identity={}, pcscf="192.0.2.10",
                sip={"ipsec_encryption": "aes-cbc", "webrtc": {"password": "test-web"}}), {})
            override_ctx = render.build_context({**o2_override, "local_addr": "172.17.0.3"})
            self.assertIn("sec_encryption=yes",
                          template.get_template("pjsip.conf.j2").render(**override_ctx))
            o2_opt_out = config.render_instance_json(_line(
                imsi="262030000000000", mcc="262", mnc="03", iccid="89490300000",
                carrier_identity={}, pcscf="192.0.2.10",
                sip={"volte_o2_register": False, "webrtc": {"password": "test-web"}}), {})
            self.assertNotIn("volte_o2_register=",
                             template.get_template("pjsip.conf.j2").render(**render.build_context(
                                 {**o2_opt_out, "local_addr": "172.17.0.3"})))
            ultra = config.render_instance_json(_line(
                imsi="310260123456789", mcc="310", mnc="260", iccid="89012600000",
                carrier_identity={"gid1": "354DFFFF"}, pcscf="192.0.2.10"), {})
            self.assertEqual(ultra["carrier_operational_status"], "mapped")
            self.assertEqual((ultra["mcc"], ultra["mnc"]), ("310", "240"))
            ultra_ctx = render.build_context({**ultra, "local_addr": "172.17.0.3"})
            self.assertIn("volte_ultra_contact=yes",
                          template.get_template("pjsip.conf.j2").render(**ultra_ctx))
            ultra_opt_out = config.render_instance_json(_line(
                imsi="310260123456789", mcc="310", mnc="260", iccid="89012600000",
                carrier_identity={"gid1": "354DFFFF"}, pcscf="192.0.2.10",
                sip={"volte_ultra_contact": False, "webrtc": {"password": "test-web"}}), {})
            self.assertNotIn("volte_ultra_contact=",
                             template.get_template("pjsip.conf.j2").render(**render.build_context(
                                 {**ultra_opt_out, "local_addr": "172.17.0.3"})))
            uk = config.render_instance_json(_line(
                imsi="234100000000000", mcc="234", mnc="10", iccid="89442100000",
                carrier_identity={}, pcscf="192.0.2.10"), {})
            self.assertEqual(uk["smsc"], "+447802000332")
            ctx = render.build_context({**uk, "local_addr": "172.17.0.3"})
            rendered = template.get_template("pjsip.conf.j2").render(**ctx)
            self.assertIn("protocol=udp", rendered)
            self.assertIn("smsc_uri=sip:+447802000332@", rendered)

    def test_eap_only_notice_is_omitted_for_o2_germany(self):
        tree = ast.parse((ENGINE / "swu_ike.py").read_text(encoding="utf-8"))
        cls = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == "swu")
        method = next(node for node in cls.body if isinstance(node, ast.FunctionDef)
                      and node.name == "create_IKE_AUTH")
        constants = dict(IDI=1, IDR=2, CP=3, SA=4, TSI=5, TSR=6, N=7, NONE=0,
                         RESERVED=0, INITIAL_CONTACT=11, P_CSCF_RESELECTION_SUPPORT=12,
                         EAP_ONLY_AUTHENTICATION=13, IKE_AUTH=35, os=os)
        exec(compile(ast.Module(body=[method], type_ignores=[]), "swu_ike.py", "exec"), constants)

        class Stub:
            ike_spi_initiator = ike_spi_responder = b""
            message_id_request = 0
            sa_list_child = []

            def __init__(self):
                self.notices = []

            def __getattr__(self, _key):
                return lambda *_args: b"x"

            def encode_payload_type_n(self, _protocol, _spi, typ):
                self.notices.append(typ)
                return b"x"

        with patch.dict(os.environ, {"SWU_EAP_ONLY": "0", "SWU_PCSCF_RESELECTION_SUPPORT": "0"}):
            node = Stub()
            constants["create_IKE_AUTH"](node)
            self.assertEqual(node.notices, [11])
        with patch.dict(os.environ, {"SWU_EAP_ONLY": "1", "SWU_PCSCF_RESELECTION_SUPPORT": "0"}):
            node = Stub()
            constants["create_IKE_AUTH"](node)
            self.assertEqual(node.notices, [11, 13])

    def test_epdg_ecs_dns_is_consumed_only_when_profiled(self):
        tree = ast.parse((ENGINE / "swu_ike.py").read_text(encoding="utf-8"))
        fn = next(node for node in tree.body if isinstance(node, ast.FunctionDef)
                  and node.name == "resolve_epdg_ipv4")
        scope = dict(ipaddress=ipaddress, subprocess=subprocess, socket=socket,
                     swu_log=lambda _value: None)
        exec(compile(ast.Module(body=[fn], type_ignores=[]), "swu_ike.py", "exec"), scope)
        with patch.object(subprocess, "check_output", return_value="203.0.113.7\n") as dig, \
                patch.object(socket, "gethostbyname", return_value="198.51.100.1") as system:
            resolved = scope["resolve_epdg_ipv4"]("epdg.example", "109.192.0.0/24")
            self.assertEqual(resolved, "203.0.113.7")
            self.assertIn("+subnet=109.192.0.0/24", dig.call_args.args[0])
            self.assertEqual(scope["resolve_epdg_ipv4"]("other.example", ""), "198.51.100.1")
            system.assert_called_once_with("other.example")


if __name__ == "__main__":
    unittest.main()
