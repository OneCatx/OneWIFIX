"""eUICC nameplates the phone reads from GET /api/euicc-catalog.

The rules are the retail SKU table already used by the web board, reduced to the
fields the phone matches on: id, nameplate, EID prefixes, SAS.
"""
from __future__ import annotations

import json
from pathlib import Path

_PATH = Path(__file__).with_name("euicc_catalog.json")


def view() -> dict:
    try:
        payload = json.loads(_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"rules": []}
    rules = []
    for item in payload.get("rules") or []:
        if not isinstance(item, dict):
            continue
        nameplate = str(item.get("nameplate") or "").strip()
        if not nameplate:
            continue
        rules.append({
            "id": str(item.get("id") or "").strip(),
            "nameplate": nameplate,
            "eidPrefixes": _strings(item.get("eidPrefixes")),
            "sas": _strings(item.get("sas")),
        })
    return {"rules": rules}


def _strings(value) -> list[str]:
    if not isinstance(value, list):
        return []
    return [text for text in (str(item).strip() for item in value) if text]
