"""
۰۰۰۲ — ترمیمِ دیتابیس‌های قدیمی: حذفِ ستونِ یتیمِ ``kind`` از آسمانِ ستاره‌ها

زمینه (چرا این مایگریشن لازم است؟):
  • ۱۶ سپتامبر، کامیت fb24945 فیلد ``Constellation.kind`` را با مایگریشن
    ``content.0002_constellation_kind_and_sky_shapes`` اضافه کرد و دو ردیفِ
    شکلِ آسمان (♥ با order=90 و ∞ با order=91) در دیتابیس ساخت.
  • همان روز، کامیت 7bc99e4 کلِ درخت را به وضعیت ۱۵ سپتامبر برگرداند؛ یعنی
    فیلد از مدل و فایلِ مایگریشن از دیسک حذف شد — ولی دیتابیس‌هایی که آن
    مایگریشن را اجرا کرده بودند، ستونِ ``kind`` (با قیدِ NOT NULL) و آن دو
    ردیف را نگه داشتند.
  • تا وقتی seed فقط ردیف‌های موجود را get می‌کرد خطایی دیده نمی‌شد؛ اما با
    اضافه شدنِ دو صورتِ فلکیِ تازه (❤ و ♾) در seed، اولین INSERT بدونِ ستونِ
    ``kind`` اجرا شد و seed با این خطا مُرد:
        IntegrityError: NOT NULL constraint failed: content_constellation.kind

این مایگریشن چه می‌کند (فقط روی دیتابیس؛ state مدل‌ها دست‌نخورده می‌ماند):
  ۱) اگر ستونِ ``kind`` روی جدولِ content_constellation هست:
     ۱-۱) همان دو ردیفِ خودکاری که مایگریشنِ قدیمی ساخته بود (kind='shape'
          با حرفِ ♥/∞) پاک می‌شوند؛ چون معادلِ تازه‌شان (❤/♾ با order ۶ و ۷)
          را seed می‌سازد و فرانتِ فعلی همه‌ی ردیف‌ها را رندر می‌کند — ماندنِ
          ردیف‌های ۹۰/۹۱ هم آسمان را شلوغ می‌کرد و هم با بسامدِ بالای ۶۰۰۰
          هرتز صدای گوش‌خراش تولید می‌کرد. اگر بابا دستی ردیفی با kind='shape'
          و حرفِ دیگری ساخته باشد، به‌عنوانِ یک صورتِ فلکیِ معمولی می‌ماند و
          پاک نمی‌شود.
     ۱-۲) خودِ ستون DROP می‌شود (ایندکسِ خودکارش هم همراهش می‌رود).
  ۲) رکوردِ یتیمِ ``0002_constellation_kind_and_sky_shapes`` از جدولِ
     django_migrations پاک می‌شود تا تاریخچه‌ی مهاجرت هم‌تراز شود.
  روی نصبِ تازه (بدونِ ستون/رکوردِ قدیمی) کاملاً بی‌اثر است.

برگشت: یک‌طرفه است (reverse=noop)؛ داده‌ی حذف‌شده همان داده‌ی خودکارِ seed
است و با ``seed_loveos`` دوباره ساخته می‌شود.

سازگاری: روی SQLite (توسعه) و MySQL (پروداکشن) یکسان کار می‌کند.
"""
from django.db import migrations
from django.db.migrations.recorder import MigrationRecorder

TABLE = "content_constellation"
COLUMN = "kind"
STALE_MIGRATION = "0002_constellation_kind_and_sky_shapes"
# ردیف‌هایی که مایگریشنِ برگردانده‌شده (۱۶ سپتامبر، fb24945) ساخته بود.
LEGACY_SHAPE_LETTERS = ["♥", "∞"]


def _table_columns(schema_editor, table):
    with schema_editor.connection.cursor() as cursor:
        return {
            f.name
            for f in schema_editor.connection.introspection.get_table_description(
                cursor, table
            )
        }


def drop_legacy_kind(apps, schema_editor):
    """ستونِ یتیمِ kind و ردیف‌های ♥/∞ قدیمی را اگر هستند پاک می‌کند."""
    MigrationRecorder(schema_editor.connection).record_unapplied(
        "content", STALE_MIGRATION
    )

    if COLUMN not in _table_columns(schema_editor, TABLE):
        return  # نصبِ تازه؛ چیزی برای ترمیم نیست

    qn = schema_editor.quote_name
    with schema_editor.connection.cursor() as cursor:
        # ردیف‌های قدیمی *قبل* از حذفِ ستون پاک می‌شوند چون فیلتر به kind نیاز دارد.
        cursor.execute(
            f"DELETE FROM {qn(TABLE)} WHERE {qn(COLUMN)} = %s"
            f" AND {qn('letter')} IN (%s, %s)",
            ["shape", *LEGACY_SHAPE_LETTERS],
        )
    schema_editor.execute(f"ALTER TABLE {qn(TABLE)} DROP COLUMN {qn(COLUMN)}")


class Migration(migrations.Migration):
    dependencies = [
        ("content", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(drop_legacy_kind, migrations.RunPython.noop),
    ]
