"""Phone call records for the handset.

The id the phone sees is the engine call id. Audio is signed 16-bit linear at 8 kHz on
the device media socket, carried into the same IMS call through AudioSocket.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone

_INCOMING = {"in", "incoming"}
_ACTIVE = {"ringing", "answering", "early_media", "dialing", "active"}
_STATES = {
    "ringing": "ringing",
    "dialing": "dialing",
    "early": "early_media",
    "early_media": "early_media",
    "answered": "active",
    "active": "active",
    "up": "active",
    "ended": "ended",
    "hangup": "ended",
    "completed": "ended",
    "failed": "failed",
    "busy": "failed",
    "noanswer": "failed",
    "cancelled": "failed",
    "canceled": "failed",
}
_TERMINAL = {"ended", "failed"}


def _iso(value) -> str:
    try:
        stamp = int(value)
    except (TypeError, ValueError):
        return ""
    if stamp <= 0:
        return ""
    return datetime.fromtimestamp(stamp, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def view(row: dict) -> dict:
    status = str((row or {}).get("status") or "")
    state = _STATES.get(status, "unknown")
    direction = "incoming" if str(row.get("direction") or "") in _INCOMING else "outgoing"
    ident = str(row.get("call_id") or row.get("id") or "")
    return {
        "id": ident,
        "number": str(row.get("peer") or ""),
        "peer": str(row.get("peer") or ""),
        "direction": direction,
        "state": state,
        "media_ready": state in _ACTIVE,
        "started_at": _iso(row.get("start_ts")),
        "ended_at": _iso(row.get("end_ts")) or None,
    }


def find(rows, ident: str) -> dict | None:
    wanted = str(ident or "").strip()
    if not wanted:
        return None
    for row in rows or []:
        if (str(row.get("call_id") or "") == wanted or str(row.get("id") or "") == wanted
                or str(row.get("engine_id") or "") == wanted):
            return row
    return None


def dialed_record(result: dict | None) -> dict | None:
    """The row this dial created. The newest log row can belong to another call."""
    record = (result or {}).get("record")
    return record if isinstance(record, dict) else None


async def until_revoked(revoked, seconds: float = 2) -> bool:
    """Wait for the next snapshot, or return once the caller's credential is revoked."""
    if revoked is not None and revoked.is_set():
        return True
    sleep_task = asyncio.create_task(asyncio.sleep(seconds))
    if revoked is None:
        await sleep_task
        return False
    wait_task = asyncio.create_task(revoked.wait())
    try:
        await asyncio.wait({sleep_task, wait_task}, return_when=asyncio.FIRST_COMPLETED)
    finally:
        for task in (sleep_task, wait_task):
            if not task.done():
                task.cancel()
    return bool(revoked.is_set())


def media(device_id: str, call_id: str) -> dict:
    return {
        "id": str(call_id or ""),
        "codec": "slin",
        "format": "pcm_s16le_8000_mono",
        "dtmf": True,
        "stream": f"/api/devices/{device_id}/calls/media?id={call_id}",
    }


def open_calls(rows) -> list[dict]:
    result = []
    seen = set()
    for row in rows or []:
        item = view(row)
        if not item["id"] or item["state"] in _TERMINAL or row.get("end_ts"):
            continue
        if item["id"] in seen:
            continue
        seen.add(item["id"])
        result.append(item)
    return result


def snapshot(instances, calls_for) -> dict:
    """One native call-event snapshot. ``calls_for(id)`` returns that line's log rows."""
    devices = []
    seen = set()
    for inst in instances or []:
        iid = str(inst.get("id") or "")
        if not iid or iid in seen:
            continue
        seen.add(iid)
        ready = bool(inst.get("enabled")) and inst.get("provisioning_state") != "draft"
        devices.append({
            "device_id": iid,
            "label": str(inst.get("name") or iid),
            "ready": ready,
            "calls": open_calls(calls_for(iid)),
        })
    return {
        "status": "configured",
        "eventStatus": "connected",
        "canReceiveCalls": any(item["ready"] for item in devices),
        "devices": devices,
    }


def license_status() -> dict:
    """This box is the gateway seat. There is no separate license key to invent."""
    return {"activated": True, "code": "", "edition": "", "client_kind": "gateway"}
