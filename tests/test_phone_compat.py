import unittest

from control.app.phone_compat import rewrite


class PhonePathTests(unittest.TestCase):
    def test_phone_bearer_reaches_the_mobile_facade(self):
        token = "mdd_c1_phone"
        self.assertEqual(rewrite("/api/devices", token), "/api/mobile/v1/devices")
        self.assertEqual(rewrite("/api/sms/contacts", token), "/api/mobile/v1/sms/contacts")
        self.assertEqual(rewrite("/api/dashboard/host", token), "/api/mobile/v1/dashboard/host")
        self.assertEqual(rewrite("/api/instances", token), "/api/instances")
        self.assertEqual(rewrite("/api/devices/discovered", token), "/api/devices/discovered")

    def test_shared_page_paths_forward_without_a_phone_token(self):
        self.assertEqual(rewrite("/api/settings/notifications"),
                         "/api/mobile/v1/settings/notifications")
        self.assertEqual(rewrite("/api/devices/sim1/network"),
                         "/api/mobile/v1/devices/sim1/network")
        self.assertEqual(rewrite("/api/devices/sim1/esim/profiles"),
                         "/api/mobile/v1/devices/sim1/esim/profiles")
        self.assertEqual(rewrite("/api/devices"), "/api/devices")
        self.assertEqual(rewrite("/api/settings/card-backup"), "/api/settings/card-backup")
        self.assertEqual(rewrite("/api/automatic-tasks"), "/api/mobile/v1/automatic-tasks")
        self.assertEqual(rewrite("/api/logs/history"), "/api/mobile/v1/logs/history")
        self.assertEqual(rewrite("/api/settings/security", "mdd_c1_phone"),
                         "/api/mobile/v1/settings/security")
        self.assertEqual(rewrite("/api/euicc-catalog"), "/api/mobile/v1/euicc-catalog")
        self.assertEqual(rewrite("/api/settings/password"), "/api/mobile/v1/settings/password")
        self.assertEqual(rewrite("/api/system/update/check"), "/api/system/update/check")
        self.assertEqual(rewrite("/api/system/update/check", "mdd_c1_phone"),
                         "/api/mobile/v1/system/update/check")
        self.assertEqual(rewrite("/api/system/update/apply", "mdd_c1_phone"),
                         "/api/mobile/v1/system/update/apply")

    def test_onetools_and_voip_register_keep_their_real_routes(self):
        self.assertEqual(rewrite("/api/onetools/sms/stream", "mdd_pair1_x"),
                         "/api/mobile/v1/onetools/sms/stream")
        self.assertEqual(rewrite("/api/calls/push", "mdd_c1_phone"),
                         "/api/mobile/v1/calls/push-endpoint")
        self.assertEqual(rewrite("/api/mobile/v1/devices", "mdd_c1_phone"),
                         "/api/mobile/v1/devices")

    def test_call_license_and_mtu_paths_reach_the_mobile_facade(self):
        self.assertEqual(rewrite("/api/devices/sim1/calls/dial"),
                         "/api/mobile/v1/devices/sim1/calls/dial")
        self.assertEqual(rewrite("/api/calls/events"), "/api/mobile/v1/calls/events")
        self.assertEqual(rewrite("/api/license"), "/api/mobile/v1/license")
        self.assertEqual(rewrite("/api/settings/vowifi"), "/api/mobile/v1/settings/vowifi")
        self.assertEqual(rewrite("/api/devices/sim1/calls/media", "", "WEBSOCKET"),
                         "/api/devices/sim1/calls/media")
        self.assertEqual(rewrite("/api/devices", "mdd_c1_phone", "POST"),
                         "/api/mobile/v1/devices")
        self.assertEqual(rewrite("/api/devices", "", "POST"), "/api/devices")


if __name__ == "__main__":
    unittest.main()
