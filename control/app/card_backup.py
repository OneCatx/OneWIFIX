"""Per-ICCID card settings backup.

The file records how each card is meant to run. It does not carry a PIN, an
authentication secret, or any SMS.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone


SCHEMA_VERSION = 1
MAX_BYTES = 64 * 1024
_IP_VERSIONS = {"", "IP", "IPV6", "IPV4V6"}
_VOICE_PATHS = {"", "vowifi", "cellular"}
_FIELDS = (
    "network_enabled", "vowifi_enabled", "airplane_enabled", "apn",
    "ip_version", "custom_phone_number", "mbn_profile", "voice_path",
)


class CardBackupError(ValueError):
    """The document cannot be exported, checked, or restored."""


def _text(value) -> str:
    return str(value or "").strip()


def _policy(raw: dict) -> dict:
    ip_version = _text(raw.get("ip_version")).upper()
    if ip_version not in _IP_VERSIONS:
        raise CardBackupError(f"unsupported ip_version {raw.get('ip_version')!r}")
    voice_path = _text(raw.get("voice_path")).lower()
    if voice_path not in _VOICE_PATHS:
        raise CardBackupError(f"unsupported voice_path {raw.get('voice_path')!r}")
    iccid = _text(raw.get("iccid"))
    if not iccid:
        raise CardBackupError("card backup entry missing iccid")
    return {
        "iccid": iccid,
        "network_enabled": bool(raw.get("network_enabled", False)),
        "vowifi_enabled": bool(raw.get("vowifi_enabled", True)),
        "airplane_enabled": bool(raw.get("airplane_enabled", False)),
        "apn": _text(raw.get("apn")),
        "ip_version": ip_version,
        "custom_phone_number": _text(raw.get("custom_phone_number")),
        "mbn_profile": _text(raw.get("mbn_profile")),
        "voice_path": voice_path,
    }


def policy_from_instance(inst: dict) -> dict | None:
    iccid = _text(inst.get("iccid"))
    if not iccid:
        return None
    vowifi = bool(inst.get("enabled", inst.get("vowifi_enabled", True)))
    return _policy({
        "iccid": iccid,
        "network_enabled": inst.get("cellular_enabled", inst.get("network_enabled", False)),
        "vowifi_enabled": vowifi,
        "airplane_enabled": inst.get("flight_mode", inst.get("airplane_enabled", False)),
        "apn": inst.get("apn") or "ims",
        "ip_version": inst.get("ip_version") or "",
        "custom_phone_number": inst.get("msisdn") or inst.get("custom_phone_number") or "",
        "mbn_profile": inst.get("mbn_profile") or "",
        "voice_path": inst.get("voice_path") or ("vowifi" if vowifi else "cellular"),
    })


def policies_for_export(stored: dict, instances: list[dict]) -> list[dict]:
    cards: dict[str, dict] = {}
    for iccid, raw in (stored or {}).items():
        if not isinstance(raw, dict):
            continue
        row = dict(raw)
        row.setdefault("iccid", iccid)
        cards[_text(row.get("iccid"))] = _policy(row)
    cards.pop("", None)
    for inst in instances or []:
        row = policy_from_instance(inst)
        if row:
            cards[row["iccid"]] = row
    return [cards[key] for key in sorted(cards)]


def export_backup(policies, *, source: str = "onewifi", device_imei: str = "") -> bytes:
    cards = []
    seen = set()
    for raw in policies or []:
        row = _policy(raw)
        if row["iccid"] in seen:
            raise CardBackupError(f"card backup duplicate iccid {row['iccid']}")
        seen.add(row["iccid"])
        cards.append(row)
    if not cards:
        raise CardBackupError("card backup has no cards")
    document = {
        "schema_version": SCHEMA_VERSION,
        "exported_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": _text(source),
        "device_imei": _text(device_imei),
        "cards": cards,
    }
    raw = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(raw) > MAX_BYTES:
        raise CardBackupError(f"card backup exceeds {MAX_BYTES} bytes")
    return raw


def parse_backup(payload: bytes) -> dict:
    if not payload:
        raise CardBackupError("card backup is empty")
    if len(payload) > MAX_BYTES:
        raise CardBackupError(f"card backup exceeds {MAX_BYTES} bytes")
    try:
        document = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise CardBackupError("card backup is not valid JSON") from exc
    if not isinstance(document, dict):
        raise CardBackupError("card backup is not valid JSON")
    if document.get("schema_version") != SCHEMA_VERSION:
        raise CardBackupError(
            f"unsupported card backup schema_version {document.get('schema_version')}")
    cards = document.get("cards")
    if not isinstance(cards, list) or not cards:
        raise CardBackupError("card backup has no cards")
    parsed = []
    seen = set()
    for raw in cards:
        if not isinstance(raw, dict):
            raise CardBackupError("card backup entry missing iccid")
        row = _policy(raw)
        if row["iccid"] in seen:
            raise CardBackupError(f"card backup duplicate iccid {row['iccid']}")
        seen.add(row["iccid"])
        parsed.append(row)
    return {
        "schema_version": SCHEMA_VERSION,
        "exported_at": _text(document.get("exported_at")),
        "source": _text(document.get("source")),
        "device_imei": _text(document.get("device_imei")),
        "cards": parsed,
    }


def iccid_tail(iccid: str) -> str:
    value = _text(iccid)
    return value if len(value) <= 4 else value[-4:]


def preview(document: dict) -> dict:
    cards = []
    for card in document.get("cards") or []:
        cards.append({
            "iccid_tail": iccid_tail(card.get("iccid")),
            "voice_path": card.get("voice_path") or "",
            "vowifi": bool(card.get("vowifi_enabled")),
            "network": bool(card.get("network_enabled")),
            "apn": card.get("apn") or "",
        })
    return {
        "schema_version": document.get("schema_version"),
        "exported_at": document.get("exported_at") or "",
        "device_imei": document.get("device_imei") or "",
        "card_count": len(cards),
        "cards": cards,
    }


def remembered_policy(stored: dict, iccid: str) -> dict | None:
    raw = (stored or {}).get(_text(iccid))
    if not isinstance(raw, dict):
        return None
    try:
        return _policy({**raw, "iccid": iccid})
    except CardBackupError:
        return None


def policy_view(stored: dict, iccid: str, instance: dict | None = None) -> dict:
    """What the card screen shows: the remembered row, with the live line on top."""
    view = remembered_policy(stored, iccid) or _policy({"iccid": iccid, "vowifi_enabled": True})
    if instance and _text(instance.get("iccid")) == _text(iccid):
        if "enabled" in instance:
            view["vowifi_enabled"] = bool(instance.get("enabled"))
        if _text(instance.get("apn")):
            view["apn"] = _text(instance.get("apn"))
        if _text(instance.get("msisdn")):
            view["custom_phone_number"] = _text(instance.get("msisdn"))
        if "flight_mode" in instance:
            view["airplane_enabled"] = bool(instance.get("flight_mode"))
        if "cellular_enabled" in instance:
            view["network_enabled"] = bool(instance.get("cellular_enabled"))
    if not view["ip_version"]:
        view["ip_version"] = "IPV4V6"
    return view


def merge_policy(stored: dict, iccid: str, patch: dict) -> dict:
    current = remembered_policy(stored, iccid) or {
        "iccid": iccid, "vowifi_enabled": True,
    }
    for key in _FIELDS:
        if key in (patch or {}):
            current[key] = patch[key]
    policies = kept_policies(stored)
    policies[_text(iccid)] = _policy(current)
    return policies


def instance_update_from_policy(inst: dict, policy: dict) -> dict:
    airborne = bool(policy.get("airplane_enabled"))
    update = {
        "id": str(inst["id"]),
        "apn": policy.get("apn") or "ims",
        "enabled": (not airborne) and bool(policy.get("vowifi_enabled", True)),
        "cellular_enabled": bool(policy.get("network_enabled")),
        "flight_mode": airborne,
    }
    if policy.get("custom_phone_number"):
        update["msisdn"] = policy["custom_phone_number"]
    return update


def instance_update_from_patch(inst: dict, policy: dict, patch: dict) -> dict | None:
    update = {"id": str(inst["id"])}
    if "apn" in (patch or {}):
        update["apn"] = policy.get("apn") or "ims"
    if "vowifi_enabled" in (patch or {}):
        update["enabled"] = bool(policy.get("vowifi_enabled", True))
    if (patch or {}).get("custom_phone_number"):
        update["msisdn"] = policy["custom_phone_number"]
    if "network_enabled" in (patch or {}):
        update["cellular_enabled"] = bool(policy.get("network_enabled"))
    if "airplane_enabled" in (patch or {}):
        airborne = bool(policy.get("airplane_enabled"))
        update["flight_mode"] = airborne
        update["enabled"] = (not airborne) and bool(policy.get("vowifi_enabled", True))
    return update if len(update) > 1 else None


def updates_for_iccid(stored: dict, instances: list[dict], iccid: str) -> list[dict]:
    policy = remembered_policy(stored, iccid)
    if not policy:
        return []
    wanted = _text(iccid)
    return [instance_update_from_policy(inst, policy)
            for inst in instances or []
            if _text(inst.get("iccid")) == wanted]


def kept_policies(stored: dict) -> dict:
    policies = {}
    for iccid, raw in (stored or {}).items():
        if not isinstance(raw, dict):
            continue
        row = dict(raw)
        row.setdefault("iccid", iccid)
        try:
            kept = _policy(row)
        except CardBackupError:
            continue
        policies[kept["iccid"]] = kept
    return policies


def plan_restore(document: dict, expected_imei: str, stored: dict,
                 instances: list[dict]) -> tuple[dict, list[dict]]:
    expected = _text(expected_imei)
    bound = _text(document.get("device_imei"))
    if expected and bound and expected != bound:
        raise CardBackupError(f"card backup device_imei {bound} does not match target")
    policies = kept_policies(stored)
    updates = []
    by_iccid = {}
    for inst in instances or []:
        iccid = _text(inst.get("iccid"))
        if iccid and iccid not in by_iccid:
            by_iccid[iccid] = inst
    for card in document.get("cards") or []:
        row = _policy(card)
        policies[row["iccid"]] = row
        inst = by_iccid.get(row["iccid"])
        if not inst:
            continue
        update = instance_update_from_policy(inst, row)
        updates.append(update)
    return policies, updates
