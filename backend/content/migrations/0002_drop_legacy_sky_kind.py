"""
۰۰۰۲ — ترمیمِ دیتابیس‌های قدیمی: حذفِ ستونِ یتیمِ ``kind`` از آسمانِ ستاره‌ها

زمینه (چرا این مایگریشن لازم است؟):
  • ۱۶ سپتامبر، کامیت fb24945 فیلد ``Constellation.kind`` را با ``db_index=True``
    و مایگریشن ``content.0002_constellation_kind_and_sky_shapes`` اضافه کرد و
    دو ردیفِ شکلِ آسمان (♥ با order=90 و ∞ با order=91) در دیتابیس ساخت.
  • همان روز، کامیت 7bc99e4 کلِ درخت را به وضعیت ۱۵ سپتامبر برگرداند؛ یعنی
    فیلد از مدل و فایلِ مایگریشن از دیسک حذف شد — ولی دیتابیس‌هایی که آن
    مایگریشن را اجرا کرده بودند، ستونِ ``kind`` (NOT NULL)، ایندکسِ خودکارش
    (``content_constellation_kind_<hash>``) و آن دو ردیف را نگه داشتند.
  • تا وقتی seed فقط ردیف‌های موجود را get می‌کرد خطایی دیده نمی‌شد؛ اما با
    اضافه شدنِ دو صورتِ فلکیِ تازه (❤ و ♾) در seed، اولین INSERT بدونِ ستونِ
    ``kind`` اجرا شد و seed با این خطا مُرد:
        IntegrityError: NOT NULL constraint failed: content_constellation.kind

این مایگریشن چه می‌کند (فقط روی دیتابیس؛ state مدل‌ها دست‌نخورده می‌ماند):
  ۱) اگر ستونِ ``kind`` روی جدولِ content_constellation هست:
     ۱-۱) همان دو ردیفِ خودکاری که مایگریشنِ قدیمی ساخته بود (kind='shape'
          با حرفِ ♥/∞) پاک می‌شوند؛ چون معادلِ تازه‌شان (❤/♾ با order ۶ و ۷)
          را seed می‌سازد و فرانتِ فعلی همه‌ی ردیف‌ها را رندر می‌کند — ماندنِ
          ردیف‌های ۹۰/۹۱ هم آسمان را شلوغ می‌کرد و هم با بسامدِ بالای ۶۰۰
          هرتز صدای گوش‌خراش تولید می‌کرد. اگر بابا دستی ردیفی با kind='shape'
          و حرفِ دیگری ساخته باشد، به‌عنوانِ یک صورتِ فلکیِ معمولی می‌ماند و
          پاک نمی‌شود.
     ۱-۲) *همه‌ی* ایندکس‌هایی که ستونِ kind بخشی از آن‌هاست، با introspection
          کشف و DROP می‌شوند. این قدم برای SQLite الزامی است؛ SQLite اجازه
          نمی‌دهد ستونی که روی آن ایندکس هست مستقیم حذف شود:
              error in index content_constellation_kind_e5ab940f
              after drop column: no such column: kind
          نامِ ایندکس هاردکد نمی‌شود — بخشی از آن هشِ نامِ فیلد است و ممکن
          است بینِ نصب‌ها فرق کند.
     ۱-۳) بعد از پاکِ ایندکس‌ها، خودِ ستون DROP می‌شود.
  ۲) رکوردِ یتیمِ ``0002_constellation_kind_and_sky_shapes`` از جدولِ
     django_migrations پاک می‌شود تا تاریخچه‌ی مهاجرت هم‌تراز شود.
  روی نصبِ تازه (بدونِ ستون/رکوردِ قدیمی) کاملاً بی‌اثر است؛ و چون هر قدم
  با کشفِ وضعیتِ فعلی شروع می‌شود، تکرارش (idempotency) هم بی‌خطر است — حتی
  اگر اجرایِ قبلیِ شکست‌خورده روی MySQL (DDL غیراتمیک) ایندکس‌ها را حذف کرده
  باشد و ستون را رها کرده باشد.

برگشت: یک‌طرفه است (reverse=noop)؛ داده‌ی حذف‌شده همان داده‌ی خودکارِ seed
است و با ``seed_loveos`` دوباره ساخته می‌شود.

سازگاری: SQLite (توسعه) / MySQL (پروداکشن) / PostgreSQL — سینتکسِ DROP INDEX
برای MySQL فرق دارد (``DROP INDEX <name> ON <table>``) و با ``vendor`` شاخه
می‌زند.
"""
from django.db import migrations
from django.db.migrations.recorder import MigrationRecorder

TABLE = "content_constellation"
COLUMN = "kind"
STALE_MIGRATION = "0002_constellation_kind_and_sky_shapes"
# ردیف‌هایی که مایگریشنِ برگردانده‌شده (۱۶ سپتامبر، fb24945) ساخته بود.
LEGACY_SHAPE_LETTERS = ["♥", "∞"]


def _table_columns(connection, table):
    with connection.cursor() as cursor:
        return {
            f.name
            for f in connection.introspection.get_table_description(cursor, table)
        }


def _index_names_on_column(connection, table, column):
    """نامِ همه‌ی ایندکس‌هایی که ستونِ ``column`` بخشی از آن‌هاست را با
    introspection کشف می‌کند:

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


def drop_legacy_kind(apps, schema_editor):
    """ستونِ یتیمِ kind، ایندکسِ رویش و ردیف‌های ♥/∞ قدیمی را اگر هستند
    پاک می‌کند."""
    connection = schema_editor.connection
    MigrationRecorder(connection).record_unapplied("content", STALE_MIGRATION)

    if COLUMN not in _table_columns(connection, TABLE):
        return  # نصبِ تازه (یا ترمیمِ قبلی کامل)؛ چیزی برای ترمیم نیست

    qn = schema_editor.quote_name
    with connection.cursor() as cursor:
        # ردیف‌های قدیمی *قبل* از حذفِ ستون پاک می‌شوند چون فیلتر به kind نیاز دارد.
        cursor.execute(
            f"DELETE FROM {qn(TABLE)} WHERE {qn(COLUMN)} = %s"
            f" AND {qn('letter')} IN (%s, %s)",
            ["shape", *LEGACY_SHAPE_LETTERS],
        )

    # اول ایندکس‌ها، بعد ستون: SQLite حذفِ مستقیمِ ستونِ ایندکس‌دار را رد می‌کند
    # (error in index ... after drop column: no such column: kind).
    for index_name in _index_names_on_column(connection, TABLE, COLUMN):
        if connection.vendor == "mysql":
            schema_editor.execute(f"DROP INDEX {qn(index_name)} ON {qn(TABLE)}")
        else:  # sqlite / postgresql
            schema_editor.execute(f"DROP INDEX {qn(index_name)}")

    schema_editor.execute(f"ALTER TABLE {qn(TABLE)} DROP COLUMN {qn(COLUMN)}")


class Migration(migrations.Migration):
    dependencies = [
        ("content", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(drop_legacy_kind, migrations.RunPython.noop),
    ]
