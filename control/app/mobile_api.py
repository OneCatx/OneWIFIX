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

from . import cellular_sms, config as cfg, mobile_dto, mobile_pairing, mobile_settings, store
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

    @router.get("/devices")
    async def devices():
        items = await rows()
        # MDD does not impose OneWIFI's licensed device quota.
        return {"data": {"device_limit": None, "devices": items}}

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
        used_mb = round(total_mb * float(memory.get("used_percent") or 0) / 100)
        return {"data": {"host": {"cpu_model": "", "board_model": str(snapshot.get("model") or ""),
                                   "memory_model": "", "disk_model": ""},
                         "perf": {"cpu_percent": None,
                                  "memory_percent": float(memory.get("used_percent") or 0),
                                  "memory_used_bytes": used_mb * 1024 * 1024,
                                  "memory_total_bytes": total_mb * 1024 * 1024,
                                  "disk_percent": float(disk.get("used_percent") or 0),
                                  "disk_used_bytes": int(disk.get("used_bytes") or 0),
                                  "disk_total_bytes": int(disk.get("total_bytes") or 0),
                                  "net_rx_bps": None,
                                  "net_tx_bps": None}}}

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

    @router.get("/sms/contacts")
    async def sms_contacts(request: Request, limit: int = 100):
        result = []
        owner = mdd._owner(request)
        for inst in cfg.list_instances():
            iid = str(inst["id"])
            unread = store.unread_counts(owner, iid)
            for thread in store.list_threads(iid):
                peer = str(thread["peer"])
                result.append({"peer": peer, "device_id": iid,
                               "device_name": str(inst.get("name") or iid),
                               "local_phone": str(inst.get("msisdn") or ""),
                               "iccid": str(inst.get("iccid") or ""),
                               "imsi": str(inst.get("imsi") or ""),
                               "last_content": str(thread.get("last_body") or ""),
                               "message_count": int(thread["n"]),
                               "unread_count": int(unread.get(peer) or 0),
                               "last_timestamp": thread.get("last_ts"),
                               "direction": "outbound" if thread.get("last_kind") == "out" else "inbound"})
        result.sort(key=lambda row: int(row["last_timestamp"] or 0), reverse=True)
        return {"data": result[:max(1, min(limit, 500))]}

    @router.get("/sms/thread")
    def sms_thread(device_id: str, peer: str, before_id: int | None = None,
                   limit: int = 100, iccid: str = "", imsi: str = ""):
        inst = line(device_id)
        if (iccid and iccid != str(inst.get("iccid") or "")) or (
                imsi and imsi != str(inst.get("imsi") or "")):
            raise HTTPException(409, "line identity changed")
        return {"data": [mobile_dto.sms_message(row) for row in
                         store.list_messages_page(device_id, peer, before_id,
                                                  max(1, min(limit, 500)))]}

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
                "aid": body.get("aid_hex") or body.get("aid") or None}

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
        return {"data": {"status": "already_active" if result.get("already_active")
                         else "switched", "iccid": iccid, "verified": True,
                         "device_id": device_id, "reader_id": str(reader["id"])}}

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
        secret = mobile_pairing.issue(rotate=request.method == "POST")
        origin = str(request.base_url).rstrip("/")
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
        return {"data": {"version": VERSION, "build_time": "", "developer": False}}

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

    @router.api_route("/{legacy:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
    def unsupported(legacy: str):
        raise HTTPException(501, f"MDD mobile operation unsupported: {legacy}")

    # Register directly so the gate/test route inventory sees each method/path. Newer FastAPI
    # represents include_router as a nested _IncludedRouter without a top-level path.
    for route in router.routes:
        app.add_api_route(route.path, route.endpoint, methods=route.methods)


def error_response(status: int, code: str, message: str):
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status)
