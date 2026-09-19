"""
تست‌های هسته: جستجوی سراسری، موقعیت مؤثر و کش اپ‌ها.

این تست‌ها دقیقاً همان چیزهایی را قفل می‌کنند که کاربر گزارش کرده بود:
  • موقعیت دخترم باید از «موقعیت زنده» خوانده شود، نه از مقدار ثابت پنل بابا.
  • تغییرات موقعیت باید خودکار روی مقدار پنل بابا هم بنشیند.
  • جستجوی سراسری باید در همه‌ی اپ‌ها، با غلط‌گیری حرف‌های عربی/فارسی، کار کند.
"""
import threading
import time
from datetime import timedelta

from django.test import TestCase, TransactionTestCase
from django.utils import timezone

from accounts.models import DeviceSession, LiveLocation, UserConfig
from content.models import Memory, Voice
from core.search import _sources, normalize, run_search, smart_suggestions
from core.services import clear_app_cache, effective_daughter_location


class SearchTests(TestCase):
    def setUp(self):
        UserConfig.get_solo()
        self.session = DeviceSession.issue(hours=1)
        self.auth = {"HTTP_AUTHORIZATION": f"Token {self.session.token}"}

    def test_normalize_unifies_arabic_and_persian_letters(self):
        self.assertEqual(normalize("كتاب يادگاري"), normalize("کتاب یادگاری"))
        self.assertEqual(normalize("دُخترم"), normalize("دخترم"))
        self.assertEqual(normalize("  چند   فاصله  "), "چند فاصله")

    def test_search_finds_memory_with_arabic_typing(self):
        Memory.objects.create(title="خاطره‌ی پارک", text="آن روز با بابا رفتیم پارک")
        res = self.client.get("/api/search?q=بابا", **self.auth)
        self.assertEqual(res.status_code, 200)
        self.assertGreaterEqual(res.json()["total"], 1)

    def test_search_respects_app_filter(self):
        Memory.objects.create(title="چیز خاص", text="متن")
        Voice.objects.create(title="صدا", note="سلام")
        data = self.client.get("/api/search?q=چیز خاص&app=memories", **self.auth).json()
        apps = {group["app"] for group in data["groups"]}
        self.assertEqual(apps, {"memories"})

    def test_search_date_range(self):
        Memory.objects.create(title="خاطره‌ی قدیمیِ پارک", text="پارک", happened_on=timezone.localdate() - timedelta(days=400))
        Memory.objects.create(title="خاطره‌ی تازه‌ی پارک", text="پارک", happened_on=timezone.localdate())
        data = self.client.get(
            f"/api/search?q=پارک&from={timezone.localdate().isoformat()}", **self.auth
        ).json()
        titles = [hit["title"] for group in data["groups"] for hit in group["items"]]
        self.assertTrue(any("تازه" in t for t in titles), "خاطره‌ی امروز باید بیاید")
        self.assertFalse(any("قدیمی" in t for t in titles), "خاطره‌ی قدیمی باید بیرون از بازه بماند")

    def test_date_to_includes_the_whole_day(self):
        """
        فیلتر «تا این تاریخ» باید همه‌ی همان روز را بگیرد.

        قبلاً مقدار خام `date` به یک فیلد زمانی داده می‌شد و هر رکوردی که بعد از
        نیمه‌شب همان روز ثبت شده بود از نتیجه بیرون می‌افتاد (و Django هم هشدار
        naive datetime می‌داد).
        """
        from social.models import ChatMessage

        today = timezone.localdate()
        ChatMessage.objects.create(sender="daddy", text="پیام پارک امروز بعدازظهر")
        data = self.client.get(
            f"/api/search?q=پارک&from={today.isoformat()}&to={today.isoformat()}", **self.auth
        ).json()
        titles = [hit["title"] for group in data["groups"] for hit in group["items"]]
        self.assertTrue(any("پارک" in t for t in titles), "پیام امروز باید داخل بازه‌ی امروز بیفتد")

    def test_disabled_source_is_skipped(self):
        cfg = UserConfig.get_solo()
        cfg.search_disabled_sources = ["memories"]
        cfg.save(update_fields=["search_disabled_sources"])
        Memory.objects.create(title="خاطره خاص", text="متن")
        data = self.client.get("/api/search?q=خاطره خاص", **self.auth).json()
        self.assertFalse(any(group["app"] == "memories" for group in data["groups"]))

    def test_suggestions_and_empty_query(self):
        data = self.client.get("/api/search?q=&suggest=1", **self.auth).json()
        self.assertIn("items", data)
        empty = self.client.get("/api/search?q=", **self.auth).json()
        self.assertIn("suggestions", empty)
        self.assertEqual(empty["groups"], [])
        Memory.objects.create(title="خاطره", text="متن")
        self.assertTrue(smart_suggestions(), "حالت خالی باید پیشنهاد بدهد، نه پیام «چیزی پیدا نشد»")

    def test_run_search_matches_title_and_body(self):
        Memory.objects.create(title="سفر شمال", text="دریا و جنگل")
        payload = run_search("جنگل")
        titles = [hit["title"] for group in payload["groups"] for hit in group["items"]]
        self.assertIn("سفر شمال", titles)
        self.assertEqual(payload["query"], "جنگل")

    def test_unknown_app_returns_nothing_without_error(self):
        res = self.client.get("/api/search?q=بابا&app=does-not-exist", **self.auth)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["groups"], [])

    def test_sources_are_declared_once_and_unique(self):
        keys = [s.key for s in _sources()]
        self.assertEqual(len(keys), len(set(keys)), "کلید منبع تکراری است")
        self.assertEqual(len(keys), 21, "تعداد منابع جستجو باید ۲۱ باشد")

    def test_all_new_apps_have_a_search_source(self):
        """هر اپ تازه‌ی ۲.۰ باید در جستجوی سراسری دیده شود."""
        keys = {s.key for s in _sources()}
        for key in ("call_logs", "call_plans", "gifts", "reading_books", "reading_notes",
                    "reading_quotes", "home_features", "home_rooms", "language", "quiz"):
            with self.subTest(source=key):
                self.assertIn(key, keys)

    def test_call_log_is_found_in_search(self):
        """گزارش کاربر: جزئیات تماس‌ها در جستجو نمی‌آمد."""
        from calls.models import CallLog

        slot = CallLog.objects.create(topic="فیلم دیدن با هم", duration_minutes=40, daughter_mood="happy")
        body = self.client.get("/api/search?q=فیلم", **self.auth).json()
        self.assertGreaterEqual(body["total"], 1)
        apps = {g["app"] for g in body["groups"]}
        self.assertIn("call", apps)
        # هر کارت نتیجه یک payload دارد که فرانت‌اند با آن رکورد را باز می‌کند
        payloads = [i["payload"] for g in body["groups"] for i in g["items"]]
        self.assertTrue(any(pl.get("log_id") == slot.id and pl.get("open") == "call" for pl in payloads))

    def test_new_app_records_are_searchable(self):
        """یک رکورد از هر اپ تازه می‌سازیم و می‌بینیم جستجو پیدایش می‌کند."""
        from dreamhome.models import DreamHomeFeature
        from gifts.models import Gift
        from language.models import LanguageEntry
        from reading.models import ReadingBook

        Gift.objects.create(name="النگوی نقره", price=1200000, currency="تومان")
        ReadingBook.objects.create(title="شاهزاده‌ی کوچک")
        DreamHomeFeature.objects.create(title="پنجره‌ی بزرگ رو به باغ")
        LanguageEntry.objects.create(text="دلم برایت تنگ شده", language="mzn")
        for q, app in (("النگوی", "gifts"), ("شاهزاده", "reading"), ("پنجره", "dreamhome"), ("دلم", "language")):
            with self.subTest(q=q):
                groups = self.client.get(f"/api/search?q={q}", **self.auth).json()["groups"]
                self.assertIn(app, {g["app"] for g in groups})

    def test_cache_can_be_cleared(self):
        Memory.objects.create(title="خاطره‌ی کش", text="متن")
        first = self.client.get("/api/search?q=خاطره‌ی کش", **self.auth).json()["total"]
        self.assertEqual(first, 1)
        Memory.objects.create(title="خاطره‌ی کش دوم", text="متن")
        # تا وقتی کش زنده است، نتیجه‌ی اول برمی‌گردد…
        self.assertEqual(self.client.get("/api/search?q=خاطره‌ی کش", **self.auth).json()["total"], first)
        # …ولی با پاک‌کردن کش، نتیجه‌ی تازه می‌آید
        clear_app_cache()
        self.assertEqual(self.client.get("/api/search?q=خاطره‌ی کش", **self.auth).json()["total"], 2)


