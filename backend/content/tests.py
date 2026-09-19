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

    شبیه‌سازی: ستونِ ``kind`` از نوعِ NOT NULL بدونِ پیش‌فرض + دو ردیفِ ♥/∞
    قدیمی + رکوردِ یتیم در django_migrations — دقیقاً همان وضعیتی که seed را
    با ``NOT NULL constraint failed: content_constellation.kind`` می‌شکست.
    """

    def _columns(self, table):
        with connection.cursor() as cur:
            return {
                f.name
                for f in connection.introspection.get_table_description(cur, table)
            }

    def _add_not_null_column(self, table, column, ddl_type):
        qn = connection.ops.quote_name
        with connection.cursor() as cur:
            cur.execute(
                f"ALTER TABLE {qn(table)} ADD COLUMN {qn(column)} {ddl_type} NOT NULL"
            )

    def _simulate_legacy_sky(self):
        """جدولِ آسمان را به وضعیتِ بعد از fb24945 برمی‌گرداند."""
        Constellation.objects.all().delete()
        self._add_not_null_column("content_constellation", "kind", "varchar(8)")
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
        self.assertNotIn("ui_quality", self._columns("accounts_userconfig"))

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

            # ۴) ستون رفته، شکل‌های قدیمی پاک شده‌اند، حرف‌های اسم مانده‌اند.
            self.assertNotIn("kind", self._columns("content_constellation"))
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

    def test_stale_ui_quality_is_dropped(self):
        UserConfig.objects.all().delete()
        self._add_not_null_column("accounts_userconfig", "ui_quality", "varchar(10)")
        MigrationRecorder(connection).record_applied(
            "accounts", "0004_userconfig_ui_quality"
        )
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
