"""تست‌های صندوقچه: افزودن محتوا توسط دخترم (متن/عکس/صدا/ویدیو)."""
import importlib
from datetime import timedelta

from django.apps import apps
from django.core.management import CommandError, call_command
from django.db import connection
from django.db.migrations.recorder import MigrationRecorder
from django.db.utils import IntegrityError
from django.test import TestCase, TransactionTestCase
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

    def _run_repair(self, module_name, func_name):
        mod = importlib.import_module(module_name)
        with connection.schema_editor() as se:
            getattr(mod, func_name)(apps, se)

    def test_repair_is_noop_on_fresh_database(self):
        """روی نصبِ تازه (جدول‌های خالی و سالم) ترمیم بی‌اثر و بی‌خطاست."""
        self._run_repair(
            "content.migrations.0002_drop_legacy_sky_kind", "drop_legacy_kind"
        )
        self._run_repair(
            "accounts.migrations.0004_drop_legacy_ui_quality",
            "drop_legacy_ui_quality",
        )
        self.assertNotIn("kind", self._columns("content_constellation"))
        self.assertEqual(self._indexes_on("content_constellation", "kind"), [])
        self.assertNotIn("ui_quality", self._columns("accounts_userconfig"))

    def test_end_to_end_legacy_database_via_migrate_and_seed(self):
        """سناریوی کاملِ دیتابیسِ واقعیِ کاربر، از خرابی تا سلامت:

        شبیه‌سازیِ قدیمی (ستون + ایندکس + ۸ ردیف + یتیم‌های تاریخچه) ←
        `migrate` واقعی که هر دو ترمیم را اجرا می‌کند ← `seed_loveos`
        با ۸ صورتِ فلکی + seed دومِ idempotent.
        """
        self._simulate_legacy_sky()
        self._simulate_legacy_ui_quality()

        # همان شکستِ واقعی: مایگریشن‌های ترمیمی هنوز در django_migrations
        # ثبت نشده‌اند (0002 روی SQLite رول‌بک شد؛ 0004 هم ممکن است هرگز
        # اجرا نشده باشد) تا `migrate` واقعاً اجرا شوند.
        recorder = MigrationRecorder(connection)
        recorder.migration_qs.filter(
            app="content", name="0002_drop_legacy_sky_kind"
        ).delete()
        recorder.migration_qs.filter(
            app="accounts", name="0004_drop_legacy_ui_quality"
        ).delete()

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
