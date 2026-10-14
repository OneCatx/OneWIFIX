"""In-process MDD page adapters for the retained native clients.

Only routes with a real MDD read/operation are implemented. Unknown legacy controls return
501 instead of a convincing empty success. Gate authorization happens before these handlers.
"""
from __future__ import annotations

import asyncio
import json
import re
import time
from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse

from . import (cellular_sms, config as cfg, gate, handset_audio, mobile_dto, mobile_pairing,
               mobile_settings, phone_calls, phone_extras, store, vowifi_mtu)
from .ami import target_channel
from .version import VERSION


def install(app, mdd):
    router = APIRouter(prefix="/api/mobile/v1")

    def line(iid):
        inst = cfg.get_instance(str(iid))
        if not inst:
            raise HTTPException(404, "instance not found")
        return inst

    async def rows():
        hardware = await mdd._unified_devices()
        by_instance = {str(item["instance_id"]): item for item in hardware
                       if item.get("instance_id")}
        configured = [mobile_dto.device(inst, mdd._cached_line_status(inst),
                                        by_instance.get(str(inst["id"])))
                      for inst in cfg.list_instances()]
        unbound = [mobile_dto.device(
            {"id": f"reader:{item['id']}", "name": item.get("name") or "Reader",
             "enabled": False, "iccid": (mdd.hub.cards.get(str(item.get("reader") or "")) or {}).get("iccid") or ""},
            {"state": "STOPPED", "label": "Not provisioned", "reason": "Provision a line"}, item)
            for item in hardware if not item.get("instance_id")]
        for item in unbound:
            item["callable"] = False
            item["reader_id"] = item["id"][7:]
        return configured + unbound

    @router.post("/devices")
    def register_device(body: dict):
        return mdd._register_discovered_device(body)

    @router.get("/devices")
    async def devices():
        items = await rows()
        # MDD does not impose OneWIFI's licensed device quota.
        # The phone DTO rejects null. This is a display ceiling, not a license.
        return {"data": {"device_limit": phone_extras.developer_view(cfg.get_settings())["device_limit"],
                         "devices": items}}

    @router.get("/devices/{iid}/overview")
    async def device_overview(iid: str):
        item = next((row for row in await rows() if row["id"] == iid), None)
        if item is None:
            raise HTTPException(404, "device not found")
        return {"data": {"devices": [item]}}

    @router.get("/dashboard/devices")
    async def dashboard_devices():
        return {"data": await rows()}

    @router.get("/dashboard/host")
    async def dashboard_host():
        snapshot = mdd.hub.host_snapshot or mdd.sysinfo.collect(
            cfg.DATA_DIR, include_docker_storage=False)
        memory = snapshot.get("memory") or {}
        disk = snapshot.get("disk") or {}
        total_mb = max(0, int(memory.get("total_mb") or 0))
        memory_percent = phone_extras.percent(memory.get("used_percent"))
        used_mb = round(total_mb * memory_percent / 100)
        return {"data": {"host": {"cpu_model": "", "board_model": str(snapshot.get("model") or ""),
                                   "memory_model": "", "disk_model": ""},
                         "perf": {"cpu_percent": phone_extras.percent(snapshot.get("cpu_percent")),
                                  "memory_percent": memory_percent,
                                  "memory_used_bytes": used_mb * 1024 * 1024,
                                  "memory_total_bytes": total_mb * 1024 * 1024,
                                  "disk_percent": phone_extras.percent(disk.get("used_percent")),
                                  "disk_used_bytes": int(disk.get("used_bytes") or 0),
                                  "disk_total_bytes": int(disk.get("total_bytes") or 0),
                                  "net_rx_bps": 0.0,
                                  "net_tx_bps": 0.0}}}

    async def physical_for(iid: str) -> dict:
        physical = await mdd._unified_devices()
        item = next((row for row in physical if str(row.get("instance_id") or "") == iid), None)
        if item is None:
            line(iid)
            raise HTTPException(409, "line has no attached physical reader")
        return item

    async def set_capability(iid: str, field: str, body: dict):
        if not isinstance(body.get("enabled"), bool):
            raise HTTPException(422, "enabled must be boolean")
        item = await physical_for(iid)
        result = await mdd.api_device_capabilities(item["id"], {field: body["enabled"]})
        return {"data": {"enabled": body["enabled"], "actual":
                         (result.get("capabilities") or {}).get(
                             {"cellular_enabled": "cellular", "vowifi_enabled": "vowifi",
                              "flight_mode": "flight"}[field], {}).get("actual")}}

    @router.patch("/devices/{iid}/network")
    async def network(iid: str, body: dict):
        return await set_capability(iid, "cellular_enabled", body)

    @router.patch("/devices/{iid}/vowifi")
    async def vowifi(iid: str, body: dict):
        return await set_capability(iid, "vowifi_enabled", body)

    @router.patch("/devices/{iid}/flight-mode")
    async def flight_mode(iid: str, body: dict):
        return await set_capability(iid, "flight_mode", body)

    @router.post("/devices/{iid}/vowifi/actions/reconnect")
    async def reconnect(iid: str):
        line(iid)
        await physical_for(iid)
        return {"data": await mdd.api_instance_start(iid)}

    @router.post("/devices/{iid}/actions/reboot")
    async def reboot_device(iid: str):
        line(iid)
        if await asyncio.to_thread(mdd.engine.is_running, iid):
            await mdd._stop_instance(iid, "user_requested")
        await mdd.api_instance_start(iid)
        return {"data": {"ok": True, "id": iid}}

    @router.get("/sms/contacts")
    async def sms_contacts(request: Request, device_id: str = "", limit: int = 100):
        return {"data": mdd.sms_inbox.list_contacts(
            mdd._owner(request), cfg.list_instances(), device_id, limit)}

    @router.get("/sms/thread")
    def sms_thread(request: Request, device_id: str, peer: str, before_id: int | None = None,
                   limit: int = 100, iccid: str = "", imsi: str = ""):
        try:
            rows = mdd.sms_inbox.open_thread(
                mdd._owner(request), line(device_id), peer, before_id, limit, iccid, imsi)
        except mdd.sms_inbox.SmsInboxError as exc:
            raise HTTPException(exc.status, str(exc)) from exc
        return {"data": [mobile_dto.sms_message(row) for row in rows]}

    @router.delete("/sms/messages/{message_id}")
    def sms_message_delete(message_id: str):
        try:
            deleted = mdd.sms_inbox.delete_message(message_id)
        except mdd.sms_inbox.SmsInboxError as exc:
            raise HTTPException(exc.status, str(exc)) from exc
        return {"data": {"deleted": deleted}}

    @router.get("/cards/{iccid}/policy")
    def card_policy(iccid: str):
        return mdd.api_card_policy(iccid)

    @router.put("/cards/{iccid}/policy")
    async def card_policy_save(iccid: str, request: Request):
        return await mdd.api_card_policy_save(iccid, request)

    @router.delete("/sms/thread")
    def sms_delete(device_id: str, peer: str, iccid: str = "", imsi: str = ""):
        inst = line(device_id)
        if (iccid and iccid != str(inst.get("iccid") or "")) or (
                imsi and imsi != str(inst.get("imsi") or "")):
            raise HTTPException(409, "line identity changed")
        return {"data": {"deleted": store.delete_thread(device_id, peer)}}

    @router.post("/sms/send")
    async def sms_send(body: dict):
        iid = str(body.get("device_id") or "")
        line(iid)
        to = str(body.get("phone") or "").strip()
        message = body.get("message")
        if not to or not isinstance(message, str) or not message:
            raise HTTPException(422, "recipient and non-empty message body are required")
        limit = phone_extras.developer_view(cfg.get_settings())["sms_hourly_limit"]
        if store.count_outbound_since(int(time.time()) - 3600) >= limit:
            raise HTTPException(429, "hourly SMS limit reached")
        result = await mdd.send_sms_on_line(iid, to, message)
        if result.get("unavailable"):
            raise HTTPException(409, result.get("error") or "SMS unavailable")
        if not result.get("ok") and not result.get("uncertain"):
            return JSONResponse({"data": mobile_dto.sms_outcome(result)}, status_code=502)
        outcome = mobile_dto.sms_outcome(result)
        if result.get("uncertain"):
            outcome["outcome"] = "accepted_unconfirmed"
        return {"data": outcome}

    async def reader_for(identity: str) -> tuple[str, int]:
        physical = await mdd._unified_devices()
        if identity.startswith("reader:"):
            item = next((row for row in physical if row["id"] == identity[7:]
                         and not row.get("instance_id")), None)
        else:
            inst = line(identity)
            item = next((row for row in physical if str(row.get("instance_id") or "") == identity), None)
            # A stale physical association must not operate another inserted SIM.
            if item and inst.get("iccid"):
                card = mdd.hub.cards.get(str(item.get("reader") or "")) or {}
                if str(card.get("iccid") or "") != str(inst["iccid"]):
                    raise HTTPException(409, "line SIM identity changed")
        if not item or not item.get("present") or not item.get("reader"):
            raise HTTPException(409, "no live MDD reader bound to this identity")
        return await asyncio.to_thread(mdd._esim_resolve_reader, None, item["reader"])

    def _reader_args(name: str, index: int, body: dict | None = None) -> dict:
        body = body or {}
        return {"reader": name, "reader_index": index,
                "aid": body.get("aid_hex") or body.get("aidHex") or body.get("aid") or None}

    @router.get("/devices/{iid}/esim")
    async def esim(iid: str):
        name, idx = await reader_for(iid)
        cached = await mdd.api_esim_chip_cached(reader_index=idx, reader=name)
        return {"data": mobile_dto.esim_overview(cached.get("ses") or [])}

    @router.get("/devices/{iid}/esim/profiles")
    async def esim_profiles(iid: str, refresh: int = 0):
        name, idx = await reader_for(iid)
        result = (await mdd.api_esim_profiles(reader_index=idx, reader=name) if refresh
                  else await mdd.api_esim_chip_cached(reader_index=idx, reader=name))
        if not refresh and not result.get("cached"):
            return {"data": {"cached": False, "ses": []}}
        if any(se.get("error") for se in result.get("ses") or []):
            raise HTTPException(502, "eUICC profile read incomplete")
        return {"data": mobile_dto.esim_groups(result.get("ses") or [])}

    @router.post("/devices/{iid}/esim/actions/switch")
    async def esim_switch(iid: str, body: dict):
        name, idx = await reader_for(iid)
        iccid = str(body.get("iccid") or "")
        if not iccid:
            raise HTTPException(422, "iccid required")
        result = await mdd.api_esim_enable(iccid, _reader_args(name, idx, body))
        observed = (result.get("card") or {}).get("iccid")
        if not result.get("ok") or str(observed or "") != iccid or result.get("verified") is False:
            raise HTTPException(409, "target ICCID was not observed after switch")
        if result.get("recovery_error"):
            raise HTTPException(503, "profile switched but line recovery failed: " +
                                str(result["recovery_error"]))
        physical = await mdd._unified_devices()
        reader = next((row for row in physical if row.get("reader") == name
                       and row.get("present") and row.get("id")), None)
        live_card = mdd.hub.cards.get(name) or {}
        if not reader or str(live_card.get("iccid") or "") != iccid:
            raise HTTPException(503, "profile switched but reader identity is unavailable")
        recovered = str((result.get("recovery") or {}).get("instance_id") or "")
        associated = str(reader.get("instance_id") or "")
        if recovered and associated != recovered:
            raise HTTPException(503, "profile switched but line association is not current")
        candidate = recovered or associated
        instance = cfg.get_instance(candidate) if candidate else None
        if candidate and (not instance or str(instance.get("iccid") or "") != iccid):
            raise HTTPException(503, "profile switched but line identity is not current")
        device_id = candidate or "reader:" + str(reader["id"])
        data = {"status": "already_active" if result.get("already_active") else "switched",
                "iccid": iccid, "verified": True, "device_id": device_id,
                "reader_id": str(reader["id"])}
        switch = result.get("esim_switch")
        if isinstance(switch, dict):
            data["esim_switch"] = switch
        return {"data": data}

    @router.post("/devices/{iid}/esim/actions/disable")
    async def esim_disable(iid: str, body: dict):
        name, idx = await reader_for(iid)
        iccid = str(body.get("iccid") or "")
        if not iccid:
            raise HTTPException(422, "iccid required")
        result = await mdd.api_esim_disable(iccid, _reader_args(name, idx, body))
        if not result.get("ok"):
            raise HTTPException(502, "eSIM disable failed")
        return {"data": {"status": "disabled", "iccid": iccid}}

    @router.patch("/devices/{iid}/esim/profiles/{iccid}")
    async def esim_rename(iid: str, iccid: str, body: dict):
        name, idx = await reader_for(iid)
        nickname = str(body.get("name") or "").strip()
        if not nickname:
            raise HTTPException(422, "name required")
        result = await mdd.api_esim_nickname(iccid, {**_reader_args(name, idx, body),
                                                       "nickname": nickname})
        if not result.get("ok"):
            raise HTTPException(502, "eSIM nickname failed")
        return {"data": {"status": "renamed", "iccid": iccid}}

    @router.delete("/devices/{iid}/esim/profiles/{iccid}")
    async def esim_delete(iid: str, iccid: str, aid_hex: str = ""):
        name, idx = await reader_for(iid)
        result = await mdd.api_esim_delete(iccid, reader_index=idx, reader=name,
                                           aid=aid_hex or None)
        if not result.get("ok"):
            raise HTTPException(502, "eSIM delete failed")
        return {"data": {"status": "deleted", "iccid": iccid}}

    @router.post("/devices/{iid}/esim/actions/download")
    async def esim_download(iid: str, body: dict, request: Request):
        name, idx = await reader_for(iid)
        queue: asyncio.Queue = asyncio.Queue()
        listeners = mdd.hub.esim_download_listeners.setdefault(name, set())
        listeners.add(queue)
        operation_id = None
        try:
            result = await mdd.api_esim_download({**_reader_args(name, idx, body),
                                                  "smdp": body.get("smdp"),
                                                  "matching_id": body.get("matching_id"),
                                                  "confirmation_code": body.get("confirmation_code")})
            if not result.get("started"):
                raise HTTPException(502, "eSIM download did not start")
            operation_id = result.get("operation_id")
        except Exception:
            listeners.discard(queue)
            raise

        async def stream():
            completed = False
            try:
                while True:
                    try:
                        event = await asyncio.wait_for(queue.get(), timeout=600)
                    except asyncio.TimeoutError:
                        yield "event: progress\ndata: " + json.dumps(
                            {"step": "error", "msg": "eSIM download timed out", "pct": 0}) + "\n\n"
                        break
                    if event.get("operation_id") != operation_id:
                        continue
                    progress = mobile_dto.esim_progress(event)
                    yield "event: progress\ndata: " + json.dumps(progress) + "\n\n"
                    if progress["step"] in ("done", "error"):
                        completed = True
                        break
            finally:
                listeners.discard(queue)
                if not listeners:
                    mdd.hub.esim_download_listeners.pop(name, None)
                # Disconnecting the owner cancels its in-flight lpac process, not all readers.
                if not completed and mdd.hub.esim_download_ops.get(name) == operation_id:
                    await mdd.api_esim_download_cancel({"reader": name,
                                                        "reader_index": idx,
                                                        "operation_id": operation_id})

        return StreamingResponse(stream(), media_type="text/event-stream")

    @router.api_route("/settings/notifications/onetools/pairing", methods=["GET", "POST"])
    async def pairing(request: Request):
        stored = cfg.get_settings().get("onetools") or {}
        enabled = True if not isinstance(stored, dict) or "enabled" not in stored else bool(
            stored.get("enabled"))
        if not enabled:
            return {"data": {"enabled": False, "token_set": False, "origin": "",
                             "uri": "", "json": ""}}
        secret = mobile_pairing.issue(rotate=request.method == "POST")
        public = str(stored.get("public_base_url") or "").strip().rstrip("/")
        origin = public or str(request.base_url).rstrip("/")
        uri = "onetools://onewifi?" + urlencode({"u": origin, "t": secret})
        return {"data": {"enabled": True, "token_set": True, "origin": origin,
                         "uri": uri, "json": json.dumps({"v": 1, "u": origin, "t": secret})}}

    @router.get("/settings/notifications")
    def notification_settings():
        return {"data": mobile_settings.view(cfg.get_settings())}

    @router.put("/settings/notifications")
    def save_notification_settings(body: dict):
        return {"data": mobile_settings.update(body)}

    @router.post("/settings/notifications/{channel}/test")
    async def test_notification_settings(channel: str, body: dict):
        return {"data": await asyncio.to_thread(mobile_settings.test, channel, body)}

    @router.get("/settings/preferences")
    def preferences():
        return {"data": {"language": cfg.get_settings().get("ui_language") or "zh"}}

    @router.put("/settings/preferences")
    def save_preferences(body: dict):
        language = body.get("language")
        if language not in ("zh", "en") or set(body) != {"language"}:
            raise HTTPException(422, "language must be zh or en")
        cfg.update_settings({"ui_language": language})
        return {"data": {"language": language}}

    @router.get("/system/info")
    def system_info():
        return {"data": phone_extras.system_info(VERSION)}

    @router.get("/settings/vowifi")
    def vowifi_settings():
        return {"data": vowifi_mtu.view(cfg.get_settings())}

    @router.put("/settings/vowifi")
    def save_vowifi_settings(body: dict):
        current = cfg.get_settings()
        try:
            saved = vowifi_mtu.patch(current, body)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        cfg.update_settings(saved)
        return {"data": vowifi_mtu.view({**current, **saved})}

    @router.get("/license")
    def gateway_license():
        return {"data": phone_calls.license_status()}

    def _callable(iid: str) -> dict:
        inst = line(iid)
        if inst.get("provisioning_state") == "draft":
            raise HTTPException(409, "line is not callable")
        return inst

    @router.get("/devices/{iid}/calls")
    def device_calls(iid: str):
        line(iid)
        return {"data": {"calls": [phone_calls.view(row) for row in store.list_calls(iid, 100)]}}

    @router.post("/devices/{iid}/calls/dial")
    async def device_dial(iid: str, body: dict):
        _callable(iid)
        number = str((body or {}).get("number") or "").strip()
        if not re.fullmatch(r"[0-9+*#]{1,32}", number):
            raise HTTPException(422, "number is required")
        result = await mdd.place_handset_call(iid, number)
        record = phone_calls.dialed_record(result)
        if not result.get("ok"):
            if record and not record.get("end_ts"):
                store.update_call(int(record["id"]), "failed", ended=True)
            raise HTTPException(409, result.get("error") or result.get("detail") or "call failed")
        if record is None:
            raise HTTPException(409, "call was not recorded")
        return {"data": phone_calls.view(record)}

    @router.post("/devices/{iid}/calls/answer")
    async def device_answer(iid: str, body: dict):
        line(iid)
        ident = str((body or {}).get("id") or "").strip()
        record = phone_calls.find(store.list_calls(iid, 200), ident)
        if record is None:
            raise HTTPException(404, "call not found")
        result = await mdd.answer_handset_call(iid, ident)
        if not result.get("ok"):
            raise HTTPException(409, result.get("error") or result.get("detail") or "call failed")
        # Connecting the handset's audio is not the far end answering. Only an inbound
        # ring moves to answered here; an outbound call stays dialing until the carrier does.
        inbound = str(record.get("direction") or "") in ("in", "incoming")
        if (inbound and not record.get("end_ts")
                and str(record.get("status") or "") == "ringing"):
            store.update_call(int(record["id"]), "answered")
            record = {**record, "status": "answered"}
        return {"data": phone_calls.view(record)}

    @router.post("/devices/{iid}/calls/hangup")
    async def device_hangup(iid: str, body: dict):
        line(iid)
        ident = str((body or {}).get("id") or "").strip()
        if not ident:
            raise HTTPException(422, "call id is required")
        record = phone_calls.find(store.list_calls(iid, 200), ident)
        if record is None:
            raise HTTPException(404, "call not found")
        if record.get("end_ts"):
            handset_audio.bridge.release_record(record)
            return {"data": {"ok": True}}
        result = await mdd.hangup_call(iid, record)
        if not result.get("ok") and result.get("error") != "call is not active":
            raise HTTPException(409, result.get("error") or result.get("detail") or "call failed")
        store.update_call(int(record["id"]), "ended", ended=True)
        handset_audio.bridge.release_record(record)
        return {"data": {"ok": True}}

    @router.get("/devices/{iid}/calls/media")
    def device_media(iid: str, id: str = ""):
        line(iid)
        call_id = str(id or "").strip()
        if not call_id:
            raise HTTPException(422, "call id is required")
        return {"data": phone_calls.media(iid, call_id)}

    @router.post("/devices/{iid}/calls/dtmf")
    async def device_dtmf(iid: str, body: dict):
        line(iid)
        digit = str((body or {}).get("digit") or "")
        ident = str((body or {}).get("id") or "").strip()
        if not re.fullmatch(r"[0-9*#A-D]", digit):
            return JSONResponse({"error": {"code": "invalid_dtmf", "message": "invalid digit"}},
                                status_code=422)
        if not ident:
            raise HTTPException(422, "call id is required")
        record = phone_calls.find(store.list_calls(iid, 200), ident)
        if record is None:
            raise HTTPException(404, "call not found")
        if record.get("end_ts"):
            raise HTTPException(409, "call has ended")
        ami = await mdd.hub.ami_for(iid)
        if ami is None:
            return JSONResponse({"error": {"code": "dtmf_unavailable", "message": "line is not in a call"}},
                                status_code=409)
        chosen = await ami.channels_for_call(
            str(record.get("engine_id") or ""), str(record.get("call_id") or ident))
        result = await ami.play_dtmf(digit, target_channel(chosen, "dtmf"))
        if not result.get("ok"):
            return JSONResponse({"error": {"code": "dtmf_unavailable", "message": "digit was not sent"}},
                                status_code=409)
        return {"data": {"ok": True}}

    @router.get("/calls/events")
    async def call_events(request: Request):
        who = getattr(request.state, "principal", None)
        if who is None:
            who = (request.scope.get("state") or {}).get("principal")
        credential = str(getattr(who, "credential", "") or "")

        async def events():
            if not credential:
                return
            entry = gate._live.add(credential)
            revoked = entry[1]
            revision = 0
            last = ""
            try:
                while True:
                    if await request.is_disconnected() or revoked.is_set():
                        return
                    body = phone_calls.snapshot(
                        cfg.list_instances(), lambda item: store.list_calls(item, 50))
                    raw = json.dumps(body, separators=(",", ":"), sort_keys=True)
                    if raw != last:
                        revision += 1
                        last = raw
                        payload = {"generation": 1, "revision": revision, **body}
                        yield f"id: {revision}\nevent: snapshot\ndata: {json.dumps(payload)}\n\n"
                    else:
                        yield ": keepalive\n\n"
                    if await phone_calls.until_revoked(revoked, 2):
                        return
            finally:
                gate._live.discard(credential, entry)

        return StreamingResponse(events(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-store"})

    @router.get("/settings/sms")
    def sms_settings():
        policy = cellular_sms.storage_policy(cfg.get_settings())
        return {"data": {"auto_clear_modem_storage": policy == "delete"}}

    @router.put("/settings/sms")
    def save_sms_settings(body: dict):
        enabled = body.get("auto_clear_modem_storage")
        if not isinstance(enabled, bool) or set(body) != {"auto_clear_modem_storage"}:
            raise HTTPException(422, "auto_clear_modem_storage must be boolean")
        cfg.update_settings({"cellular_sms_storage": "delete" if enabled else "keep"})
        return {"data": {"auto_clear_modem_storage": enabled}}

    @router.put("/onetools/ios/push-endpoint")
    def register_sms_endpoint(body: dict, request: Request):
        try:
            return {"data": mobile_pairing.register_sms(
                mdd.gate.bearer_token(mdd.gate._headers(request.scope)),
                body.get("device_token"), body.get("environment"),
                body.get("push_to_start_token"), mode=str(body.get("live_activity_mode") or ""))}
        except mobile_pairing.PairingError as exc:
            raise HTTPException(400, str(exc)) from exc

    @router.put("/onetools/ios/push-endpoint/live-activity")
    def register_activity(body: dict, request: Request):
        try:
            secret = mdd.gate.bearer_token(mdd.gate._headers(request.scope))
            return {"data": mobile_pairing.register_activity(
                secret, body.get("device_token"), body.get("environment"),
                body.get("expected_activity_id"), body)}
        except mobile_pairing.PairingError as exc:
            raise HTTPException(409 if "conflict" in str(exc) else 400, str(exc)) from exc

    @router.post("/onetools/ios/push-endpoint/ack")
    def ack_sms_endpoint(body: dict, request: Request):
        try:
            secret = mdd.gate.bearer_token(mdd.gate._headers(request.scope))
            return {"data": {"sms_id": mobile_pairing.ack_sms(
                secret, body.get("device_token"), body.get("sms_id"))}}
        except mobile_pairing.PairingError as exc:
            raise HTTPException(400, str(exc)) from exc

    @router.get("/onetools/sms/stream")
    async def sms_stream(request: Request):
        secret = mdd.gate.bearer_token(mdd.gate._headers(request.scope))
        try:
            cursor = max(0, int(request.headers.get("last-event-id") or 0))
        except ValueError:
            cursor = 0

        async def events():
            last = cursor
            yield "event: connected\ndata: " + json.dumps({"lastEventId": last}) + "\n\n"
            while mobile_pairing.verify(secret):
                stored = cfg.get_settings().get("onetools") or {}
                if isinstance(stored, dict) and "enabled" in stored and not stored.get("enabled"):
                    break
                page = await asyncio.to_thread(store.inbound_sms_after_id, last)
                for row in page:
                    last = int(row["id"])
                    inst = cfg.get_instance(str(row["instance"])) or {}
                    data = {"id": last, "deviceId": str(row["instance"]),
                            "deviceLabel": str(inst.get("name") or row["instance"]),
                            "number": str(row["peer"]), "content": str(row["body"]),
                            "atMs": int(row["ts"]) * 1000}
                    yield f"id: {last}\nevent: sms\ndata: {json.dumps(data)}\n\n"
                if len(page) < 100:
                    yield ": keepalive\n\n"
                    await asyncio.sleep(20)
            # Rotation/expiry stops the stream; no old credential stays subscribed.

        return StreamingResponse(events(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-store"})

    @router.post("/calls/push-endpoint")
    def register_call_endpoint(body: dict, request: Request):
        who = mdd.gate.current(request)
        if who.kind != "client" or who.client_id is None:
            raise HTTPException(403, "client token required")
        try:
            result = mobile_pairing.register_call(
                who.client_id, body.get("device_token"), body.get("environment"))
        except mobile_pairing.PairingError as exc:
            raise HTTPException(400, str(exc)) from exc
        bundle = str((cfg.get_settings().get("apns_voip") or {}).get("bundle_id") or "")
        return {"data": {**result, "voipTopic": bundle + ".voip" if bundle else ""}}

    @router.get("/calls/{call_id}/pickup")
    def pickup(call_id: str, device_id: str):
        if not re.fullmatch(r"[0-9]+\.[0-9]+", call_id):
            raise HTTPException(400, "invalid engine call ID")
        inst = line(device_id)
        if inst.get("provisioning_state") == "draft":
            raise HTTPException(409, "line is not callable")
        record = store.get_open_call_by_id(device_id, call_id)
        if not record or record.get("status") != "ringing" or \
                record.get("direction") != "in":
            raise HTTPException(409, "call is no longer ringing on this line")
        expires = int(record["start_ts"]) + 60
        if time.time() >= expires:
            raise HTTPException(409, "call ring window expired")
        return {"data": {"call_id": call_id, "pickup_uri": "mddpickup-" + call_id,
                         "expires_at": expires, "device_id": device_id}}

    @router.get("/logs/history")
    def log_history(lines: int = 500, level: str = "", search: str = ""):
        return {"data": phone_extras.history(lines, level, search)}

    @router.get("/settings/security")
    def security_settings(request: Request):
        peer = request.client.host if request.client else ""
        return {"data": phone_extras.security_view(
            cfg.get_settings(), peer, request.headers.get("x-forwarded-for", ""))}

    @router.put("/settings/security")
    def security_save(body: dict, request: Request):
        try:
            saved = phone_extras.security_save(cfg.get_settings(), body)
        except phone_extras.PhoneExtraError as exc:
            raise HTTPException(422, str(exc)) from exc
        cfg.update_settings({"security": saved})
        peer = request.client.host if request.client else ""
        return {"data": phone_extras.security_view(
            cfg.get_settings(), peer, request.headers.get("x-forwarded-for", ""))}

    @router.get("/settings/https")
    def https_settings():
        return {"data": phone_extras.https_view(cfg.get_settings())}

    @router.put("/settings/https")
    def https_save(body: dict):
        try:
            saved = phone_extras.https_save(cfg.get_settings(), body)
        except phone_extras.PhoneExtraError as exc:
            raise HTTPException(422, str(exc)) from exc
        cfg.update_settings({"security": saved})
        return {"data": phone_extras.https_view(cfg.get_settings())}

    @router.get("/settings/developer")
    def developer_settings():
        return {"data": phone_extras.developer_view(cfg.get_settings())}

    @router.put("/settings/developer")
    def developer_save(body: dict):
        try:
            saved = phone_extras.developer_save(body)
        except phone_extras.PhoneExtraError as exc:
            raise HTTPException(422, str(exc)) from exc
        current = dict(cfg.get_settings().get("developer") or {})
        current.update(saved)
        cfg.update_settings({"developer": current})
        return {"data": phone_extras.developer_view(cfg.get_settings())}

    def _tasks():
        return cfg.get_settings().get("phone_tasks") or {}

    @router.get("/automatic-tasks")
    def automatic_tasks():
        return {"data": phone_extras.tasks_view(_tasks())}

    @router.get("/automatic-tasks/runs")
    def automatic_runs(limit: int = 20, offset: int = 0):
        return {"data": phone_extras.runs_view(_tasks(), limit, offset)}

    @router.post("/automatic-tasks")
    def automatic_create(body: dict):
        try:
            stored, task = phone_extras.save_task(_tasks(), body)
        except phone_extras.PhoneExtraError as exc:
            raise HTTPException(422, str(exc)) from exc
        cfg.update_settings({"phone_tasks": stored})
        return {"data": task}

    @router.put("/automatic-tasks/{task_id}")
    def automatic_update(task_id: int, body: dict):
        try:
            stored, task = phone_extras.save_task(_tasks(), body, task_id)
        except phone_extras.PhoneExtraError as exc:
            status = 404 if "not found" in str(exc) else 422
            raise HTTPException(status, str(exc)) from exc
        cfg.update_settings({"phone_tasks": stored})
        return {"data": task}

    @router.delete("/automatic-tasks/{task_id}")
    def automatic_delete(task_id: int):
        try:
            stored = phone_extras.delete_task(_tasks(), task_id)
        except phone_extras.PhoneExtraError as exc:
            raise HTTPException(404, str(exc)) from exc
        cfg.update_settings({"phone_tasks": stored})
        return {"data": {"deleted": True}}

    @router.post("/automatic-tasks/{task_id}/run")
    async def automatic_run(task_id: int):
        try:
            phone_extras.task_by_id(_tasks(), task_id)
            claimed = phone_extras.claim_task(_tasks(), task_id)
        except phone_extras.PhoneExtraError as exc:
            raise HTTPException(404, str(exc)) from exc
        if claimed is None:
            raise HTTPException(409, "task is already running")
        cfg.update_settings({"phone_tasks": claimed[0]})
        try:
            status, output, error = await mdd._execute_automatic_task(claimed[1])
        except Exception as exc:
            status, output, error = "failed", "", type(exc).__name__
        stored, run = phone_extras.begin_run(
            _tasks(), claimed[1], output, error, status, scheduled=False)
        cfg.update_settings({"phone_tasks": stored})
        phone_extras.note_run(claimed[1], status)
        return {"data": run}

    @router.get("/euicc-catalog")
    def euicc_catalog_route():
        from . import euicc_catalog
        return {"data": euicc_catalog.view()}

    @router.post("/settings/password")
    def change_password(body: dict):
        from . import auth, clients, gate
        try:
            old, new = phone_extras.password_fields(body or {})
            auth.change_password(old, new)
        except phone_extras.PhoneExtraError as exc:
            raise HTTPException(422, str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        clients.revoke_all()
        gate.revoke_kind("session")
        gate.revoke_kind("client")
        return {"data": {"changed": True, "reauthentication_required": True}}

    @router.get("/system/update/check")
    async def system_update_check():
        from . import update_check
        result = await asyncio.to_thread(update_check.check, True)
        return {"data": phone_extras.update_view(result)}

    @router.api_route("/{legacy:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
    def unsupported(legacy: str):
        raise HTTPException(501, f"MDD mobile operation unsupported: {legacy}")

    # Register directly so the gate/test route inventory sees each method/path. Newer FastAPI
    # represents include_router as a nested _IncludedRouter without a top-level path.
    for route in router.routes:
        app.add_api_route(route.path, route.endpoint, methods=route.methods)


def error_response(status: int, code: str, message: str):
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status)
