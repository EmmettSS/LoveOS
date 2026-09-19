"""
۰۰۰۴ — ترمیمِ دیتابیس‌های قدیمی: حذفِ ستونِ یتیمِ ``ui_quality``

زمینه: ۱۶ سپتامبر، کامیت fb24945 فیلد ``UserConfig.ui_quality`` را با مایگریشن
``accounts.0004_userconfig_ui_quality`` اضافه کرد و همان روز کامیت 7bc99e4 کلِ
درخت را به وضعیت ۱۵ سپتامبر برگرداند. فیلد از مدل و فایلِ مایگریشن از دیسک
رفت، ولی دیتابیس‌هایی که آن مایگریشن را اجرا کرده بودند ستون را نگه داشتند.
این ستونِ اضافه همان بلایی را سرِ INSERTهای accounts_userconfig می‌آورد که
ستونِ یتیمِ kind سرِ seed آورد (NOT NULL constraint failed)؛ پس هم‌زمان با
ترمیمِ content پاک می‌شود.

این مایگریشن فقط روی دیتابیس اثر می‌گذارد و state مدل‌ها را عوض نمی‌کند:
  ۱) اگر ستونِ ``ui_quality`` روی جدولِ accounts_userconfig هست، DROP می‌شود.
  ۲) رکوردِ یتیمِ ``0004_userconfig_ui_quality`` از جدولِ django_migrations
     پاک می‌شود تا تاریخچه‌ی مهاجرت هم‌تراز شود.
روی نصبِ تازه کاملاً بی‌اثر است.

برگشت: یک‌طرفه است (reverse=noop)؛ این ستون متعلق به قابلیتِ برگردانده‌شده‌ی
«کیفیتِ سه‌بعدی» بود که دیگر در مدل‌ها نیست.

سازگاری: روی SQLite (توسعه) و MySQL (پروداکشن) یکسان کار می‌کند.
"""
from django.db import migrations
from django.db.migrations.recorder import MigrationRecorder

TABLE = "accounts_userconfig"
COLUMN = "ui_quality"
STALE_MIGRATION = "0004_userconfig_ui_quality"


def drop_legacy_ui_quality(apps, schema_editor):
    """ستونِ یتیمِ ui_quality را اگر هست پاک می‌کند."""
    MigrationRecorder(schema_editor.connection).record_unapplied(
        "accounts", STALE_MIGRATION
    )

    with schema_editor.connection.cursor() as cursor:
        columns = {
            f.name
            for f in schema_editor.connection.introspection.get_table_description(
                cursor, TABLE
            )
        }
    if COLUMN not in columns:
        return  # نصبِ تازه؛ چیزی برای ترمیم نیست

    qn = schema_editor.quote_name
    schema_editor.execute(f"ALTER TABLE {qn(TABLE)} DROP COLUMN {qn(COLUMN)}")


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0003_userconfig_search_disabled_sources_and_more"),
    ]

    operations = [
        migrations.RunPython(drop_legacy_ui_quality, migrations.RunPython.noop),
    ]
