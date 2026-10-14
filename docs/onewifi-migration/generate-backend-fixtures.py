"""Generate mobile DTO contract samples through MDD's real ASGI routes."""
import json
import os
from pathlib import Path
from unittest.mock import AsyncMock, patch

from control.app import main, store
from tests.test_client_signin import ClientSignInTests


def main_run():
    fixture = ClientSignInTests("test_sign_in_needs_the_administrator_password")
    fixture.setUp()
    try:
        token = fixture.sign_in(capabilities=["manage_devices", "manage_esim",
                                            "manage_settings"])[1]["token"]
        inst = {"id": "sim1", "name": "Work", "msisdn": "+61400000000",
                "iccid": "8901", "imsi": "50501", "enabled": True}
        hardware = [
            {"id": "physical-1", "instance_id": "sim1", "present": True,
             "reader": "Reader A", "device_type": "reader", "model": "PCSC"},
            {"id": "physical-2", "present": True, "reader": "Reader B",
             "device_type": "reader", "model": "PCSC"},
        ]
        host = {"model": "", "memory": {"used_percent": 25.0, "total_mb": 4096},
                "disk": {"used_percent": 50.0, "used_bytes": 1073741824,
                         "total_bytes": 2147483648}}
        output = {}
        with patch.object(main.cfg, "list_instances", return_value=[inst]), \
                patch.object(main.cfg, "get_instance", return_value=inst), \
                patch.object(main.hub, "host_snapshot", host), \
                patch.object(main, "_unified_devices", new=AsyncMock(return_value=hardware)), \
                patch.object(main, "_esim_resolve_reader", return_value=("Reader A", 0)), \
                patch.dict(main.hub.cards, {"Reader A": {"iccid": "8901"},
                                             "Reader B": {"iccid": "8902"}}, clear=True), \
                patch.object(main.cfg, "get_settings", return_value={
                    "telegram": {"enabled": True, "bot_token": "fixture-bot-secret", "chat_id": "123"},
                    "wecom": {"enabled": True, "urls": [
                        "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=fixture-webhook-key"]},
                    "bark": {"enabled": False, "urls": [], "level": "active"}}), \
                patch.object(main, "api_esim_chip_cached", new=AsyncMock(return_value={
                    "cached": True, "ses": [{"eid": "eid1", "aid": "a000", "profiles": [
                        {"iccid": "8901", "profileState": "enabled",
                         "profileName": "Work plan", "serviceProviderName": "Carrier"}]}]})):
            store.add_message("sim1", "in", "+61412345678", "Sample SMS", ts=1700000000)
            for name, path in (
                ("dashboard-host", "/api/mobile/v1/dashboard/host"),
                ("dashboard-devices", "/api/mobile/v1/dashboard/devices"),
                ("devices", "/api/mobile/v1/devices"),
                ("device-overview", "/api/mobile/v1/devices/sim1/overview"),
                ("esim-overview", "/api/mobile/v1/devices/sim1/esim"),
                ("esim-profiles", "/api/mobile/v1/devices/sim1/esim/profiles"),
                ("sms-contacts", "/api/mobile/v1/sms/contacts"),
                ("notification-settings", "/api/mobile/v1/settings/notifications"),
                ("preferences", "/api/mobile/v1/settings/preferences"),
                ("sms-settings", "/api/mobile/v1/settings/sms"),
                ("system-info", "/api/mobile/v1/system/info"),
            ):
                status, data = fixture.call("GET", path, token=token)
                if status != 200:
                    raise RuntimeError(f"{path}: HTTP {status} {data}")
                output[name] = data
        root = Path(__file__).with_name("contracts")
        root.mkdir(exist_ok=True)
        for name, body in output.items():
            (root / (name + ".json")).write_text(
                json.dumps(body, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    finally:
        fixture.doCleanups()


if __name__ == "__main__":
    main_run()
