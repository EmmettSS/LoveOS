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
  ۱) اگر ستونِ ``ui_quality`` روی جدولِ accounts_userconfig هست:
     ۱-۱) ایندکس‌هایی که ستون بخشی از آن‌هاست با introspection کشف و DROP
          می‌شوند (در تاریخچه‌ی واقعی این ستون ایندکس نداشت؛ این قدم فقط
          همان الگوی امنِ هم‌ترازِ ترمیمِ content است — هر وضعیتِ دیگری را
          هم بدونِ فرضِ اضافه می‌پذیرد).
     ۱-۲) بعد از آن، خودِ ستون DROP می‌شود.
  ۲) رکوردِ یتیمِ ``0004_userconfig_ui_quality`` از جدولِ django_migrations
     پاک می‌شود تا تاریخچه‌ی مهاجرت هم‌تراز شود.
روی نصبِ تازه کاملاً بی‌اثر است و چون هر قدم با کشفِ وضعیتِ فعلی شروع
می‌شود، تکرارش (idempotency) بی‌خطر است.

برگشت: یک‌طرفه است (reverse=noop)؛ این ستون متعلق به قابلیتِ برگردانده‌شده‌ی
«کیفیتِ سه‌بعدی» بود که دیگر در مدل‌ها نیست.

سازگاری: SQLite (توسعه) / MySQL (پروداکشن) / PostgreSQL — سینتکسِ DROP INDEX
برای MySQL فرق دارد (``DROP INDEX <name> ON <table>``) و با ``vendor`` شاخه
می‌زند.
"""
from django.db import migrations
from django.db.migrations.recorder import MigrationRecorder

TABLE = "accounts_userconfig"
COLUMN = "ui_quality"
STALE_MIGRATION = "0004_userconfig_ui_quality"


def _table_columns(connection, table):
    with connection.cursor() as cursor:
        return {
            f.name
            for f in connection.introspection.get_table_description(cursor, table)
        }


def _index_names_on_column(connection, table, column):
    """نامِ همه‌ی ایندکس‌هایی که ستونِ ``column`` بخشی از آن‌هاست را با
    introspection کشف می‌کند (همان الگوی امنِ content.0002):

      • SQLite:     PRAGMA index_list + PRAGMA index_info
      • MySQL:      SHOW INDEX
      • PostgreSQL: pg_index + pg_class + pg_attribute
    """
    qn = connection.ops.quote_name
    with connection.cursor() as cursor:
        if connection.vendor == "sqlite":
            names = []
            # ردیف‌ها را اول materialize کنیم: execute‌ی تودرتو روی همان
            # cursor، نتیجه‌ی execute‌ی بیرونی را بی‌اثر می‌کند.
            for row in list(cursor.execute(f"PRAGMA index_list({qn(table)})")):
                index_name, origin = row[1], row[3]
                # ایندکس‌های خودکارِ قیدِ UNIQUE/PK (origin=u/pk) با
                # DROP INDEX پاک نمی‌شوند؛ این ستون چنین قیدی ندارد.
                if origin in ("u", "pk"):
                    continue
                index_cols = {
                    col_row[2]
                    for col_row in cursor.execute(
                        f"PRAGMA index_info({qn(index_name)})"
                    )
                }
                if column in index_cols:
                    names.append(index_name)
            return names
        if connection.vendor == "mysql":
            by_key = {}
            for row in cursor.execute(f"SHOW INDEX FROM {qn(table)}"):
                # ستون‌های SHOW INDEX: 2 = Key_name، 4 = Column_name
                by_key.setdefault(row[2], set()).add(row[4])
            return [key for key, cols in by_key.items() if column in cols]
        # postgresql
        rows = cursor.execute(
            """
            SELECT ci.relname
            FROM pg_index i
            JOIN pg_class t ON t.oid = i.indrelid
            JOIN pg_class ci ON ci.oid = i.indexrelid
            JOIN pg_attribute a
                ON a.attrelid = t.oid AND a.attnum = ANY (i.indkey)
            WHERE t.relname = %s AND a.attname = %s
            """,
            [table, column],
        )
        return [row[0] for row in rows]


def drop_legacy_ui_quality(apps, schema_editor):
    """ستونِ یتیمِ ui_quality و ایندکسِ (احتمالی) رویش را اگر هستند پاک می‌کند."""
    connection = schema_editor.connection
    MigrationRecorder(connection).record_unapplied("accounts", STALE_MIGRATION)

    if COLUMN not in _table_columns(connection, TABLE):
        return  # نصبِ تازه (یا ترمیمِ قبلی کامل)؛ چیزی برای ترمیم نیست

    qn = schema_editor.quote_name
    # اول ایندکس‌های (احتمالی) رویِ ستون، بعد خودِ ستون — همان منطقِ
    # content.0002 که برای SQLite الزامی است.
    for index_name in _index_names_on_column(connection, TABLE, COLUMN):
        if connection.vendor == "mysql":
            schema_editor.execute(f"DROP INDEX {qn(index_name)} ON {qn(TABLE)}")
        else:  # sqlite / postgresql
            schema_editor.execute(f"DROP INDEX {qn(index_name)}")

    schema_editor.execute(
        f"ALTER TABLE {qn(TABLE)} DROP COLUMN {qn(COLUMN)}"
    )


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0003_userconfig_search_disabled_sources_and_more"),
    ]

    operations = [
        migrations.RunPython(drop_legacy_ui_quality, migrations.RunPython.noop),
    ]
