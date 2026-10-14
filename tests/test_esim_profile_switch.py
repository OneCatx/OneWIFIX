import tempfile
import unittest
import hashlib
import asyncio
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from control.app import main
from host import mdd_orchestrator, vpcd_modem_bridge
from host.mdd_orchestrator import Orchestrator


class BridgeRestartHandshakeTests(unittest.TestCase):
    def test_restart_completes_only_for_new_pid_ready_channels_and_target_iccid(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            app = Orchestrator(root / "data", root)
            old = Mock()
            old.poll.return_value = None
            other = Mock()
            other.poll.return_value = None
            app.bridges = {"modem-1": old, "modem-2": other}
            app.bridge_ports = {"modem-1": 15360, "modem-2": 15616}
            request_id = "switch-1"
            mdd_orchestrator.atomic_json(
                app.bridge_restart_request_dir / f"{request_id}.json", {
                    "request_id": request_id,
                    "device_id": "modem-1",
                    "expected_iccid_sha256": hashlib.sha256(
                        b"profile-target").hexdigest(),
                    "requested_at": 100,
                })

            app.process_bridge_restart_requests()

            old.terminate.assert_called_once()
            old.wait.assert_called_once_with(8)
            other.terminate.assert_not_called()
            self.assertNotIn("modem-1", app.bridges)
            status_path = app.bridge_restart_status_dir / f"{request_id}.json"
            self.assertEqual(mdd_orchestrator.read_json(status_path)["state"], "stopped")

            replacement = SimpleNamespace(pid=22, poll=lambda: None)
            app.bridges["modem-1"] = replacement
            identity_path = app.data / "modems" / "modem-1.json"
            mdd_orchestrator.atomic_json(identity_path, {
                "bridge_pid": 11, "channel_status": "ready", "channel_allocated": 3,
                "iccid": "profile-target",
            })
            app.finish_bridge_restart_requests({"modem-1", "modem-2"})
            self.assertEqual(mdd_orchestrator.read_json(status_path)["state"], "spawned")

            mdd_orchestrator.atomic_json(identity_path, {
                "bridge_pid": 22, "channel_status": "ready", "channel_allocated": 3,
                "iccid": "profile-old",
            })
            app.finish_bridge_restart_requests({"modem-1", "modem-2"})
            self.assertEqual(mdd_orchestrator.read_json(status_path)["state"], "spawned")

            mdd_orchestrator.atomic_json(identity_path, {
                "bridge_pid": 22, "channel_status": "ready", "channel_allocated": 3,
                "iccid": "profile-target",
            })
            app.finish_bridge_restart_requests({"modem-1", "modem-2"})
            status = mdd_orchestrator.read_json(status_path)
            self.assertEqual(status["state"], "channels_ready")
            self.assertEqual(status["bridge_pid"], 22)
            self.assertIs(app.bridges["modem-2"], other)

    def test_requests_for_two_modems_have_independent_status_files(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            app = Orchestrator(root / "data", root)
            first, second = Mock(), Mock()
            first.poll.return_value = second.poll.return_value = None
            app.bridges = {"modem-1": first, "modem-2": second}
            for request_id, device_id in (("switch-1", "modem-1"),
                                          ("switch-2", "modem-2")):
                mdd_orchestrator.atomic_json(
                    app.bridge_restart_request_dir / f"{request_id}.json", {
                        "request_id": request_id, "device_id": device_id,
                        "expected_iccid_sha256": hashlib.sha256(
                            f"profile-{device_id[-1]}".encode()).hexdigest(),
                    })

            app.process_bridge_restart_requests()

            self.assertEqual(
                mdd_orchestrator.read_json(
                    app.bridge_restart_status_dir / "switch-1.json")["device_id"],
                "modem-1")
            self.assertEqual(
                mdd_orchestrator.read_json(
                    app.bridge_restart_status_dir / "switch-2.json")["device_id"],
                "modem-2")


class ESimProfileSwitchControlTests(unittest.IsolatedAsyncioTestCase):
    @staticmethod
    async def _run_captured(_name, _idx, coro, **_kwargs):
        return await coro

    def test_legacy_line_is_scoped_from_its_live_modem_match(self):
        reader = "VoWiFi Modem modem-1 00 00"
        with patch.object(main.hub, "cards", {
                reader: {"name": reader, "present": True, "matched": "legacy"}}):
            self.assertTrue(main._esim_instance_uses_modem(
                {"id": "legacy"}, "modem-1"))

    async def test_refresh_requires_every_virtual_reader_to_report_target_iccid(self):
        readers = [
            "VoWiFi Modem modem-1 00 00",
            "VoWiFi Modem modem-1 00 01",
            "VoWiFi Modem modem-1 00 02",
        ]
        target = SimpleNamespace(
            iccid="profile-target", imsi="imsi-target", mcc="234", mnc="15",
            mnc_len=2, pin_enabled=False, pin_tries=3, smsc="",
            carrier_identity={})
        cards = {reader: {"name": reader, "index": index, "present": True,
                          "iccid": "profile-old"}
                 for index, reader in enumerate(readers)}
        instance = {"id": "2", "iccid": "profile-target"}
        with patch.object(main.sim, "list_readers", return_value=readers), \
                patch.object(main.sim, "read_card", return_value=target), \
                patch.object(main, "_match_instance_by_iccid", return_value=instance), \
                patch.object(main, "_carrier_identity_update", return_value={}), \
                patch.object(main, "_modem_active_slot_capacity", return_value=3), \
                patch.object(main.hub, "cards", cards), \
                patch.object(main.hub, "broadcast", new=AsyncMock()):
            info, refreshed = await main._esim_refresh_modem_readers(
                readers[0], "modem-1", "profile-target")

        self.assertEqual(info["iccid"], "profile-target")
        self.assertEqual(refreshed, readers)
        self.assertEqual({card["iccid"] for card in cards.values()}, {"profile-target"})

    async def test_refresh_ignores_extra_empty_enumerated_slot(self):
        """ML307X enumerates 00..03 while only three logical channels are allocated."""
        readers = [
            "VoWiFi Modem modem-1 00 00",
            "VoWiFi Modem modem-1 00 01",
            "VoWiFi Modem modem-1 00 02",
            "VoWiFi Modem modem-1 00 03",
        ]
        target = SimpleNamespace(
            iccid="profile-target", imsi="imsi-target", mcc="515", mnc="66",
            mnc_len=2, pin_enabled=False, pin_tries=3, smsc="",
            carrier_identity={})
        empty = SimpleNamespace(
            iccid="", imsi="", mcc="", mnc="", mnc_len=None, pin_enabled=False,
            pin_tries=3, smsc="", carrier_identity={})

        def read_card(idx):
            return empty if idx == 3 else target

        cards = {reader: {"name": reader, "index": index, "present": index < 3,
                          "iccid": "profile-old"}
                 for index, reader in enumerate(readers)}
        instance = {"id": "2", "iccid": "profile-target"}
        with patch.object(main.sim, "list_readers", return_value=readers), \
                patch.object(main.sim, "read_card", side_effect=read_card), \
                patch.object(main, "_match_instance_by_iccid", return_value=instance), \
                patch.object(main, "_carrier_identity_update", return_value={}), \
                patch.object(main, "_modem_active_slot_capacity", return_value=3), \
                patch.object(main.hub, "cards", cards), \
                patch.object(main.hub, "broadcast", new=AsyncMock()):
            info, refreshed = await main._esim_refresh_modem_readers(
                readers[0], "modem-1", "profile-target")

        self.assertEqual(info["iccid"], "profile-target")
        self.assertEqual(refreshed, readers[:3])
        self.assertEqual(cards[readers[3]]["iccid"], "profile-old")

    async def test_prepare_and_restore_preserve_the_exact_running_snapshot(self):
        lines = {
            "1": {"id": "1", "enabled": True, "imei_source_device_id": "modem-1"},
            "2": {"id": "2", "enabled": True, "imei_source_device_id": "modem-1"},
            "3": {"id": "3", "enabled": True, "imei_source_device_id": "modem-2"},
        }

        def get_instance(iid):
            return dict(lines[str(iid)])

        def upsert(value):
            iid = str(value["id"])
            lines[iid].update(value)
            return dict(lines[iid])

        with patch.object(main.cfg, "list_instances",
                          side_effect=lambda: [dict(line) for line in lines.values()]), \
                patch.object(main.cfg, "get_instance", side_effect=get_instance), \
                patch.object(main.cfg, "upsert_instance", side_effect=upsert), \
                patch.object(main.cfg, "get_settings", return_value={}), \
                patch.object(main.engine, "is_running",
                             side_effect=lambda iid: str(iid) == "1"), \
                patch.object(main.engine, "stop") as stop, \
                patch.object(main, "_start_engine_checked") as start, \
                patch.object(main.hub, "drop_ami", new=AsyncMock()), \
                patch.object(main.egress, "publish"):
            previous = await main._esim_prepare_profile_switch("modem-1")
            self.assertFalse(lines["1"]["enabled"])
            self.assertFalse(lines["2"]["enabled"])
            self.assertTrue(lines["3"]["enabled"])
            await main._esim_restore_profile_switch(previous)

        stop.assert_called_once_with("1")
        self.assertTrue(lines["1"]["enabled"])
        self.assertTrue(lines["2"]["enabled"])
        start.assert_called_once()
        self.assertEqual(start.call_args.args[0]["id"], "1")

    async def test_recovery_failure_compensates_and_is_not_success(self):
        """Recovery failure restores the old profile, never reports ok=True."""
        error = main.HTTPException(503, "bridge failed")
        with patch.object(main, "_esim_resolve_reader", return_value=("reader", 0)), \
                patch.object(main, "_esim_switch_identity",
                             return_value=("modem-1", "modem-1")), \
                patch.object(main, "_esim_prepare_profile_switch",
                             new=AsyncMock(return_value={"1": {"enabled": True,
                                                                "running": True}})), \
                patch.object(main, "_esim_modem_reader_names", return_value=["reader"]), \
                patch.object(main, "_esim_resolve_se", return_value={"id": "se", "aid": "a"}), \
                patch.object(main, "_esim_profile_inventory", new=AsyncMock(side_effect=[
                    ("eid-1", "profile-old", {"profile-old", "profile-target"}),
                    ("eid-1", "profile-target", {"profile-old", "profile-target"})])), \
                patch.object(main.lpa, "profile_enable", new=AsyncMock()), \
                patch.object(main, "_esim_run", side_effect=self._run_captured), \
                patch.object(main, "_esim_cache_update_profile"), \
                patch.object(main, "_esim_recover_profile_switch",
                             new=AsyncMock(side_effect=error)), \
                patch.object(main, "_esim_compensate_enable",
                             new=AsyncMock(return_value="profile-old")) as compensate:
            with self.assertRaises(main.HTTPException) as raised:
                await main.api_esim_enable("profile-target", {})

        self.assertEqual(raised.exception.status_code, 503)
        self.assertIn("original profile restored", raised.exception.detail)
        compensate.assert_awaited_once()
        self.assertNotIn("reader", main.hub.lpa_busy)
        shot = main.esim_switch_progress.snapshot("reader")
        self.assertEqual(shot["phase"], "failure_ims_recovery")
        self.assertEqual(shot["fail_reason"], "rolled_back")
        self.assertTrue(shot["recoverable"])
        self.assertEqual(len(shot["phases"]), 11)

    async def test_native_reader_success_lands_on_switch_callbacks(self):
        main.esim_switch_progress._progress.clear()
        with patch.object(main, "_esim_resolve_reader", return_value=("reader", 0)), \
                patch.object(main, "_esim_switch_identity", return_value=("reader:reader", "")), \
                patch.object(main, "_esim_resolve_se", return_value={"id": "se", "aid": None}), \
                patch.object(main, "_esim_active_profile_card", new=AsyncMock(return_value=(
                    "eid-1", "profile-old", {"profile-old", "profile-target"}, None))), \
                patch.object(main, "_esim_prepare_reader_profile_switch",
                             new=AsyncMock(return_value={})), \
                patch.object(main, "_esim_profile_inventory", new=AsyncMock(side_effect=[
                    ("eid-1", "profile-old", {"profile-old", "profile-target"}),
                    ("eid-1", "profile-target", {"profile-old", "profile-target"})])), \
                patch.object(main, "_esim_probe_card", new=AsyncMock(return_value=SimpleNamespace(
                    iccid="profile-target"))), \
                patch.object(main, "_esim_refresh_card", new=AsyncMock(return_value={
                    "iccid": "profile-target"})), \
                patch.object(main.lpa, "profile_enable", new=AsyncMock()), \
                patch.object(main, "_esim_run", side_effect=self._run_captured), \
                patch.object(main, "_esim_cache_update_profile"):
            result = await main.api_esim_enable("profile-target", {})
        shot = result["esim_switch"]
        self.assertEqual(result["card"]["iccid"], "profile-target")
        self.assertEqual(shot["status"], "done")
        self.assertEqual(shot["phase"], "switch_callbacks")
        self.assertFalse(shot["active"])
        self.assertTrue(shot["recoverable"])
        self.assertEqual(len(shot["phases"]), 11)
        self.assertEqual(len(shot["steps"]), 5)
        self.assertTrue(shot["steps"][-1]["ready"])

    async def test_post_switch_probe_retries_through_the_refresh_window(self):
        old = SimpleNamespace(iccid="profile-old")
        new = SimpleNamespace(iccid="profile-new")
        reads = [RuntimeError("card is resetting"), old, new]

        def read_card(_idx):
            value = reads.pop(0)
            if isinstance(value, Exception):
                raise value
            return value

        with patch.object(main.sim, "read_card", side_effect=read_card), \
                patch.object(main, "ESIM_CARD_REFRESH_INTERVAL", 0):
            result = await main._esim_probe_card(
                0, expect_iccid="profile-new", attempts=5)
        self.assertEqual(result.iccid, "profile-new")

    async def test_post_switch_probe_reports_the_card_truth_when_attempts_run_out(self):
        old = SimpleNamespace(iccid="profile-old")
        with patch.object(main.sim, "read_card", return_value=old), \
                patch.object(main, "ESIM_CARD_REFRESH_INTERVAL", 0):
            result = await main._esim_probe_card(
                0, expect_iccid="profile-new", attempts=3)
        self.assertEqual(result.iccid, "profile-old")

    async def test_native_reader_switch_disables_the_old_profiles_line(self):
        lines = {"7": {"id": "7", "enabled": True}}

        def upsert(value):
            lines[str(value["id"])].update(value)
            return dict(lines[str(value["id"])])

        with patch.object(main.hub, "cards",
                          {"reader": {"name": "reader", "matched": "7"}}), \
                patch.object(main.cfg, "get_instance",
                             side_effect=lambda iid: dict(lines[str(iid)])), \
                patch.object(main.cfg, "upsert_instance", side_effect=upsert), \
                patch.object(main.hub, "reset_health"), \
                patch.object(main.egress, "publish"):
            previous = await main._esim_prepare_reader_profile_switch("reader")

        self.assertFalse(lines["7"]["enabled"])
        self.assertEqual(previous, {"7": {"enabled": True, "running": False}})

    async def test_native_reader_lpa_failure_restores_the_old_line(self):
        previous = {"7": {"enabled": True, "running": False}}
        error = main.HTTPException(400, "lpac failed")
        with patch.object(main, "_esim_resolve_reader", return_value=("reader", 0)), \
                patch.object(main, "_esim_switch_identity",
                             return_value=("reader:reader", "")), \
                patch.object(main, "_esim_resolve_se", return_value={"id": "se", "aid": None}), \
                patch.object(main, "_esim_prepare_reader_profile_switch",
                             new=AsyncMock(return_value=previous)), \
                patch.object(main, "_esim_profile_inventory", new=AsyncMock(return_value=(
                    "eid-1", "profile-old", {"profile-old", "profile-target"}))), \
                patch.object(main.lpa, "profile_enable", new=AsyncMock(side_effect=error)), \
                patch.object(main, "_esim_run", side_effect=self._run_captured), \
                patch.object(main, "_esim_compensate_enable",
                             new=AsyncMock(return_value="profile-old")) as compensate:
            with self.assertRaises(main.HTTPException):
                await main.api_esim_enable("profile-target", {})

        compensate.assert_awaited_once_with(
            "reader", 0, "", "profile-target",
            {"eid": "eid-1", "previous_iccid": "profile-old", "aid": None}, previous)

    async def test_native_reader_inventory_target_but_physical_card_old_compensates(self):
        previous = {"7": {"enabled": True, "running": False}}
        snapshot = {"eid": "eid-1", "previous_iccid": "profile-old", "aid": None}
        async def run(_name, _idx, coro, **kwargs):
            return await coro
        with patch.object(main, "_esim_resolve_reader", return_value=("reader", 0)), \
                patch.object(main, "_esim_switch_identity", return_value=("reader:reader", "")), \
                patch.object(main, "_esim_resolve_se", return_value={"id": "se", "aid": None}), \
                patch.object(main, "_esim_active_profile_card", new=AsyncMock(return_value=(
                    "eid-1", "profile-old", {"profile-old", "profile-target"}, None))), \
                patch.object(main, "_esim_prepare_reader_profile_switch",
                             new=AsyncMock(return_value=previous)), \
                patch.object(main, "_esim_profile_inventory", new=AsyncMock(side_effect=[
                    ("eid-1", "profile-old", {"profile-old", "profile-target"}),
                    ("eid-1", "profile-target", {"profile-old", "profile-target"})])), \
                patch.object(main, "_esim_probe_card", new=AsyncMock(return_value=SimpleNamespace(
                    iccid="profile-old"))), \
                patch.object(main, "_esim_refresh_card", new=AsyncMock(return_value={
                    "iccid": "profile-old"})), \
                patch.object(main.lpa, "profile_enable", new=AsyncMock()), \
                patch.object(main, "_esim_run", side_effect=run), \
                patch.object(main, "_esim_cache_update_profile") as cache, \
                patch.object(main, "_esim_compensate_enable",
                             new=AsyncMock(return_value="profile-old")) as compensate:
            with self.assertRaises(main.HTTPException) as raised:
                await main.api_esim_enable("profile-target", {})
        self.assertEqual(raised.exception.status_code, 503)
        compensate.assert_awaited_once_with(
            "reader", 0, "", "profile-target", snapshot, previous)
        cache.assert_not_called()
        shot = main.esim_switch_progress.snapshot("reader")
        self.assertEqual(shot["status"], "failed")
        self.assertEqual(shot["phase"], "failure_ims_recovery")
        self.assertEqual(shot["fail_reason"], "rolled_back")
        self.assertTrue(shot["recoverable"])
        self.assertEqual(len(shot["steps"]), 5)
        self.assertEqual(len(shot["phases"]), 11)

    async def test_native_reader_inventory_target_but_card_unreadable_compensates(self):
        previous = {"7": {"enabled": True, "running": False}}
        with patch.object(main, "_esim_resolve_reader", return_value=("reader", 0)), \
                patch.object(main, "_esim_switch_identity", return_value=("reader:reader", "")), \
                patch.object(main, "_esim_resolve_se", return_value={"id": "se", "aid": None}), \
                patch.object(main, "_esim_active_profile_card", new=AsyncMock(return_value=(
                    "eid-1", "profile-old", {"profile-old", "profile-target"}, None))), \
                patch.object(main, "_esim_prepare_reader_profile_switch",
                             new=AsyncMock(return_value=previous)), \
                patch.object(main, "_esim_profile_inventory", new=AsyncMock(side_effect=[
                    ("eid-1", "profile-old", {"profile-old", "profile-target"}),
                    ("eid-1", "profile-target", {"profile-old", "profile-target"})])), \
                patch.object(main, "_esim_probe_card", new=AsyncMock(side_effect=OSError(
                    "reader unavailable"))), \
                patch.object(main, "_esim_run", side_effect=self._run_captured), \
                patch.object(main, "_esim_cache_update_profile") as cache, \
                patch.object(main, "_esim_compensate_enable",
                             new=AsyncMock(return_value="profile-old")) as compensate:
            with self.assertRaises(main.HTTPException) as raised:
                await main.api_esim_enable("profile-target", {})
        self.assertEqual(raised.exception.status_code, 503)
        compensate.assert_awaited_once()
        cache.assert_not_called()

    async def test_same_reader_disable_waits_for_enable_verification_transaction(self):
        paused, release = asyncio.Event(), asyncio.Event()
        mutations = []
        reader = "concurrent-native-reader"

        async def inventory(_name, _aid):
            paused.set()
            await release.wait()
            return ("eid-1", "profile-old" if reader in mutations else "profile-target",
                    {"profile-old", "profile-target"})

        async def disable(*args, **kwargs):
            mutations.append(args[0])

        with patch.object(main, "_esim_resolve_reader", side_effect=lambda _idx, name: (
                name or reader, 0)), \
                patch.object(main, "_esim_switch_identity", side_effect=lambda name: (
                    "reader:" + name, "")), \
                patch.object(main, "_esim_resolve_se", return_value={"id": "se", "aid": None}), \
                patch.object(main, "_esim_active_profile_card", new=AsyncMock(return_value=(
                    "eid-1", "profile-old", {"profile-old", "profile-target"}, None))), \
                patch.object(main, "_esim_prepare_reader_profile_switch",
                             new=AsyncMock(return_value={})), \
                patch.object(main, "_esim_guard_engine"), \
                patch.object(main, "_esim_profile_inventory", new=AsyncMock(return_value=(
                    "eid-1", "profile-old", {"profile-old", "profile-target"}))), \
                patch.object(main, "_esim_retry_profile_inventory", side_effect=inventory), \
                patch.object(main, "_esim_probe_card", new=AsyncMock(return_value=SimpleNamespace(
                    iccid="profile-target"))), \
                patch.object(main, "_esim_refresh_card", new=AsyncMock(return_value={
                    "iccid": "profile-target"})), \
                patch.object(main.lpa, "profile_enable", new=AsyncMock()), \
                patch.object(main.lpa, "profile_disable", new=AsyncMock(side_effect=disable)), \
                patch.object(main, "_esim_cache_update_profile"), \
                patch.object(main, "_esim_compensate_enable", new=AsyncMock()) as compensate:
            enabling = asyncio.create_task(main.api_esim_enable("profile-target", {}))
            try:
                await asyncio.wait_for(paused.wait(), 2)
                disabling = asyncio.create_task(main.api_esim_disable("profile-old", {}))
                await asyncio.sleep(0.02)
                self.assertFalse(disabling.done(), "second writer entered before verification")
                self.assertEqual(mutations, [])
                self.assertTrue((await main.api_esim_disable(
                    "other-profile", {"reader": "independent-native-reader"}))["ok"])
                self.assertEqual(mutations, ["independent-native-reader"])
                release.set()
                self.assertTrue((await enabling)["ok"])
                self.assertTrue((await disabling)["ok"])
                compensate.assert_not_awaited()
            finally:
                release.set()
                await asyncio.gather(enabling, disabling, return_exceptions=True)

    async def test_download_background_job_blocks_writer_and_clears_busy_on_failure(self):
        reader = "download-native-reader"
        entered, release = asyncio.Event(), asyncio.Event()

        async def download(*args, **kwargs):
            entered.set()
            await release.wait()
            raise RuntimeError("download failed")

        with patch.object(main, "_esim_resolve_reader", return_value=(reader, 0)), \
                patch.object(main, "_esim_switch_identity", return_value=("reader:" + reader, "")), \
                patch.object(main, "_esim_resolve_se", return_value={"id": "se", "aid": None}), \
                patch.object(main, "_esim_guard_engine"), \
                patch.object(main, "_esim_imei_for_reader", return_value=""), \
                patch.object(main, "_esim_refresh_card", new=AsyncMock(return_value={})), \
                patch.object(main.hub, "broadcast", new=AsyncMock()), \
                patch.object(main.lpa, "download", new=AsyncMock(side_effect=download)), \
                patch.object(main.lpa, "profile_disable", new=AsyncMock()), \
                patch.object(main, "_esim_cache_update_profile"):
            started = await main.api_esim_download({"reader": reader})
            self.assertTrue(started["started"])
            self.assertEqual(main.hub.esim_download_ops[reader], started["operation_id"])
            try:
                await asyncio.wait_for(entered.wait(), 2)
                disabling = asyncio.create_task(main.api_esim_disable("profile-old", {}))
                await asyncio.sleep(0.02)
                self.assertFalse(disabling.done(), "download did not hold writer transaction")
                release.set()
                self.assertTrue((await asyncio.wait_for(disabling, 2))["ok"])
                self.assertNotIn(reader, main.hub.esim_download_ops)
                self.assertNotIn(reader, main.hub.lpa_busy)
            finally:
                release.set()
                await asyncio.sleep(0)

    async def test_cancelled_download_releases_reader_writer_reservation(self):
        reader = "cancelled-native-reader"
        tasks = []
        create_task = asyncio.create_task

        def capture(coro):
            task = create_task(coro)
            tasks.append(task)
            return task

        async def cancelled(*args, **kwargs):
            raise asyncio.CancelledError()

        with patch.object(main, "_esim_resolve_reader", return_value=(reader, 0)), \
                patch.object(main, "_esim_switch_identity", return_value=("reader:" + reader, "")), \
                patch.object(main, "_esim_resolve_se", return_value={"id": "se", "aid": None}), \
                patch.object(main, "_esim_guard_engine"), \
                patch.object(main, "_esim_imei_for_reader", return_value=""), \
                patch.object(main.hub, "broadcast", new=AsyncMock()), \
                patch.object(main.lpa, "download", new=AsyncMock(side_effect=cancelled)), \
                patch.object(main.asyncio, "create_task", side_effect=capture):
            result = await main.api_esim_download({"reader": reader})
            self.assertTrue(result["started"])
            with self.assertRaises(asyncio.CancelledError):
                await tasks[0]
            self.assertNotIn(reader, main.hub.esim_download_ops)
            self.assertNotIn(reader, main.hub.lpa_busy)
            self.assertFalse(main.hub.esim_switch_lock("reader:" + reader).locked())

    async def test_queued_download_reservation_rejects_sibling_vpcd_writer(self):
        pending = []
        real_create_task = asyncio.create_task

        def queue_job(coro):
            pending.append(coro)
            return Mock()

        def identity(name):
            return ("modem-one" if name in ("slot-a", "slot-b") else "modem-two",
                    "modem-one" if name in ("slot-a", "slot-b") else "modem-two")

        with patch.object(main, "_esim_resolve_reader", side_effect=lambda _idx, name: (name, 0)), \
                patch.object(main, "_esim_switch_identity", side_effect=identity), \
                patch.object(main, "_esim_resolve_se", return_value={"id": "se", "aid": None}), \
                patch.object(main, "_esim_guard_engine"), \
                patch.object(main, "_esim_imei_for_reader", return_value=""), \
                patch.object(main, "_esim_refresh_card", new=AsyncMock(return_value={})), \
                patch.object(main.hub, "broadcast", new=AsyncMock()), \
                patch.object(main.lpa, "download", new=AsyncMock(return_value={})), \
                patch.object(main.lpa, "profile_disable", new=AsyncMock()) as disable, \
                patch.object(main, "_esim_cache_update_profile"):
            with patch.object(main.asyncio, "create_task", side_effect=queue_job):
                started = await main.api_esim_download({"reader": "slot-a"})
            try:
                self.assertTrue(started["started"])
                with self.assertRaises(main.HTTPException) as blocked:
                    await main.api_esim_disable("profile", {"reader": "slot-b"})
                self.assertEqual(blocked.exception.status_code, 409)
                disable.assert_not_awaited()
                self.assertTrue((await main.api_esim_disable(
                    "other-profile", {"reader": "slot-c"}))["ok"])
                disable.assert_awaited_once()
            finally:
                await real_create_task(pending.pop())

    async def test_queued_download_cancel_prevents_lpac_start(self):
        pending = []
        real_create_task = asyncio.create_task
        reader = "queued-reader"

        def queue_job(coro):
            pending.append(coro)
            return Mock()

        with patch.object(main, "_esim_resolve_reader", return_value=(reader, 0)), \
                patch.object(main, "_esim_switch_identity", return_value=("reader:" + reader, "")), \
                patch.object(main, "_esim_resolve_se", return_value={"id": "se", "aid": None}), \
                patch.object(main, "_esim_guard_engine"), \
                patch.object(main, "_esim_imei_for_reader", return_value=""), \
                patch.object(main.hub, "broadcast", new=AsyncMock()) as broadcast, \
                patch.object(main.lpa, "download", new=AsyncMock()) as download, \
                patch.object(main.lpa, "cancel_download", new=AsyncMock(return_value=False)) as signal:
            with patch.object(main.asyncio, "create_task", side_effect=queue_job):
                started = await main.api_esim_download({"reader": reader})
            self.assertTrue((await main.api_esim_download_cancel({"reader": reader,
                "operation_id": started["operation_id"]}))["cancelled"])
            signal.assert_not_awaited()
            await real_create_task(pending.pop())
            download.assert_not_awaited()
            self.assertNotIn(reader, main.hub.esim_download_ops)
            self.assertNotIn("reader:" + reader, main.hub.esim_download_reservations)
            self.assertTrue(any(event.args[0].get("event") == "error" and
                                event.args[0].get("operation_id") == started["operation_id"]
                                for event in broadcast.call_args_list))

    async def test_running_download_cancel_signals_without_waiting_for_writer_lock(self):
        reader = "active-reader"
        entered, release = asyncio.Event(), asyncio.Event()
        tasks = []
        real_create_task = asyncio.create_task

        def capture(coro):
            task = real_create_task(coro)
            tasks.append(task)
            return task

        async def download(*args, **kwargs):
            entered.set()
            await release.wait()
            raise main.lpa.LpaError("cancelled")

        with patch.object(main, "_esim_resolve_reader", return_value=(reader, 0)), \
                patch.object(main, "_esim_switch_identity", return_value=("reader:" + reader, "")), \
                patch.object(main, "_esim_resolve_se", return_value={"id": "se", "aid": None}), \
                patch.object(main, "_esim_guard_engine"), \
                patch.object(main, "_esim_imei_for_reader", return_value=""), \
                patch.object(main.hub, "broadcast", new=AsyncMock()), \
                patch.object(main.lpa, "download", new=AsyncMock(side_effect=download)), \
                patch.object(main.lpa, "cancel_download", new=AsyncMock(return_value=True)) as signal, \
                patch.object(main.asyncio, "create_task", side_effect=capture):
            started = await main.api_esim_download({"reader": reader})
            try:
                await asyncio.wait_for(entered.wait(), 2)
                cancelled = await asyncio.wait_for(main.api_esim_download_cancel({
                    "reader": reader, "operation_id": started["operation_id"]}), 1)
                self.assertIs(cancelled["cancelled"], True)
                signal.assert_awaited_once_with(reader)
            finally:
                release.set()
                await asyncio.gather(*tasks, return_exceptions=True)
            self.assertNotIn(reader, main.hub.esim_download_ops)

    async def test_running_cancel_never_reports_normal_completion_even_if_signal_fails(self):
        for signal_result in (True, False):
            with self.subTest(signal_result=signal_result):
                reader = "normal-after-cancel-reader"
                entered, release = asyncio.Event(), asyncio.Event()
                tasks = []
                real_create_task = asyncio.create_task

                def capture(coro):
                    task = real_create_task(coro)
                    tasks.append(task)
                    return task

                async def download(*args, **kwargs):
                    entered.set()
                    await release.wait()
                    return {"iccid": "profile-new"}

                with patch.object(main, "_esim_resolve_reader", return_value=(reader, 0)), \
                        patch.object(main, "_esim_switch_identity", return_value=("reader:" + reader, "")), \
                        patch.object(main, "_esim_resolve_se", return_value={"id": "se", "aid": None}), \
                        patch.object(main, "_esim_guard_engine"), \
                        patch.object(main, "_esim_imei_for_reader", return_value=""), \
                        patch.object(main, "_esim_refresh_card", new=AsyncMock(return_value={})), \
                        patch.object(main.hub, "broadcast", new=AsyncMock()) as broadcast, \
                        patch.object(main.lpa, "download", new=AsyncMock(side_effect=download)), \
                        patch.object(main.lpa, "cancel_download",
                                     new=AsyncMock(return_value=signal_result)) as signal, \
                        patch.object(main.asyncio, "create_task", side_effect=capture):
                    started = await main.api_esim_download({"reader": reader})
                    try:
                        await asyncio.wait_for(entered.wait(), 2)
                        accepted = await main.api_esim_download_cancel({
                            "reader": reader, "operation_id": started["operation_id"]})
                        self.assertTrue(accepted["cancelled"])
                        signal.assert_awaited_once_with(reader)
                    finally:
                        release.set()
                        await asyncio.gather(*tasks, return_exceptions=True)
                    events = [call.args[0]["event"] for call in broadcast.call_args_list]
                    self.assertIn("error", events)
                    self.assertNotIn("completed", events)
                    error = next(call.args[0] for call in broadcast.call_args_list
                                 if call.args[0]["event"] == "error")
                    self.assertIn("outcome unknown", error["error"])
                    self.assertNotIn(reader, main.hub.esim_download_ops)
                    self.assertNotIn(started["operation_id"], main.hub.esim_download_cancelled)

    async def test_lpa_cancel_reports_unable_to_signal_process(self):
        reader = "signal-failure-reader"
        proc = Mock(returncode=None)
        proc.send_signal.side_effect = OSError("signal failed")
        proc.kill.side_effect = OSError("kill failed")
        with patch.dict(main.lpa._active, {reader: proc}):
            self.assertFalse(await main.lpa.cancel_download(reader))
        proc.send_signal.assert_called_once()
        proc.kill.assert_called_once()

    async def test_cancel_during_post_download_refresh_does_not_complete(self):
        reader = "refresh-reader"
        entered, release = asyncio.Event(), asyncio.Event()
        tasks = []
        real_create_task = asyncio.create_task

        def capture(coro):
            task = real_create_task(coro)
            tasks.append(task)
            return task

        async def refresh(*args):
            entered.set()
            await release.wait()
            return {}

        with patch.object(main, "_esim_resolve_reader", return_value=(reader, 0)), \
                patch.object(main, "_esim_switch_identity", return_value=("reader:" + reader, "")), \
                patch.object(main, "_esim_resolve_se", return_value={"id": "se", "aid": None}), \
                patch.object(main, "_esim_guard_engine"), \
                patch.object(main, "_esim_imei_for_reader", return_value=""), \
                patch.object(main, "_esim_refresh_card", new=AsyncMock(side_effect=refresh)), \
                patch.object(main.hub, "broadcast", new=AsyncMock()) as broadcast, \
                patch.object(main.lpa, "download", new=AsyncMock(return_value={})), \
                patch.object(main.lpa, "cancel_download", new=AsyncMock(return_value=False)), \
                patch.object(main.asyncio, "create_task", side_effect=capture):
            started = await main.api_esim_download({"reader": reader})
            try:
                await asyncio.wait_for(entered.wait(), 2)
                self.assertTrue((await main.api_esim_download_cancel({
                    "reader": reader, "operation_id": started["operation_id"]}))["cancelled"])
            finally:
                release.set()
                await asyncio.gather(*tasks, return_exceptions=True)
            events = [call.args[0]["event"] for call in broadcast.call_args_list]
            self.assertIn("error", events)
            self.assertNotIn("completed", events)

    async def test_terminal_broadcast_rejects_late_cancel_without_releasing_reservation(self):
        for fail in (False, True):
            with self.subTest(fail=fail):
                reader = "terminal-reader"
                entered, release = asyncio.Event(), asyncio.Event()
                replacement_entered, replacement_release = asyncio.Event(), asyncio.Event()
                tasks = []
                downloads = 0
                real_create_task = asyncio.create_task

                def capture(coro):
                    task = real_create_task(coro)
                    tasks.append(task)
                    return task

                async def broadcast(event):
                    if event.get("event") in ("completed", "error"):
                        entered.set()
                        await release.wait()

                async def download(*args, **kwargs):
                    nonlocal downloads
                    downloads += 1
                    if downloads == 2:
                        replacement_entered.set()
                        await replacement_release.wait()
                    elif fail:
                        raise main.lpa.LpaError("lpac failed")
                    return {"iccid": "profile"}

                with patch.object(main, "_esim_resolve_reader", return_value=(reader, 0)), \
                        patch.object(main, "_esim_switch_identity", return_value=("reader:" + reader, "")), \
                        patch.object(main, "_esim_resolve_se", return_value={"id": "se", "aid": None}), \
                        patch.object(main, "_esim_guard_engine"), \
                        patch.object(main, "_esim_imei_for_reader", return_value=""), \
                        patch.object(main, "_esim_refresh_card", new=AsyncMock(return_value={})), \
                        patch.object(main.hub, "broadcast", new=AsyncMock(side_effect=broadcast)), \
                        patch.object(main.lpa, "download", new=AsyncMock(side_effect=download)), \
                        patch.object(main.lpa, "cancel_download", new=AsyncMock()) as signal, \
                        patch.object(main.asyncio, "create_task", side_effect=capture):
                    started = await main.api_esim_download({"reader": reader})
                    try:
                        await asyncio.wait_for(entered.wait(), 2)
                        self.assertEqual(main.hub.esim_download_reservations["reader:" + reader],
                                         started["operation_id"])
                        self.assertTrue(main.hub.esim_switch_lock("reader:" + reader).locked())
                        rejected = await main.api_esim_download_cancel({
                            "reader": reader, "operation_id": started["operation_id"]})
                        self.assertFalse(rejected["cancelled"])
                        signal.assert_not_awaited()
                    finally:
                        release.set()
                        await asyncio.gather(*tasks, return_exceptions=True)
                    self.assertNotIn("reader:" + reader, main.hub.esim_download_reservations)
                    self.assertNotIn(reader, main.hub.esim_download_ops)
                    replacement = await main.api_esim_download({"reader": reader})
                    try:
                        await asyncio.wait_for(replacement_entered.wait(), 2)
                        self.assertFalse((await main.api_esim_download_cancel({
                            "reader": reader,
                            "operation_id": started["operation_id"]}))["cancelled"])
                        self.assertEqual(main.hub.esim_download_ops[reader],
                                         replacement["operation_id"])
                        signal.assert_not_awaited()
                    finally:
                        replacement_release.set()
                        await asyncio.gather(*tasks, return_exceptions=True)

    async def test_queued_cancel_terminal_broadcast_rejects_second_cancel(self):
        reader = "queued-terminal-reader"
        pending = []
        entered, release = asyncio.Event(), asyncio.Event()
        real_create_task = asyncio.create_task

        def queue_job(coro):
            pending.append(coro)
            return Mock()

        async def broadcast(event):
            if event.get("event") == "error":
                entered.set()
                await release.wait()

        with patch.object(main, "_esim_resolve_reader", return_value=(reader, 0)), \
                patch.object(main, "_esim_switch_identity", return_value=("reader:" + reader, "")), \
                patch.object(main, "_esim_resolve_se", return_value={"id": "se", "aid": None}), \
                patch.object(main, "_esim_guard_engine"), \
                patch.object(main, "_esim_imei_for_reader", return_value=""), \
                patch.object(main.hub, "broadcast", new=AsyncMock(side_effect=broadcast)), \
                patch.object(main.lpa, "download", new=AsyncMock()) as download:
            with patch.object(main.asyncio, "create_task", side_effect=queue_job):
                started = await main.api_esim_download({"reader": reader})
            self.assertTrue((await main.api_esim_download_cancel({
                "reader": reader, "operation_id": started["operation_id"]}))["cancelled"])
            job = real_create_task(pending.pop())
            try:
                await asyncio.wait_for(entered.wait(), 2)
                self.assertFalse((await main.api_esim_download_cancel({
                    "reader": reader, "operation_id": started["operation_id"]}))["cancelled"])
                self.assertEqual(main.hub.esim_download_reservations["reader:" + reader],
                                 started["operation_id"])
            finally:
                release.set()
                await asyncio.gather(job, return_exceptions=True)
            download.assert_not_awaited()

    async def test_delayed_cancel_does_not_mark_replacement_operation(self):
        reader = "replacement-reader"
        entered, old_release = asyncio.Event(), asyncio.Event()
        signal_entered, signal_release = asyncio.Event(), asyncio.Event()
        new_entered, new_release = asyncio.Event(), asyncio.Event()
        jobs = []
        real_create_task = asyncio.create_task

        def capture(coro):
            job = real_create_task(coro)
            jobs.append(job)
            return job

        async def download(*args, **kwargs):
            if len(jobs) == 1:
                entered.set()
                await old_release.wait()
            else:
                new_entered.set()
                await new_release.wait()
            return {"iccid": "profile"}

        async def signal(_reader):
            signal_entered.set()
            await signal_release.wait()
            return True

        with patch.object(main, "_esim_resolve_reader", return_value=(reader, 0)), \
                patch.object(main, "_esim_switch_identity", return_value=("reader:" + reader, "")), \
                patch.object(main, "_esim_resolve_se", return_value={"id": "se", "aid": None}), \
                patch.object(main, "_esim_guard_engine"), \
                patch.object(main, "_esim_imei_for_reader", return_value=""), \
                patch.object(main, "_esim_refresh_card", new=AsyncMock(return_value={})), \
                patch.object(main.hub, "broadcast", new=AsyncMock()) as broadcast, \
                patch.object(main.lpa, "download", new=AsyncMock(side_effect=download)), \
                patch.object(main.lpa, "cancel_download", new=AsyncMock(side_effect=signal)), \
                patch.object(main.asyncio, "create_task", side_effect=capture):
            first = await main.api_esim_download({"reader": reader})
            cancel = None
            try:
                await asyncio.wait_for(entered.wait(), 2)
                cancel = real_create_task(main.api_esim_download_cancel({
                    "reader": reader, "operation_id": first["operation_id"]}))
                await asyncio.wait_for(signal_entered.wait(), 2)
                old_release.set()
                await asyncio.wait_for(jobs[0], 2)
                second = await main.api_esim_download({"reader": reader})
                await asyncio.wait_for(new_entered.wait(), 2)
                signal_release.set()
                self.assertTrue((await asyncio.wait_for(cancel, 2))["cancelled"])
                self.assertNotIn(second["operation_id"], main.hub.esim_download_cancelled)
                self.assertEqual(main.hub.esim_download_ops[reader], second["operation_id"])
                stale_cancelling = [call.args[0] for call in broadcast.call_args_list
                                    if call.args[0].get("event") == "cancelling" and
                                    call.args[0].get("operation_id") == first["operation_id"]]
                self.assertEqual(stale_cancelling, [])
            finally:
                signal_release.set()
                old_release.set()
                new_release.set()
                await asyncio.gather(*jobs, return_exceptions=True)
                if cancel:
                    await asyncio.gather(cancel, return_exceptions=True)

    async def test_sse_disconnect_cancels_only_its_operation(self):
        from starlette.requests import Request

        async def run_case(current_id):
            listeners = main.hub.esim_download_listeners
            reader = "stream-reader"

            async def start(_body):
                main.hub.esim_download_ops[reader] = "newer" if current_id == "old" else current_id
                return {"started": True, "operation_id": current_id}

            scope = {"type": "http", "method": "POST", "scheme": "https",
                     "server": ("gateway.example", 443), "path": "/api/mobile/v1/devices/line/esim/actions/download",
                     "root_path": "", "headers": []}
            route = next(r for r in main.app.routes
                         if r.path == "/api/mobile/v1/devices/{iid}/esim/actions/download"
                         and "POST" in r.methods)
            with patch.object(main, "_unified_devices", new=AsyncMock(return_value=[
                    {"id": "physical", "instance_id": "line", "present": True,
                     "reader": reader}])), \
                    patch.object(main.cfg, "get_instance", return_value={"id": "line", "iccid": "8901"}), \
                    patch.dict(main.hub.cards, {reader: {"iccid": "8901"}}, clear=True), \
                    patch.object(main, "_esim_resolve_reader", return_value=(reader, 0)), \
                    patch.object(main, "api_esim_download", new=AsyncMock(side_effect=start)), \
                    patch.object(main, "api_esim_download_cancel", new=AsyncMock()) as cancel:
                response = await route.endpoint("line", {}, Request(scope))
                stream = response.body_iterator
                queue = next(iter(listeners[reader]))
                queue.put_nowait({"operation_id": current_id, "event": "progress",
                                  "step": "downloading", "data": "progress"})
                self.assertIn("event: progress", await asyncio.wait_for(stream.__anext__(), 1))
                # ASGI closes an already-running iterator after disconnect.
                await stream.aclose()
                if current_id == "old":
                    cancel.assert_not_awaited()
                else:
                    cancel.assert_awaited_once_with({"reader": reader,
                        "reader_index": 0, "operation_id": current_id})
            main.hub.esim_download_ops.pop(reader, None)
            main.hub.esim_download_listeners.pop(reader, None)

        await run_case("active")
        await run_case("old")

    async def test_cancel_during_started_broadcast_prevents_lpac_start(self):
        reader = "broadcast-reader"
        tasks = []
        real_create_task = asyncio.create_task
        cancellations = []

        def capture(coro):
            task = real_create_task(coro)
            tasks.append(task)
            return task

        async def broadcast(event):
            if event.get("event") == "started":
                cancellations.append(await main.api_esim_download_cancel({
                    "reader": reader, "operation_id": event["operation_id"]}))

        with patch.object(main, "_esim_resolve_reader", return_value=(reader, 0)), \
                patch.object(main, "_esim_switch_identity", return_value=("reader:" + reader, "")), \
                patch.object(main, "_esim_resolve_se", return_value={"id": "se", "aid": None}), \
                patch.object(main, "_esim_guard_engine"), \
                patch.object(main, "_esim_imei_for_reader", return_value=""), \
                patch.object(main.hub, "broadcast", new=AsyncMock(side_effect=broadcast)), \
                patch.object(main.lpa, "download", new=AsyncMock()) as download, \
                patch.object(main.lpa, "cancel_download", new=AsyncMock(return_value=False)) as signal, \
                patch.object(main.asyncio, "create_task", side_effect=capture):
            await main.api_esim_download({"reader": reader})
            await asyncio.gather(*tasks)
            self.assertEqual(cancellations, [{"ok": True, "cancelled": True}])
            signal.assert_awaited_once_with(reader)
            download.assert_not_awaited()

    async def test_lpa_failure_restores_previous_line_snapshot(self):
        previous = {"1": {"enabled": True, "running": True}}
        error = main.HTTPException(400, "lpac failed")
        with patch.object(main, "_esim_resolve_reader", return_value=("reader", 0)), \
                patch.object(main, "_esim_switch_identity",
                             return_value=("modem-1", "modem-1")), \
                patch.object(main, "_esim_prepare_profile_switch",
                             new=AsyncMock(return_value=previous)), \
                patch.object(main, "_esim_modem_reader_names", return_value=["reader"]), \
                patch.object(main, "_esim_resolve_se", return_value={"id": "se", "aid": "a"}), \
                patch.object(main, "_esim_profile_inventory", new=AsyncMock(return_value=(
                    "eid-1", "profile-old", {"profile-old", "profile-target"}))), \
                patch.object(main.lpa, "profile_enable", new=AsyncMock(side_effect=error)), \
                patch.object(main, "_esim_run", side_effect=self._run_captured), \
                patch.object(main, "_esim_compensate_enable",
                             new=AsyncMock(return_value="profile-old")) as compensate:
            with self.assertRaises(main.HTTPException):
                await main.api_esim_enable("profile-target", {})

        compensate.assert_awaited_once_with(
            "reader", 0, "modem-1", "profile-target",
            {"eid": "eid-1", "previous_iccid": "profile-old", "aid": "a"}, previous)
        self.assertNotIn("reader", main.hub.lpa_busy)

    async def test_compensation_reenables_old_profile_only_on_same_euicc(self):
        previous = {"1": {"enabled": True, "running": True},
                    "2": {"enabled": False, "running": False}}
        inventory = [("eid-a", "profile-target", {"profile-old", "profile-target"}),
                     ("eid-a", "profile-old", {"profile-old", "profile-target"})]
        with patch.object(main, "_esim_profile_inventory", new=AsyncMock(
                side_effect=inventory)), \
                patch.object(main, "_match_instance_by_iccid", return_value=None), \
                patch.object(main.lpa, "profile_enable", new=AsyncMock()) as enable, \
                patch.object(main, "_esim_restart_modem_bridge", new=AsyncMock()), \
                patch.object(main, "_esim_refresh_modem_readers", new=AsyncMock()), \
                patch.object(main, "_esim_restore_profile_switch",
                             new=AsyncMock()) as restore:
            result = await main._esim_compensate_enable(
                "reader", 0, "modem-1", "profile-target",
                {"eid": "eid-a", "previous_iccid": "profile-old", "aid": "aid-a"}, previous)
        self.assertEqual(result, "profile-old")
        enable.assert_awaited_once_with("reader", "profile-old", aid="aid-a")
        restore.assert_awaited_once_with(previous, verified_iccid="profile-old")

    async def test_wrong_euicc_blocks_compensation_and_engine_restart(self):
        with patch.object(main, "_esim_profile_inventory", new=AsyncMock(
                return_value=("eid-b", "profile-target", {"profile-old"}))), \
                patch.object(main, "_match_instance_by_iccid", return_value=None), \
                patch.object(main.lpa, "profile_enable", new=AsyncMock()) as enable, \
                patch.object(main, "_esim_restore_profile_switch",
                             new=AsyncMock()) as restore:
            with self.assertRaisesRegex(RuntimeError, "EID changed"):
                await main._esim_compensate_enable(
                    "reader", 0, "modem-1", "profile-target",
                    {"eid": "eid-a", "previous_iccid": "profile-old"},
                    {"1": {"enabled": True, "running": True}})
        enable.assert_not_awaited()
        restore.assert_not_awaited()

    async def test_verified_compensation_never_restarts_other_card_line(self):
        lines = {"1": {"id": "1", "enabled": False, "iccid": "profile-old"},
                 "2": {"id": "2", "enabled": False, "iccid": "other-card"}}

        def upsert(value):
            lines[value["id"]].update(value)
            return dict(lines[value["id"]])

        prior = {iid: {"enabled": True, "running": True} for iid in lines}
        with patch.object(main.cfg, "get_instance", side_effect=lambda iid: dict(lines[iid])), \
                patch.object(main.cfg, "upsert_instance", side_effect=upsert), \
                patch.object(main.cfg, "get_settings", return_value={}), \
                patch.object(main, "_start_engine_checked") as start, \
                patch.object(main.egress, "publish"):
            await main._esim_restore_profile_switch(prior, verified_iccid="profile-old")
        self.assertTrue(lines["1"]["enabled"])
        self.assertTrue(lines["2"]["enabled"])
        start.assert_called_once()
        self.assertEqual(start.call_args.args[0]["id"], "1")

    async def test_unverified_card_keeps_line_off_after_profile_reenable(self):
        inventory = [("eid-a", "profile-target", {"profile-old", "profile-target"}),
                     ("eid-a", "profile-old", {"profile-old", "profile-target"})]
        with patch.object(main, "_esim_profile_inventory", new=AsyncMock(
                side_effect=inventory)), \
                patch.object(main, "_match_instance_by_iccid", return_value=None), \
                patch.object(main.lpa, "profile_enable", new=AsyncMock()) as enable, \
                patch.object(main, "_esim_restart_modem_bridge",
                             new=AsyncMock(side_effect=RuntimeError("bridge unavailable"))), \
                patch.object(main, "_esim_restore_profile_switch",
                             new=AsyncMock()) as restore:
            with self.assertRaisesRegex(RuntimeError, "bridge unavailable"):
                await main._esim_compensate_enable(
                    "reader", 0, "modem-1", "profile-target",
                    {"eid": "eid-a", "previous_iccid": "profile-old"},
                    {"1": {"enabled": True, "running": True}})
        enable.assert_awaited_once()
        restore.assert_not_awaited()

    async def test_inventory_requires_eid_and_single_enabled_profile(self):
        with patch.object(main.lpa, "chip_info", new=AsyncMock(return_value={"eid": "eid-a"})), \
                patch.object(main.lpa, "profile_list", new=AsyncMock(return_value=[
                    {"iccid": "one", "profileState": "enabled"},
                    {"iccid": "two", "profileState": "enabled"}])):
            with self.assertRaisesRegex(RuntimeError, "ambiguous"):
                await main._esim_profile_inventory("reader", None)

    async def test_missing_eid_cannot_be_treated_as_same_card(self):
        with patch.object(main.lpa, "chip_info", new=AsyncMock(return_value={"eid": ""})), \
                patch.object(main.lpa, "profile_list", new=AsyncMock(return_value=[
                    {"iccid": "profile-old", "profileState": "enabled"}])):
            with self.assertRaisesRegex(RuntimeError, "eUICC identity"):
                await main._esim_profile_inventory("reader", "aid")

    async def test_idempotent_enable_is_verified_against_physical_card(self):
        main.esim_switch_progress._progress.clear()
        with patch.object(main, "_esim_resolve_reader", return_value=("reader", 0)), \
                patch.object(main, "_esim_switch_identity",
                             return_value=("modem-1", "modem-1")), \
                patch.object(main, "_esim_resolve_se", return_value={"id": "se", "aid": "a"}), \
                patch.object(main, "_esim_profile_inventory", new=AsyncMock(return_value=(
                    "eid-a", "profile-target", {"profile-target"}))), \
                patch.object(main, "_esim_probe_card", new=AsyncMock(return_value=
                             SimpleNamespace(iccid="profile-target"))), \
                patch.object(main, "_esim_run", side_effect=self._run_captured), \
                patch.object(main, "_esim_prepare_profile_switch", new=AsyncMock()) as prepare, \
                patch.object(main.lpa, "profile_enable", new=AsyncMock()) as enable:
            result = await main.api_esim_enable("profile-target", {})
        self.assertTrue(result["verified"])
        self.assertEqual(result["card"]["iccid"], "profile-target")
        prepare.assert_not_awaited()
        enable.assert_not_awaited()
        shot = result["esim_switch"]
        self.assertEqual(shot["status"], "")
        self.assertFalse(shot["active"])
        self.assertEqual(len(shot["phases"]), 11)
        self.assertEqual([step["label"] for step in shot["steps"]],
                         ["停网", "飞行", "写卡", "校验", "恢复"])

    async def test_compensation_failure_remains_distinct_from_enable_failure(self):
        previous = {"1": {"enabled": True, "running": True}}
        with patch.object(main, "_esim_resolve_reader", return_value=("reader", 0)), \
                patch.object(main, "_esim_switch_identity",
                             return_value=("modem-1", "modem-1")), \
                patch.object(main, "_esim_prepare_profile_switch",
                             new=AsyncMock(return_value=previous)), \
                patch.object(main, "_esim_modem_reader_names", return_value=["reader"]), \
                patch.object(main, "_esim_resolve_se", return_value={"id": "se", "aid": "a"}), \
                patch.object(main, "_esim_profile_inventory", new=AsyncMock(return_value=(
                    "eid-a", "profile-old", {"profile-old", "profile-target"}))), \
                patch.object(main.lpa, "profile_enable",
                             new=AsyncMock(side_effect=RuntimeError("enable failed"))), \
                patch.object(main, "_esim_run", side_effect=self._run_captured), \
                patch.object(main, "_esim_compensate_enable",
                             new=AsyncMock(side_effect=RuntimeError("EID changed"))):
            with self.assertRaises(main.HTTPException) as raised:
                await main.api_esim_enable("profile-target", {})
        self.assertEqual(raised.exception.status_code, 503)
        self.assertIn("enable failed", raised.exception.detail)
        self.assertIn("compensation failed: EID changed", raised.exception.detail)
        shot = main.esim_switch_progress.snapshot("reader")
        self.assertEqual(shot["phase"], "failure_ims_recovery")
        self.assertEqual(shot["fail_reason"], "rollback_failed")
        self.assertTrue(shot["recoverable"])

    async def test_cancelled_request_awaits_compensation_before_releasing_reader(self):
        previous = {"1": {"enabled": True, "running": True}}
        calls = 0

        async def cancel_after_snapshot(_name, _idx, coro, **_kwargs):
            nonlocal calls
            calls += 1
            result = await coro
            if calls == 2:
                raise __import__("asyncio").CancelledError()
            return result

        with patch.object(main, "_esim_resolve_reader", return_value=("reader", 0)), \
                patch.object(main, "_esim_switch_identity",
                             return_value=("modem-1", "modem-1")), \
                patch.object(main, "_esim_prepare_profile_switch",
                             new=AsyncMock(return_value=previous)), \
                patch.object(main, "_esim_modem_reader_names", return_value=["reader"]), \
                patch.object(main, "_esim_resolve_se", return_value={"id": "se", "aid": "a"}), \
                patch.object(main, "_esim_profile_inventory", new=AsyncMock(return_value=(
                    "eid-a", "profile-old", {"profile-old", "profile-target"}))), \
                patch.object(main.lpa, "profile_enable", new=AsyncMock()), \
                patch.object(main, "_esim_run", side_effect=cancel_after_snapshot), \
                patch.object(main, "_esim_compensate_enable",
                             new=AsyncMock(return_value="profile-old")) as compensate:
            with self.assertRaises(__import__("asyncio").CancelledError):
                await main.api_esim_enable("profile-target", {})
            compensate.assert_awaited_once()
            self.assertNotIn("reader", main.hub.lpa_busy)


def _encode_iccid(iccid: str) -> bytes:
    digits = iccid + "F" * (len(iccid) % 2)
    return bytes(int(digits[i], 16) | (int(digits[i + 1], 16) << 4)
                 for i in range(0, len(digits), 2))


class BridgeIdentityTests(unittest.TestCase):
    """The bridge must publish the card's ICCID, not the baseband's cached one.

    An eSIM profile switch happens over AT+CSIM behind the baseband, whose AT+CCID cache
    then keeps the previous profile until a SIM re-init — which made every post-switch
    bridge rebuild verification time out (issue #26).
    """

    CARD_ICCID = "8900000000000000001"
    STALE_AT_ICCID = "8900000000000000002"

    def _card(self, csim_responses):
        card = object.__new__(vpcd_modem_bridge.ModemCard)
        card.debug = False
        card.calls = []

        def csim(apdu):
            card.calls.append(apdu.hex().upper())
            response = csim_responses.get(apdu.hex().upper())
            if response is None:
                raise vpcd_modem_bridge.ModemError("unexpected APDU")
            return response

        def _at(command):
            if command in ("AT+CGSN", "AT+GSN"):
                return b"123456789012345\r\nOK"
            if command in ("AT+CCID", "AT+ICCID"):
                return b'+QCCID: %s\r\nOK' % self.STALE_AT_ICCID.encode()
            raise vpcd_modem_bridge.ModemError("unexpected AT command")

        card.csim = csim
        card._at = _at
        return card

    def test_decode_bcd_iccid(self):
        self.assertEqual(
            vpcd_modem_bridge.decode_bcd_iccid(_encode_iccid(self.CARD_ICCID)),
            self.CARD_ICCID)
        self.assertEqual(vpcd_modem_bridge.decode_bcd_iccid(b"\xab" * 10), "")

    def test_identity_prefers_the_card_over_the_baseband_cache(self):
        card = self._card({
            "00A4080C022FE2": b"\x90\x00",
            "00B000000A": _encode_iccid(self.CARD_ICCID) + b"\x90\x00",
            "00A40004023F00": b"\x90\x00",
        })
        identity = card.identity()
        self.assertEqual(identity["iccid"], self.CARD_ICCID)
        self.assertEqual(identity["imei"], "123456789012345")
        # The basic-channel file state is restored for the baseband afterwards.
        self.assertEqual(card.calls[-1], "00A40004023F00")

    def test_identity_falls_back_to_at_when_the_card_read_fails(self):
        card = self._card({})
        identity = card.identity()
        self.assertEqual(identity["iccid"], self.STALE_AT_ICCID)

    def test_incomplete_refresh_keeps_verified_hardware_imei_only(self):
        previous = {"imei": "123456789012345", "iccid": self.CARD_ICCID}
        refreshed = vpcd_modem_bridge.retain_hardware_identity(
            previous, {"imei": "", "iccid": ""})

        self.assertEqual(refreshed["imei"], previous["imei"])
        # A blank ICCID is meaningful evidence of removal, unlike a blank IMEI read.
        self.assertEqual(refreshed["iccid"], "")

    def test_complete_refresh_replaces_the_previous_identity(self):
        refreshed = vpcd_modem_bridge.retain_hardware_identity(
            {"imei": "123456789012345", "iccid": self.CARD_ICCID},
            {"imei": "350000000000018", "iccid": self.STALE_AT_ICCID})

        self.assertEqual(refreshed, {
            "imei": "350000000000018", "iccid": self.STALE_AT_ICCID})


if __name__ == "__main__":
    unittest.main()
