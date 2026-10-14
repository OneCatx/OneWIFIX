import unittest

from control.app.sms_code import extract_verification_code


class SmsCodeTests(unittest.TestCase):
    def test_reads_a_code_after_the_chinese_keyword(self):
        self.assertEqual(
            extract_verification_code("您的验证码是 123456，请勿泄露"), "123456")

    def test_reads_an_english_otp(self):
        self.assertEqual(extract_verification_code("Your code is 889900."), "889900")

    def test_ignores_ordinary_text_and_codes_inside_the_sender_bracket(self):
        self.assertEqual(extract_verification_code("hello there"), "")
        self.assertEqual(extract_verification_code("【123456】今天开会"), "")

    def test_ignores_a_date_shaped_number(self):
        self.assertEqual(extract_verification_code("验证码 2024-1234 已过期"), "")


if __name__ == "__main__":
    unittest.main()
