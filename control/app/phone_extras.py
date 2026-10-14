"""Phone pages that sit on the existing line: tasks, logs, access, dial, carrier name.

Nothing here opens a second IMS registration or invents a radio measurement.
"""
from __future__ import annotations

import ipaddress
import logging
import os
from collections import deque
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

_LOGS: deque = deque(maxlen=500)
_LEVELS = ("debug", "info", "warn", "warning", "error")
_TASK_TYPES = {"sms", "call", "public_ip"}
_ENVIRONMENTS = {"vowifi", "cellular"}
_PAYLOAD_KEYS = {"phone", "message", "duration_seconds"}

_NAMES = {
    "att-us": ("AT&T", "US"),
    "three-hk": ("3", "HK"),
    "o2-germany": ("O2", "DE"),
    "o2-uk": ("O2", "GB"),
    "vodafone-uk": ("Vodafone", "GB"),
    "vodafone-germany": ("Vodafone", "DE"),
    "vodafone-netherlands": ("Vodafone", "NL"),
    "ctexcel-ee-uk": ("EE", "GB"),
    "xesim-lebara-vodafone-uk": ("Lebara", "GB"),
    "dito-ph": ("DITO", "PH"),
    "dito-ph-3610": ("DITO", "PH"),
    "dito-ph-618": ("DITO", "PH"),
    "ultra-mobile-us": ("Ultra Mobile", "US"),
    "china-mainland": ("China", "CN"),
    "estonia": ("Estonia", "EE"),
    "csl-hk": ("CSL", "HK"),
}


class PhoneExtraError(ValueError):
    pass


def capture_logs() -> None:
    """Keep the recent control-plane log lines the phone history page reads."""
    root = logging.getLogger("mdd")
    if any(isinstance(item, _Capture) for item in root.handlers):
        return
    root.addHandler(_Capture())


