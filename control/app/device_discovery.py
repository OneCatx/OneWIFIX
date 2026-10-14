"""Readers and USB modems the operator can add, including ones already configured."""
from __future__ import annotations


def _hex_id(value) -> int:
    text = str(value or "").strip().lower()
    if text.startswith("0x"):
        text = text[2:]
    try:
        return int(text, 16) if text else 0
    except ValueError:
        return 0


def _row(**fields) -> dict:
    row = {
        "hardware_kind": "",
        "reader_name": "",
        "device_type": "",
        "discovery_key": "",
        "control_path": "",
        "net_interface": "",
        "usb_path": "",
        "vendor_id": 0,
        "product_id": 0,
        "driver_name": "",
        "at_ports": [],
        "at_port": "",
        "imei": "",
        "name": "",
        "mode": "",
        "network_capable": False,
        "configured": False,
        "configured_id": "",
        "degraded": False,
        "discovery_issue": "",
    }
    row.update(fields)
    return row


def roster(readers, *, reader_issue: str = "", cards=None, instances=None,
           usb_candidates=None) -> list[dict]:
    """Fresh list for GET /api/devices/discovered.

    ``readers`` are PC/SC names. A reader or USB path already bound to an instance is
    marked configured instead of being hidden. ``reader_issue`` is one of the two
    strings the add-device card already translates.
    """
    configured_readers: dict[str, str] = {}
    configured_usb: dict[str, str] = {}
    for inst in instances or []:
        if not isinstance(inst, dict):
            continue
        iid = str(inst.get("id") or "")
        reader = str(inst.get("reader") or "")
        if iid and reader and not reader.startswith("imsi:"):
            configured_readers[reader] = iid
        for key in ("usb_path", "stable_path"):
            path = str(inst.get(key) or "")
            if iid and path:
                configured_usb[path] = iid
    for name, card in (cards or {}).items():
        if not isinstance(card, dict):
            continue
        iid = str(card.get("instance_id") or "")
        reader = str(card.get("reader") or name or "")
        if iid and reader:
            configured_readers.setdefault(reader, iid)

    devices = []
    names = [str(name) for name in (readers or []) if str(name)]
    if reader_issue and not names:
        devices.append(_row(
            discovery_key="pcsc", device_type="usb_sim_reader", hardware_kind="pcsc",
            discovery_issue=reader_issue, degraded=True))
    for name in names:
        iid = configured_readers.get(name, "")
        devices.append(_row(
            discovery_key=name, reader_name=name, control_path=name,
            device_type="usb_sim_reader", hardware_kind="pcsc", mode="pcsc",
            configured=bool(iid), configured_id=iid,
            discovery_issue=reader_issue, degraded=bool(reader_issue)))
    for candidate in usb_candidates or []:
        if not isinstance(candidate, dict):
            continue
        path = str(candidate.get("usb_path") or "")
        if not path:
            continue
        iid = configured_usb.get(path, "")
        label = str(candidate.get("product") or candidate.get("name") or "USB modem")
        devices.append(_row(
            discovery_key=path, device_type="pcie_ec20_ec25", hardware_kind="usb",
            driver_name=label, name=label, usb_path=path, mode="modem",
            vendor_id=_hex_id(candidate.get("vid")),
            product_id=_hex_id(candidate.get("pid")),
            configured=bool(iid), configured_id=iid, network_capable=True))
    return devices
