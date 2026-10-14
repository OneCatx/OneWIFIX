"""MDD-owned iOS delivery, never blocking SIM event ingestion."""
from __future__ import annotations

import logging
import threading
import time

from . import mobile_apns, mobile_pairing

log = logging.getLogger("mdd.mobile_notify")
_accepted: set[tuple[str, int]] = set()
_lock = threading.Lock()


def incoming_call(settings: dict, payload: dict) -> None:
    config = settings.get("apns_voip") or {}
    if not config.get("enabled") or not payload.get("pickup_uri"):
        return
    for endpoint in mobile_pairing.call_endpoints():
        if endpoint["environment"] != config.get("environment"):
            continue
        try:
            mobile_apns.send_voip(config, endpoint["device_token"], payload)
        except Exception as exc:  # noqa: best effort, no credential/body in logs
            log.warning("VoIP APNs delivery failed: %s", type(exc).__name__)


def incoming_sms(settings: dict, event: dict) -> None:
    config = settings.get("apns") or {}
    if not config.get("enabled"):
        return
    sms_id = int(event.get("id") or 0)
    if sms_id <= 0:
        return
    for endpoint in mobile_pairing.sms_endpoints():
        token = endpoint["device_token"]
        if endpoint["environment"] != config.get("environment") or \
                endpoint.get("last_confirmed_sms_id", 0) >= sms_id:
            continue
        key = (token, sms_id)
        with _lock:
            if key in _accepted:
                continue
        try:
            mobile_apns.send_sms(config, token, event)
            with _lock:
                _accepted.add(key)
                if len(_accepted) > 4096:
                    _accepted.clear()
            activity = endpoint.get("live_activity") or {}
            update_token = activity.get("update_token")
            if activity.get("state") == "active" and activity.get("expires_at", 0) > time.time() and update_token:
                try:
                    mobile_apns.send_live_activity_update(config, update_token, event)
                except Exception as exc:  # noqa: alert was accepted; never replay it
                    log.warning("Live Activity APNs delivery failed: %s", type(exc).__name__)
        except mobile_apns.APNsError as exc:
            if exc.reason in ("Unregistered", "BadDeviceToken", "DeviceTokenNotForTopic"):
                mobile_pairing.remove_sms_token(token)
            log.warning("SMS APNs delivery rejected: status=%d reason=%s", exc.status, exc.reason)
        except Exception as exc:  # noqa
            log.warning("SMS APNs delivery failed: %s", type(exc).__name__)
