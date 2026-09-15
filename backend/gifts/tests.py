"""تست‌های دفتر هدیه‌ها: ثبت، نوتیف دوطرفه، فیلترها و آمار."""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from accounts.models import DeviceSession, UserConfig
from core.jalali import to_jalali
from core.models import OSNotification, SoroushOutbox
from gifts.models import Gift, GiftOccasion


class GiftHistoryTests(TestCase):
    def setUp(self):
        UserConfig.get_solo()
        self.session = DeviceSession.issue(hours=1)
        self.auth = {"HTTP_AUTHORIZATION": f"Token {self.session.token}"}
        self.occasion, _ = GiftOccasion.objects.get_or_create(name="تولد", defaults={"icon": "🎂"})

    def _post(self, payload):
        return self.client.post("/api/gifts", payload, content_type="application/json", **self.auth)

    def test_daughter_gift_notifies_daddy(self):
        res = self._post(
            {
                "name": "شال دست‌باف",
                "giver": "daughter",
                "receiver": "daddy",
                "recorded_by": "daughter",
                "occasion": self.occasion.id,
                "reaction": "بابا گفت شب‌ها می‌بندمش",
            }
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(OSNotification.objects.filter(kind="gift").exists())
        self.assertTrue(SoroushOutbox.objects.filter(event="gift_added").exists())

    def test_price_band_is_derived_when_not_given(self):
        self._post({"name": "کتاب", "price": 3000})
        gift = Gift.objects.get(name="کتاب")
        self.assertEqual(gift.effective_price_band, "medium")
        self.env = None

    def test_filters_and_search(self):
        self._post({"name": "زنجیر طلا", "giver": "daddy", "receiver": "daughter", "price": 4800})
        self._post({"name": "کتاب شعر", "giver": "daughter", "receiver": "daddy", "price": 200})
        by_giver = self.client.get("/api/gifts?giver=daughter", **self.auth).json()
        self.assertEqual(len(by_giver["items"]), 1)
        self.assertEqual(by_giver["items"][0]["name"], "کتاب شعر")
        q = self.client.get("/api/gifts?q=زنجیر", **self.auth).json()
        self.assertEqual(q["count"], 1)
        band = self.client.get("/api/gifts?band=low", **self.auth).json()
        self.assertEqual(band["items"][0]["name"], "کتاب شعر")

    def test_stats_counts_and_years(self):
        today = timezone.localdate()
        self._post({"name": "هدیه امسال", "giver": "daddy", "receiver": "daughter", "price": 1000})
        Gift.objects.create(name="هدیه پارسال", given_on=today - timedelta(days=400), giver="daughter", receiver="daddy")
        stats = self.client.get("/api/gifts/stats", **self.auth).json()
        self.assertEqual(stats["total_count"], 2)
        self.assertEqual(stats["received_count"], 1)
        self.assertEqual(stats["given_count"], 1)
        self.assertEqual(stats["total_value"], 1000)
        self.assertEqual(len(stats["years"]), 2)
        self.assertTrue(stats["has_prices"])

    def test_edit_and_delete(self):
        self._post({"name": "عطر"})
        gift = Gift.objects.get(name="عطر")
        res = self.client.patch(
            f"/api/gifts/{gift.id}", {"reaction": "خیلی خوشحال شد"}, content_type="application/json", **self.auth
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["item"]["reaction"], "خیلی خوشحال شد")
        res = self.client.delete(f"/api/gifts/{gift.id}", **self.auth)
        self.assertEqual(res.status_code, 200)
        self.assertFalse(Gift.objects.filter(pk=gift.id).exists())

    def test_occasions_endpoint_lists_years(self):
        self._post({"name": "کادو", "occasion": self.occasion.id})
        data = self.client.get("/api/gifts/occasions", **self.auth).json()
        self.assertTrue(any(o["name"] == "تولد" for o in data["items"]))
        # قرارداد اپ سال شمسی است؛ `given_on` در دیتابیس میلادی می‌ماند.
        self.assertIn(to_jalali(timezone.localdate())[0], data["years"])
