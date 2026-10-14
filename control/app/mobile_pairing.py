"""Separate, expiring OneTools pairing credential and owned iOS endpoints.

This token has no MDD client or administrator authority. Secrets and push tokens are never
included in normal settings projections or logged by the notification dispatcher.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import threading
import time

from . import config as cfg, store

PATH = os.path.join(cfg.DATA_DIR, "mobile-pairing.json")
TTL = 30 * 24 * 3600
ENDPOINT_TTL = 90 * 24 * 3600
_lock = threading.RLock()
_HEX = re.compile(r"^[0-9a-f]+$")


class PairingError(ValueError):
    pass


def _read() -> dict:
    try:
        with open(PATH, encoding="utf-8") as handle:
            value = json.load(handle)
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def _save(value: dict) -> None:
    os.makedirs(os.path.dirname(PATH), mode=0o700, exist_ok=True)
    temporary = PATH + ".tmp"
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        json.dump(value, handle)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, PATH)


def _digest(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


def issue(*, rotate: bool = False) -> str:
    with _lock:
        state = _read()
        if not rotate and state.get("expires_at", 0) > time.time() and state.get("secret"):
            return state["secret"]
        secret = "mdd_pair1_" + secrets.token_urlsafe(32)
        _save({"secret": secret, "expires_at": int(time.time()) + TTL,
               "endpoints": {}, "calls": state.get("calls") or {}})
        return secret


def verify(secret: str) -> bool:
    if not secret or not secret.startswith("mdd_pair1_"):
        return False
    with _lock:
        state = _read()
        return (state.get("expires_at", 0) > time.time() and
                hmac.compare_digest(str(state.get("secret") or ""), secret))


def _token(value: str, *, fixed: bool) -> str:
    token = str(value or "").strip().lower()
    if not _HEX.fullmatch(token) or len(token) % 2 or (fixed and len(token) != 64) or len(token) > 256:
        raise PairingError("invalid hexadecimal device token")
    return token


def register_sms(secret: str, device_token: str, environment: str,
                 push_to_start_token: str = "", *, mode: str = "") -> dict:
    if not verify(secret):
        raise PairingError("pairing credential expired or revoked")
    token = _token(device_token, fixed=True)
    environment = str(environment or "").strip().lower()
    if environment not in ("sandbox", "production"):
        raise PairingError("invalid APNs environment")
    if mode not in ("", "update_only") or push_to_start_token:
        raise PairingError("only update_only Live Activity protocol is supported")
    start = ""
    with _lock:
        state = _read()
        if not hmac.compare_digest(str(state.get("secret") or ""), secret):
            raise PairingError("pairing credential revoked")
        old = (state.get("endpoints") or {}).get(token) or {}
        record = {"device_token": token, "environment": environment,
                  "push_to_start_token": start, "owner": _digest(secret),
                  "expires_at": int(time.time()) + ENDPOINT_TTL,
                  "last_confirmed_sms_id": int(old.get("last_confirmed_sms_id") or 0)
                  if old.get("owner") == _digest(secret) else 0,
                  "live_activity": old.get("live_activity") if old.get("owner") == _digest(secret)
                  else None}
        record["live_activity"] = record["live_activity"] or _empty_activity()
        state.setdefault("endpoints", {})[token] = record
        _save(state)
        return _receipt(record)


def _empty_activity() -> dict:
    return {"activity_id": "", "update_token": "", "revision": 0,
            "state": "none", "expires_at": 0}


def _receipt(record: dict) -> dict:
    slot = record.get("live_activity") or _empty_activity()
    return {"device_token": record["device_token"], "environment": record["environment"],
            "push_to_start_token": "", "last_confirmed_sms_id": record["last_confirmed_sms_id"],
            "live_activity_protocol": 1, "live_activity_mode": "update_only",
            "server_time": int(time.time()),
            "live_activity": {key: slot[key] for key in ("activity_id", "revision", "state", "expires_at")}}


def register_activity(secret: str, device_token: str, environment: str,
                      expected_activity_id: str, body: dict) -> dict:
    if not verify(secret):
        raise PairingError("pairing credential expired or revoked")
    token = _token(device_token, fixed=True)
    now = int(time.time())
    activity_id = str(body.get("activity_id") or "")
    state_name = str(body.get("state") or "")
    revision = body.get("revision")
    started = body.get("started_at")
    expiry = body.get("expires_at")
    update_token = str(body.get("update_token") or "")
    if (not activity_id or len(activity_id) > 256 or
            state_name not in ("active", "ended", "dismissed") or
            not isinstance(revision, int) or isinstance(revision, bool) or revision <= 0 or
            not isinstance(started, int) or not isinstance(expiry, int) or
            started > now + 60 or expiry <= started or expiry > started + 28800):
        raise PairingError("invalid Live Activity snapshot")
    if state_name == "active":
        _token(update_token, fixed=False)
        if expiry <= now:
            raise PairingError("Live Activity expired")
    elif update_token:
        raise PairingError("ended activity must clear update token")
    with _lock:
        state = _read()
        record = (state.get("endpoints") or {}).get(token)
        if not record or record.get("owner") != _digest(secret) or \
                record.get("environment") != environment or record.get("expires_at", 0) <= now:
            raise PairingError("endpoint not found or expired")
        current = record.get("live_activity") or _empty_activity()
        if current["activity_id"] != str(expected_activity_id or ""):
            raise PairingError("Live Activity compare-and-swap conflict")
        if activity_id == current["activity_id"] and revision <= current["revision"]:
            raise PairingError("Live Activity revision conflict")
        if (activity_id == current["activity_id"] and
                current["state"] in ("ended", "dismissed") and state_name == "active"):
            raise PairingError("Live Activity compare-and-swap conflict")
        if activity_id != current["activity_id"] and state_name != "active":
            raise PairingError("new activity must start active")
        record["live_activity"] = {"activity_id": activity_id, "update_token": update_token,
                                   "revision": revision, "started_at": started,
                                   "expires_at": expiry, "state": state_name}
        _save(state)
        return _receipt(record)


def ack_sms(secret: str, device_token: str, sms_id: int) -> int:
    if not verify(secret):
        raise PairingError("pairing credential expired or revoked")
    token = _token(device_token, fixed=True)
    if not isinstance(sms_id, int) or isinstance(sms_id, bool) or sms_id <= 0:
        raise PairingError("positive sms_id required")
    message = store.get_message(sms_id)
    if not message or message.get("direction") != "in":
        raise PairingError("sms_id is not an inbound message")
    with _lock:
        state = _read()
        record = (state.get("endpoints") or {}).get(token)
        if not record or record.get("owner") != _digest(secret) or record.get("expires_at", 0) <= time.time():
            raise PairingError("endpoint not found or expired")
        record["last_confirmed_sms_id"] = max(int(record.get("last_confirmed_sms_id") or 0), sms_id)
        _save(state)
        return record["last_confirmed_sms_id"]


def sms_endpoints() -> list[dict]:
    with _lock:
        state = _read()
        if state.get("expires_at", 0) <= time.time():
            return []
        owner = _digest(str(state.get("secret") or ""))
        return [dict(value) for value in (state.get("endpoints") or {}).values()
                if value.get("owner") == owner and value.get("expires_at", 0) > time.time()]


def remove_sms_token(token: str) -> None:
    with _lock:
        state = _read()
        if (state.get("endpoints") or {}).pop(token, None) is not None:
            _save(state)


def register_call(client_id: int, device_token: str, environment: str) -> dict:
    token = _token(device_token, fixed=False)
    environment = str(environment or "").strip().lower()
    if environment not in ("sandbox", "production"):
        raise PairingError("invalid APNs environment")
    with _lock:
        state = _read()
        state.setdefault("calls", {})[token] = {
            "device_token": token, "environment": environment,
            "client_id": int(client_id), "expires_at": int(time.time()) + ENDPOINT_TTL}
        _save(state)
        return {"registered": True, "environment": environment}


def call_endpoints() -> list[dict]:
    from . import clients
    active = {record["id"] for record in clients.list_clients()}
    with _lock:
        return [dict(value) for value in (_read().get("calls") or {}).values()
                if value.get("expires_at", 0) > time.time() and value.get("client_id") in active]


def remove_client(client_id: int) -> None:
    with _lock:
        state = _read()
        calls = state.get("calls") or {}
        state["calls"] = {token: value for token, value in calls.items()
                          if int(value.get("client_id") or 0) != client_id}
        if len(state["calls"]) != len(calls):
            _save(state)


def remove_all_clients() -> None:
    with _lock:
        state = _read()
        if state.get("calls"):
            state["calls"] = {}
            _save(state)
