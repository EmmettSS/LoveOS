"""تست‌های صندوقچه: افزودن محتوا توسط دخترم (متن/عکس/صدا/ویدیو)."""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from accounts.models import DeviceSession, UserConfig
from content.models import Constellation, VaultItem


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


class StarmapTests(TestCase):
    """
    آسمانِ ستاره‌ها: حرف‌های اسم + «شکل‌های آسمان» (♥ و ∞).

    نکته‌ی مهم درباره‌ی این تست‌ها: دیتابیسِ تست با **مایگریشن‌ها** ساخته
    می‌شود، نه با ``seed_loveos``. پس اگر ``content.0002`` درست کار نکند،
    این‌جا هیچ شکلی وجود نخواهد داشت و تست می‌شکند — یعنی این تست عملاً
    خودِ مایگریشنِ داده را هم پوشش می‌دهد.
    """

    def setUp(self):
        UserConfig.get_solo()
        self.session = DeviceSession.issue(hours=1)
        self.auth = {"HTTP_AUTHORIZATION": f"Token {self.session.token}"}

    def _items(self):
        res = self.client.get("/api/starmap", **self.auth)
        self.assertEqual(res.status_code, 200)
        return res.json()["items"]

    def test_sky_shapes_exist_from_migration(self):
        """♥ و ∞ باید بدونِ اجرای seed، فقط با migrate وجود داشته باشند."""
        shapes = Constellation.objects.filter(kind="shape")
        self.assertEqual(shapes.count(), 2)
        self.assertEqual(set(shapes.values_list("letter", flat=True)), {"♥", "∞"})

    def test_shapes_are_ordered_after_letters(self):
        """شکل‌ها آخرِ آسمان می‌نشینند تا ردیفِ حرف‌های اسم شلوغ نشود."""
        items = self._items()
        kinds = [i["kind"] for i in items]
        self.assertIn("shape", kinds)
        # هیچ shape‌ای قبل از یک letter نیاید
        self.assertEqual(kinds, sorted(kinds, key=lambda k: 0 if k == "letter" else 1))
        self.assertEqual([i["letter"] for i in items if i["kind"] == "shape"], ["♥", "∞"])

    def test_kind_is_exposed_in_api(self):
        """فرانت برای جداکردنِ دو منطقه به ``kind`` نیاز دارد."""
        for item in self._items():
            self.assertIn("kind", item)
            self.assertIn(item["kind"], ("letter", "shape"))

    def test_shape_geometry_is_closed_and_in_unit_box(self):
        """
        هندسه باید «بسته» و داخلِ جعبه‌ی ۰..۱ باشد.

        بسته‌بودن حیاتی است: اگر نقطه‌ی اول و آخر یکی نباشند، پلی‌لاینِ SVG
        در فرورفتگیِ بالای قلب (و سمتِ راستِ بی‌نهایت) یک شکافِ دیده‌شدنی
        باقی می‌گذارد.
        """
        for shape in Constellation.objects.filter(kind="shape"):
            stars = shape.stars
            self.assertGreaterEqual(len(stars), 12, f"{shape.letter} ستاره‌ی کافی ندارد")
            self.assertEqual(stars[0], stars[-1], f"حلقه‌ی {shape.letter} بسته نیست")
            for x, y in stars:
                self.assertGreaterEqual(x, 0.0)
                self.assertLessEqual(x, 1.0)
                self.assertGreaterEqual(y, 0.0)
                self.assertLessEqual(y, 1.0)

    def test_heart_points_down_and_infinity_crosses_center(self):
        """
        دو بررسیِ معناییِ هندسه:
          • قلب: نوکش باید **پایین** باشد (y کمینه در x≈۰٫۵). چون y رو به
            بالا ذخیره می‌شود، اگر این برعکس باشد قلب واژگون رندر می‌شود.
          • بی‌نهایت: باید دقیقاً از مرکزِ جعبه دو بار عبور کند (گره‌ی ∞).
        """
        heart = Constellation.objects.get(letter="♥")
        tip = min(heart.stars, key=lambda p: p[1])
        self.assertAlmostEqual(tip[0], 0.5, places=2, msg="نوکِ قلب باید در وسط باشد")
        lobes = [p for p in heart.stars if p[1] > 0.99]
        self.assertEqual(len(lobes), 2, "قلب باید دو لوبِ بالایی داشته باشد")

        inf = Constellation.objects.get(letter="∞")
        crossings = [p for p in inf.stars if abs(p[0] - 0.5) < 1e-6 and abs(p[1] - 0.5) < 1e-6]
        self.assertEqual(len(crossings), 2, "∞ باید دو بار از مرکز بگذرد")

    def test_each_shape_carries_a_message(self):
        """هر شکل یک پیامِ قابلِ ویرایش از طرف بابا دارد."""
        for shape in Constellation.objects.filter(kind="shape"):
            self.assertTrue(shape.message.strip(), f"{shape.letter} پیام ندارد")

    def test_inactive_shapes_are_hidden(self):
        """بابا باید بتواند از پنل یک شکل را خاموش کند."""
        Constellation.objects.filter(letter="♥").update(is_active=False)
        letters = [i["letter"] for i in self._items()]
        self.assertNotIn("♥", letters)
        self.assertIn("∞", letters)

    def test_starmap_requires_session(self):
        res = self.client.get("/api/starmap")
        self.assertIn(res.status_code, (401, 403))


class ConstellationGeometryTests(TestCase):
    """هندسه‌ی زنده (content.constellations) باید با عددِ یخ‌زده‌ی مایگریشن بخواند."""

    def test_live_module_matches_frozen_migration_literals(self):
        from content.constellations import heart_stars, infinity_stars
        from content.migrations import __path__ as _  # noqa: F401  (فقط اطمینان از بسته بودن)

        import importlib.util
        from pathlib import Path

        mig = Path(__file__).resolve().parent / "migrations" / "0002_constellation_kind_and_sky_shapes.py"
        spec = importlib.util.spec_from_file_location("frozen_shapes", mig)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        self.assertEqual(module.HEART_STARS, heart_stars())
        self.assertEqual(module.INFINITY_STARS, infinity_stars())

    def test_shape_definitions_are_complete(self):
        from content.constellations import SKY_SHAPES

        self.assertEqual(len(SKY_SHAPES), 2)
        for shape in SKY_SHAPES:
            self.assertEqual(shape["kind"], "shape")
            self.assertTrue(shape["message"].strip())
            self.assertGreaterEqual(shape["order"], 90, "order باید دور از حرف‌های اسم باشد")
            self.assertLessEqual(len(shape["letter"]), 2, "letter باید در max_length=2 بگنجد")
