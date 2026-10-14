"""Add bounded O2 Germany REGISTER and Ultra Mobile Contact consumers.

Applied last, after the existing registration patches. Every source is validated before
any write; source drift fails the engine build instead of silently dropping a profile.
"""

import os
import sys
from pathlib import Path


ROOT = Path(os.environ.get("AST_SRC", "/home/asterisk-build/asterisk"))
REGISTER = ROOT / "res/res_pjsip_outbound_registration.c"
VOLTE = ROOT / "res/res_pjsip_outbound_registration/volte.c"
HEADER = ROOT / "res/res_pjsip_outbound_registration/volte.h"
MARKER = "PATCH onewifi_carrier_register_profiles"


def replace_once(source, old, new, label):
    count = source.count(old)
    if count != 1:
        raise ValueError(f"{label}: expected one anchor, found {count}")
    return source.replace(old, new, 1)


def patch_register(source):
    source = replace_once(source,
        "\t/*! \\brief VoLTE support */\n\tunsigned int volte;\n"
        "\t/*! \\brief Enable IPSec encryption support for VoLTE */",
        "\t/*! \\brief VoLTE support */\n\tunsigned int volte;\n"
        "\t/* " + MARKER + ": carrier-specific VoLTE REGISTER/Contact opt-ins. */\n"
        "\tunsigned int volte_o2_register;\n\tunsigned int volte_ultra_contact;\n"
        "\tunsigned int volte_att_register;\n"
        "\tunsigned int volte_three_register;\n"
        "\t/*! \\brief Enable IPSec encryption support for VoLTE */", "registration options")
    source = replace_once(source,
        "\t/*! \\brief VoLTE support */\n\tunsigned int volte;\n"
        "\t/*! \\brief Current state of registration process */",
        "\t/*! \\brief VoLTE support */\n\tunsigned int volte;\n"
        "\t/* " + MARKER + ": copied from the registration for every send/retry. */\n"
        "\tunsigned int volte_o2_register;\n"
        "\tunsigned int volte_att_register;\n"
        "\tunsigned int volte_three_register;\n"
        "\t/*! \\brief Current state of registration process */", "client options")
    helper = r'''/* PATCH onewifi_carrier_register_profiles: replace only O2's REGISTER capability
 * headers, after the VoLTE sec-agree/auth path has finished modifying the request. */
static int add_o2_register_headers(struct sip_outbound_registration_client_state *client_state,
		pjsip_tx_data *tdata)
{
	static const pj_str_t supported_name = { "Supported", 9 };
	static const pj_str_t allow_name = { "Allow", 5 };
	static const pj_str_t preferred_name = { "P-Preferred-Identity", 20 };
	pjsip_regc_info info;
	pjsip_hdr *hdr;
	char preferred[PJSIP_MAX_URL_SIZE + 3];

	if (!client_state->volte || !client_state->volte_o2_register) {
		return 0;
	}
	while ((hdr = pjsip_msg_find_hdr_by_name(tdata->msg, &supported_name, NULL))) {
		pj_list_erase(hdr);
	}
	while ((hdr = pjsip_msg_find_hdr_by_name(tdata->msg, &allow_name, NULL))) {
		pj_list_erase(hdr);
	}
	if (ast_sip_add_header(tdata, "Supported", "path, gruu, outbound, sec-agree, 100rel, timer")
		|| ast_sip_add_header(tdata, "Allow", "INVITE, ACK, CANCEL, BYE, PRACK, UPDATE, INFO, MESSAGE, OPTIONS")) {
		return -1;
	}
	if (pjsip_msg_find_hdr_by_name(tdata->msg, &preferred_name, NULL)) {
		return 0;
	}
	pjsip_regc_get_info(client_state->client, &info);
	if (!info.client_uri.ptr || info.client_uri.slen <= 0
		|| info.client_uri.slen > PJSIP_MAX_URL_SIZE) {
		return -1;
	}
	pj_ansi_snprintf(preferred, sizeof(preferred), "<%.*s>",
		(int) info.client_uri.slen, info.client_uri.ptr);
	return ast_sip_add_header(tdata, "P-Preferred-Identity", preferred);
}

/* PATCH onewifi_carrier_register_profiles: AT&T public identity headers.
 * client_uri is already sip:<imsi>@one.att.net; these are the headers the
 * paired private identity does not carry by itself. */
static int add_att_register_headers(struct sip_outbound_registration_client_state *client_state,
		pjsip_tx_data *tdata)
{
	static const pj_str_t supported_name = { "Supported", 9 };
	static const pj_str_t preferred_name = { "P-Preferred-Identity", 20 };
	pjsip_regc_info info;
	pjsip_hdr *hdr;
	char preferred[PJSIP_MAX_URL_SIZE + 3];

	if (!client_state->volte || !client_state->volte_att_register) {
		return 0;
	}
	while ((hdr = pjsip_msg_find_hdr_by_name(tdata->msg, &supported_name, NULL))) {
		pj_list_erase(hdr);
	}
	if (ast_sip_add_header(tdata, "Supported", "path,sec-agree,gruu")) {
		return -1;
	}
	pjsip_regc_get_info(client_state->client, &info);
	if (!info.client_uri.ptr || info.client_uri.slen <= 0
		|| info.client_uri.slen > PJSIP_MAX_URL_SIZE) {
		return -1;
	}
	if (!pjsip_msg_find_hdr_by_name(tdata->msg, &preferred_name, NULL)) {
		pj_ansi_snprintf(preferred, sizeof(preferred), "<%.*s>",
			(int) info.client_uri.slen, info.client_uri.ptr);
		if (ast_sip_add_header(tdata, "P-Preferred-Identity", preferred)) {
			return -1;
		}
	}
	if (ast_sip_add_header(tdata, "P-Visited-Network-ID", "\"one.att.net\"")
		|| ast_sip_add_header(tdata, "P-Access-Network-Info",
			"IEEE-802.11;i-wlan-node-id=000000000000;network-provided")
		|| ast_sip_add_header(tdata, "Cellular-Network-Info",
			"3GPP-E-UTRAN-FDD;utran-cell-id-3gpp=3102800000000;cell-info-age=0")
		|| ast_sip_add_header(tdata, "Accept-Contact", "*;+g.3gpp.smsip")
		|| ast_sip_add_header(tdata, "Accept-Contact",
			"*;+g.3gpp.icsi-ref=\"urn%3Aurn-7%3A3gpp-service.ims.icsi.mmtel\"")) {
		return -1;
	}
	return 0;
}

static int add_three_register_headers(struct sip_outbound_registration_client_state *client_state,
		pjsip_tx_data *tdata)
{
	static const pj_str_t security_name = { "Security-Client", 15 };
	static const pj_str_t require_name = { "Require", 7 };
	static const pj_str_t proxy_name = { "Proxy-Require", 13 };
	static const pj_str_t supported_name = { "Supported", 9 };
	static const pj_str_t allow_name = { "Allow", 5 };
	static const pj_str_t preferred_name = { "P-Preferred-Identity", 20 };
	pjsip_regc_info info;
	pjsip_hdr *hdr;
	char preferred[PJSIP_MAX_URL_SIZE + 3];
	char authorization[512];
	char wipe[512];
	FILE *authf;
	size_t length;
	int status;

	if (!client_state->volte || !client_state->volte_three_register) {
		return 0;
	}
	while ((hdr = pjsip_msg_find_hdr_by_name(tdata->msg, &security_name, NULL))) {
		pj_list_erase(hdr);
	}
	while ((hdr = pjsip_msg_find_hdr_by_name(tdata->msg, &require_name, NULL))) {
		pj_list_erase(hdr);
	}
	while ((hdr = pjsip_msg_find_hdr_by_name(tdata->msg, &proxy_name, NULL))) {
		pj_list_erase(hdr);
	}
	while ((hdr = pjsip_msg_find_hdr_by_name(tdata->msg, &supported_name, NULL))) {
		pj_list_erase(hdr);
	}
	while ((hdr = pjsip_msg_find_hdr_by_name(tdata->msg, &allow_name, NULL))) {
		pj_list_erase(hdr);
	}
	if (ast_sip_add_header(tdata, "Supported", "path,gruu")
		|| ast_sip_add_header(tdata, "Allow",
			"OPTIONS,REGISTER,SUBSCRIBE,NOTIFY,PUBLISH,INVITE,ACK,BYE,CANCEL,UPDATE,PRACK,REFER,INFO,MESSAGE")) {
		return -1;
	}
	pjsip_regc_get_info(client_state->client, &info);
	if (!info.client_uri.ptr || info.client_uri.slen <= 0
		|| info.client_uri.slen > PJSIP_MAX_URL_SIZE) {
		return -1;
	}
	if (!pjsip_msg_find_hdr_by_name(tdata->msg, &preferred_name, NULL)) {
		pj_ansi_snprintf(preferred, sizeof(preferred), "<%.*s>",
			(int) info.client_uri.slen, info.client_uri.ptr);
		if (ast_sip_add_header(tdata, "P-Preferred-Identity", preferred)) {
			return -1;
		}
	}
	if (ast_sip_add_header(tdata, "Accept-Contact", "*;+g.3gpp.smsip")) {
		return -1;
	}
	authf = fopen("/run/onewifi/eap_direct.auth", "r");
	if (!authf || !fgets(authorization, sizeof(authorization), authf)) {
		if (authf) {
			fclose(authf);
		}
		remove("/run/onewifi/eap_direct.auth");
		return -1;
	}
	fclose(authf);
	length = strlen(authorization);
	while (length && (authorization[length - 1] == '\n' || authorization[length - 1] == '\r')) {
		authorization[--length] = '\0';
	}
	if (!length || strchr(authorization, '\r') || strchr(authorization, '\n')) {
		remove("/run/onewifi/eap_direct.auth");
		return -1;
	}
	status = ast_sip_add_header(tdata, "Authorization", authorization);
	memset(authorization, 0, sizeof(authorization));
	authf = fopen("/run/onewifi/eap_direct.auth", "w");
	if (authf) {
		memset(wipe, 0, sizeof(wipe));
		fwrite(wipe, 1, sizeof(wipe), authf);
		fclose(authf);
	}
	remove("/run/onewifi/eap_direct.auth");
	return status ? -1 : 0;
}

'''
    source = replace_once(source,
        "/*! \\brief Helper function which sends a message and cleans up, if needed, on failure */\n"
        "static pj_status_t registration_client_send(",
        helper + "/*! \\brief Helper function which sends a message and cleans up, if needed, on failure */\n"
        "static pj_status_t registration_client_send(", "REGISTER header helper")
    source = replace_once(source,
        "\tstatus = pjsip_regc_send(client_state->client, tdata);\n",
        "\tif (add_o2_register_headers(client_state, tdata)\n"
        "\t\t\t|| add_att_register_headers(client_state, tdata)\n"
        "\t\t\t|| add_three_register_headers(client_state, tdata)) {\n"
        "\t\tpjsip_tx_data_dec_ref(tdata);\n"
        "\t\tpjsip_tx_data_dec_ref(tdata);\n\t\tao2_ref(client_state, -1);\n"
        "\t\treturn -1;\n\t}\n\tstatus = pjsip_regc_send(client_state->client, tdata);\n",
        "REGISTER send")
    source = replace_once(source,
        "\t\tcontact_header_params = volte_add_contact_params(registration->imei, registration->accesstype, registration->receive_sms);",
        "\t\tcontact_header_params = volte_add_contact_params(registration->imei, registration->accesstype,\n"
        "\t\t\tregistration->receive_sms, registration->volte_ultra_contact);", "VoLTE Contact call")
    source = replace_once(source,
        "\tstate->client_state->support_outbound = registration->support_outbound;\n",
        "\tstate->client_state->support_outbound = registration->support_outbound;\n"
        "\tstate->client_state->volte_o2_register = registration->volte_o2_register;\n"
        "\tstate->client_state->volte_att_register = registration->volte_att_register;\n"
        "\tstate->client_state->volte_three_register = registration->volte_three_register;\n",
        "client option copy")
    source = replace_once(source,
        '\tast_sorcery_object_field_register(ast_sip_get_sorcery(), "registration", "volte", "no", OPT_BOOL_T, 1, FLDSET(struct sip_outbound_registration, volte));\n',
        '\tast_sorcery_object_field_register(ast_sip_get_sorcery(), "registration", "volte", "no", OPT_BOOL_T, 1, FLDSET(struct sip_outbound_registration, volte));\n'
        '\tast_sorcery_object_field_register(ast_sip_get_sorcery(), "registration", "volte_o2_register", "no", OPT_BOOL_T, 1, FLDSET(struct sip_outbound_registration, volte_o2_register));\n'
        '\tast_sorcery_object_field_register(ast_sip_get_sorcery(), "registration", "volte_ultra_contact", "no", OPT_BOOL_T, 1, FLDSET(struct sip_outbound_registration, volte_ultra_contact));\n'
        '\tast_sorcery_object_field_register(ast_sip_get_sorcery(), "registration", "volte_att_register", "no", OPT_BOOL_T, 1, FLDSET(struct sip_outbound_registration, volte_att_register));\n'
        '\tast_sorcery_object_field_register(ast_sip_get_sorcery(), "registration", "volte_three_register", "no", OPT_BOOL_T, 1, FLDSET(struct sip_outbound_registration, volte_three_register));\n',
        "sorcery options")
    return source


