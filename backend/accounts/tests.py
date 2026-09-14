"""
تست‌های حساب و قفل: ورود، قفل شدن بعد از تلاش‌های اشتباه، تنظیمات و نشست‌ها.

باگ‌های ۴ تا ۷ از همین‌جا نشست می‌گرفتند (تنظیمات ذخیره نمی‌شد، تم/زبان اعمال
نمی‌شد، و PATCH خطای 405 می‌داد)؛ اپ Settings فرانت‌اند روی همین تست‌ها تکیه دارد.
"""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from accounts.models import DeviceSession, UnlockAttempt, UserConfig


class UnlockTests(TestCase):
    def setUp(self):
        self.cfg = UserConfig.get_solo()
        self.cfg.set_passcode("1234")
        self.cfg.save(update_fields=["passcode_hash"])

    def test_correct_passcode_issues_session(self):
        res = self.client.post("/api/auth/unlock", {"passcode": "1234"}, content_type="application/json")
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertTrue(body["ok"])
        self.assertTrue(body["token"])
        self.assertEqual(DeviceSession.objects.count(), 1)

    def test_wrong_passcode_asks_for_help_after_five_tries(self):
        for _ in range(5):
            res = self.client.post("/api/auth/unlock", {"passcode": "000000"}, content_type="application/json")
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.json()["ok"])
        body = res.json()
        self.assertFalse(body["ok"])
        self.assertEqual(UnlockAttempt.objects.filter(success=False).count(), 5)
        self.assertGreaterEqual(body["failed_attempts"], 1)
        self.assertTrue(body["show_help_button"], "بعد از ۵ تلاش باید دکمه‌ی «کمک از بابا» بیاید")
        self.assertTrue(body["help_message"])


class SessionAndSettingsTests(TestCase):
    def setUp(self):
        UserConfig.get_solo()
        self.session = DeviceSession.issue(hours=1)
        self.auth = {"HTTP_AUTHORIZATION": f"Token {self.session.token}"}

    def test_me_returns_config_with_theme_and_language(self):
        cfg = UserConfig.get_solo()
        cfg.theme = "night"
        cfg.language = "fa"
        cfg.save(update_fields=["theme", "language"])
        data = self.client.get("/api/me", **self.auth).json()
        # پیکربندی کامل (بعد از قفل) مستقیم برمی‌گردد، نه لایه‌ی config
        self.assertEqual(data["theme"], "night")
        self.assertEqual(data["language"], "fa")
        self.assertIn("daughter_lat", data)
        self.assertIn("live_location", data)

    def test_expired_session_is_denied(self):
        expired = DeviceSession.issue(hours=1)
        DeviceSession.objects.filter(pk=expired.pk).update(expires_at=timezone.now() - timedelta(minutes=5))
        res = self.client.get("/api/me", HTTP_AUTHORIZATION=f"Token {expired.token}")
        self.assertIn(res.status_code, (401, 403))

    def test_logout_kills_session(self):
        self.assertEqual(self.client.post("/api/auth/logout", **self.auth).status_code, 200)
        res = self.client.get("/api/me", **self.auth)
        self.assertIn(res.status_code, (401, 403))

    def test_boot_endpoint_is_public_and_keeps_secrets(self):
        res = self.client.get("/api/boot")
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertIn("config", body)
        self.assertNotIn("passcode_hash", str(body))
        self.assertNotIn("vault_passcode_hash", str(body))
        self.assertFalse(body["unlocked"])
