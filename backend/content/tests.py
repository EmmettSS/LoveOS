"""تست‌های صندوقچه: افزودن محتوا توسط دخترم (متن/عکس/صدا/ویدیو)."""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from accounts.models import DeviceSession, UserConfig
from content.models import VaultItem


class VaultTests(TestCase):
    def setUp(self):
        UserConfig.get_solo()
        self.session = DeviceSession.issue(hours=1)
        self.auth = {"HTTP_AUTHORIZATION": f"Token {self.session.token}"}

    def _unlock(self):
        self.session.vault_until = timezone.now() + timedelta(hours=1)
        self.session.save(update_fields=["vault_until"])

    def test_vault_add_requires_unlock(self):
        res = self.client.post("/api/vault", {"title": "خاطره"}, **self.auth)
        self.assertEqual(res.status_code, 403)
        self.assertFalse(VaultItem.objects.exists())

    def test_daughter_can_add_text_item(self):
        self._unlock()
        res = self.client.post(
            "/api/vault",
            {"title": "نامه‌ی تولد", "kind": "text", "text": "دوستت دارم بابا"},
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertTrue(body["ok"])
        self.assertEqual(body["item"]["title"], "نامه‌ی تولد")
        self.assertEqual(VaultItem.objects.count(), 1)
        listing = self.client.get("/api/vault", **self.auth).json()
        self.assertFalse(listing["locked"])
        self.assertEqual(len(listing["items"]), 1)

    def test_vault_add_requires_title(self):
        self._unlock()
        res = self.client.post(
            "/api/vault", {"title": "  "}, content_type="application/json", **self.auth
        )
        self.assertEqual(res.status_code, 400)
