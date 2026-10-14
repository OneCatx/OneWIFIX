"""
ami.py - Async Asterisk AMI client (per engine instance).

The manager keeps one AmiClient per running instance to: read IMS registration state,
send SMS (AMI MessageSend to the volte_ims endpoint), place calls (Originate), and
receive live events. Incoming call/SMS are primarily delivered via the engine's
notify.py HTTP hooks; AMI events supplement call state.
"""
from __future__ import annotations

import asyncio
import logging
import re

from panoramisk import Manager

log = logging.getLogger("vowifi.ami")


def parse_concise_channels(text: str) -> list[dict]:
    """Rows from `core show channels concise`.

    Asterisk prints channel, context, extension, priority, state, application, data,
    caller id, account code, AMA flags, duration, bridge id, then uniqueid.
    """
    rows = []
    for raw in str(text or "").splitlines():
        parts = raw.strip().split("!")
        if len(parts) < 13 or not parts[0]:
            continue
        rows.append({
            "name": parts[0],
            "context": parts[1],
            "exten": parts[2],
            "data": parts[6],
            "bridge": parts[11],
            "uniqueid": parts[12],
        })
    return rows


def select_call_channels(rows, uniqueid: str = "", business_id: str = "") -> dict:
    """The local leg and the IMS leg of one call.

    A channel belongs to the call when its uniqueid matches, or when the handset id
    appears in the channel name, extension, or application data. The IMS leg is the
    `PJSIP/volte_ims` channel that shares that call's bridge. Another live call's
    bridge is left out.
    """
    uniqueid = str(uniqueid or "")
    business_id = str(business_id or "")
    empty = {"local": "", "carrier": "", "bridge": ""}
    if not uniqueid and not business_id:
        return empty
    matched = []
    for row in rows or []:
        named = business_id and (
            business_id in row["name"] or row["exten"] == business_id
            or business_id in row["data"])
        if (uniqueid and row["uniqueid"] == uniqueid) or named:
            matched.append(row)
    if not matched:
        return empty
    bridge = ""
    for row in matched:
        if not row["bridge"]:
            continue
        peers = [item for item in rows if item["bridge"] == row["bridge"]]
        if any(item["name"].startswith("PJSIP/volte_ims") for item in peers):
            bridge = row["bridge"]
            break
    if not bridge:
        bridge = next((row["bridge"] for row in matched if row["bridge"]), "")
    peers = [item for item in rows if bridge and item["bridge"] == bridge]
    carrier = next((item["name"] for item in peers if item["name"].startswith("PJSIP/volte_ims")), "")
    local = next((row["name"] for row in matched
                  if not row["name"].startswith("PJSIP/volte_ims")
                  and (not bridge or row["bridge"] == bridge)), "")
    if not local:
        local = next((row["name"] for row in matched
                      if not row["name"].startswith("PJSIP/volte_ims")), "")
    return {"local": local, "carrier": carrier, "bridge": bridge}


def target_channel(chosen: dict, purpose: str) -> str:
    """DTMF goes to the IMS leg. Hangup uses that leg, or the local leg when it is the only one."""
    chosen = chosen or {}
    if purpose == "dtmf":
        return str(chosen.get("carrier") or "")
    return str(chosen.get("carrier") or chosen.get("local") or "")


