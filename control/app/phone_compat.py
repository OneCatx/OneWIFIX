"""Map the paths iOS and Android actually call onto the mobile facade.

The web board keeps the admin device list. A phone bearer is sent to the mobile
handlers. Settings, OneTools and the device actions both sides call are forwarded
for every caller, because those handlers only exist on the mobile facade.
"""
from __future__ import annotations

import re

_MOBILE = "/api/mobile/v1"
_DEVICE_ACTION = re.compile(
    r"^devices/[^/]+/(overview|network|vowifi(/actions/reconnect)?|flight-mode|"
    r"esim(/.*)?|actions/reboot|calls(/.*)?)$")
_CLIENT_KEEP = ("auth/", "instances", "engine/", "messages", "contacts", "ws")


def socket_token(query) -> str:
    """The phone media socket puts its client token in the access_token query."""
    from urllib.parse import parse_qs
    raw = query.decode("latin1") if isinstance(query, (bytes, bytearray)) else str(query or "")
    token = (parse_qs(raw).get("access_token") or [""])[0].strip()
    return token if token.startswith(("mdd_c1_", "mdd_pair1_")) else ""


def rewrite(path: str, bearer: str = "", method: str = "GET") -> str:
    if not path.startswith("/api/") or path.startswith(_MOBILE + "/") or path == _MOBILE:
        return path
    if str(method or "").upper() == "WEBSOCKET":
        return path
    rest = path[len("/api/"):]
    if rest.startswith("onetools/"):
        return f"{_MOBILE}/{rest}"
    if rest == "calls/push":
        return f"{_MOBILE}/calls/push-endpoint"
    if rest.startswith(("settings/notifications", "settings/preferences", "settings/sms",
                        "settings/vowifi", "settings/security", "settings/https",
                        "settings/developer", "automatic-tasks", "logs/")) \
            or rest in ("system/info", "license", "calls/events", "euicc-catalog",
                        "settings/password"):
        return f"{_MOBILE}/{rest}"
    if _DEVICE_ACTION.fullmatch(rest):
        return f"{_MOBILE}/{rest}"
    token = str(bearer or "")
    if token.startswith("mdd_c1_") and not rest.startswith(_CLIENT_KEEP) \
            and rest != "devices/discovered":
        if rest == "devices" or rest.startswith((
                "devices/", "sms/", "dashboard/", "settings/", "system/", "cards/")):
            return f"{_MOBILE}/{rest}"
    return path
