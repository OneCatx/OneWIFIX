import unittest

from control.app.device_discovery import roster


class DeviceDiscoveryTests(unittest.TestCase):
    def test_marks_configured_readers_and_keeps_new_usb_modems(self):
        devices = roster(
            ["ACS ACR38U", "Alcor"],
            cards={"ACS ACR38U": {"reader": "ACS ACR38U", "instance_id": "sim1"}},
            instances=[{"id": "sim1", "reader": "ACS ACR38U"}],
            usb_candidates=[{"usb_path": "2-1.3", "vid": "2c7c", "pid": "0125",
                             "product": "EC25"}],
        )
        by_key = {item["discovery_key"]: item for item in devices}
        self.assertTrue(by_key["ACS ACR38U"]["configured"])
        self.assertEqual(by_key["ACS ACR38U"]["configured_id"], "sim1")
        self.assertFalse(by_key["Alcor"]["configured"])
        self.assertEqual(by_key["Alcor"]["device_type"], "usb_sim_reader")
        modem = by_key["2-1.3"]
        self.assertEqual(modem["vendor_id"], 0x2c7c)
        self.assertEqual(modem["product_id"], 0x0125)
        self.assertEqual(modem["driver_name"], "EC25")
        self.assertFalse(modem["configured"])

    def test_pcsc_outage_is_a_row_the_add_card_can_explain(self):
        devices = roster([], reader_issue="pcsc_service_unavailable")
        self.assertEqual(devices[0]["discovery_issue"], "pcsc_service_unavailable")
        self.assertTrue(devices[0]["degraded"])
        self.assertFalse(devices[0]["configured"])


if __name__ == "__main__":
    unittest.main()