class _Capture(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        try:
            remember(record.levelname, record.getMessage())
        except Exception:
            return


def remember(level: str, message: str) -> None:
    _LOGS.append({
        "time": _iso(datetime.now(timezone.utc)),
        "level": _level(level),
        "message": str(message or "")[:2000],
    })


def history(lines: int = 500, level: str = "", search: str = "") -> dict:
    wanted = _level(level) if str(level or "").strip() else ""
    rank = {"debug": 10, "info": 20, "warn": 30, "error": 40}
    needle = str(search or "").strip().lower()
    try:
        limit = max(1, min(2000, int(lines)))
    except (TypeError, ValueError):
        limit = 500
    chosen = []
    for row in reversed(_LOGS):
        if wanted and rank.get(row["level"], 0) < rank.get(wanted, 0):
            continue
        if needle and needle not in row["message"].lower():
            continue
        chosen.append(row)
        if len(chosen) >= limit:
            break
    return {"logs": list(reversed(chosen))}


def _level(value: str) -> str:
    text = str(value or "info").strip().lower()
    if text == "warning":
        text = "warn"
    return text if text in {"debug", "info", "warn", "error"} else "info"


def carrier_label(profile: dict, mcc: str = "", mnc: str = "") -> dict:
    """Display name for a matched profile. Unmatched lines keep the PLMN and no invented brand."""
    ident = str((profile or {}).get("id") or "")
    name, country = _NAMES.get(ident, ("", ""))
    plmn = ""
    if str(mcc or "").isdigit() and str(mnc or "").isdigit():
        plmn = str(mcc) + str(mnc).zfill(3)
    return {"name": name, "country": country, "plmn": plmn}


def canonicalize_dial(number: str, profile: dict) -> str:
    """Apply a profile's service-number map and national prefix. Codes and +numbers stay."""
    text = str(number or "").strip()
    dial = (profile or {}).get("dial") or {}
    mapped = (dial.get("service_numbers") or {}).get(text)
    if mapped:
        text = str(mapped).strip()
    prefix = str(dial.get("national_prefix") or "")
    code = "".join(ch for ch in str(dial.get("calling_code") or "") if ch.isdigit())
    if (prefix and code and text.startswith(prefix) and not text.startswith("+")
            and text[len(prefix):].isdigit()):
        text = "+" + code + text[len(prefix):]
    return text


def client_allowed(peer: str, settings: dict) -> bool:
    """Internal mode with a list restricts phone clients. An empty list does not lock the box."""
    security = (settings or {}).get("security") or {}
    if str(security.get("mode") or "internal") == "public":
        return True
    cidrs = security.get("allowed_cidrs") or []
    if not cidrs:
        return True
    try:
        address = ipaddress.ip_address(str(peer or ""))
    except ValueError:
        return False
    return any(_network(item) and address in _network(item) for item in cidrs)


def proxy_headers_trusted(settings: dict | None) -> bool:
    """The switch wins. A file saved before the switch existed still trusts its proxy list."""
    security = (settings or {}).get("security") or {}
    if "trust_proxy_headers" in security:
        return bool(security.get("trust_proxy_headers"))
    return bool(security.get("trusted_proxies") or security.get("trusted_proxy_cidrs"))


def trusted_proxy_peer(peer: str, settings: dict | None = None) -> bool:
    """Whether this direct address is a reverse proxy whose forwarding headers count."""
    if not proxy_headers_trusted(settings):
        return False
    security = (settings or {}).get("security") or {}
    trusted = security.get("trusted_proxy_cidrs") or security.get("trusted_proxies") or []
    try:
        address = ipaddress.ip_address(str(peer or ""))
    except ValueError:
        return False
    return any(_network(item) and address in _network(item) for item in trusted)


def effective_client(peer: str, forwarded_for: str = "", settings: dict | None = None) -> str:
    """The caller address. Forwarded hops count only after the direct peer is a trusted proxy.

    The chain is read from the proxy toward the client. Trusted proxies are skipped.
    A header sent by anyone else is ignored, and a hop that is not an address ends the walk.
    """
    direct = str(peer or "").strip()
    if not trusted_proxy_peer(direct, settings):
        return direct
    parts = [part.strip() for part in str(forwarded_for or "").split(",") if part.strip()]
    client = direct
    for address in reversed(parts):
        try:
            ipaddress.ip_address(address)
        except ValueError:
            return direct
        client = address
        if not trusted_proxy_peer(address, settings):
            return address
    return client


def security_view(settings: dict, peer: str = "", forwarded_for: str = "") -> dict:
    security = (settings or {}).get("security") or {}
    trusted = [str(item) for item in security.get("trusted_proxy_cidrs")
               or security.get("trusted_proxies") or []]
    allowed = [str(item) for item in security.get("allowed_cidrs") or []]
    client = effective_client(peer, forwarded_for, settings)
    return {
        "mode": "public" if security.get("mode") == "public" else "internal",
        "allowed_cidrs": allowed,
        "trust_proxy_headers": proxy_headers_trusted(settings),
        "trusted_proxy_cidrs": trusted,
        "client_ip": client,
        "client_allowed": client_allowed(client, settings),
    }


def security_save(current: dict, body: dict) -> dict:
    if not isinstance(body, dict):
        raise PhoneExtraError("security settings must be an object")
    mode = str(body.get("mode") or "internal")
    if mode not in ("public", "internal"):
        raise PhoneExtraError("mode must be public or internal")
    allowed = _cidrs(body.get("allowed_cidrs"))
    trusted = _cidrs(body.get("trusted_proxy_cidrs"))
    trust = body.get("trust_proxy_headers")
    if not isinstance(trust, bool):
        raise PhoneExtraError("trust_proxy_headers must be boolean")
    security = dict((current or {}).get("security") or {})
    security.update({
        "mode": mode,
        "allowed_cidrs": allowed,
        "trust_proxy_headers": trust,
        "trusted_proxy_cidrs": trusted,
        # The active list is empty while the switch is off, including a list left by an
        # older save. Turning the switch back on writes the current list into both fields.
        "trusted_proxies": trusted if trust else [],
    })
    return security


def listen_port(settings: dict | None = None) -> int:
    """The port the TLS listener uses. The environment override matches control/run.py."""
    override = os.environ.get("ONEWIFI_HTTP_PORT", "").strip()
    if override.isdigit() and 1 <= int(override) <= 65535:
        return int(override)
    try:
        port = int((settings or {}).get("http_port"))
    except (TypeError, ValueError):
        return 8443
    return port if 1 <= port <= 65535 else 8443


def https_view(settings: dict) -> dict:
    tls = (settings or {}).get("tls") or {}
    port = listen_port(settings)
    host = str(tls.get("domain") or "").strip()
    https_url = f"https://{host}:{port}" if host else ""
    return {
        "enabled": True,
        "tls_required": True,
        "http_url": "",
        "https_url": https_url,
        "fingerprint": "",
    }


def https_save(current: dict, body: dict) -> dict:
    if not isinstance(body, dict) or not isinstance(body.get("enabled"), bool):
        raise PhoneExtraError("enabled must be boolean")
    security = dict((current or {}).get("security") or {})
    # The listener is always TLS. Remembering "off" would tell the phone it can open HTTP.
    security["https_only"] = True
    return security


def developer_view(settings: dict) -> dict:
    raw = (settings or {}).get("developer") or {}
    return {
        "device_limit": _bounded(raw.get("device_limit"), 64, 1, 64),
        "max_device_limit": 64,
        "sms_hourly_limit": _bounded(raw.get("sms_hourly_limit"), 20, 1, 200),
        "max_sms_hourly_limit": 200,
    }


def developer_save(body: dict) -> dict:
    if not isinstance(body, dict):
        raise PhoneExtraError("developer settings must be an object")
    saved = {}
    if "device_limit" in body:
        saved["device_limit"] = _required_bound(body.get("device_limit"), 1, 64, "device_limit")
    if "sms_hourly_limit" in body:
        saved["sms_hourly_limit"] = _required_bound(
            body.get("sms_hourly_limit"), 1, 200, "sms_hourly_limit")
    if not saved:
        raise PhoneExtraError("device_limit or sms_hourly_limit is required")
    return saved


def tasks_view(blob: dict) -> dict:
    rows = list((blob or {}).get("tasks") or [])
    return {"tasks": rows}


def runs_view(blob: dict, limit: int, offset: int) -> dict:
    rows = list((blob or {}).get("runs") or [])
    start = max(0, int(offset))
    size = max(1, min(200, int(limit)))
    return {"runs": rows[start:start + size], "total": len(rows)}


def save_task(blob: dict, body: dict, task_id: int | None = None) -> tuple[dict, dict]:
    """Insert or replace one task. Returns the stored blob and the task."""
    incoming = dict(body or {})
    incoming.setdefault("enabled", True)
    incoming.setdefault("notify", False)
    incoming.setdefault("interval_days", 1)
    incoming.setdefault("retry_count", 0)
    incoming.setdefault("environment", "vowifi")
    task = _task(incoming, task_id if task_id is not None else _next_id(blob))
    previous = next((row for row in (blob or {}).get("tasks") or []
                     if int(row.get("id") or 0) == task["id"]), None)
    if previous and _same_schedule(previous, task) and previous.get("next_run_at"):
        task["next_run_at"] = previous["next_run_at"]
    rows = [row for row in (blob or {}).get("tasks") or [] if int(row.get("id") or 0) != task["id"]]
    if task_id is not None and not any(int(row.get("id") or 0) == task_id for row in (blob or {}).get("tasks") or []):
        raise PhoneExtraError("task not found")
    rows.append(task)
    rows.sort(key=lambda row: int(row["id"]))
    stored = {"tasks": rows, "runs": list((blob or {}).get("runs") or []),
              "next_id": max(_next_id(blob), task["id"] + 1)}
    return stored, task


def delete_task(blob: dict, task_id: int) -> dict:
    rows = list((blob or {}).get("tasks") or [])
    kept = [row for row in rows if int(row.get("id") or 0) != int(task_id)]
    if len(kept) == len(rows):
        raise PhoneExtraError("task not found")
    return {"tasks": kept, "runs": list((blob or {}).get("runs") or []),
            "next_id": _next_id(blob)}


def task_by_id(blob: dict, task_id: int) -> dict:
    for row in (blob or {}).get("tasks") or []:
        if int(row.get("id") or 0) == int(task_id):
            return row
    raise PhoneExtraError("task not found")


_RUN_STATUSES = {"success", "failed", "started", "accepted_unconfirmed"}


def begin_run(blob: dict, task: dict, output: str, error: str, status: str,
              scheduled: bool = True, record: bool = True,
              now: datetime | None = None) -> tuple[dict, dict]:
    """Record one run and, for a scheduled run, move the next time strictly into the future.

    A manual run leaves the plan where it is. A backlog of many missed days becomes one
    step to the next future time, not one billing action per missed day.
    """
    moment = now or datetime.now(timezone.utc)
    stamp = _iso(moment)
    runs = list((blob or {}).get("runs") or [])
    run = {
        "id": _next_run(blob),
        "task_id": int(task["id"]),
        "device_id": task["device_id"],
        "scheduled_at": task.get("next_run_at") or stamp if scheduled else "",
        "started_at": stamp,
        "finished_at": stamp,
        "status": status if status in _RUN_STATUSES else "failed",
        "manual": not scheduled,
        "attempts": 1,
        "output": str(output or "")[:2000],
        "error": str(error or "")[:2000],
    }
    if record:
        runs.append(run)
    updated = dict(task)
    updated.pop("claim_until", None)
    updated.pop("claim_slot", None)
    if scheduled:
        days = int(task.get("interval_days") or 0)
        if days > 0 and task.get("next_run_at"):
            updated["next_run_at"] = _iso(_future_run(_parse(task["next_run_at"]), moment, days))
        elif days == 0:
            updated["enabled"] = False
            updated["next_run_at"] = None
    tasks = [updated if int(row.get("id") or 0) == int(task["id"]) else row
             for row in (blob or {}).get("tasks") or []]
    stored = {"tasks": tasks, "runs": runs[-200:], "next_id": _next_id(blob)}
    return stored, run


def claim_due(blob: dict, now: datetime | None = None) -> tuple[dict | None, list[dict], list[dict]]:
    """Claim each due task that has not already run for this slot.

    The returned blob is None when nothing was claimed, so the caller can avoid a write.
    Skipped tasks already have a run for this slot and only need their clock moved forward.
    """
    moment = now or datetime.now(timezone.utc)
    tasks = []
    claimed = []
    skipped = []
    wrote = False
    for row in (blob or {}).get("tasks") or []:
        item = dict(row)
        if not _due_row(item, moment) or _claim_active(item, moment):
            tasks.append(item)
            continue
        if _ran_for_slot(blob, item):
            skipped.append(item)
            tasks.append(item)
            continue
        item["claim_until"] = _iso(moment + timedelta(minutes=15))
        item["claim_slot"] = item.get("next_run_at")
        claimed.append(dict(item))
        tasks.append(item)
        wrote = True
    if not wrote:
        return None, claimed, skipped
    stored = {"tasks": tasks, "runs": list((blob or {}).get("runs") or []),
              "next_id": _next_id(blob)}
    return stored, claimed, skipped


def claim_task(blob: dict, task_id: int, now: datetime | None = None) -> tuple[dict, dict] | None:
    """Claim one task for a manual run. None means it is already claimed."""
    moment = now or datetime.now(timezone.utc)
    found = None
    tasks = []
    for row in (blob or {}).get("tasks") or []:
        item = dict(row)
        if int(item.get("id") or 0) == int(task_id):
            if _claim_active(item, moment):
                return None
            item["claim_until"] = _iso(moment + timedelta(minutes=15))
            item["claim_slot"] = "manual"
            found = dict(item)
        tasks.append(item)
    if found is None:
        raise PhoneExtraError("task not found")
    stored = {"tasks": tasks, "runs": list((blob or {}).get("runs") or []),
              "next_id": _next_id(blob)}
    return stored, found


def due_tasks(blob: dict, now: datetime | None = None) -> list[dict]:
    moment = now or datetime.now(timezone.utc)
    ready = []
    for row in (blob or {}).get("tasks") or []:
        if _claim_active(row, moment) or not _due_row(row, moment):
            continue
        ready.append(row)
    return ready


def _task(body: dict, task_id: int) -> dict:
    if not isinstance(body, dict):
        raise PhoneExtraError("task must be an object")
    name = str(body.get("name") or "").strip()
    device = str(body.get("device_id") or "").strip()
    kind = str(body.get("task_type") or "").strip()
    environment = str(body.get("environment") or "").strip()
    if not name or not device or kind not in _TASK_TYPES or environment not in _ENVIRONMENTS:
        raise PhoneExtraError("name, device, type and environment are required")
    if not isinstance(body.get("enabled"), bool) or not isinstance(body.get("notify"), bool):
        raise PhoneExtraError("enabled and notify must be boolean")
    payload = body.get("payload") if isinstance(body.get("payload"), dict) else {}
    payload = {key: payload[key] for key in payload if key in _PAYLOAD_KEYS}
    start = str(body.get("start_date") or "").strip()
    clock = str(body.get("run_time") or "").strip()
    return {
        "id": int(task_id),
        "name": name[:80],
        "enabled": body["enabled"],
        "device_id": device,
        "profile_iccid": str(body.get("profile_iccid") or "").strip(),
        "profile_aid": str(body.get("profile_aid") or "").strip(),
        "task_type": kind,
        "environment": environment,
        "interval_days": _required_bound(body.get("interval_days"), 0, 366, "interval_days"),
        "start_date": start,
        "run_time": clock,
        "timezone": str(body.get("timezone") or "UTC").strip() or "UTC",
        "payload": payload,
        "retry_count": _required_bound(body.get("retry_count"), 0, 5, "retry_count"),
        "notify": body["notify"],
        "next_run_at": _next_run_at(start, clock, str(body.get("timezone") or "UTC")),
    }


def _next_run_at(start: str, clock: str, zone_name: str = "UTC") -> str | None:
    if not start or not clock:
        return None
    zone = _task_zone(zone_name)
    try:
        day = datetime.strptime(start, "%Y-%m-%d")
        hour, minute = clock.split(":", 1)
        local = datetime(day.year, day.month, day.day, int(hour), int(minute), tzinfo=zone)
    except (TypeError, ValueError):
        raise PhoneExtraError("start_date and run_time must be YYYY-MM-DD and HH:MM")
    utc = local.astimezone(timezone.utc)
    back = utc.astimezone(zone)
    if (back.year, back.month, back.day, back.hour, back.minute) != (
            local.year, local.month, local.day, int(hour), int(minute)):
        raise PhoneExtraError("that local time does not exist in this timezone")
    return _iso(utc)


def _cidrs(value) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, list) or len(value) > 32:
        raise PhoneExtraError("CIDR list is invalid")
    cleaned = []
    for item in value:
        network = _network(item)
        if network is None:
            raise PhoneExtraError(f"invalid CIDR {item!r}")
        cleaned.append(str(network))
    return cleaned


