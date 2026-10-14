"""VoWiFi tunnel MTU.

The engine default is 1400. Compatibility mode lowers it to 1280, the floor the
installer already accepts. An explicit SWU_TUN_MTU in the process environment wins,
so an operator override is not silently replaced.
"""
from __future__ import annotations

import os

DEFAULT = "1400"
COMPATIBLE = "1280"


def tunnel_mtu(settings: dict | None) -> str:
    explicit = os.environ.get("SWU_TUN_MTU", "").strip()
    if explicit:
        return explicit
    vowifi = (settings or {}).get("vowifi") or {}
    return COMPATIBLE if vowifi.get("mtu_compatibility") else DEFAULT


def view(settings: dict | None) -> dict:
    vowifi = (settings or {}).get("vowifi") or {}
    return {"mtu_compatibility": bool(vowifi.get("mtu_compatibility"))}


def patch(settings: dict | None, body: dict) -> dict:
    if not isinstance(body, dict) or set(body) != {"mtu_compatibility"} \
            or not isinstance(body.get("mtu_compatibility"), bool):
        raise ValueError("mtu_compatibility must be boolean")
    previous = dict((settings or {}).get("vowifi") or {})
    previous["mtu_compatibility"] = body["mtu_compatibility"]
    return {"vowifi": previous}
