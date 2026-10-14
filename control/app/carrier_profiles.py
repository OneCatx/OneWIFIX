"""OneWIFI v1 interoperability profiles for MDD's per-line engine.

Matching semantics and bundled data adapted from ONWIFI carrier_compat.go,
Copyright (c) 2026 ONWIFI, MIT License (see docs/onewifi-migration/ONWIFI-LICENSE.txt).
Physical card identity is never changed by these presentation defaults.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path


_UNSUPPORTED_FIELDS = {}
_BLOCKED_PROFILES = {"china-mainland", "estonia", "csl-hk"}
_BLOCK_MESSAGES = {
    "china-mainland": "Mainland China (+86) VoWiFi is not brought up.",
    "estonia": "Estonia VoWiFi is not brought up.",
    "csl-hk": "Hong Kong CSL VoWiFi is not brought up.",
}


def _digits(value: str, lengths: tuple[int, ...]) -> bool:
    return len(value) in lengths and value.isascii() and value.isdigit()


def _canonical_plmn(mcc: str, mnc: str) -> str:
    return mcc + mnc.zfill(3) if _digits(mcc, (3,)) and _digits(mnc, (2, 3)) else ""


def _plmn_value(value: str) -> str:
    value = value.strip().replace("/", "")
    return _canonical_plmn(value[:3], value[3:]) if len(value) in (5, 6) else ""


@lru_cache(maxsize=1)
def _rules() -> tuple[dict, ...]:
    doc = json.loads(Path(__file__).with_name("carrier_profiles.json").read_text(encoding="utf-8"))
    if doc.get("version") != 1:
        raise ValueError("unsupported carrier profile version")
    seen = set()
    for rule in doc["profiles"]:
        name = rule.get("id", "").strip()
        if not name or name in seen or not (rule.get("match") or rule.get("match_any")):
            raise ValueError("invalid or duplicate carrier profile")
        seen.add(name)
        rewrite = rule.get("identity", {}).get("subscriber_imsi_rewrite", {})
        src, dst = rewrite.get("from_prefix", ""), rewrite.get("to_prefix", "")
        if src or dst:
            if not (_digits(src, tuple(range(5, 16))) and len(src) == len(dst)
                    and dst.isascii() and dst.isdigit()):
                raise ValueError("invalid subscriber IMSI rewrite")
    return tuple(doc["profiles"])


def _match(match: dict, identity: dict) -> tuple[int, str]:
    score, sources = 0, []
    mcc, mnc = str(identity.get("mcc") or "").strip(), str(identity.get("mnc") or "").strip()
    if match.get("home_plmns"):
        home = _canonical_plmn(mcc, mnc)
        if not home or home not in {_plmn_value(str(v)) for v in match["home_plmns"]}:
            return 0, ""
        score += 100
        sources.append("hplmn")
    if match.get("mcc") or match.get("mnc"):
        want_mcc = str(match.get("mcc", "")).strip()
        want_mnc = str(match.get("mnc", "")).strip()
        if (want_mcc and mcc != want_mcc) or (want_mnc and mnc != want_mnc):
            return 0, ""
        score += 100
        sources.append("hplmn")
    for key, weight, folded in (("imsi", 80, False), ("iccid", 70, False),
                                ("gid1", 50, True), ("gid2", 40, True)):
        prefixes = match.get(key + "_prefixes", [])
        if not prefixes:
            continue
        actual = str(identity.get(key) or "").strip()
        if folded:
            actual = actual.lower()
        if not actual or not any(actual.startswith(str(p).strip().lower() if folded
                                                     else str(p).strip()) for p in prefixes):
            return 0, ""
        score += weight
        sources.append(key)
    if match.get("spns"):
        spn = str(identity.get("spn") or "").strip().lower()
        if not spn or spn not in {str(v).strip().lower() for v in match["spns"]}:
            return 0, ""
        score += 20
        sources.append("spn")
    return score, "+".join(sources)


def resolve(identity: dict) -> dict:
    """Most-specific profile; equal scores keep source document precedence."""
    defaults = {"id": "standard-3gpp", "match_source": "standard",
                "ike": {"proposal": "modern", "advertise_eap_only": True},
                "ims": {"identity_profile": "standard", "register_profile": "standard",
                        "ipsec_encryption": "aes-cbc"}}
    result = defaults
    best = -1
    for rule in _rules():
        for match in ([rule["match"]] if rule.get("match") else []) + rule.get("match_any", []):
            score, source = _match(match, identity)
            if score and score > best:
                best = score
                result = {**defaults, **{key: value for key, value in rule.items()
                                      if key not in ("match", "match_any")}, "match_source": source}
                result["ike"] = {"proposal": "modern", "advertise_eap_only": True,
                                 **rule.get("ike", {})}
                result["ims"] = {"identity_profile": "standard", "register_profile": "standard",
                                 "ipsec_encryption": "aes-cbc", **rule.get("ims", {})}
    epdg = result.get("epdg", {}).get("hostname", "").lower()
    if epdg == "epdg.epc.att.net" or epdg.endswith(".att.net"):
        for key in ("identity_profile", "register_profile"):
            if result["ims"][key] == "standard":
                result["ims"][key] = "att"
    result["unsupported_fields"] = list(_UNSUPPORTED_FIELDS.get(result["id"], ()))
    result["operational_status"] = ("blocked" if result["id"] in _BLOCKED_PROFILES
                                    else "partial" if result["unsupported_fields"] else "mapped")
    return result


def blocked_contract(profile: dict) -> dict | None:
    """Return a non-secret fail-closed contract for a profile withheld from the engine.

    The manager may still render a standard fallback for compatibility, but callers can expose
    this object to an operator/UI so a matched carrier is not mistaken for supported IMS
    behavior. No credentials or subscriber identity are included.
    """
    if profile.get("operational_status") != "blocked":
        return None
    return {
        "code": "carrier_profile_unsupported",
        "profile": str(profile.get("id") or ""),
        "status": "blocked",
        "message": _BLOCK_MESSAGES.get(
            str(profile.get("id") or ""),
            "Carrier profile has no safe MDD engine consumer; automatic defaults are withheld.",
        ),
        "fields": list(profile.get("unsupported_fields") or ()),
    }


def identity_from_instance(inst: dict) -> dict:
    raw = inst.get("carrier_identity") or {}
    return {**{key: inst.get(key, "") for key in ("mcc", "mnc", "imsi", "iccid")},
            **{key: raw.get(key, "") for key in ("spn", "gid1", "gid2")}}


def presented_subscriber(identity: dict, profile: dict) -> tuple[str, str, str]:
    """EAP/IMS-facing values only; returned values never replace raw card identity."""
    imsi = str(identity.get("imsi") or "").strip()
    configured = str(identity.get("configured_imsi") or "").strip()
    if 14 <= len(configured) <= 16 and configured.startswith("51566") and configured.isdigit():
        imsi = configured
    else:
        rewrite = profile.get("identity", {}).get("subscriber_imsi_rewrite", {})
        src, dst = rewrite.get("from_prefix", ""), rewrite.get("to_prefix", "")
        if src and imsi.startswith(src):
            imsi = dst + imsi[len(src):]
    route = profile.get("route", {})
    return (imsi, str(route.get("mcc") or identity.get("mcc") or ""),
            str(route.get("mnc") or identity.get("mnc") or ""))


def dns_client_subnet(profile: dict, host: str) -> str:
    epdg = profile.get("epdg", {})
    normalized = str(host).strip().lower().rstrip(".")
    if normalized in {str(v).strip().lower().rstrip(".") for v in epdg.get("dns_hosts", [])}:
        return str(epdg.get("dns_client_subnet") or "")
    return ""
