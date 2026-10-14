"""Explicit projections into the retained OneWIFI Flutter page DTOs.

The line ID is always the MDD instance ID. A physical reader/modem is optional metadata,
never a substitute SIM authority or a callable identifier.
"""
from __future__ import annotations


def _text(value) -> str:
    return str(value) if value is not None else ""


def device(inst: dict, status: dict, hardware: dict | None = None) -> dict:
    iid = _text(inst["id"])
    hardware = hardware or {}
    cellular = hardware.get("cellular") or {}
    registration = str(cellular.get("registration") or "").lower()
    radio_registered = (registration in {"home", "roaming", "registered"}
                        if registration and registration != "unknown" else None)
    cap = hardware.get("capabilities") or {}
    vowifi = cap.get("vowifi") or {}
    state = _text(status.get("state")).upper()
    present = bool(hardware.get("present"))
    enabled = bool(inst.get("enabled", True))
    registered = enabled and present and state in ("OK", "REGISTERED")
    runtime_phase = ("ims_ready" if registered else "failed" if state in ("ERROR", "FAILED")
                     else "stopping" if state == "STOPPED" else "idle")
    phase = ("missing" if not present else "ready" if registered else
             "degraded" if state in ("ERROR", "FAILED") else "discovered")
    iccid, imsi, msisdn = (_text(inst.get(key)) for key in ("iccid", "imsi", "msisdn"))
    modem = {
        "operator": _text(cellular.get("operator")), "native_mcc": _text(inst.get("mcc")),
        "native_mnc": _text(inst.get("mnc")), "native_spn": "", "operator_country_code": "",
        "card_mcc": _text(inst.get("mcc")), "card_mnc": _text(inst.get("mnc")),
        "card_country": "", "home_carrier_name": "", "home_carrier_plmn": "",
        "home_carrier_country_code": "", "blocked_reason": "", "network_mode": "",
        "radio_band": "", "reg_status_text": _text(cellular.get("registration")),
        "phone_number_source": "mdd", "model": _text(hardware.get("model")),
        "imei": _text(hardware.get("imei")), "iccid": iccid, "imsi": imsi,
        "phone_number": msisdn, "service_blocked": False,
        "sim_inserted": bool(present and iccid), "radio_channel": None,
        "signal_dbm": cellular.get("signal_dbm"), "signal_sinr": cellular.get("signal_sinr"),
        "reg_status": cellular.get("reg_status"),
    }
    runtime = {
        "device_id": iid, "phase": runtime_phase, "enabled": enabled,
        "active": registered, "dataplane_mode": "mdd", "iccid": iccid, "imsi": imsi,
        "sim_ready": bool(present and iccid), "access_ready": registered,
        "tunnel_ready": registered, "ims_ready": registered, "sms_ready": registered,
        "reg_status": cellular.get("reg_status"), "reg_status_text": _text(status.get("label")),
        "network_mode": "", "local_phone": msisdn, "phone_number_source": "mdd",
        "last_error_class": _text(status.get("reason_code")),
        "last_error": _text(status.get("reason")), "last_reason": _text(status.get("reason")),
        "updated_at": "", "carrier_profile_from": None,
    }
    cell_desired = bool((cap.get("cellular") or {}).get("desired"))
    flight = bool((cap.get("flight") or {}).get("desired"))
    connected = bool(cellular.get("data_active")) if present else False
    return {
        "id": iid, "name": _text(inst.get("name")) or iid,
        "reader": _text(hardware.get("reader")),
        "callable": not iid.startswith("reader:") and bool(inst.get("provisioning_state") != "draft"),
        "device_type": "usb_sim_reader" if hardware.get("device_type") != "modem" else "pcie_ec20_ec25",
        "model": _text(hardware.get("model")), "running": registered, "healthy": registered,
        "control_online": present, "physical_present": present, "worker_running": registered,
        "data_connected": connected, "radio_registered": radio_registered,
        "sms_enabled": enabled, "network_enabled": cell_desired,
        "developer_enabled": False, "network_connected": connected,
        "vowifi_enabled": enabled and bool(vowifi.get("desired", True)),
        "vowifi_active": registered, "flight_mode": flight,
        "radio_live_ok": cellular.get("radio_live_ok"), "lifecycle_phase": phase,
        "lifecycle_reason": _text(status.get("reason")),
        "proxy_port": 0, "public_ip": "", "private_ip": _text(cellular.get("ip")),
        "interface": _text(cellular.get("interface")),
        "esim_transport": "", "local_phone": msisdn, "phone_number_source": "mdd",
        "registration_state_label": _text(status.get("label")), "modem": modem,
        "vowifi_runtime": runtime, "esim_switch": {"active": False, "steps": []},
        "at_port": "", "audio_device": "", "backend_mode": "mdd", "control_device": "",
        "operator": modem["operator"], "signal_dbm": modem["signal_dbm"],
        "network_mode": modem["network_mode"], "network_duplex": "",
    }


def sms_message(row: dict) -> dict:
    return {"id": int(row["id"]), "message_id": f"mdd:{row['id']}",
            "peer": _text(row.get("peer")), "direction": "outbound" if row.get("direction") in ("out", "outbound") else "inbound",
            "content": _text(row.get("body")), "timestamp": row.get("ts")}


def sms_outcome(result: dict) -> dict:
    # A successful MDD submit does not prove handset delivery; retries are not safe once sent.
    accepted = bool(result.get("ok"))
    total, submitted = result.get("parts_total"), result.get("parts_accepted")
    if not (isinstance(total, int) and not isinstance(total, bool) and total >= 0
            and isinstance(submitted, int) and not isinstance(submitted, bool)
            and 0 <= submitted <= total):
        total = submitted = None
    return {"outcome": "accepted_unconfirmed" if accepted else "failed",
            "parts_total": total, "parts_accepted": submitted,
            "retry_safe": False}


def esim_groups(ses: list[dict]) -> list[dict]:
    groups = []
    for se in ses:
        profiles = []
        for item in se.get("profiles") or []:
            state = str(item.get("profileState") or "").lower()
            if state not in ("enabled", "disabled"):
                raise ValueError("unknown eSIM profile state")
            profiles.append({"iccid": _text(item.get("iccid")),
                             "state": 1 if state == "enabled" else 0,
                             "stateText": state, "classText": _text(item.get("profileClass")),
                             "name": _text(item.get("profileName")),
                             "serviceProviderName": _text(item.get("serviceProviderName")),
                             "profileNickname": _text(item.get("profileNickname")),
                             "locked": bool(item.get("locked"))})
        groups.append({"eid": _text(se.get("eid")), "aidHex": _text(se.get("aid")),
                       "profiles": profiles})
    return groups


def esim_overview(ses: list[dict]) -> dict:
    return {"chipInfo": {"eids": [{"eid": _text(se.get("eid")),
                                     "aid": _text(se.get("aid")),
                                     "manufacturer": "",
                                     "freeNvramBytes": se.get("freeSpace")}
                                    for se in ses], "firmware": ""} if ses else None,
            "profiles": esim_groups(ses)}


def esim_progress(event: dict) -> dict:
    kind = str(event.get("event") or "")
    step = "done" if kind == "completed" else "error" if kind == "error" else str(
        event.get("step") or kind or "progress")
    message = str(event.get("error") or event.get("step") or kind)
    return {"step": step, "msg": message, "pct": 100 if kind == "completed" else 0}
