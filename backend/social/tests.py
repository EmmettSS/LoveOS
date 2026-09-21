"""
تست‌های اجتماعی: چت، نوتیف‌ها، آب‌وهوا و نقشه.

مهم‌ترین چیزی که اینجا قفل می‌شود باگ شماره‌ی ۳ است: نقشه و آب‌وهوا باید از
«موقعیت زنده‌ی» دخترم حساب کنند، نه از مختصات ثابتی که در پنل بابا ثبت شده.
"""
from unittest import mock

from django.test import TestCase

from accounts.models import DeviceSession, LiveLocation, UserConfig
from social.models import ChatMessage


class SocialLocationTests(TestCase):
    def setUp(self):
        cfg = UserConfig.get_solo()
        cfg.daughter_city = "رشت"
        cfg.daughter_lat = 37.28
        cfg.daughter_lng = 49.58
        cfg.daughter_timezone = "Asia/Tehran"
        cfg.save()
        self.session = DeviceSession.issue(hours=1)
        self.auth = {"HTTP_AUTHORIZATION": f"Token {self.session.token}"}

    def test_map_uses_live_location_and_distance(self):
        before = self.client.get("/api/map", **self.auth).json()
        self.assertFalse(before["daughter"]["is_live"])
        self.assertEqual(before["daughter"]["city"], "رشت")

        LiveLocation.store(lat=41.01, lng=28.98, city="استانبول", timezone_name="Europe/Istanbul")
        after = self.client.get("/api/map", **self.auth).json()
        self.assertTrue(after["daughter"]["is_live"])
        self.assertEqual(after["daughter"]["city"], "استانبول")
        self.assertNotEqual(before["distance_km"], after["distance_km"], "فاصله باید با موقعیت زنده عوض شود")
        self.assertNotEqual(before["daughter"]["time"], after["daughter"]["time"], "ساعت محلی باید عوض شود")

    def test_weather_is_fetched_for_live_coordinates(self):
        calls = []

        def fake_fetch(lat, lng, tz):
            calls.append((lat, lng, tz))
            return {"temp": 20, "label": "آفتابی", "icon": "sun"}

        LiveLocation.store(lat=41.01, lng=28.98, city="استانبول", timezone_name="Europe/Istanbul")
        with mock.patch("social.api.fetch_weather", side_effect=fake_fetch):
            res = self.client.get("/api/weather", **self.auth)
        self.assertEqual(res.status_code, 200)
        self.assertIn((41.01, 28.98, "Europe/Istanbul"), calls)
        self.assertTrue(res.json()["daughter"]["is_live"])

    def test_location_post_syncs_panel_values(self):
        """باگ ۳: جابجایی معنادار باید مختصات/شهر پنل بابا را هم به‌روز کند."""
        res = self.client.post(
            "/api/location",
            {"lat": 41.01, "lng": 28.98, "city": "استانبول", "timezone": "Europe/Istanbul", "accuracy": 25},
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()["synced"])
        cfg = UserConfig.get_solo()
        self.assertEqual(cfg.daughter_city, "استانبول")
        self.assertAlmostEqual(cfg.daughter_lat, 41.01)
        self.assertEqual(cfg.daughter_timezone, "Europe/Istanbul")

    def test_small_move_does_not_overwrite_panel(self):
        self.client.post(
            "/api/location",
            {"lat": 37.281, "lng": 49.581, "city": "رشت", "timezone": "Asia/Tehran"},
            content_type="application/json",
            **self.auth,
        )
        moved = self.client.post(
            "/api/location",
            {"lat": 37.282, "lng": 49.582, "city": "رشت", "timezone": "Asia/Tehran"},
            content_type="application/json",
            **self.auth,
        ).json()
        self.assertFalse(moved["synced"], "جابجایی چند ده متری نباید «خانه»ی پنل را عوض کند")
        self.assertLess(moved["moved_km"], 1)
        self.assertEqual(UserConfig.get_solo().daughter_lat, 37.28)
        # ولی موقعیت زنده‌ی جدید برای همه‌ی اپ‌ها معتبر است
        self.assertAlmostEqual(moved["location"]["lat"], 37.282)

    def test_bad_coordinates_are_rejected(self):
        res = self.client.post(
            "/api/location", {"lat": "abc", "lng": ""}, content_type="application/json", **self.auth
        )
        self.assertEqual(res.status_code, 400)


class ChatTests(TestCase):
    def setUp(self):
        UserConfig.get_solo()
        self.session = DeviceSession.issue(hours=1)
        self.auth = {"HTTP_AUTHORIZATION": f"Token {self.session.token}"}

    def test_message_from_daughter_notifies_daddy(self):
        res = self.client.post(
            "/api/chat", {"sender": "daughter", "text": "بابا امروز چطوری؟"}, content_type="application/json", **self.auth
        )
        self.assertEqual(res.status_code, 200)
        from core.models import SoroushOutbox

        self.assertTrue(SoroushOutbox.objects.filter(event="chat").exists())

    def test_messages_are_listed_in_order(self):
        ChatMessage.objects.create(sender="daddy", text="سلام دخترم")
        ChatMessage.objects.create(sender="daughter", text="سلام بابا")
        items = self.client.get("/api/chat", **self.auth).json()["items"]
        self.assertEqual([m["text"] for m in items], ["سلام دخترم", "سلام بابا"])
