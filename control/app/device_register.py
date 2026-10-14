"""Register a discovered reader or modem as a stopped line draft.

The add-device card can save hardware before PC/SC is up, so this does not read a SIM
and does not start an engine. A later card probe fills identity; start stays on the
existing PIN preflight.
"""
from __future__ import annotations

import re

# Docker container names are onewifi-engine-{id}. Spaces and slashes are not usable there.
_SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$")


def safe_id(raw: str) -> str:
    text = re.sub(r"[^A-Za-z0-9_.-]+", "-", str(raw or "").strip()).strip("-.")[:63]
    if text and not text[0].isalnum():
        text = text.lstrip("_.-")
    return text if _SAFE_ID.fullmatch(text or "") else ""


def draft(config: dict) -> dict:
    """The line fields worth keeping from the add-device form."""
    if not isinstance(config, dict):
        raise ValueError("device config is required")
    iid = safe_id(config.get("id") or config.get("discovery_key") or "")
    if not iid:
        raise ValueError("device id is required")
    name = str(config.get("name") or iid).strip()[:80] or iid
    return {
        "id": iid,
        "name": name,
        "provisioning_state": "draft",
        "enabled": False,
        "iccid": "",
        "imsi": "",
        "mcc": "",
        "mnc": "",
        "msisdn": "",
        "proxy_country": "",
        "apn": "ims",
        "idr_mode": "apn",
        "cp_mode": "auto",
        "reader": str(config.get("control_device") or "").strip(),
        "reader_port": str(config.get("at_port") or "").strip(),
        "usb_path": str(config.get("usb_path") or "").strip(),
        "imei": str(config.get("modem_imei") or "").strip(),
        "sip": {"transport": "udp", "external": [], "webrtc": {"enable": True}},
        "debug": {"asterisk": False, "charon": False},
    }


def claim_target(instances, reader: str = "", port: str = "") -> dict | None:
    """A registered draft with no SIM yet, addressed by the live reader name or USB port."""
    reader = str(reader or "")
    port = str(port or "")
    for inst in instances or []:
        if str(inst.get("iccid") or "").strip():
            continue
        if reader and str(inst.get("reader") or "") == reader:
            return inst
        saved = (str(inst.get("reader_port") or ""), str(inst.get("usb_path") or ""))
        if port and port in saved:
            return inst
    return None


def match(instances, spec: dict) -> dict | None:
    """The line that already owns this id, reader, or USB path. None means create it."""
    wanted = str(spec.get("id") or "")
    reader = str(spec.get("reader") or "")
    usb = str(spec.get("usb_path") or "")
    same_id = None
    for inst in instances or []:
        if reader and str(inst.get("reader") or "") == reader:
            return inst
        if usb and usb in (str(inst.get("usb_path") or ""), str(inst.get("stable_path") or "")):
            return inst
        if str(inst.get("id") or "") == wanted:
            same_id = inst
    if same_id is None:
        return None
    current_reader = str(same_id.get("reader") or "")
    if not reader or not current_reader or current_reader == reader:
        return same_id
    raise ValueError("device id is already in use")
