"""تست‌های خانه‌ی رویایی: ویژگی‌ها، نقشه، گالری، کامنت و درصد پیشرفت."""
from django.test import TestCase

from accounts.models import DeviceSession, UserConfig
from core.models import OSNotification
from dreamhome.models import DreamHomeCategory, DreamHomeFeature, DreamHomeInspiration, DreamHomeRoom


class DreamHomeTests(TestCase):
    def setUp(self):
        UserConfig.get_solo()
        self.session = DeviceSession.issue(hours=1)
        self.auth = {"HTTP_AUTHORIZATION": f"Token {self.session.token}"}
        self.category, _ = DreamHomeCategory.objects.get_or_create(name="حیاط", defaults={"icon": "🌳"})

    def test_daughter_feature_notifies_daddy(self):
        res = self.client.post(
            "/api/home/features",
            {"title": "حیاط بزرگ با درخت انار", "category": self.category.id, "importance": "must", "added_by": "daughter"},
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(OSNotification.objects.filter(kind="home").exists())
        self.assertEqual(res.json()["item"]["importance_label"], "ضروری")

    def test_rooms_can_be_moved_and_clamped(self):
        room = DreamHomeRoom.objects.create(name="نشیمن", x=10, y=10, w=20, h=20)
        res = self.client.patch(
            f"/api/home/rooms/{room.id}",
            {"x": 999, "y": -5, "w": 12, "h": 12, "color": "#86efac"},
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(res.status_code, 200)
        item = res.json()["item"]
        self.assertEqual(item["x"], 90, "مختصات باید در محدوده‌ی ۰ تا ۹۰ بماند")
        self.assertEqual(item["y"], 0)
        self.assertEqual(item["color"], "#86efac")

    def test_room_ideas_are_grouped_by_kind(self):
        room = DreamHomeRoom.objects.create(name="آشپزخانه")
        for kind, text in [("idea", "جزیره‌ی چوبی"), ("color", "سبز کم‌رنگ"), ("furniture", "صندلی چوبی")]:
            res = self.client.post(
                f"/api/home/rooms/{room.id}/ideas",
                {"kind": kind, "text": text},
                content_type="application/json",
                **self.auth,
            )
            self.assertEqual(res.status_code, 200)
        data = self.client.get(f"/api/home/rooms/{room.id}/ideas", **self.auth).json()
        self.assertEqual(len(data["items"]), 3)

    def test_stats_percent_of_checklist(self):
        DreamHomeFeature.objects.create(title="الف", importance="must", is_done=True)
        DreamHomeFeature.objects.create(title="ب", importance="must")
        DreamHomeFeature.objects.create(title="ج", importance="nice")
        DreamHomeFeature.objects.create(title="د", importance="luxury")
        stats = self.client.get("/api/home/stats", **self.auth).json()
        self.assertEqual(stats["features_total"], 4)
        self.assertEqual(stats["done"], 1)
        self.assertEqual(stats["percent"], 25)
        self.assertEqual(stats["must"], 2)
        self.assertEqual(len(stats["checklist"]["must"]), 2)

    def test_inspiration_comment_flow(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        photo = SimpleUploadedFile("room.jpg", b"fake-image-bytes", content_type="image/jpeg")
        res = self.client.post(
            "/api/home/inspirations",
            {"title": "اتاق خواب روشن", "photo": photo, "room": ""},
            format="multipart",
            **self.auth,
        )
        self.assertEqual(res.status_code, 200)
        insp = DreamHomeInspiration.objects.first()
        comment = self.client.post(
            f"/api/home/inspirations/{insp.id}/comments",
            {"owner": "daughter", "text": "این دیوار رو دوست دارم"},
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(comment.status_code, 200)
        detail = self.client.get(f"/api/home/inspirations/{insp.id}", **self.auth).json()
        self.assertEqual(len(detail["item"]["comments"]), 1)

    def test_overview_has_everything_the_app_needs(self):
        DreamHomeFeature.objects.create(title="حیاط", importance="must")
        DreamHomeRoom.objects.create(name="نشیمن")
        data = self.client.get("/api/home/overview", **self.auth).json()
        for key in ("features", "rooms", "inspirations", "categories", "stats"):
            self.assertIn(key, data)