class AmiClient:
    # Hard bounds so a wedged AMI connection can never hang the status poller / API.
    CONNECT_TIMEOUT = 6.0    # login handshake
    ACTION_TIMEOUT = 8.0     # any single AMI action (send_action) response

    def __init__(self, instance_id: str, host: str, port: int, username: str, secret: str,
                 realm: str, msisdn: str = "", smsc: str = ""):
        self.instance_id = str(instance_id)
        self.host = host
        self.port = port
        self.username = username
        self.secret = secret
        self.realm = realm
        self.msisdn = msisdn
        self.smsc = smsc
        self._mgr: Manager | None = None
        self._connected = False
        self._closed = False
        self._event_cb = None

    async def connect(self):
        self._mgr = Manager(host=self.host, port=self.port,
                            username=self.username, secret=self.secret,
                            ping_delay=15, reconnect_timeout=5)
        # panoramisk auto-reconnects on connection loss/refusal by scheduling
        # loop.call_later(reconnect_timeout, self.connect); its close() only cancels the
        # pinger, NOT that pending timer — so a Manager whose target container was stopped
        # or recreated with a NEW AMI secret keeps reconnecting forever and floods the new
        # Asterisk with "failed to authenticate as 'vowifi'" every few seconds. Wrap connect()
        # so that once we close() this client, any queued/scheduled reconnect becomes a no-op.
        self._closed = False
        _orig_connect = self._mgr.connect

        def _guarded_connect(*a, **k):
            if self._closed:
                return None            # client closed -> stop the reconnect loop dead
            return _orig_connect(*a, **k)

        self._mgr.connect = _guarded_connect
        try:
            # Bound the login handshake: a half-open TCP (e.g. the container was just
            # recreated on the same IP) must not block the caller indefinitely.
            await asyncio.wait_for(self._mgr.connect(), timeout=self.CONNECT_TIMEOUT)
            self._connected = True
            log.info("AMI connected instance=%s %s:%s", self.instance_id, self.host, self.port)
        except Exception as e:  # noqa  (asyncio.TimeoutError included)
            # A Manager whose connect failed is not inert. panoramisk has already scheduled
            # its pinger and its reconnect timer on the event loop, and those callbacks keep
            # the object reachable, so nothing collects it. ami_for() caches this client and
            # drops it on its next pass -- but until some caller asks for this instance again
            # the Manager keeps sending Ping on a transport that never opened, once per ping
            # interval, for as long as the control plane lives. Observed after an upgrade
            # restarted the control plane while the engine containers were still starting:
            # one refused connect left ~5 log lines a minute for hours.
            #
            # The failure path owns its own cleanup instead. Closing here cannot lose a
            # connection that would otherwise have recovered: _connected is only ever set by
            # a successful connect(), so a Manager that reconnects behind our back still
            # leaves this client unusable and ami_for() rebuilds it either way.
            self._closed = True
            try:
                self._mgr.close()
            except Exception:
                pass
            self._connected = False
            log.warning("AMI connect failed instance=%s: %r", self.instance_id, e)

    async def _action(self, action: dict, timeout: float | None = None):
        """Send an AMI action with a hard timeout. panoramisk's send_action awaits a Future
        that resolves when the matching AMI response arrives; if the connection is wedged
        (socket up but Asterisk not answering, or a reconnect orphaned the in-flight future)
        that Future never resolves. Without this bound a single stuck action hangs the status
        poller AND the /api/instances handler forever. On timeout we mark the client
        disconnected so ami_for() rebuilds it on the next call, and re-raise TimeoutError."""
        try:
            return await asyncio.wait_for(self._mgr.send_action(action),
                                          timeout=timeout or self.ACTION_TIMEOUT)
        except asyncio.TimeoutError:
            log.warning("AMI action timed out instance=%s action=%s -> marking disconnected",
                        self.instance_id, action.get("Action"))
            self._connected = False
            raise

    async def close(self):
        # Mark closed FIRST so any reconnect that panoramisk already scheduled
        # (loop.call_later -> self.connect) turns into a no-op via the guard installed in
        # connect(). Otherwise the Manager keeps dialing the (now stopped / re-secreted)
        # engine forever, flooding its Asterisk with AMI auth failures.
        self._closed = True
        if self._mgr:
            try:
                self._mgr.close()
            except Exception:
                pass
        self._connected = False

    @property
    def connected(self):
        return self._connected and self._mgr is not None and not self._closed

    async def registration_state(self) -> str:
        """Return 'Registered' | 'Rejected' | 'Unregistered' | 'unknown'."""
        if not self.connected:
            return "unknown"
        # Some IMS-patched Asterisk builds never finish PJSIPShowRegistrationsDetailed even
        # while registration is healthy. AMI Command uses the same reliable CLI view as
        # ``asterisk -rx`` without creating a Docker exec process for every status sample.
        try:
            res = await self._action(
                {"Action": "Command", "Command": "pjsip show registrations"}, timeout=3.0)
            text = ""
            for m in (res if isinstance(res, list) else [res]):
                text += str(m.get("Output") or m.get("content") or "")
            if "Registered" in text:
                return "Registered"
            if "Rejected" in text:
                return "Rejected"
            if "Unregistered" in text:
                return "Unregistered"
        except Exception as e:  # noqa
            log.debug("reg state error: %r", e)
        return "unknown"

    async def active_channel_count(self) -> int | None:
        """Return the number of live Asterisk channels, or ``None`` when unreadable.

        A stale IMS registration does not necessarily tear down an established call: its RTP
        can still be flowing through the otherwise-live ESP tunnel.  Automatic recovery must
        therefore fail closed when checking for calls.  AMI Command is used for the same reason
        as registration_state(): it is bounded and reliable on the supported IMS-patched build.
        """
        if not self.connected:
            return None
        try:
            res = await self._action(
                {"Action": "Command", "Command": "core show channels count"}, timeout=3.0)
            text = ""
            for message in (res if isinstance(res, list) else [res]):
                text += str(message.get("Output") or message.get("content") or "") + "\n"
            match = re.search(r"\b(\d+)\s+active channels?\b", text, re.I)
            return int(match.group(1)) if match else None
        except Exception as exc:  # noqa
            log.debug("active channel count error: %r", exc)
            return None

    async def send_sms(self, to: str, body: str) -> dict:
        if not self.connected:
            return {"ok": False, "error": "AMI not connected"}
        dest = f"pjsip:volte_ims/{to}@volte_ims"
        frm = f"sip:{self.msisdn or to}@{self.realm}"
        try:
            res = await self._action(
                {"Action": "MessageSend", "To": dest, "From": frm, "Body": body})
            msg = res[0] if isinstance(res, list) else res
            ok = (msg.get("Response") == "Success")
            return {"ok": ok, "detail": msg.get("Message", "")}
        except Exception as e:  # noqa
            return {"ok": False, "error": repr(e)}

    async def originate(self, to: str, from_endpoint: str) -> dict:
        """Place a call: ring from_endpoint (a local endpoint / softphone) and bridge to
        the dialed number over the IMS. Uses a Local channel into from-local."""
        if not self.connected:
            return {"ok": False, "error": "AMI not connected"}
        try:
            res = await self._action({
                "Action": "Originate",
                "Channel": f"PJSIP/{from_endpoint}",
                "Exten": to,
                "Context": "from-local",
                "Priority": "1",
                "CallerID": self.msisdn or "gateway",
                "Async": "true",
            }, timeout=12.0)
            msg = res[0] if isinstance(res, list) else res
            return {"ok": msg.get("Response") == "Success", "detail": msg.get("Message", "")}
        except Exception as e:  # noqa
            return {"ok": False, "error": repr(e)}

    async def originate_handset(self, number: str, audio_id: str) -> dict:
        """Bridge `number` on the IMS to the handset AudioSocket identified by `audio_id`."""
        if not self.connected:
            return {"ok": False, "error": "AMI not connected"}
        try:
            res = await self._action({
                "Action": "Originate",
                "Channel": f"Local/{audio_id}@handset-media/n",
                "Exten": number,
                "Context": "from-local",
                "Priority": "1",
                "CallerID": self.msisdn or "gateway",
                "Async": "true",
                # Inherited by the carrier leg. from-local also reads it from the Local name.
                "Variable": f"__ONEWIFI_CALL_ID={audio_id}",
            }, timeout=12.0)
            msg = res[0] if isinstance(res, list) else res
            return {"ok": msg.get("Response") == "Success", "detail": msg.get("Message", "")}
        except Exception as e:  # noqa
            return {"ok": False, "error": repr(e)}

    async def _command_text(self, command: str) -> str:
        res = await self._action({"Action": "Command", "Command": command}, timeout=3.0)
        text = ""
        for item in (res if isinstance(res, list) else [res]):
            text += str(item.get("Output") or item.get("content") or "")
        return text

    async def channel_for_uniqueid(self, uniqueid: str) -> str:
        if not self.connected or not uniqueid:
            return ""
        try:
            text = await self._command_text("core show channels concise")
        except Exception as exc:  # noqa
            log.debug("channel list failed: %r", exc)
            return ""
        for line in text.splitlines():
            parts = line.strip().split("!")
            if len(parts) >= 13 and parts[12] == uniqueid:
                return parts[0]
        return ""

    async def redirect(self, channel: str, context: str, exten: str) -> dict:
        if not self.connected:
            return {"ok": False, "error": "AMI not connected"}
        try:
            res = await self._action({
                "Action": "Redirect",
                "Channel": channel,
                "Context": context,
                "Exten": exten,
                "Priority": "1",
            })
            msg = res[0] if isinstance(res, list) else res
            return {"ok": msg.get("Response") == "Success", "detail": msg.get("Message", "")}
        except Exception as e:  # noqa
            return {"ok": False, "error": repr(e)}

    async def channels_for_call(self, uniqueid: str = "", business_id: str = "") -> dict:
        if not self.connected:
            return {"ok": False, "error": "AMI not connected", "local": "", "carrier": ""}
        try:
            text = await self._command_text("core show channels concise")
        except Exception as exc:  # noqa
            return {"ok": False, "error": repr(exc), "local": "", "carrier": ""}
        chosen = select_call_channels(parse_concise_channels(text), uniqueid, business_id)
        chosen["ok"] = bool(chosen["local"] or chosen["carrier"])
        if not chosen["ok"]:
            chosen["error"] = "call is not active"
        return chosen

    async def play_dtmf(self, digit: str, channel: str = "") -> dict:
        """Send one digit on the IMS leg of the named call."""
        if not self.connected:
            return {"ok": False, "error": "AMI not connected"}
        if not channel:
            return {"ok": False, "error": "dtmf_unavailable"}
        try:
            res = await self._action({
                "Action": "PlayDTMF", "Channel": channel, "Digit": digit,
            })
            msg = res[0] if isinstance(res, list) else res
            return {"ok": msg.get("Response") == "Success", "detail": msg.get("Message", "")}
        except Exception as e:  # noqa
            return {"ok": False, "error": repr(e)}

    async def hangup_channel(self, channel: str) -> dict:
        """Hang up one channel. This does not hang up the other calls on the line."""
        if not self.connected:
            return {"ok": False, "error": "AMI not connected"}
        if not channel:
            return {"ok": False, "error": "call is not active"}
        try:
            res = await self._action({"Action": "Hangup", "Channel": channel})
            msg = res[0] if isinstance(res, list) else res
            return {"ok": msg.get("Response") == "Success", "detail": msg.get("Message", ""),
                    "channel": channel}
        except Exception as e:  # noqa
            return {"ok": False, "error": repr(e)}

    async def hangup_all(self) -> dict:
        if not self.connected:
            return {"ok": False, "error": "AMI not connected"}
        try:
            await self._action({"Action": "Command", "Command": "channel request hangup all"})
            return {"ok": True}
        except Exception as e:  # noqa
            return {"ok": False, "error": repr(e)}
