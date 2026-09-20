"""تست‌های صندوقچه و «حال دل»:
  • صندوقچه: افزودن محتوا توسط دخترم (متن/عکس/صدا/ویدیو)
  • حال دل: حال‌های تازه‌ای که خودش می‌سازد + ترمیمِ دیتابیس‌های قدیمی که
    ستونِ یتیمِ ``note`` داشتند (همان خطای NOT NULL constraint failed).
"""
import importlib
from datetime import timedelta

from django.apps import apps
from django.core.management import CommandError, call_command
from django.db import DatabaseError, connection
from django.db.migrations.recorder import MigrationRecorder
from django.db.utils import IntegrityError, OperationalError
from django.test import TestCase, TransactionTestCase
from django.utils import timezone

from accounts.models import DeviceSession, UserConfig
from content import legacy as mood_legacy
from content.models import Constellation, MoodLog, MoodMessage, VaultItem
from core.models import SoroushOutbox


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


class MoodApiTests(TestCase):
    """«حال دل»: ثبتِ حال، حالِ تازه‌ای که خودِ دخترم می‌سازد و پاسخِ امن.

    این تست‌ها همان چیزی را می‌گیرند که در اپ دیده شد:
      • لمسِ حال هیچ واکنشی نداشت (۵۰۰ خاموش) — الان باید پاسخِ روشن بدهد.
      • حالِ دلخواه باید بشود ساخت و به بابا خبر برود.
    """

    def setUp(self):
        UserConfig.get_solo()
        self.session = DeviceSession.issue(hours=1)
        self.auth = {"HTTP_AUTHORIZATION": f"Token {self.session.token}"}
        MoodMessage.objects.create(
            mood="happy", message="خوشحالی‌ات دنیای منو روشن می‌کنه ☀", emoji="😊"
        )

    def _post(self, path, payload):
        return self.client.post(path, payload, content_type="application/json", **self.auth)

    # ------------------------------------------------------------ فهرست ----
    def test_moods_lists_presets_with_emoji(self):
        body = self.client.get("/api/moods", **self.auth).json()
        item = body["items"][0]
        self.assertEqual(item["mood"], "happy")
        self.assertEqual(item["label"], "خوشحال")
        self.assertEqual(item["emoji"], "😊")
        self.assertFalse(item["is_custom"])

    # ------------------------------------------------------------- ثبت ----
    def test_mood_set_logs_the_mood_and_replies(self):
        res = self._post("/api/moods/set", {"mood": "happy", "note": "امروز خیلی خوب بود"})
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertTrue(body["ok"])
        self.assertIn("روشن", body["message"])
        log = MoodLog.objects.get()
        self.assertEqual(log.mood, "happy")
        self.assertEqual(log.note, "امروز خیلی خوب بود")
        self.assertEqual(log.label, "خوشحال")
        self.assertTrue(SoroushOutbox.objects.filter(event="mood").exists())

    def test_mood_set_without_payload_is_a_clear_400(self):
        res = self._post("/api/moods/set", {})
        self.assertEqual(res.status_code, 400)
        self.assertFalse(MoodLog.objects.exists())

    def test_mood_set_of_an_unknown_mood_never_500s(self):
        """حالِ حذف‌شده از پنل نباید اپ را با خطای سرور روبرو کند."""
        res = self._post("/api/moods/set", {"mood": "something-old", "label": "خستم"})
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertTrue(body["ok"])
        self.assertEqual(body["label"], "خستم")
        self.assertEqual(MoodLog.objects.get().label, "خستم")

    # -------------------------------------------------------- حالِ تازه ----
    def test_daughter_can_add_her_own_mood(self):
        res = self._post("/api/moods/add", {"label": "دلم هوای دریا داره", "emoji": "🌊", "note": "بابا کِی میریم؟"})
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertTrue(body["ok"])
        self.assertTrue(body["item"]["is_custom"])
        self.assertEqual(body["item"]["emoji"], "🌊")
        self.assertTrue(body["item"]["mood"].startswith("custom-"))

        # هم در فهرست می‌ماند، هم همان لحظه به‌عنوان حالِ فعلی ثبت شده.
        listing = self.client.get("/api/moods", **self.auth).json()["items"]
        self.assertIn("دلم هوای دریا داره", [m["label"] for m in listing])
        log = MoodLog.objects.get()
        self.assertEqual(log.note, "بابا کِی میریم؟")
        self.assertEqual(log.added_by, "daughter")
        self.assertTrue(SoroushOutbox.objects.filter(event="mood_add").exists())

    def test_custom_mood_is_reused_for_the_same_label(self):
        first = self._post("/api/moods/add", {"label": "خوابم میاد" }).json()
        second = self._post("/api/moods/add", {"label": "خوابم میاد", "emoji": "😴"}).json()
        self.assertEqual(first["item"]["mood"], second["item"]["mood"])
        self.assertEqual(MoodMessage.objects.filter(label="خوابم میاد").count(), 1)
        self.assertEqual(MoodLog.objects.count(), 2)

    def test_custom_mood_needs_a_label(self):
        res = self._post("/api/moods/add", {"label": "   "})
        self.assertEqual(res.status_code, 400)
        self.assertFalse(MoodMessage.objects.filter(added_by="daughter").exists())

    def test_custom_mood_can_be_selected_later(self):
        created = self._post("/api/moods/add", {"label": "دلم گرفته", "emoji": "🥲"}).json()["item"]
        res = self._post("/api/moods/set", {"mood": created["mood"]})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["label"], "دلم گرفته")
        # ایموجیِ خودش، نه ایموجیِ پیش‌فرض
        self.assertEqual(res.json()["emoji"], "🥲")


