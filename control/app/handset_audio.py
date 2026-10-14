"""Bridge one IMS call to the phone's PCM socket.

Asterisk already owns the carrier leg. AudioSocket carries signed 16-bit linear audio at
8 kHz between that leg and this process. The phone speaks the same samples as binary
WebSocket frames of 320 bytes (20 ms). Nothing here registers a second IMS identity.
"""
from __future__ import annotations

import asyncio
import logging
import uuid

log = logging.getLogger("mdd.handset")

KIND_HANGUP = 0x00
KIND_UUID = 0x01
KIND_AUDIO = 0x10
KIND_ERROR = 0xFF
PORT = 8792
FRAME = 320
MAX_AUDIO = 6400


def encode_packet(kind: int, payload: bytes = b"") -> bytes:
    if not 0 <= kind <= 255 or len(payload) > 65535:
        raise ValueError("invalid audiosocket frame")
    return bytes((kind,)) + len(payload).to_bytes(2, "big") + payload


class Parser:
    """Reassemble AudioSocket frames from a TCP stream."""

    def __init__(self):
        self._buf = b""

    def feed(self, data: bytes) -> list[tuple[int, bytes]]:
        self._buf += data
        frames = []
        while len(self._buf) >= 3:
            kind = self._buf[0]
            length = int.from_bytes(self._buf[1:3], "big")
            if len(self._buf) < 3 + length:
                break
            frames.append((kind, self._buf[3:3 + length]))
            self._buf = self._buf[3 + length:]
        return frames


def audio_uuid(payload: bytes) -> str:
    if len(payload) != 16:
        raise ValueError("audiosocket uuid must be 16 bytes")
    return str(uuid.UUID(bytes=payload))


class Leg:
    def __init__(self, iid: str, phone_id: str, audio_id: str):
        self.iid = str(iid)
        self.phone_id = str(phone_id)
        self.audio_id = str(audio_id)
        self.phone = None
        self.writer: asyncio.StreamWriter | None = None
        self._pending: list[bytes] = []

    async def from_phone(self, data: bytes) -> None:
        if not data or len(data) > MAX_AUDIO or len(data) % 2:
            return
        writer = self.writer
        packet = encode_packet(KIND_AUDIO, data)
        if writer is None:
            self._pending.append(packet)
            del self._pending[:-25]
            return
        writer.write(packet)
        await writer.drain()

    async def to_phone(self, payload: bytes) -> None:
        phone = self.phone
        if phone is None or not payload or len(payload) > MAX_AUDIO or len(payload) % 2:
            return
        await phone.send_bytes(payload)

    async def attach_tcp(self, writer: asyncio.StreamWriter) -> None:
        self.writer = writer
        for packet in self._pending:
            writer.write(packet)
        self._pending.clear()
        await writer.drain()

    def close_tcp(self) -> None:
        writer = self.writer
        self.writer = None
        if writer is not None:
            writer.close()


def _close_phone(phone) -> None:
    close = getattr(phone, "close", None)
    if close is None:
        return
    try:
        result = close(code=1000)
    except TypeError:
        try:
            result = close()
        except Exception:
            log.debug("handset phone close failed", exc_info=True)
            return
    except Exception:
        log.debug("handset phone close failed", exc_info=True)
        return
    if asyncio.iscoroutine(result):
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            result.close()
            return
        loop.create_task(result)


class Bridge:
    def __init__(self):
        self._phone: dict[str, Leg] = {}
        self._audio: dict[str, Leg] = {}

    def prepare(self, iid: str, phone_id: str | None = None) -> tuple[str, str]:
        """Return (phone id, audiosocket uuid). Outbound uses the uuid as the phone id."""
        audio_id = str(uuid.uuid4())
        phone = str(phone_id or audio_id)
        previous = self._phone.get(phone)
        if previous is not None:
            self._release(previous)
        leg = Leg(iid, phone, audio_id)
        self._phone[phone] = leg
        self._audio[audio_id] = leg
        return phone, audio_id

    def leg(self, phone_id: str) -> Leg | None:
        return self._phone.get(str(phone_id or ""))

    def claim(self, audio_id: str) -> Leg | None:
        return self._audio.get(str(audio_id or ""))

    def _release(self, leg: Leg) -> None:
        self._phone.pop(leg.phone_id, None)
        self._audio.pop(leg.audio_id, None)
        phone = leg.phone
        leg.phone = None
        leg.close_tcp()
        if phone is not None:
            _close_phone(phone)

    def drop(self, phone_id: str) -> None:
        key = str(phone_id or "")
        leg = self._phone.get(key) or self._audio.get(key)
        if leg is None:
            return
        self._release(leg)

    def release_record(self, record: dict | None) -> None:
        if not record:
            return
        for key in ("call_id", "engine_id"):
            self.drop(str(record.get(key) or ""))


bridge = Bridge()


async def serve(port: int = PORT):
    async def client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        parser = Parser()
        leg = None
        try:
            while True:
                chunk = await reader.read(4096)
                if not chunk:
                    break
                for kind, payload in parser.feed(chunk):
                    if kind == KIND_UUID and leg is None:
                        try:
                            leg = bridge.claim(audio_uuid(payload))
                        except ValueError:
                            leg = None
                        if leg is None:
                            writer.close()
                            return
                        await leg.attach_tcp(writer)
                    elif kind == KIND_AUDIO and leg is not None:
                        await leg.to_phone(payload)
                    elif kind == KIND_HANGUP:
                        return
        except Exception as exc:  # noqa: BLE001 - one socket must not stop the listener
            log.warning("handset audio socket closed: %s", type(exc).__name__)
        finally:
            if leg is not None and leg.writer is writer:
                leg.writer = None
            writer.close()
            if leg is not None:
                bridge.drop(leg.phone_id)

    return await asyncio.start_server(client, "0.0.0.0", port)


async def attach_phone(iid: str, phone_id: str, ws) -> None:
    """Copy PCM both ways until the phone closes the socket."""
    leg = bridge.leg(phone_id)
    if leg is None or leg.iid != str(iid):
        await ws.close(code=1008)
        return
    leg.phone = ws
    try:
        while True:
            message = await ws.receive()
            if message.get("type") == "websocket.disconnect":
                return
            data = message.get("bytes")
            if data:
                await leg.from_phone(data)
    finally:
        if leg.phone is ws:
            leg.phone = None
        bridge.drop(leg.phone_id)