class EffectiveLocationTests(TestCase):
    """قاعده‌ی تک‌منبعی: همه‌ی اپ‌ها از effective_daughter_location می‌خوانند."""

    def setUp(self):
        self.cfg = UserConfig.get_solo()
        self.cfg.daughter_city = "رشت"
        self.cfg.daughter_lat = 37.28
        self.cfg.daughter_lng = 49.58
        self.cfg.daughter_timezone = "Asia/Tehran"
        self.cfg.save()

    def test_falls_back_to_panel_value_when_no_live_location(self):
        eff = effective_daughter_location(self.cfg)
        self.assertEqual(eff["city"], "رشت")
        self.assertFalse(eff["is_live"])
        self.assertEqual(eff["source"], "config")

    def test_live_location_wins_over_panel_value(self):
        LiveLocation.store(lat=41.01, lng=28.98, city="استانبول", timezone_name="Europe/Istanbul")
        eff = effective_daughter_location(self.cfg)
        self.assertEqual(eff["city"], "استانبول")
        self.assertTrue(eff["is_live"])
        self.assertEqual(eff["source"], "device")

    def test_stale_live_location_is_ignored(self):
        live = LiveLocation.store(lat=41.01, lng=28.98, city="استانبول", timezone_name="Europe/Istanbul")
        LiveLocation.objects.filter(pk=live.pk).update(
            captured_at=timezone.now() - timedelta(minutes=self.cfg.location_ttl_minutes + 30)
        )
        eff = effective_daughter_location(UserConfig.get_solo())
        self.assertEqual(eff["city"], "رشت", "موقعیت کهنه نباید جای مقدار پنل را بگیرد")

    def test_disabled_location_switches_back_to_panel(self):
        LiveLocation.store(lat=41.01, lng=28.98, city="استانبول")
        self.cfg.location_enabled = False
        self.cfg.save(update_fields=["location_enabled"])
        eff = effective_daughter_location(UserConfig.get_solo())
        self.assertFalse(eff["is_live"])