def _network(value):
    try:
        return ipaddress.ip_network(str(value).strip(), strict=False)
    except ValueError:
        return None


def _bounded(value, default: int, low: int, high: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return default
    return min(high, max(low, number))


def _required_bound(value, low: int, high: int, name: str) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        raise PhoneExtraError(f"{name} must be an integer")
    if not low <= number <= high:
        raise PhoneExtraError(f"{name} must be {low}..{high}")
    return number


def _next_id(blob: dict) -> int:
    return max([1, *[int(row.get("id") or 0) + 1 for row in (blob or {}).get("tasks") or []]])


def _next_run(blob: dict) -> int:
    return max([1, *[int(row.get("id") or 0) + 1 for row in (blob or {}).get("runs") or []]])


def system_info(version: str) -> dict:
    """The phone only loads HTTPS and developer pages when developer is true."""
    return {"version": str(version or "OneWIFI"), "build_time": "", "developer": True}


def password_fields(body: dict) -> tuple[str, str]:
    if not isinstance(body, dict):
        raise PhoneExtraError("password body is invalid")
    new = str(body.get("new_password") or "")
    confirm = body.get("confirm_password")
    if confirm is None or str(confirm) != new:
        raise PhoneExtraError("passwords do not match")
    old = str(body.get("old_password") or body.get("current_password") or "")
    return old, new


def update_view(result: dict | None) -> dict:
    """Empty message lets the phone say 发现新版本 / 当前已是最新 itself."""
    result = result or {}
    return {
        "available": bool(result.get("update_available")),
        "version": str(result.get("latest") or ""),
        "current_version": str(result.get("current") or ""),
        "message": str(result.get("error") or ""),
        "repository": str(result.get("repository") or ""),
    }


def percent(value) -> float:
    """Host meters the phone accepts are 0..100. A sample above that is clamped."""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.0
    if number != number or number < 0:
        return 0.0
    return 100.0 if number > 100 else number


def execution_plan(task: dict, instance: dict | None) -> dict:
    """Decide the one action a task may take before any message or call is sent."""
    kind = str((task or {}).get("task_type") or "")
    if kind == "public_ip":
        return {"action": "fail", "error": "public ip is not measured for a line", "retry": False}
    block = profile_block(task, instance)
    if block:
        return {"action": "fail", "error": block, "retry": False}
    if kind == "sms":
        transport = str((task or {}).get("environment") or "")
        if transport not in _ENVIRONMENTS:
            return {"action": "fail", "error": "environment is not supported", "retry": False}
        return {"action": "sms", "transport": transport, "retry": False}
    if kind == "call":
        if str((task or {}).get("environment") or "") == "cellular":
            return {"action": "fail", "error": "cellular calls are not placed by an automatic task",
                    "retry": False}
        return {"action": "call", "duration": duration_seconds(task), "retry": True}
    return {"action": "fail", "error": "unsupported task", "retry": False}


def profile_block(task: dict, instance: dict | None) -> str:
    """A saved card must still be the card on the line. An empty card means the current one."""
    wanted_iccid = str((task or {}).get("profile_iccid") or "").strip()
    wanted_aid = str((task or {}).get("profile_aid") or "").strip()
    if not wanted_iccid and not wanted_aid:
        return ""
    current = instance or {}
    current_iccid = str(current.get("iccid") or "").strip()
    current_aid = str(current.get("aid") or current.get("aid_hex") or "").strip()
    if wanted_iccid and wanted_iccid != current_iccid:
        return "profile does not match the line"
    if wanted_aid and wanted_aid.lower() != current_aid.lower():
        return "profile does not match the line"
    return ""


def duration_seconds(task: dict) -> int:
    if str((task or {}).get("task_type") or "") != "call":
        return 0
    try:
        number = int(((task or {}).get("payload") or {}).get("duration_seconds") or 0)
    except (TypeError, ValueError):
        return 0
    return min(4 * 60 * 60, max(0, number))


def classify_sms(result: dict | None) -> tuple[str, str, str]:
    result = result or {}
    if result.get("uncertain"):
        return "accepted_unconfirmed", "sms accepted, delivery not confirmed", ""
    if result.get("ok"):
        return "success", "sms accepted", ""
    return "failed", "", str(result.get("error") or "sms failed")


def classify_call(result: dict | None) -> tuple[str, str, str]:
    result = result or {}
    if result.get("ok"):
        return "started", str(result.get("call_id") or ""), ""
    return "failed", "", str(result.get("error") or result.get("detail") or "call failed")


def note_run(task: dict, status: str) -> None:
    if not (task or {}).get("notify"):
        return
    remember("info", f"automatic task {task.get('name') or task.get('id')}: {status}")


def _task_zone(name: str):
    cleaned = str(name or "UTC").strip() or "UTC"
    if cleaned in {"UTC", "Etc/UTC", "Etc/GMT", "GMT"}:
        return timezone.utc
    try:
        return ZoneInfo(cleaned)
    except ZoneInfoNotFoundError:
        raise PhoneExtraError("timezone is not recognized")


def _same_schedule(previous: dict, task: dict) -> bool:
    return (str(previous.get("start_date") or "") == str(task.get("start_date") or "")
            and str(previous.get("run_time") or "") == str(task.get("run_time") or "")
            and str(previous.get("timezone") or "UTC") == str(task.get("timezone") or "UTC")
            and int(previous.get("interval_days") or 0) == int(task.get("interval_days") or 0))


def _future_run(current: datetime, now: datetime, days: int) -> datetime:
    step = timedelta(days=max(1, int(days)))
    if current > now:
        return current
    jumps = int((now - current).total_seconds() // step.total_seconds()) + 1
    return current + jumps * step


def _due_row(row: dict, moment: datetime) -> bool:
    if not row.get("enabled") or not row.get("next_run_at"):
        return False
    try:
        return _parse(row["next_run_at"]) <= moment
    except ValueError:
        return False


def _claim_active(row: dict, moment: datetime) -> bool:
    raw = row.get("claim_until")
    if not raw:
        return False
    try:
        return _parse(raw) > moment
    except ValueError:
        return False


def _ran_for_slot(blob: dict, task: dict) -> bool:
    slot = str(task.get("next_run_at") or "")
    if not slot:
        return False
    for run in (blob or {}).get("runs") or []:
        if run.get("manual"):
            continue
        if (int(run.get("task_id") or 0) == int(task.get("id") or 0)
                and str(run.get("scheduled_at") or "") == slot):
            return True
    return False


def _iso(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse(value: str) -> datetime:
    return datetime.strptime(str(value), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
