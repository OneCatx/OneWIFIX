"""Inbox reads shared by the web console and the phone API.

Opening a thread marks it read. A single-message delete and a JSON export
carry the message text only — never a PIN or an authentication secret.
"""

from __future__ import annotations

from . import store


class SmsInboxError(ValueError):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def list_contacts(owner: int, instances: list[dict], device_id: str = "",
                  limit: int = 100) -> list[dict]:
    chosen = str(device_id or "")
    rows = []
    for inst in instances or []:
        iid = str(inst["id"])
        if chosen and chosen != "all" and iid != chosen:
            continue
        unread = store.unread_counts(int(owner), iid)
        for thread in store.list_threads(iid):
            peer = str(thread["peer"])
            rows.append({
                "peer": peer,
                "device_id": iid,
                "device_name": str(inst.get("name") or iid),
                "local_phone": str(inst.get("msisdn") or ""),
                "iccid": str(inst.get("iccid") or ""),
                "imsi": str(inst.get("imsi") or ""),
                "last_content": str(thread.get("last_body") or ""),
                "message_count": int(thread["n"]),
                "unread_count": int(unread.get(peer) or 0),
                "last_timestamp": thread.get("last_ts"),
                "direction": "outbound" if thread.get("last_kind") == "out" else "inbound",
            })
    rows.sort(key=lambda row: int(row["last_timestamp"] or 0), reverse=True)
    return rows[:max(1, min(int(limit), 500))]


def open_thread(owner: int, instance: dict, peer: str, before_id: int | None = None,
                limit: int = 100, iccid: str = "", imsi: str = "") -> list[dict]:
    peer = str(peer or "").strip()
    if not peer:
        raise SmsInboxError("peer required", 422)
    if ((iccid and iccid != str(instance.get("iccid") or ""))
            or (imsi and imsi != str(instance.get("imsi") or ""))):
        raise SmsInboxError("line identity changed", 409)
    iid = str(instance["id"])
    rows = store.list_messages_page(iid, peer, before_id, max(1, min(int(limit), 500)))
    store.mark_thread_read(int(owner), iid, peer)
    return rows


def delete_message(message_id) -> int:
    try:
        mid = int(message_id)
    except (TypeError, ValueError):
        raise SmsInboxError("message not found", 404) from None
    row = store.message_by_id(mid)
    if not row:
        raise SmsInboxError("message not found", 404)
    return store.delete_messages(str(row["instance"]), [mid])


def export_messages(instances: list[dict], device_id: str = "", limit: int = 2000) -> list[dict]:
    """Message text for a backup file. No PIN, no authentication secret."""
    chosen = str(device_id or "")
    cap = max(1, min(int(limit), 2000))
    rows = []
    for inst in instances or []:
        iid = str(inst["id"])
        if chosen and chosen != "all" and iid != chosen:
            continue
        for message in store.recent_messages(iid, cap):
            rows.append({
                "id": int(message["id"]),
                "device_id": iid,
                "peer": str(message.get("peer") or ""),
                "direction": "outbound" if message.get("direction") in ("out", "outbound") else "inbound",
                "content": str(message.get("body") or ""),
                "timestamp": message.get("ts"),
            })
    rows.sort(key=lambda row: (int(row["timestamp"] or 0), int(row["id"])), reverse=True)
    return rows[:cap]