class LegacySchemaRepairTests(TransactionTestCase):
    """ترمیمِ خودکارِ دیتابیس‌هایی که مهاجرتِ برگردانده‌شده‌ی ۱۶ سپتامبر
    (fb24945) را اجرا کرده‌اند و بعد کد به ۱۵ سپتامبر برگشت (7bc99e4).

    شبیه‌سازی (دقیقاً مثلِ دیتابیسِ واقعیِ کاربر): ستونِ ``kind`` از نوعِ
    NOT NULL بدونِ پیش‌فرض + ایندکسِ خودکارِ ``db_index=True`` + ۶ ردیفِ
    حرف + ۲ ردیفِ ♥/∞ قدیمی + رکوردِ یتیم در django_migrations — همان
    وضعیتی که seed را با ``NOT NULL constraint failed: content_constellation.kind``
    می‌شکست و ``migrate`` را با ``error in index ... after drop column``.
    """

    # نامِ ایندکسی که مهاجرتِ قدیمی (db_index=True) روی دیتابیسِ واقعیِ
    # کاربر ساخته بود؛ Django بخشِ آخرش را از هشِ نامِ فیلد می‌سازد.
    LEGACY_KIND_INDEX = "content_constellation_kind_e5ab940f"

    def _columns(self, table):
        with connection.cursor() as cur:
            return {
                f.name
                for f in connection.introspection.get_table_description(cur, table)
            }

    def _indexes_on(self, table, column):
        """نامِ ایندکس‌هایی که ستونِ داده‌شده بخشی از آن‌هاست (فقط SQLite)."""
        qn = connection.ops.quote_name
        with connection.cursor() as cur:
            found = []
            # execute‌ی تودرتو روی همان cursor نتیجه‌ی بیرونی را بی‌اثر می‌کند؛
            # پس ردیف‌ها را اول materialize می‌کنیم.
            for row in list(cur.execute(f"PRAGMA index_list({qn(table)})")):
                name = row[1]
                cols = {
                    col_row[2]
                    for col_row in cur.execute(f"PRAGMA index_info({qn(name)})")
                }
                if column in cols:
                    found.append(name)
            return found

    def _drop_index_if_exists(self, name):
        with connection.cursor() as cur:
            cur.execute(f"DROP INDEX IF EXISTS {connection.ops.quote_name(name)}")

    def _drop_column_if_exists(self, table, column):
        """ستون (و ایندکس‌های رویش) را اگر هست حذف می‌کند — برای شبیه‌سازیِ
        idempotent حتی اگر تستِ قبلی وسطِ راه شکسته باشد."""
        if column not in self._columns(table):
            return
        for index_name in self._indexes_on(table, column):
            self._drop_index_if_exists(index_name)
        qn = connection.ops.quote_name
        with connection.cursor() as cur:
            cur.execute(f"ALTER TABLE {qn(table)} DROP COLUMN {qn(column)}")

    def _add_not_null_column(self, table, column, ddl_type):
        qn = connection.ops.quote_name
        with connection.cursor() as cur:
            cur.execute(
                f"ALTER TABLE {qn(table)} ADD COLUMN {qn(column)} {ddl_type} NOT NULL"
            )

    def _simulate_legacy_sky(self):
        """جدولِ آسمان را به وضعیتِ بعد از fb24945 برمی‌گرداند:
        ستونِ NOT NULL بدونِ پیش‌فرض + ایندکس + ۶ ردیفِ حرف (kind='letter')
        + ۲ ردیفِ ♥/∞ (kind='shape') + رکوردِ یتیم در django_migrations."""
        Constellation.objects.all().delete()
        self._drop_index_if_exists(self.LEGACY_KIND_INDEX)
        self._drop_column_if_exists("content_constellation", "kind")
        self._add_not_null_column("content_constellation", "kind", "varchar(8)")
        with connection.cursor() as cur:
            # دقیقاً همان ایندکسی که مهاجرتِ قدیمی ساخته بود.
            cur.execute(
                f"CREATE INDEX {self.LEGACY_KIND_INDEX}"
                " ON content_constellation(kind)"
            )
        rows = [(l, i, "letter") for i, l in enumerate(["M", "A", "R", "Y", "A", "M"])]
        rows += [("♥", 90, "shape"), ("∞", 91, "shape")]
        with connection.cursor() as cur:
            for letter, order, kind in rows:
                cur.execute(
                    'INSERT INTO "content_constellation"'
                    ' ("letter", "order", "message", "stars", "is_active",'
                    ' "created_at", "updated_at", "kind")'
                    " VALUES (%s, %s, %s, %s, 1, %s, %s, %s)",
                    [letter, order, "", "[]", timezone.now(), timezone.now(), kind],
                )
        MigrationRecorder(connection).record_applied(
            "content", "0002_constellation_kind_and_sky_shapes"
        )

    def _simulate_legacy_ui_quality(self):
        """جدولِ تنظیمات را به وضعیتِ بعد از fb24945 برمی‌گرداند
        (ستونِ NOT NULL بدونِ پیش‌فرض + رکوردِ یتیم)."""
        UserConfig.objects.all().delete()
        self._drop_column_if_exists("accounts_userconfig", "ui_quality")
        self._add_not_null_column("accounts_userconfig", "ui_quality", "varchar(10)")
        MigrationRecorder(connection).record_applied(
            "accounts", "0004_userconfig_ui_quality"
        )

    # ---------------------------------------------------- حال دلِ قدیمی ----
    # همان حالتی که در ترمینالِ خانه دیده شد:
    #   sqlite3.IntegrityError: NOT NULL constraint failed: content_moodlog.note
    MOODLOG_TABLE = "content_moodlog"
    LEGACY_NOTE_INDEX = "content_moodlog_note_e5ab940f"

    def _simulate_legacy_moodlog(self):
        """جدولِ «حال دل» را به وضعیتِ نسخه‌ی قدیمی برمی‌گرداند:

        • ستون‌های تازه‌ی ۰۰۰۴ (label/emoji/added_by) برداشته می‌شوند،
        • ``note`` با NOT NULL و بدونِ پیش‌فرض برمی‌گردد (همان چیزی که
          نوشتن را می‌شکست) به‌همراهِ ایندکسی که رویش بود،
        • دو یادداشتِ واقعی در ردیف‌ها گذاشته می‌شود تا سنجیده شود که
          ترمیم آن‌ها را گم نمی‌کند و ۰۰۰۴ برشان می‌گرداند.
        """
        MoodLog.objects.all().delete()
        for column in ("label", "emoji", "added_by", "note"):
            self._drop_column_if_exists(self.MOODLOG_TABLE, column)
        self._add_not_null_column(self.MOODLOG_TABLE, "note", "text")
        qn = connection.ops.quote_name
        with connection.cursor() as cur:
            cur.execute(
                f"CREATE INDEX {self.LEGACY_NOTE_INDEX}"
                f" ON {qn(self.MOODLOG_TABLE)}({qn('note')})"
            )
            for mood, note in (
                ("happy", "امروز بغل بابا بودم"),
                ("missing", "دلم براش تنگ شده بود"),
            ):
                cur.execute(
                    f'INSERT INTO {qn(self.MOODLOG_TABLE)}'
                    f" ({qn('created_at')}, {qn('updated_at')}, {qn('mood')}, {qn('note')})"
                    " VALUES (%s, %s, %s, %s)",
                    [timezone.now(), timezone.now(), mood, note],
                )

    def _moodlog_rows(self):
        qn = connection.ops.quote_name
        with connection.cursor() as cur:
            return {
                row[0]: row[1]
                for row in cur.execute(
                    f"SELECT {qn('mood')}, {qn('note')} FROM {qn(self.MOODLOG_TABLE)}"
                    f" ORDER BY {qn('id')}"
                )
            }

    def _run_repair(self, module_name, func_name):
        mod = importlib.import_module(module_name)
        with connection.schema_editor() as se:
            getattr(mod, func_name)(apps, se)

    def _run_mood_repair(self):
        self._run_repair(
            "content.migrations.0003_repair_legacy_moodlog_note",
            "repair_legacy_moodlog_note",
        )

    def test_repair_is_noop_on_fresh_database(self):
        """روی نصبِ تازه (جدول‌های خالی و سالم) ترمیم بی‌اثر و بی‌خطاست."""
        self._run_repair(
            "content.migrations.0002_drop_legacy_sky_kind", "drop_legacy_kind"
        )
        self._run_repair(
            "accounts.migrations.0004_drop_legacy_ui_quality",
            "drop_legacy_ui_quality",
        )
        self._run_mood_repair()
        self.assertNotIn("kind", self._columns("content_constellation"))
        self.assertEqual(self._indexes_on("content_constellation", "kind"), [])
        self.assertNotIn("ui_quality", self._columns("accounts_userconfig"))
        # ستونِ سالمِ note (فیلدِ واقعیِ مدل) دست‌نخورده می‌ماند.
        self.assertIn("note", self._columns(self.MOODLOG_TABLE))
        self.assertIn("label", self._columns(self.MOODLOG_TABLE))

    def test_end_to_end_legacy_database_via_migrate_and_seed(self):
        """سناریوی کاملِ دیتابیسِ واقعیِ کاربر، از خرابی تا سلامت:

        شبیه‌سازیِ قدیمی (ستون + ایندکس + ۸ ردیف + یتیم‌های تاریخچه) ←
        `migrate` واقعی که هر دو ترمیم را اجرا می‌کند ← `seed_loveos`
        با ۸ صورتِ فلکی + seed دومِ idempotent.
        """
        self._simulate_legacy_sky()
        self._simulate_legacy_ui_quality()
        self._simulate_legacy_moodlog()

        # همان شکستِ واقعی: مایگریشن‌های ترمیمی هنوز در django_migrations
        # ثبت نشده‌اند (0002 روی SQLite رول‌بک شد؛ بقیه هم ممکن است هرگز
        # اجرا نشده باشند) تا `migrate` واقعاً اجرا شوند.
        recorder = MigrationRecorder(connection)
        for app, name in (
            ("content", "0002_drop_legacy_sky_kind"),
            ("content", "0003_repair_legacy_moodlog_note"),
            ("content", "0004_mood_custom"),
            ("accounts", "0004_drop_legacy_ui_quality"),
        ):
            recorder.migration_qs.filter(app=app, name=name).delete()

        call_command("migrate", verbosity=0)

        # ترمیم کامل: نه ستون، نه ایندکس، نه ردیف‌های شکلِ قدیمی، نه یتیم‌ها.
        self.assertNotIn("kind", self._columns("content_constellation"))
        self.assertEqual(self._indexes_on("content_constellation", "kind"), [])
        self.assertNotIn("ui_quality", self._columns("accounts_userconfig"))
        self.assertFalse(
            recorder.migration_qs.filter(
                app="content", name="0002_constellation_kind_and_sky_shapes"
            ).exists()
        )
        self.assertFalse(
            recorder.migration_qs.filter(
                app="accounts", name="0004_userconfig_ui_quality"
            ).exists()
        )
        # شش حرفِ اسم مانده‌اند، ردیف‌های ♥/∞ قدیمی پاک شده‌اند.
        self.assertEqual(
            list(Constellation.objects.order_by("order").values_list("letter", flat=True)),
            ["M", "A", "R", "Y", "A", "M"],
        )

        # «حال دل»: ستونِ یتیمِ note رفته، فیلدِ تازه‌اش (و ستون‌های ۰۰۰۴) هست،
        # ردیف‌های قدیمی سرِ جایشان‌اند و یادداشت‌هایشان برگشته.
        self.assertIn("note", self._columns(self.MOODLOG_TABLE))
        self.assertIn("label", self._columns(self.MOODLOG_TABLE))
        self.assertEqual(
            self._moodlog_rows(),
            {"happy": "امروز بغل بابا بودم", "missing": "دلم براش تنگ شده بود"},
        )
        # و نوشتنِ حال دوباره کار می‌کند (همان دکمه‌ای که ۵۰۰ می‌داد).
        MoodLog.objects.create(mood="happy", label="خوشحال", emoji="😊", note="بعد از ترمیم")
        self.assertEqual(MoodLog.objects.count(), 3)

        # حالا seed کامل اجرا می‌شود: ۶ حرف + ❤ و ♾.
        call_command("seed_loveos", verbosity=0)
        self.assertEqual(Constellation.objects.count(), 8)
        self.assertEqual(
            list(Constellation.objects.order_by("order").values_list("letter", flat=True)),
            ["M", "A", "R", "Y", "A", "M", "❤", "♾"],
        )

        # seed دوم idempotent است.
        call_command("seed_loveos", verbosity=0)
        self.assertEqual(Constellation.objects.count(), 8)

    def test_diagnose_write_failure_explains_the_fix(self):
        """پیامِ لاگ باید راهِ درست را بگوید، نه فقط «خطا شد»."""
        # حالتِ اول: ستونِ یتیم (همان باگِ اصلی)
        note = mood_legacy.diagnose_write_failure(
            connection,
            OperationalError("NOT NULL constraint failed: content_moodlog.note"),
        )
        self.assertIn("migrate", note)
        self.assertIn("note", note)

        # حالتِ دوم: دیتابیسِ migrate‌نشده (ستون‌های مدل در جدول نیستند)
        self.assertEqual(mood_legacy.missing_model_columns(connection), [])
        qn = connection.ops.quote_name
        with connection.cursor() as cur:
            cur.execute(f"ALTER TABLE {qn(self.MOODLOG_TABLE)} DROP COLUMN {qn('emoji')}")
        try:
            self.assertIn("emoji", mood_legacy.missing_model_columns(connection))
            note = mood_legacy.diagnose_write_failure(connection, OperationalError("boom"))
            self.assertIn("migrate", note)
            self.assertIn("emoji", note)
        finally:
            with connection.cursor() as cur:
                cur.execute(
                    f"ALTER TABLE {qn(self.MOODLOG_TABLE)}"
                    f" ADD COLUMN {qn('emoji')} varchar(8) NOT NULL DEFAULT ''"
                )

    def test_stale_moodlog_note_leaves_no_trace_after_full_migrate(self):
        """تکرارِ ترمیم باید بی‌خطر باشد (idempotency): دو بار migrate،
        یک نتیجه — و نوشتنِ حال در هر دو حالت کار می‌کند."""
        self._simulate_legacy_moodlog()
        recorder = MigrationRecorder(connection)
        for name in ("0003_repair_legacy_moodlog_note", "0004_mood_custom"):
            recorder.migration_qs.filter(app="content", name=name).delete()
        call_command("migrate", "content", verbosity=0)
        before = self._columns(self.MOODLOG_TABLE)
        # اجرای دستیِ همان تابعِ ترمیم، دوباره (شبیه migrate دوباره).
        self._run_mood_repair()
        self.assertEqual(self._columns(self.MOODLOG_TABLE), before)
        self.assertEqual(
            self._moodlog_rows(),
            {"happy": "امروز بغل بابا بودم", "missing": "دلم براش تنگ شده بود"},
        )

    def test_stale_kind_blocks_writes_and_repair_fixes_it(self):
        self._simulate_legacy_sky()
        try:
            # ۱) همان خطای کاربر در سطحِ ORM: INSERT بدونِ kind می‌میرد.
            with self.assertRaises(IntegrityError):
                Constellation.objects.create(letter="❤", order=6, message="x")
            # ۲) و seed به‌جای tracebackِ گنگ، راهِ درست (migrate) را می‌گوید.
            with self.assertRaisesMessage(CommandError, "migrate"):
                call_command("seed_loveos", verbosity=0)

            # ۳) اجرای ترمیم (همان کاری که `migrate` می‌کند).
            self._run_repair(
                "content.migrations.0002_drop_legacy_sky_kind", "drop_legacy_kind"
            )

            # ۴) ستون رفته، ایندکسِ رویش هم رفته، شکل‌های قدیمی پاک شده‌اند،
            #    حرف‌های اسم مانده‌اند.
            self.assertNotIn("kind", self._columns("content_constellation"))
            self.assertEqual(self._indexes_on("content_constellation", "kind"), [])
            self.assertEqual(
                list(
                    Constellation.objects.order_by("order").values_list(
                        "letter", flat=True
                    )
                ),
                ["M", "A", "R", "Y", "A", "M"],
            )
            self.assertFalse(
                MigrationRecorder(connection)
                .migration_qs.filter(
                    app="content", name="0002_constellation_kind_and_sky_shapes"
                )
                .exists()
            )

            # ۵) حالا seed کامل اجرا می‌شود: ۶ حرف + ❤ و ♾.
            call_command("seed_loveos", verbosity=0)
            self.assertEqual(
                list(
                    Constellation.objects.order_by("order").values_list(
                        "letter", flat=True
                    )
                ),
                ["M", "A", "R", "Y", "A", "M", "❤", "♾"],
            )
        finally:
            # اگر تست وسطِ راه شکست، ستونِ اضافه را جمع کن تا تست‌های بعدی
            # روی دیتابیسِ کثیف اجرا نشوند (ترمیم idempotent است).
            self._run_repair(
                "content.migrations.0002_drop_legacy_sky_kind", "drop_legacy_kind"
            )

    def test_all_indexes_on_kind_are_dropped_but_others_survive(self):
        """اگر چند ایندکس (مثلاً جدا + ترکیبی) روی kind باشد، همه باید کشف و
        حذف شوند؛ ایندکسِ ستونِ دیگر دست‌نخورده بماند."""
        qn = connection.ops.quote_name
        with connection.cursor() as cur:
            cur.execute('DELETE FROM "content_constellation"')
            cur.execute(
                f"ALTER TABLE {qn('content_constellation')}"
                f" ADD COLUMN {qn('kind')} varchar(8) NOT NULL"
            )
            cur.execute(
                f"CREATE INDEX legacy_idx_a ON {qn('content_constellation')}({qn('kind')})"
            )
            cur.execute(
                f"CREATE INDEX legacy_idx_b"
                f" ON {qn('content_constellation')}({qn('kind')}, {qn('letter')})"
            )
            cur.execute(
                f"CREATE INDEX idx_letter ON {qn('content_constellation')}({qn('letter')})"
            )
        try:
            # باید هر دو ایندکسِ kind (جدا و ترکیبی) را یکجا کشف کند.
            self.assertEqual(
                sorted(self._indexes_on("content_constellation", "kind")),
                ["legacy_idx_a", "legacy_idx_b"],
            )
            self._run_repair(
                "content.migrations.0002_drop_legacy_sky_kind", "drop_legacy_kind"
            )
            self.assertEqual(self._indexes_on("content_constellation", "kind"), [])
            with connection.cursor() as cur:
                remaining = {
                    row[1] for row in cur.execute(
                        f"PRAGMA index_list({qn('content_constellation')})"
                    )
                }
            self.assertIn("idx_letter", remaining)
            self.assertNotIn("legacy_idx_a", remaining)
            self.assertNotIn("legacy_idx_b", remaining)
        finally:
            self._run_repair(
                "content.migrations.0002_drop_legacy_sky_kind", "drop_legacy_kind"
            )

    def test_stale_ui_quality_is_dropped(self):
        self._simulate_legacy_ui_quality()
        try:
            with self.assertRaises(IntegrityError):
                UserConfig.get_solo()
            self._run_repair(
                "accounts.migrations.0004_drop_legacy_ui_quality",
                "drop_legacy_ui_quality",
            )
            self.assertNotIn("ui_quality", self._columns("accounts_userconfig"))
            self.assertFalse(
                MigrationRecorder(connection)
                .migration_qs.filter(
                    app="accounts", name="0004_userconfig_ui_quality"
                )
                .exists()
            )
            # حالا ساختِ ردیفِ تازه بی‌خطاست.
            self.assertIsNotNone(UserConfig.get_solo().pk)
        finally:
            self._run_repair(
                "accounts.migrations.0004_drop_legacy_ui_quality",
                "drop_legacy_ui_quality",
            )


    # ---------------------------------------------- حال دل: ترمیمِ یتیم ----
    def test_legacy_moodlog_note_blocks_writes_until_migrate_repairs_it(self):
        """همان خطای ترمینال: ``INSERT`` روی ستونِ یتیمِ ``note`` می‌میرد و
        بعد از مسیرِ واقعیِ ``migrate`` دوباره سالم می‌شود."""
        self._simulate_legacy_moodlog()
        recorder = MigrationRecorder(connection)
        for name in ("0003_repair_legacy_moodlog_note", "0004_mood_custom"):
            recorder.migration_qs.filter(app="content", name=name).delete()

        # ۱) قبل از ترمیم: نوشتن می‌میرد (همان جنسِ خطای کاربر).
        with self.assertRaises(DatabaseError):
            MoodLog.objects.create(mood="happy")

        # ۲) مسیرِ واقعیِ آپدیت: `migrate` (۰۰۰۳ + ۰۰۰۴).
        call_command("migrate", verbosity=0)

        # ۳) ستونِ یتیم رفته، ایندکسش هم رفته، فیلدهای تازه سرِ جایشان‌اند.
        self.assertIn("note", self._columns(self.MOODLOG_TABLE))
        self.assertEqual(
            self._indexes_on(self.MOODLOG_TABLE, "note"),
            [],
            "ایندکسِ ستونِ یتیم باید پاک شود",
        )

        # ۴) یادداشت‌های قدیمی گم نشده‌اند.
        self.assertEqual(
            self._moodlog_rows(),
            {"happy": "امروز بغل بابا بودم", "missing": "دلم براش تنگ شده بود"},
        )

        # ۵) و دکمه‌ی «حال دلم» دیگر ۵۰۰ نمی‌دهد.
        MoodLog.objects.create(mood="sleepy", label="خواب‌آلود", note="شب بخیر بابا")
        self.assertEqual(MoodLog.objects.count(), 3)

    def test_runtime_guard_unblocks_a_stale_column_without_migrate(self):
        """ترمیمِ درجا: اگر ستونِ یتیمِ دیگری روی جدول ظاهر شود و کسی migrate
        نزند، همان لمسِ حال باید خودش را درمان کند (نه ۵۰۰)."""
        qn = connection.ops.quote_name
        MoodLog.objects.all().delete()
        with connection.cursor() as cur:
            cur.execute(
                f"ALTER TABLE {qn(self.MOODLOG_TABLE)}"
                f" ADD COLUMN {qn('legacy_flag')} varchar(8) NOT NULL"
            )
        mood_legacy._runtime_repair_done = False
        try:
            UserConfig.get_solo()
            session = DeviceSession.issue(hours=1)
            MoodMessage.objects.get_or_create(mood="happy", defaults={"message": "خوشحالم"})
            res = self.client.post(
                "/api/moods/set",
                {"mood": "happy", "note": "تستِ ترمیمِ درجا"},
                content_type="application/json",
                HTTP_AUTHORIZATION=f"Token {session.token}",
            )
            self.assertEqual(res.status_code, 200, res.content)
            self.assertTrue(res.json()["ok"])
            self.assertNotIn("legacy_flag", self._columns(self.MOODLOG_TABLE))
            self.assertEqual(MoodLog.objects.get().note, "تستِ ترمیمِ درجا")
        finally:
            mood_legacy._runtime_repair_done = False

    def test_mood_write_stays_calm_when_the_database_is_not_ready(self):
        """اگر جدول اصلاً آماده نباشد (مثلاً migrate فراموش شده)، پاسخ باید
        JSONِ روشن با پیامِ قشنگ باشد — نه ۵۰۰ و نه سکوت."""
        from unittest.mock import patch

        UserConfig.get_solo()
        session = DeviceSession.issue(hours=1)
        MoodMessage.objects.get_or_create(mood="happy", defaults={"message": "خوشحالم"})
        with patch(
            "content.api.MoodLog.objects.create",
            side_effect=OperationalError("no such column: content_moodlog.label"),
        ):
            res = self.client.post(
                "/api/moods/set",
                {"mood": "happy"},
                content_type="application/json",
                HTTP_AUTHORIZATION=f"Token {session.token}",
            )
        self.assertEqual(res.status_code, 503)
        body = res.json()
        self.assertFalse(body["ok"])
        self.assertTrue(body["message"], "پیامِ راهنما برای دخترم باید باشد")

    def test_sqlite_rebuild_fallback_keeps_data_and_other_indexes(self):
        """SQLiteهای قدیمی‌تر از ‎3.35‎ ``DROP COLUMN`` ندارند؛ این مسیر جدول را
        از نو می‌سازد و نباید داده یا ایندکسِ ستون‌های دیگر را از دست بدهد."""
        from core.schema import _sqlite_rebuild_without_columns

        if connection.vendor != "sqlite":
            self.skipTest("این پناهگاه مخصوص SQLite است")
        probe = "loveos_rebuild_probe"
        with connection.cursor() as cur:
            cur.execute(f"DROP TABLE IF EXISTS {probe}")
            cur.execute(
                f"CREATE TABLE {probe} (id integer NOT NULL PRIMARY KEY,"
                " keep text NOT NULL, legacy text NOT NULL)"
            )
            cur.execute(f"CREATE INDEX probe_keep_idx ON {probe}(keep)")
            cur.execute(
                f"INSERT INTO {probe} (id, keep, legacy) VALUES"
                " (1, 'دخترم', 'x'), (2, 'بابا', 'y')"
            )
        try:
            _sqlite_rebuild_without_columns(connection, probe, ["legacy"])
            self.assertNotIn("legacy", self._columns(probe))
            with connection.cursor() as cur:
                rows = list(cur.execute(f"SELECT id, keep FROM {probe} ORDER BY id"))
                indexes = {
                    row[1] for row in cur.execute(f"PRAGMA index_list({probe})")
                }
            self.assertEqual(rows, [(1, "دخترم"), (2, "بابا")])
            self.assertIn("probe_keep_idx", indexes)
        finally:
            with connection.cursor() as cur:
                cur.execute(f"DROP TABLE IF EXISTS {probe}")
