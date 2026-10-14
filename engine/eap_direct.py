"""One-shot handoff of the IKE EAP result into the first IMS REGISTER.

Three HK wants that REGISTER to carry Authorization built from the same
RAND, AUTN and RES the ePDG just checked, and it must not be logged or kept
after Asterisk has read it.
"""

import base64
import hashlib
import os
from pathlib import Path


def _md5_hex(data: bytes) -> str:
    return hashlib.md5(data).hexdigest()


def _quote(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def build_authorization(username: str, realm: str, res: bytes, rand: bytes, autn: bytes) -> str:
    if not isinstance(res, (bytes, bytearray)) or not 4 <= len(res) <= 16:
        raise ValueError("eap_direct requires a full RES")
    if not isinstance(rand, (bytes, bytearray)) or len(rand) < 16:
        raise ValueError("eap_direct requires a full RAND")
    if not isinstance(autn, (bytes, bytearray)) or len(autn) < 16:
        raise ValueError("eap_direct requires a full AUTN")
    if not username or not realm or any(ch in "\r\n\x00" for ch in username + realm):
        raise ValueError("eap_direct identity is invalid")
    nonce = base64.b64encode(bytes(rand[:16]) + bytes(autn[:16])).decode("ascii")
    uri = "sip:" + realm
    ha1 = _md5_hex(username.encode("ascii") + b":" + realm.encode("ascii") + b":" + bytes(res))
    ha2 = _md5_hex(b"REGISTER:" + uri.encode("ascii"))
    response = _md5_hex((ha1 + ":" + nonce + ":" + ha2).encode("ascii"))
    return (
        f'Digest username="{_quote(username)}",realm="{_quote(realm)}",'
        f'nonce="{nonce}",uri="{_quote(uri)}",response="{response}",algorithm=AKAv1-MD5'
    )


def publish_authorization(run_dir: str, username: str, realm: str,
                          res: bytes, rand: bytes, autn: bytes) -> None:
    """Write one Authorization line for Asterisk, mode 0600. Raise without the secret."""
    line = build_authorization(username, realm, res, rand, autn)
    path = Path(run_dir) / "eap_direct.auth"
    path.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        os.write(fd, (line + "\n").encode("ascii"))
    finally:
        os.close(fd)
        line = ""