def patch_volte(source):
    source = replace_once(source,
        "const char *volte_add_contact_params(const char *imei, const char *accesstype, pj_bool_t sms_enabled)\n",
        "/* " + MARKER + ": Ultra Mobile adds WLAN/SMS Contact feature tags. */\n"
        "const char *volte_add_contact_params(const char *imei, const char *accesstype,\n"
        "\tpj_bool_t sms_enabled, pj_bool_t ultra_mobile)\n", "Contact signature")
    source = replace_once(source,
        '\tsprintf(contact, "+g.3gpp.icsi-ref=\\"urn%%3Aurn-7%%3A3gpp-service.ims.icsi.mmtel\\";audio");\n',
        '\tif (ultra_mobile)\n'
        '\t\tsprintf(contact, "+g.3gpp.icsi-ref=\\"urn%%3Aurn-7%%3A3gpp-service.ims.icsi.mmtel,urn%%3Aurn-7%%3A3gpp-service.ims.icsi.sms\\";audio");\n'
        '\telse\n'
        '\t\tsprintf(contact, "+g.3gpp.icsi-ref=\\"urn%%3Aurn-7%%3A3gpp-service.ims.icsi.mmtel\\";audio");\n',
        "Contact ICSI")
    source = replace_once(source,
        '\tif (accesstype[0])\n\t\tsprintf(strchr(contact, \'\\0\'), ";+g.3gpp.accesstype=\\"%s\\"", accesstype);\n',
        '\tif (accesstype[0])\n\t\tsprintf(strchr(contact, \'\\0\'), ";+g.3gpp.accesstype=\\"%s\\"", accesstype);\n'
        '\telse if (ultra_mobile)\n\t\tsprintf(strchr(contact, \'\\0\'), ";+g.3gpp.accesstype=\\"wlan1\\"");\n',
        "Contact access type")
    source = replace_once(source,
        '\tif (sms_enabled)\n\t\tsprintf(strchr(contact, \'\\0\'), ";+g.3gpp.smsip");\n\n\treturn contact;\n',
        '\tif (sms_enabled)\n\t\tsprintf(strchr(contact, \'\\0\'), ";+g.3gpp.smsip");\n'
        '\tif (ultra_mobile)\n'
        '\t\tsprintf(strchr(contact, \'\\0\'), ";+g.3gpp.smsip-msisdnless;+g.3gpp.smsip-msisdn-less");\n\n'
        '\treturn contact;\n', "Contact tags")
    return source


