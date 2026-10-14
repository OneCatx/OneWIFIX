"""Phone task, log, access, dial and carrier-name helpers."""
import os
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from control.app import phone_extras


class DialAndNameTests(unittest.TestCase):
    def test_service_number_and_national_prefix_are_expanded(self):
        profile = {"dial": {"calling_code": "44", "national_prefix": "0",
                            "service_numbers": {"888": "+447870020888"}}}
        self.assertEqual(phone_extras.canonicalize_dial("888", profile), "+447870020888")
        self.assertEqual(phone_extras.canonicalize_dial("07900000000", profile),
                         "+447900000000")
        self.assertEqual(phone_extras.canonicalize_dial("+447900000000", profile),
                         "+447900000000")

    def test_known_profile_has_a_display_name_and_an_unknown_one_does_not(self):
        att = phone_extras.carrier_label({"id": "att-us"}, "310", "280")
        self.assertEqual(att["name"], "AT&T")
        self.assertEqual(att["plmn"], "310280")
        self.assertEqual(phone_extras.carrier_label({"id": "standard-3gpp"}, "234", "15")["name"],
                         "")
        from control.app import mobile_dto
        row = mobile_dto.device(
            {"id": "line", "enabled": True, "mcc": "310", "mnc": "280",
             "imsi": "310280123456789"},
            {"state": "OK"}, {"present": True})
        self.assertEqual(row["modem"]["home_carrier_name"], "AT&T")
        self.assertTrue(row["radio_registered"])
        self.assertEqual(row["modem"]["network_mode"], "VoWiFi")
        self.assertEqual(row["signal_dbm"], 0)


class TaskTests(unittest.TestCase):
    def test_create_list_and_run_round_trip(self):
        stored, task = phone_extras.save_task({}, {
            "name": "Morning", "device_id": "sim1", "task_type": "sms",
            "interval_days": 0,
            "start_date": "2026-10-14", "run_time": "09:00",
            "payload": {"phone": "+1", "message": "hi", "extra": "drop"},
        })
        self.assertEqual(task["id"], 1)
        self.assertEqual(task["payload"], {"phone": "+1", "message": "hi"})
        self.assertEqual(phone_extras.tasks_view(stored)["tasks"][0]["name"], "Morning")
        later, run = phone_extras.begin_run(stored, task, "sms accepted", "", "success")
        self.assertEqual(run["status"], "success")
        self.assertEqual(run["device_id"], "sim1")
        self.assertFalse(later["tasks"][0]["enabled"])

    def test_bad_task_is_refused(self):
        with self.assertRaises(phone_extras.PhoneExtraError):
            phone_extras.save_task({}, {"name": "x"})


class AccessTests(unittest.TestCase):
    def test_internal_list_allows_only_matching_clients(self):
        saved = phone_extras.security_save({}, {
            "mode": "internal", "allowed_cidrs": ["10.0.0.0/8"],
            "trust_proxy_headers": False, "trusted_proxy_cidrs": [],
        })
        settings = {"security": saved}
        self.assertTrue(phone_extras.client_allowed("10.1.2.3", settings))
        self.assertFalse(phone_extras.client_allowed("192.0.2.10", settings))
        view = phone_extras.security_view(settings, "10.1.2.3")
        self.assertTrue(view["client_allowed"])
        self.assertEqual(view["client_ip"], "10.1.2.3")

    def test_turning_proxy_trust_off_retires_the_old_list(self):
        current = {"security": {"trusted_proxies": ["10.0.0.0/8"], "trust_proxy_headers": True}}
        saved = phone_extras.security_save(current, {
            "mode": "internal", "allowed_cidrs": ["203.0.113.0/24"],
            "trust_proxy_headers": False, "trusted_proxy_cidrs": ["10.0.0.0/8"],
        })
        settings = {"security": saved}
        self.assertFalse(phone_extras.trusted_proxy_peer("10.1.2.3", settings))
        self.assertEqual(saved["trusted_proxies"], [])
        legacy = {"security": {"trusted_proxies": ["10.0.0.0/8"]}}
        self.assertTrue(phone_extras.trusted_proxy_peer("10.1.2.3", legacy))

    def test_forwarded_client_counts_only_through_a_trusted_proxy(self):
        settings = {"security": {
            "mode": "internal", "allowed_cidrs": ["203.0.113.0/24"],
            "trust_proxy_headers": True, "trusted_proxies": ["10.0.0.0/8"],
            "trusted_proxy_cidrs": ["10.0.0.0/8"],
        }}
        self.assertEqual(
            phone_extras.effective_client("10.1.2.3", "203.0.113.9", settings), "203.0.113.9")
        self.assertTrue(phone_extras.client_allowed(
            phone_extras.effective_client("10.1.2.3", "203.0.113.9", settings), settings))
        self.assertFalse(phone_extras.client_allowed(
            phone_extras.effective_client("10.1.2.3", "198.51.100.4", settings), settings))
        self.assertEqual(
            phone_extras.effective_client("198.51.100.4", "10.2.3.4", settings), "198.51.100.4")
        self.assertEqual(
            phone_extras.effective_client(
                "10.0.0.1", "1.2.3.4, 203.0.113.9, 10.0.0.2", settings),
            "203.0.113.9")
        off = {"security": {**settings["security"], "trust_proxy_headers": False,
                            "trusted_proxies": ["10.0.0.0/8"]}}
        self.assertEqual(
            phone_extras.effective_client("10.1.2.3", "203.0.113.9", off), "10.1.2.3")

    def test_https_stays_on_and_uses_the_listen_port(self):
        saved = phone_extras.https_save({"security": {"https_only": True}}, {"enabled": False})
        self.assertTrue(saved["https_only"])
        view = phone_extras.https_view({"security": saved, "tls": {"domain": "gw.example"},
                                        "http_port": 10443})
        self.assertTrue(view["enabled"])
        self.assertTrue(view["tls_required"])
        self.assertEqual(view["https_url"], "https://gw.example:10443")
        self.assertEqual(view["http_url"], "")
        self.assertEqual(phone_extras.https_view({"tls": {"domain": "gw.example"}})["https_url"],
                         "https://gw.example:8443")
        with patch.dict(os.environ, {"ONEWIFI_HTTP_PORT": "9443"}):
            self.assertEqual(phone_extras.listen_port({"http_port": 8443}), 9443)

    def test_developer_quota_is_bounded(self):
        saved = phone_extras.developer_save({"device_limit": 8, "sms_hourly_limit": 20})
        self.assertEqual(saved["device_limit"], 8)
        with self.assertRaises(phone_extras.PhoneExtraError):
            phone_extras.developer_save({"device_limit": 0})


