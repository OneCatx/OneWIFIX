import unittest
from unittest.mock import patch

from control.app import device_state


class DeviceRenameTests(unittest.TestCase):
    def test_clean_name_strips_and_rejects_blank_or_long(self):
        self.assertEqual(device_state.clean_device_name("  客厅模组  "), "客厅模组")
        with self.assertRaises(ValueError):
            device_state.clean_device_name("   ")
        with self.assertRaises(ValueError):
            device_state.clean_device_name(None)
        with self.assertRaises(ValueError):
            device_state.clean_device_name("名" * 65)

    def test_saved_display_name_wins_over_hardware_label(self):
        self.assertEqual(
            device_state.resolve_device_name(
                {"display_name": "客厅", "name": "USB modem"},
                "Quectel",
                default="Cellular modem",
            ),
            "客厅",
        )
        self.assertEqual(
            device_state.resolve_device_name(
                {"name": "USB modem", "imei": "123456789012345"},
                "Quectel",
                default="Cellular modem",
            ),
            "Quectel",
        )
        self.assertEqual(
            device_state.resolve_device_name({}, "", default="Cellular modem"),
            "Cellular modem",
        )

    def test_display_name_merge_keeps_existing_hardware_fields(self):
        with patch.object(device_state, "_read", return_value={"devices": {
            "phys-a": {"imei": "123456789012345", "device_type": "modem"},
        }}), patch.object(device_state, "_write") as write:
            saved = device_state.set_hardware("phys-a", {
                "device_type": "modem",
                "display_name": "客厅",
            })
        self.assertEqual(saved["imei"], "123456789012345")
        self.assertEqual(saved["display_name"], "客厅")
        self.assertEqual(saved["device_type"], "modem")
        write.assert_called_once()


if __name__ == "__main__":
    unittest.main()