class SettingsApiTests(TestCase):
    """رفع باگ: تغییر تم و زبان باید واقعاً ذخیره شود (و 405 ندهد)."""

    def setUp(self):
        UserConfig.get_solo()
        self.session = DeviceSession.issue(hours=1)
        self.auth = {"HTTP_AUTHORIZATION": f"Token {self.session.token}"}

    def test_patch_theme_and_language_are_persisted(self):
        res = self.client.patch(
            "/api/settings", {"theme": "day", "language": "en"}, content_type="application/json", **self.auth
        )
        self.assertEqual(res.status_code, 200)
        cfg = UserConfig.get_solo()
        self.assertEqual(cfg.theme, "day")
        self.assertEqual(cfg.language, "en")
        self.assertEqual(res.json()["config"]["theme"], "day")
        self.assertEqual(res.json()["config"]["language"], "en")

    def test_post_and_get_also_work(self):
        self.assertEqual(self.client.get("/api/settings", **self.auth).status_code, 200)
        res = self.client.post(
            "/api/settings", {"theme": "night"}, content_type="application/json", **self.auth
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(UserConfig.get_solo().theme, "night")

    def test_invalid_values_are_ignored_not_saved(self):
        self.cfg_language_before = UserConfig.get_solo().language
        self.client.patch(
            "/api/settings", {"theme": "rainbow", "language": "klingon"}, content_type="application/json", **self.auth
        )
        cfg = UserConfig.get_solo()
        self.assertNotEqual(cfg.theme, "rainbow")
        self.assertEqual(cfg.language, self.cfg_language_before)

    def test_sound_and_font_scale_round_trip(self):
        self.client.patch(
            "/api/settings", {"sound_enabled": False, "font_scale": 1.25}, content_type="application/json", **self.auth
        )
        cfg = UserConfig.get_solo()
        self.assertFalse(cfg.sound_enabled)
        self.assertEqual(cfg.font_scale, 1.25)
        self.client.patch(
            "/api/settings", {"font_scale": 99}, content_type="application/json", **self.auth
        )
        self.assertEqual(UserConfig.get_solo().font_scale, 1.6, "اندازه فونت باید در بازه بماند")

    def test_settings_are_not_publicly_writable(self):
        res = self.client.patch("/api/settings", {"theme": "day"}, content_type="application/json")
        self.assertIn(res.status_code, (401, 403))


class AdminPanelTests(TestCase):
    """
    پنل بابا باید برای همه‌ی مدل‌های تازه هم باز شود.

    هر مدلی که در ادمین ثبت شده باشد، هم فهرست و هم صفحه‌ی «افزودن»ش باید
    ۲۰۰ بدهد؛ این تست جلوی خطاهای پنهان (fieldset اشتباه، inline بدون مدل و…)
    را می‌گیرد.
    """

    def setUp(self):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        self.admin_user = User.objects.create_superuser("daddy", "daddy@example.com", "loveos-test-pass")
        self.client.force_login(self.admin_user)

    def test_new_apps_are_all_registered_in_admin(self):
        from django.contrib import admin
        from django.apps import apps as django_apps

        expected = {
            "calls": {"CallFreeSlot", "CallAppointment", "CallLog", "CallSettings"},
            "gifts": {"GiftOccasion", "Gift"},
            "reading": {"ReadingBook", "ReadingChapter", "ReadingNote", "ReadingQuote", "ChapterComment"},
            "dreamhome": {
                "DreamHomeCategory", "DreamHomeFeature", "DreamHomeRoom",
                "DreamHomeRoomIdea", "DreamHomeInspiration", "InspirationComment",
            },
            "language": {"LanguageCategory", "LanguageEntry", "LanguageQuiz", "LanguageAttempt", "LanguageProgress"},
        }
        for app_label, models in expected.items():
            for model_name in models:
                model = django_apps.get_model(app_label, model_name)
                self.assertIn(model, admin.site._registry, f"{app_label}.{model_name} در پنل ثبت نشده")

    def test_admin_pages_render_for_every_registered_model(self):
        from django.conf import settings
        from django.contrib import admin

        prefix = f"/{settings.ADMIN_PATH}"
        checked = 0
        for model in list(admin.site._registry):
            opts = model._meta
            base = f"{prefix}/{opts.app_label}/{opts.model_name}/"
            listing = self.client.get(base)
            self.assertEqual(listing.status_code, 200, f"فهرست {opts.label} خطا داد")
            if not opts.auto_created:
                add = self.client.get(f"{base}add/")
                self.assertIn(add.status_code, (200, 403), f"صفحه‌ی افزودن {opts.label} خطا داد")
            checked += 1
        self.assertGreater(checked, 20, "تعداد مدل‌های ثبت‌شده کمتر از انتظار است")

    def test_admin_gate_shows_the_brand_mark(self):
        """دروازه‌ی پنل باید نشانِ LoveOS را نشان بدهد (نه ایموجی).

        نشان از docs/branding/generate-logo.mjs ساخته می‌شود و بینِ نشانه‌های
        LOVEOS-LOGO/LOVEOS-FAVICON داخلِ قالب می‌نشیند؛ اگر آن نشانه‌ها پاک شوند،
        این تست می‌گیرد.
        """
        from django.conf import settings
        from django.test import override_settings

        with override_settings(ADMIN_GATE_PASSCODE="gate-test-pass"):
            res = self.client.get(f"/{settings.ADMIN_PATH}/")

        self.assertEqual(res.status_code, 401)
        html = res.content.decode()
        self.assertIn('<svg class="loveos-mark"', html, "نشانِ LoveOS در دروازه‌ی پنل نیست")
        self.assertIn("data:image/svg+xml", html, "فاوآیکونِ دروازه ست نشده")
        self.assertNotIn("\U0001F497", html, "ایموجیِ قلب هنوز در دروازه هست")
        self.assertGreater(len(html), 4000, "قالبِ دروازه ناقص رندر شده")

    def test_calls_admin_shows_weekday_and_time(self):
        from calls.models import CallFreeSlot

        from django.conf import settings

        from datetime import time as clock

        slot = CallFreeSlot.objects.create(owner="daddy", weekday=2, start_time=clock(21, 0), end_time=clock(22, 0))
        res = self.client.get(f"/{settings.ADMIN_PATH}/calls/callfreeslot/")
        self.assertEqual(res.status_code, 200)
        self.assertContains(res, "دوشنبه")
        self.assertIn("21:00", str(slot))
        # ثبت با رشته هم نباید در پنل بشکند (ایمپورت داده/فرم دستی)
        loose = CallFreeSlot(owner="daughter", weekday=0, start_time="09:30", end_time="10:00")
        self.assertIn("09:30", str(loose))


class NotifyAsyncTests(TransactionTestCase):
  """
  اعلان‌های سروش نباید درخواست API را معطل کنند.

  این دقیقاً همان چیزی است که باعث شد دختر بگوید «پازل برد را تشخیص
  نمی‌دهد»: `/api/puzzles/<pk>/complete` موقع ثبت نتیجه، `notify_daddy`
  را صدا می‌زد و آن هم **همگام** به سروش درخواست می‌داد. وقتی سروش در
  دسترس نبود، پاسخ تا تایم‌اوت نمی‌آمد و جشنِ پایانِ پازل هرگز نشان داده
  نمی‌شد. حالا ارسال در نخِ پس‌زمینه انجام می‌شود.
  """

  def _slow_provider(self, delay: float = 0.6):
    from unittest import mock

    provider = mock.Mock()

    def send_message(chat_id, text, **kwargs):
      time.sleep(delay)
      return {"ok": True, "result": {"message_id": 1}}

    provider.send_message.side_effect = send_message
    return provider

  @staticmethod
  def _join_flush_threads(timeout: float = 10) -> None:
    for th in threading.enumerate():
      if th.name.startswith("soroush-flush-"):
        th.join(timeout)

  def test_notify_daddy_returns_without_waiting_for_network(self):
    from unittest import mock

    from core import soroush
    from core.models import SoroushOutbox

    provider = self._slow_provider()
    with mock.patch.object(soroush, "get_provider", return_value=provider):
      started = time.monotonic()
      msg = soroush.notify_daddy("puzzle", "دخترت پازل رو حل کرد")
      elapsed = time.monotonic() - started

      self.assertLess(elapsed, 0.3, f"notify_daddy {elapsed:.2f}s منتظر شبکه ماند")
      self.assertEqual(msg.status, "pending")
      self.assertEqual(SoroushOutbox.objects.get(pk=msg.pk).status, "pending")

      self._join_flush_threads()

    self.assertEqual(provider.send_message.call_count, 1)
    self.assertEqual(SoroushOutbox.objects.get(pk=msg.pk).status, "sent")

  def test_notify_daddy_can_be_forced_synchronous(self):
    from unittest import mock

    from django.conf import settings
    from django.test import override_settings

    from core import soroush
    from core.models import SoroushOutbox

    provider = self._slow_provider(delay=0.0)
    with override_settings(LOVEOS={**settings.LOVEOS, "NOTIFY_ASYNC": False}):
      with mock.patch.object(soroush, "get_provider", return_value=provider):
        msg = soroush.notify_daddy("puzzle", "حالت همگام")
        self.assertEqual(msg.status, "sent")

    self._join_flush_threads()
    self.assertEqual(provider.send_message.call_count, 1)
    self.assertEqual(SoroushOutbox.objects.get(pk=msg.pk).status, "sent")