class LogTests(unittest.TestCase):
    def test_history_filters_level_and_text(self):
        phone_extras.remember("info", "quiet")
        phone_extras.remember("error", "disk full")
        rows = phone_extras.history(level="warn", search="disk")["logs"]
        self.assertEqual([row["message"] for row in rows], ["disk full"])
        self.assertTrue(rows[0]["time"].endswith("Z"))


class ScheduleTests(unittest.TestCase):
    def _task(self, **extra):
        body = {
            "name": "Morning", "device_id": "sim1", "task_type": "sms",
            "enabled": True, "interval_days": 1, "notify": False,
            "start_date": "2026-10-15", "run_time": "09:00",
        }
        body.update(extra)
        return phone_extras.save_task({}, body)

    def test_local_time_is_stored_in_utc(self):
        _stored, shanghai = self._task(timezone="Asia/Shanghai")
        _stored, utc = self._task()
        self.assertEqual(shanghai["next_run_at"], "2026-10-15T01:00:00Z")
        self.assertEqual(utc["next_run_at"], "2026-10-15T09:00:00Z")
        with self.assertRaises(phone_extras.PhoneExtraError):
            self._task(timezone="Not/AZone")
        with self.assertRaises(phone_extras.PhoneExtraError):
            self._task(timezone="America/New_York", start_date="2026-03-08", run_time="02:30")
        _stored, folded = self._task(timezone="America/New_York", start_date="2026-11-01",
                                     run_time="01:30")
        again, _task = phone_extras.save_task(_stored, {
            "name": "Morning renamed", "device_id": "sim1", "task_type": "sms",
            "enabled": True, "interval_days": 1, "notify": False,
            "timezone": "America/New_York", "start_date": "2026-11-01", "run_time": "01:30",
        }, folded["id"])
        self.assertEqual(again["tasks"][0]["next_run_at"], folded["next_run_at"])

    def test_a_month_offline_runs_once_and_lands_in_the_future(self):
        stored, task = self._task(start_date="2026-09-01", run_time="00:00")
        moment = datetime(2026, 10, 15, tzinfo=timezone.utc)
        claimed_blob, claimed, skipped = phone_extras.claim_due(stored, moment)
        self.assertEqual(len(claimed), 1)
        self.assertEqual(skipped, [])
        again, second, _skipped = phone_extras.claim_due(claimed_blob, moment)
        self.assertIsNone(again)
        self.assertEqual(second, [])
        finished, run = phone_extras.begin_run(
            claimed_blob, claimed[0], "sms accepted", "", "success", now=moment)
        nxt = phone_extras._parse(finished["tasks"][0]["next_run_at"])
        self.assertGreater(nxt, moment)
        self.assertEqual(phone_extras.due_tasks(finished, moment + timedelta(seconds=30)), [])
        self.assertEqual(run["status"], "success")
        self.assertEqual(len(finished["runs"]), 1)

    def test_manual_run_keeps_the_plan_and_a_second_claim_waits(self):
        stored, task = self._task()
        moment = datetime(2026, 10, 14, tzinfo=timezone.utc)
        claimed = phone_extras.claim_task(stored, task["id"], moment)
        self.assertIsNotNone(claimed)
        self.assertIsNone(phone_extras.claim_task(claimed[0], task["id"], moment))
        finished, run = phone_extras.begin_run(
            claimed[0], claimed[1], "started", "", "started", scheduled=False, now=moment)
        self.assertTrue(run["manual"])
        self.assertEqual(finished["tasks"][0]["next_run_at"], task["next_run_at"])
        self.assertTrue(finished["tasks"][0]["enabled"])
        self.assertNotIn("claim_until", finished["tasks"][0])

    def test_profile_channel_and_result_are_explicit(self):
        task = {"task_type": "sms", "environment": "cellular", "profile_iccid": "8944",
                "payload": {"phone": "+1", "message": "hi"}}
        blocked = phone_extras.execution_plan(task, {"iccid": "0000"})
        self.assertEqual(blocked["action"], "fail")
        allowed = phone_extras.execution_plan(task, {"iccid": "8944"})
        self.assertEqual(allowed, {"action": "sms", "transport": "cellular", "retry": False})
        self.assertEqual(phone_extras.classify_sms({"ok": True, "uncertain": True})[0],
                         "accepted_unconfirmed")
        call = phone_extras.execution_plan(
            {"task_type": "call", "environment": "vowifi",
             "payload": {"duration_seconds": 5}}, {"iccid": "8944"})
        self.assertEqual(call["action"], "call")
        self.assertEqual(call["duration"], 5)
        self.assertEqual(phone_extras.classify_call({"ok": True, "call_id": "abc"})[0], "started")
        self.assertEqual(phone_extras.execution_plan({"task_type": "public_ip"}, None)["action"],
                         "fail")
        self.assertEqual(phone_extras.execution_plan(
            {"task_type": "call", "environment": "cellular"}, {"iccid": "8944"})["action"], "fail")


