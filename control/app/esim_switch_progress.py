"""Eleven-phase eSIM switch progress.

The card still moves through five steps. The phase names are the finer ladder
from the older OneWIFI switch, so a failure can say whether it can be retried.
"""

from __future__ import annotations

import threading


STEPS = (
    {"key": "stop", "label": "停网"},
    {"key": "flight", "label": "飞行"},
    {"key": "write", "label": "写卡"},
    {"key": "check", "label": "校验"},
    {"key": "back", "label": "恢复"},
)

PHASES = (
    {"key": "radio_held", "label": "RadioHeld", "recoverable": True},
    {"key": "identity_generation", "label": "IdentityGeneration", "recoverable": True},
    {"key": "if_token", "label": "IfToken", "recoverable": True},
    {"key": "ims_begin_issued", "label": "IMSBeginIssued", "recoverable": True},
    {"key": "switch_after", "label": "SwitchAfter", "recoverable": True},
    {"key": "switch_callbacks", "label": "SwitchCallbacks", "recoverable": True},
    {"key": "degraded_with_error", "label": "DegradedWithError", "recoverable": True},
    {"key": "failed", "label": "Failed", "recoverable": True},
    {"key": "failed_internal", "label": "FailedInternal", "recoverable": False},
    {"key": "failed_with_error", "label": "FailedWithError", "recoverable": True},
    {"key": "failure_ims_recovery", "label": "FailureIMSRecovery", "recoverable": True},
)

_STEP_PHASE = {
    1: "radio_held",
    2: "identity_generation",
    3: "switch_after",
    4: "switch_callbacks",
    5: "failure_ims_recovery",
}

_lock = threading.Lock()
_progress: dict[str, dict] = {}


def _ids(*ids: str) -> list[str]:
    seen = []
    for value in ids:
        key = str(value or "").strip()
        if key and key not in seen:
            seen.append(key)
    return seen


def _blank() -> dict:
    return {"step": 0, "status": "", "failed": False, "phase": "",
            "recoverable": True, "fail_reason": ""}


def _phase_for_step(step: int) -> str:
    return _STEP_PHASE.get(step, "radio_held")


def begin(*ids: str) -> None:
    row = {"step": 1, "status": "running", "failed": False,
           "phase": _phase_for_step(1), "recoverable": True, "fail_reason": ""}
    with _lock:
        for key in _ids(*ids):
            _progress[key] = dict(row)


def advance(step: int, *ids: str) -> None:
    step = min(5, max(1, int(step)))
    with _lock:
        for key in _ids(*ids):
            current = _progress.get(key) or _blank()
            if current["step"] < step:
                current["step"] = step
            current["status"] = "running"
            current["failed"] = False
            current["phase"] = _phase_for_step(current["step"])
            current["recoverable"] = True
            current["fail_reason"] = ""
            _progress[key] = current


def complete(*ids: str) -> None:
    row = {"step": 5, "status": "done", "failed": False,
           "phase": "switch_callbacks", "recoverable": True, "fail_reason": ""}
    with _lock:
        for key in _ids(*ids):
            _progress[key] = dict(row)


def fail(reason: str, *ids: str) -> None:
    reason = str(reason or "").strip()
    with _lock:
        for key in _ids(*ids):
            current = _progress.get(key) or _blank()
            if current["step"] < 1:
                current["step"] = 1
            current["status"] = "failed"
            current["failed"] = True
            current["fail_reason"] = reason
            current["phase"] = "failed_with_error"
            current["recoverable"] = True
            if reason in {"rolled_back", "rollback_failed"}:
                current["phase"] = "failure_ims_recovery"
                current["recoverable"] = True
            if current["step"] in {3, 4} and reason in {"write_rejected", "identity_mismatch"}:
                current["phase"] = "failed_internal"
                current["recoverable"] = False
            if current["step"] == 5:
                if current["phase"] != "failure_ims_recovery":
                    current["phase"] = "failure_ims_recovery"
                if reason == "identity_mismatch":
                    current["phase"] = "failed_internal"
                    current["recoverable"] = False
            _progress[key] = current


def snapshot(switch_id: str = "") -> dict:
    current = _blank()
    key = str(switch_id or "").strip()
    with _lock:
        if key and key in _progress:
            current = dict(_progress[key])
    steps = []
    for index, step in enumerate(STEPS, start=1):
        ready = current["step"] > index or (current["step"] == index and current["status"] == "done")
        steps.append({
            "key": step["key"],
            "label": step["label"],
            "ready": ready,
            "pending": current["status"] == "running" and current["step"] == index,
            "failed": current["failed"] and current["step"] == index,
        })
    body = {
        "active": current["status"] == "running",
        "step": current["step"],
        "status": current["status"],
        "steps": steps,
        "phase": current["phase"],
        "phases": [dict(phase) for phase in PHASES],
        "recoverable": current["recoverable"] if current["failed"] else True,
    }
    if current["failed"]:
        body["fail_reason"] = current["fail_reason"]
    return body
