"""APNs HTTP/2 sender for MDD-owned SMS, Live Activity and VoIP endpoints.

Behavior adapted from NEWONE/internal/server/apns_provider.go and apns_token_auth.go
(source commit 6056f50; MIT/NOTICE provenance in docs/onewifi-migration).
"""
from __future__ import annotations

import base64
import json
import logging
import os
import re
import time

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec, utils

log = logging.getLogger("mdd.mobile_apns")
_OTP = re.compile(r"(?<!\d)(\d{4,8})(?!\d)")
_tokens: dict[tuple[str, str, str], tuple[float, str]] = {}


class APNsError(RuntimeError):
    def __init__(self, status: int, reason: str):
        super().__init__(f"APNs HTTP {status}: {reason}")
        self.status, self.reason = status, reason


def validate_provider_settings(settings: dict) -> None:
    """Verify an enabled provider can sign; no network request or private key echo."""
    if not isinstance(settings, dict) or not isinstance(settings.get("enabled"), bool):
        raise ValueError("APNs enabled must be boolean")
    if not settings["enabled"]:
        return
    if settings.get("environment") not in ("sandbox", "production") or not re.fullmatch(
            r"[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+", str(settings.get("bundle_id") or "")):
        raise ValueError("APNs environment and bundle ID are required")
    if not all(re.fullmatch(r"[A-Z0-9]{10}", str(settings.get(key) or ""))
               for key in ("team_id", "key_id")):
        raise ValueError("APNs Team ID and Key ID must be 10 uppercase letters/digits")
    path = str(settings.get("auth_key_path") or "")
    if not os.path.isabs(path) or not os.path.isfile(path):
        raise ValueError("APNs provider key file is unavailable")
    try:
        with open(path, "rb") as handle:
            key = serialization.load_pem_private_key(handle.read(65537), password=None)
    except (OSError, ValueError, TypeError):
        raise ValueError("APNs provider key file is invalid") from None
    if not isinstance(key, ec.EllipticCurvePrivateKey) or not isinstance(key.curve, ec.SECP256R1):
        raise ValueError("APNs provider key must be P-256")


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def provider_authorization(settings: dict) -> str:
    key_id = str(settings.get("key_id") or "").strip()
    team_id = str(settings.get("team_id") or "").strip()
    path = str(settings.get("auth_key_path") or "")
    if not key_id or not team_id or not path:
        raise ValueError("APNs provider key, key ID and team ID are required")
    cache_key = (key_id, team_id, path)
    cached = _tokens.get(cache_key)
    if cached and time.time() - cached[0] < 50 * 60:
        return cached[1]
    with open(path, "rb") as handle:
        key = serialization.load_pem_private_key(handle.read(65537), password=None)
    if not isinstance(key, ec.EllipticCurvePrivateKey) or not isinstance(key.curve, ec.SECP256R1):
        raise ValueError("APNs provider key must be P-256")
    issued = int(time.time())
    signing = _b64(json.dumps({"alg": "ES256", "kid": key_id}, separators=(",", ":")).encode())
    signing += "." + _b64(json.dumps({"iss": team_id, "iat": issued},
                                   separators=(",", ":")).encode())
    r, s = utils.decode_dss_signature(key.sign(signing.encode(), ec.ECDSA(hashes.SHA256())))
    token = signing + "." + _b64(r.to_bytes(32, "big") + s.to_bytes(32, "big"))
    _tokens[cache_key] = (issued, token)
    return token


def _send(settings: dict, token: str, payload: dict, topic: str, kind: str,
          collapse: str, expiry: str, *, client=None) -> None:
    if not settings.get("enabled"):
        raise ValueError("APNs is disabled")
    environment = str(settings.get("environment") or "")
    if environment not in ("sandbox", "production") or not settings.get("bundle_id"):
        raise ValueError("APNs environment and bundle ID are required")
    host = "api.sandbox.push.apple.com" if environment == "sandbox" else "api.push.apple.com"
    headers = {"authorization": "bearer " + provider_authorization(settings),
               "apns-topic": topic, "apns-push-type": kind, "apns-priority": "10",
               "apns-expiration": expiry, "apns-collapse-id": collapse[:64]}
    if client is None:
        with httpx.Client(http2=True, timeout=8, trust_env=False) as actual:
            response = actual.post(f"https://{host}/3/device/{token}", json=payload,
                                   headers=headers)
    else:
        response = client.post(f"https://{host}/3/device/{token}", json=payload,
                               headers=headers)
    if response.http_version != "HTTP/2":
        raise RuntimeError("APNs transport did not negotiate HTTP/2")
    if response.status_code >= 300:
        try:
            reason = str(response.json().get("reason") or "rejected")
        except (ValueError, AttributeError):
            reason = "rejected"
        raise APNsError(response.status_code, reason)


def send_voip(settings: dict, token: str, event: dict, *, client=None) -> None:
    call_id = str(event.get("call_id") or "")
    iid = str(event.get("instance") or "")
    pickup = str(event.get("pickup_uri") or "")
    if not re.fullmatch(r"[0-9]+\.[0-9]+", call_id) or not iid or pickup != "mddpickup-" + call_id:
        raise ValueError("active call identity and pickup URI required")
    payload = {"aps": {"content-available": 1}, "protocol_version": 1,
               "event": "incoming_call", "call_id": call_id, "device_id": iid,
               "device_label": str(event.get("sim_name") or ""),
               "number": str(event.get("from") or ""), "direction": "incoming",
               "pickup_uri": pickup}
    _send(settings, token, payload, str(settings["bundle_id"]) + ".voip", "voip",
          "call-" + call_id, str(int(time.time()) + 30), client=client)


def send_sms(settings: dict, token: str, event: dict, *, client=None) -> None:
    sms_id = int(event.get("id") or 0)
    body = str(event.get("content") or "")
    if sms_id <= 0 or not body:
        raise ValueError("inbound SMS ID and content required")
    code = _OTP.search(body)
    payload = {"aps": {"alert": {"title": "验证码 " + code.group(1) if code else "收到新短信",
                                  "body": code.group(1) if code else body},
                       "sound": "default", "category": "ONEWIFI_SMS"},
               "protocol_version": 1, "sms_id": sms_id, "content": body,
               "number": str(event.get("number") or ""),
               "device_label": str(event.get("deviceLabel") or "")}
    _send(settings, token, payload, str(settings["bundle_id"]), "alert",
          f"sms-{sms_id}", "0", client=client)


def send_live_activity_update(settings: dict, token: str, event: dict, *, client=None) -> bool:
    code = _OTP.search(str(event.get("content") or ""))
    if not code:
        return False
    now = int(time.time())
    payload = {"aps": {"timestamp": now, "event": "update",
                       "content-state": {"code": code.group(1),
                                         "sender": str(event.get("number") or ""),
                                         "device": str(event.get("deviceLabel") or "短信"),
                                         "startedAt": float(now - 978307200)},
                       "stale-date": now + 120}}
    _send(settings, token, payload, str(settings["bundle_id"]) + ".push-type.liveactivity",
          "liveactivity", f"live-{event.get('id')}", "0", client=client)
    return True