class DueTests(unittest.TestCase):
    def test_only_an_enabled_task_whose_time_has_passed_is_due(self):
        stored, task = phone_extras.save_task({}, {
            "name": "Soon", "device_id": "sim1", "task_type": "public_ip",
            "enabled": True, "interval_days": 1,
            "start_date": "2020-01-01", "run_time": "00:00",
        })
        moment = datetime(2026, 10, 14, tzinfo=timezone.utc)
        self.assertEqual(phone_extras.due_tasks(stored, moment)[0]["id"], task["id"])
        stored["tasks"][0]["enabled"] = False
        self.assertEqual(phone_extras.due_tasks(stored, moment), [])


class PhoneContractTests(unittest.TestCase):
    def test_system_info_opens_the_developer_pages(self):
        self.assertTrue(phone_extras.system_info("1.14.0")["developer"])

    def test_password_confirm_must_match(self):
        old, new = phone_extras.password_fields({
            "old_password": "current-secret", "new_password": "next-secret-1",
            "confirm_password": "next-secret-1"})
        self.assertEqual((old, new), ("current-secret", "next-secret-1"))
        with self.assertRaises(phone_extras.PhoneExtraError):
            phone_extras.password_fields({
                "old_password": "current-secret", "new_password": "next-secret-1",
                "confirm_password": "other"})

    def test_update_view_uses_the_phone_field_names(self):
        view = phone_extras.update_view({
            "update_available": True, "latest": "1.15.0", "current": "1.14.0",
            "repository": "OneCatx/mdd-sim-gateway"})
        self.assertTrue(view["available"])
        self.assertEqual(view["version"], "1.15.0")
        self.assertEqual(view["current_version"], "1.14.0")
        self.assertEqual(view["message"], "")

    def test_host_percent_stays_inside_the_phone_range(self):
        self.assertEqual(phone_extras.percent(140), 100.0)
        self.assertEqual(phone_extras.percent("nope"), 0.0)
        self.assertEqual(phone_extras.percent(12.5), 12.5)

    def test_catalog_and_new_pages_are_allowed_for_a_phone_client(self):
        from control.app import authz, euicc_catalog

        class Client:
            kind = "client"
            capabilities = ("manage_devices", "manage_esim", "manage_settings")

        client = Client()
        self.assertTrue(authz.allowed(client, "GET", "/api/mobile/v1/euicc-catalog"))
        self.assertTrue(authz.allowed(client, "POST", "/api/mobile/v1/settings/password"))
        self.assertTrue(authz.allowed(client, "GET", "/api/mobile/v1/system/update/check"))
        self.assertFalse(authz.allowed(client, "POST", "/api/mobile/v1/system/update/apply"))
        self.assertFalse(authz.allowed(client, "POST", "/api/system/update/apply"))
        rules = euicc_catalog.view()["rules"]
        self.assertTrue(any(row["id"] == "estk-max" and row["nameplate"] == "ESTK.me Max"
                            for row in rules))


if __name__ == "__main__":
    unittest.main()