def patch_header(source):
    return replace_once(source,
        "const char *volte_add_contact_params(const char *imei, const char *accesstype, pj_bool_t sms_enabled);",
        "/* " + MARKER + " */\n"
        "const char *volte_add_contact_params(const char *imei, const char *accesstype,\n"
        "\tpj_bool_t sms_enabled, pj_bool_t ultra_mobile);", "Contact declaration")


def main():
    originals = {path: path.read_text() for path in (REGISTER, VOLTE, HEADER)}
    marked = {path: MARKER in source for path, source in originals.items()}
    if all(marked.values()):
        expected = {
            REGISTER: ('state->client_state->volte_o2_register = registration->volte_o2_register;',
                       'state->client_state->volte_att_register = registration->volte_att_register;',
                       'state->client_state->volte_three_register = registration->volte_three_register;',
                       'add_o2_register_headers(client_state, tdata)',
                       'add_att_register_headers(client_state, tdata)',
                       'add_three_register_headers(client_state, tdata)',
                       'registration->receive_sms, registration->volte_ultra_contact',
                       '"registration", "volte_ultra_contact"',
                       '"registration", "volte_att_register"',
                       '"registration", "volte_three_register"',
                       'Security-Client'),
            VOLTE: ('pj_bool_t sms_enabled, pj_bool_t ultra_mobile)',
                    'icsi.mmtel,urn%%3Aurn-7%%3A3gpp-service.ims.icsi.sms',
                    'smsip-msisdnless;+g.3gpp.smsip-msisdn-less'),
            HEADER: ('pj_bool_t sms_enabled, pj_bool_t ultra_mobile);',),
        }
        if any(token not in originals[path] for path, tokens in expected.items()
               for token in tokens):
            raise ValueError("carrier REGISTER patch marker without complete consumers")
        print("carrier REGISTER patch already applied")
        return
    if any(marked.values()):
        raise ValueError("partial carrier REGISTER patch detected")
    patched = {REGISTER: patch_register(originals[REGISTER]),
               VOLTE: patch_volte(originals[VOLTE]),
               HEADER: patch_header(originals[HEADER])}
    for path, source in patched.items():
        path.write_text(source)
    print("patched O2 REGISTER headers and Ultra Mobile Contact features")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError) as exc:
        print(f"carrier REGISTER patch failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
