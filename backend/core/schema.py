"""
core/schema.py — کشف و ترمیمِ ستون‌های یتیمِ دیتابیس

چرا این فایل هست؟
  تاریخِ این پروژه یک الگوی تکراری دارد: یک فیلد به مدل اضافه می‌شود، مایگریشنش
  اجرا می‌شود، بعد کد به عقب برمی‌گردد و فیلد از مدل (و از دیسک) می‌رود — ولی
  ستون در دیتابیسِ نصب‌های قبلی می‌ماند. اگر آن ستون ``NOT NULL`` باشد و
  پیش‌فرضِ دیتابیسی نداشته باشد، هر ``INSERT`` با این خطا می‌میرد:

      sqlite3.IntegrityError: NOT NULL constraint failed: content_moodlog.note

  تا امروز دو بار همین اتفاق افتاده (``content_constellation.kind`` و
  ``accounts_userconfig.ui_quality``) و هر بار یک مایگریشنِ دست‌سازِ تک‌منظوره
  برایش نوشته شده. این ماژول همان منطق را **عمومی** می‌کند تا هر ستونِ
  «مسدودکننده» — چه امروز و چه فردا — با یک فراخوانی کشف و (با پشتیبان‌گیری)
  حذف شود.

قاعده‌ی تشخیصِ ستونِ مسدودکننده (دقیق است، نه حدسی):
  ۱) در جدول هست،
  ۲) در مدلِ جنگو نیست،
  ۳) ``NOT NULL`` است،
  ۴) پیش‌فرضِ دیتابیسی ندارد (``DEFAULT``).
اگر هر چهار شرط برقرار باشد، اورم جنگو آن ستون را در ``INSERT`` نمی‌فرستد،
دیتابیس آن را ``NULL`` می‌کند و قیدِ ``NOT NULL`` می‌شکند. اگر پیش‌فرض داشته
باشد خطری نیست و دست‌نخورده می‌ماند.

پیش از حذف، مقدارهای ستون در جدولی به‌نام ``<table>_legacy_<column>``
پشتیبان‌گیری می‌شوند (``source_id`` + ``payload``) تا هیچ نوشته‌ای گم نشود؛
مایگریشنی که فیلدِ تازهٔ هم‌نام را می‌سازد می‌تواند داده‌ها را برگرداند.

سازگاری: SQLite (توسعه) / MySQL (پروداکشن) / PostgreSQL.
"""
from __future__ import annotations

import logging
import re

from django.db import DatabaseError

logger = logging.getLogger(__name__)

# پیامِ «ستون نمی‌تواند NULL باشد» در سه دیتابیسِ پشتیبانی‌شده:
_SQLITE_NOT_NULL = re.compile(r"NOT NULL constraint failed:\s*[\"']?([\w.]+)[\"']?", re.I)
_MYSQL_NOT_NULL = re.compile(r"Column '([\w]+)' cannot be null", re.I)
_PG_NOT_NULL = re.compile(r'null value in column "([\w]+)"', re.I)


# ------------------------------------------------------------- کاوشِ جدول -- #
def table_exists(connection, table: str) -> bool:
    """آیا جدول هست؟ (بدون استثنا، روی هر سه دیتابیس)"""
    try:
        with connection.cursor() as cursor:
            return table in connection.introspection.table_names(cursor)
    except DatabaseError:  # اتصالِ خراب/دیتابیسِ آماده‌نشده
        return False


def table_columns(connection, table: str) -> set[str]:
    with connection.cursor() as cursor:
        return {
            field.name
            for field in connection.introspection.get_table_description(cursor, table)
        }


def column_facts(connection, table: str) -> dict[str, dict[str, bool]]:
    """برای هر ستون: ``{"not_null": bool, "has_default": bool}``.

    ``get_table_description`` جنگو برای ستونِ پیش‌فرض‌دار در PostgreSQL مقدارِ
    درست را همیشه برنمی‌گرداند؛ پس مستقیم از ``information_schema`` (یا
    ``PRAGMA`` در SQLite) می‌خوانیم و تنها در صورتِ شکست به آن پناه می‌بریم.
    """
    qn = connection.ops.quote_name
    facts: dict[str, dict[str, bool]] = {}
    with connection.cursor() as cursor:
        if connection.vendor == "sqlite":
            # (cid, name, type, notnull, dflt_value, pk)
            for row in list(cursor.execute(f"PRAGMA table_info({qn(table)})")):
                facts[row[1]] = {
                    "not_null": bool(row[3]),
                    "has_default": row[4] is not None,
                }
        elif connection.vendor == "mysql":
            rows = list(
                cursor.execute(
                    "SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT"
                    " FROM information_schema.COLUMNS"
                    " WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s",
                    [table],
                )
            )
            for name, nullable, default in rows:
                facts[name] = {
                    "not_null": str(nullable or "").upper() == "NO",
                    "has_default": default is not None,
                }
        else:  # postgresql
            rows = list(
                cursor.execute(
                    "SELECT column_name, is_nullable, column_default"
                    " FROM information_schema.columns WHERE table_name = %s",
                    [table],
                )
            )
            for name, nullable, default in rows:
                facts[name] = {
                    "not_null": str(nullable or "").upper() == "NO",
                    "has_default": default is not None,
                }

    if facts:
        return facts

    # پناهگاهِ آخری: کاوشِ خودِ جنگو (بدون تشخیصِ مطمئنِ پیش‌فرض).
    with connection.cursor() as cursor:
        for field in connection.introspection.get_table_description(cursor, table):
            facts[field.name] = {
                "not_null": not field.null_ok,
                "has_default": field.default is not None,
            }
    return facts


def blocking_columns(connection, table: str, known_columns) -> list[str]:
    """ستون‌هایی که ``INSERT`` را می‌شکنند (هستند، در مدل نیستند، NOT NULL و
    بدون پیش‌فرض)."""
    if not table_exists(connection, table):
        return []
    known = set(known_columns)
    facts = column_facts(connection, table)
    return [
        name
        for name, fact in facts.items()
        if name not in known and fact["not_null"] and not fact["has_default"]
    ]


def blocking_column_from_error(exc: BaseException, table: str) -> str | None:
    """نامِ ستونِ مسدودکننده را از پیامِ خطای دیتابیس بیرون می‌کشد.

    این تنها راهِ مطمئن برای ترمیمِ *درجا* (وسطِ یک درخواست) است: نگاه به
    ستون‌های جدول ممکن است چند ستونِ مشکوک نشان بدهد، ولی دیتابیس دقیقاً
    گفته کدام یکی جلوی ``INSERT`` را گرفته.
    """
    message = str(exc)
    for pattern in (_SQLITE_NOT_NULL, _MYSQL_NOT_NULL, _PG_NOT_NULL):
        match = pattern.search(message)
        if not match:
            continue
        found = match.group(1)
        if "." in found:  # sqlite: "content_moodlog.note"
            found_table, found = found.split(".", 1)
            if found_table.strip('"').strip("'") != table:
                continue
        if found:
            return found.strip('"').strip("'")
    return None


# --------------------------------------------------- ایندکس‌ها و پشتیبان -- #
def index_names_on_column(connection, table: str, column: str) -> list[str]:
    """نامِ همه‌ی ایندکس‌هایی که ستون بخشی از آن‌هاست (SQLite/MySQL/PostgreSQL)."""
    qn = connection.ops.quote_name
    with connection.cursor() as cursor:
        if connection.vendor == "sqlite":
            names = []
            # ردیف‌ها را اول materialize می‌کنیم: executeِ تودرتو روی همان
            # cursor، نتیجه‌ی executeِ بیرونی را بی‌اثر می‌کند.
            for row in list(cursor.execute(f"PRAGMA index_list({qn(table)})")):
                name, origin = row[1], row[3]
                if origin in ("u", "pk"):  # ایندکس‌های خودکارِ UNIQUE/PK
                    continue
                cols = {
                    inner[2] for inner in cursor.execute(f"PRAGMA index_info({qn(name)})")
                }
                if column in cols:
                    names.append(name)
            return names
        if connection.vendor == "mysql":
            by_key: dict[str, set] = {}
            for row in cursor.execute(f"SHOW INDEX FROM {qn(table)}"):
                # ستون‌های SHOW INDEX: 2 = Key_name، 4 = Column_name
                by_key.setdefault(row[2], set()).add(row[4])
            return [key for key, cols in by_key.items() if column in cols]
        rows = cursor.execute(
            """
            SELECT ci.relname
            FROM pg_index i
            JOIN pg_class t ON t.oid = i.indrelid
            JOIN pg_class ci ON ci.oid = i.indexrelid
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY (i.indkey)
            WHERE t.relname = %s AND a.attname = %s
            """,
            [table, column],
        )
        return [row[0] for row in rows]


def drop_index(connection, table: str, index_name: str) -> None:
    qn = connection.ops.quote_name
    with connection.cursor() as cursor:
        if connection.vendor == "mysql":
            cursor.execute(f"DROP INDEX {qn(index_name)} ON {qn(table)}")
        else:  # sqlite / postgresql
            cursor.execute(f"DROP INDEX {qn(index_name)}")


def backup_table_name(table: str, column: str) -> str:
    return f"{table}_legacy_{column}"


def backup_column(connection, table: str, column: str) -> str | None:
    """مقدارهای یک ستون را پیش از حذف در جدولِ پشتیبان نگه می‌دارد.

    خروجی: نامِ جدولِ پشتیبان (یا ``None`` اگر چیزی برای نگه‌داشتن نبود).
    ساختارِ جدول عمداً ساده است (``source_id`` + ``payload``) تا روی SQLite،
    MySQL و PostgreSQL یکسان کار کند.
    """
    if not table_exists(connection, table):
        return None
    qn = connection.ops.quote_name
    backup = backup_table_name(table, column)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                f"CREATE TABLE IF NOT EXISTS {qn(backup)}"
                f" ({qn('source_id')} INTEGER PRIMARY KEY,"
                f" {qn('payload')} TEXT)"
            )
            # CAST لازم است: ستونِ قدیمی می‌تواند عدد/تاریخ باشد و payload متن است.
            cursor.execute(
                f"INSERT INTO {qn(backup)} ({qn('source_id')}, {qn('payload')})"
                f" SELECT {qn('id')}, CAST({qn(column)} AS TEXT) FROM {qn(table)}"
                f" WHERE {qn(column)} IS NOT NULL"
                f" AND CAST({qn(column)} AS TEXT) <> ''"
            )
    except DatabaseError:
        logger.warning("LoveOS: پشتیبان‌گیری از ستون %s.%s نشد", table, column, exc_info=True)
        return None
    return backup


def preserved_values(connection, table: str, column: str) -> dict[int, str]:
    """مقدارهای پشتیبان‌گیری‌شده‌ی یک ستون (اگر جدولِ پشتیبان باشد)."""
    backup = backup_table_name(table, column)
    if not table_exists(connection, backup):
        return {}
    qn = connection.ops.quote_name
    with connection.cursor() as cursor:
        return {
            int(row[0]): str(row[1])
            for row in cursor.execute(
                f"SELECT {qn('source_id')}, {qn('payload')} FROM {qn(backup)}"
            )
        }


# --------------------------------------------------------- حذفِ ستون ------ #
def _sqlite_rebuild_without_columns(connection, table: str, columns) -> None:
    """پناهگاهِ SQLiteهای قدیمی‌تر از ‎3.35‎ که ``DROP COLUMN`` ندارند.

    جدول را از روی ``PRAGMA table_info`` از نو می‌سازد (همان نوع‌ها، همان
    ``NOT NULL``ها و همان پیش‌فرض‌ها)، داده‌ها را منتقل می‌کند، ایندکس‌های
    ستون‌های دیگر را برمی‌گرداند و در آخر نامِ جدول را برمی‌گرداند.
    (``AUTOINCREMENT`` در این مسیر از دست می‌رود؛ این فقط رفتارِ استفاده‌ی
    دوبارهٔ شناسه‌ها را عوض می‌کند و برای این پروژه بی‌اهمیت است.)
    """
    qn = connection.ops.quote_name
    drop = set(columns)
    with connection.cursor() as cursor:
        info = list(cursor.execute(f"PRAGMA table_info({qn(table)})"))
        keep = [row for row in info if row[1] not in drop]
        # ایندکس‌های دست‌ساز (خودکارهای UNIQUE/PK با جدول می‌آیند و لازم نیست).
        indexes = [
            row[1]
            for row in cursor.execute(
                "SELECT type, sql, name FROM sqlite_master"
                " WHERE type = 'index' AND tbl_name = %s AND sql IS NOT NULL",
                [table],
            )
        ]
        index_sql = [
            row[0]
            for row in cursor.execute(
                "SELECT sql FROM sqlite_master"
                " WHERE type = 'index' AND tbl_name = %s AND sql IS NOT NULL",
                [table],
            )
        ]
        del indexes
    # ایندکس‌هایی که روی ستون‌های حذف‌شونده هستند بعداً بی‌معنی می‌شوند.
    index_sql = [
        sql for sql in index_sql if not any(f'"{c}"' in sql or f"({c}" in sql for c in drop)
    ]

    defs = []
    for _cid, name, ctype, not_null, default, pk in keep:
        part = f"{qn(name)} {ctype or 'TEXT'}"
        if not_null:
            part += " NOT NULL"
        if default is not None:
            part += f" DEFAULT {default}"
        if pk:
            part += " PRIMARY KEY"
        defs.append(part)

    shadow = f"{table}__loveos_rebuild"
    cols = ", ".join(qn(row[1]) for row in keep)
    with connection.cursor() as cursor:
        cursor.execute(f"DROP TABLE IF EXISTS {qn(shadow)}")
        cursor.execute(f"CREATE TABLE {qn(shadow)} ({', '.join(defs)})")
        cursor.execute(
            f"INSERT INTO {qn(shadow)} ({cols}) SELECT {cols} FROM {qn(table)}"
        )
        cursor.execute(f"DROP TABLE {qn(table)}")
    with connection.cursor() as cursor:
        cursor.execute(f"ALTER TABLE {qn(shadow)} RENAME TO {qn(table)}")
        for sql in index_sql:
            try:
                cursor.execute(sql)
            except DatabaseError:  # ایندکسِ تکراری/ناهم‌خوان — جدول سالم است
                logger.warning("LoveOS: بازسازیِ ایندکس نشد: %s", sql, exc_info=True)


def drop_column(connection, table: str, column: str) -> bool:
    """ستون را حذف می‌کند (اگر باشد). خروجی: انجام شد یا نه."""
    if not table_exists(connection, table):
        return False
    if column not in table_columns(connection, table):
        return False
    qn = connection.ops.quote_name
    try:
        with connection.cursor() as cursor:
            cursor.execute(f"ALTER TABLE {qn(table)} DROP COLUMN {qn(column)}")
        return True
    except DatabaseError:
        if connection.vendor != "sqlite":
            raise
        # SQLite قدیمی: بازسازیِ جدول (بدون ستونِ خواسته‌شده).
        _sqlite_rebuild_without_columns(connection, table, [column])
        return True


def repair_blocking_columns(connection, table: str, known_columns) -> list[str]:
    """همه‌ی ستون‌های مسدودکننده‌ی یک جدول را با پشتیبان‌گیری حذف می‌کند.

    خروجی: نامِ ستون‌های حذف‌شده. کاملاً idempotent است: اگر ستونی نباشد یا
    قبلاً ترمیم شده باشد، فقط یک لیست خالی برمی‌گرداند.
    """
    if not table_exists(connection, table):
        return []
    blockers = blocking_columns(connection, table, known_columns)
    if not blockers:
        return []

    dropped: list[str] = []
    for column in blockers:
        backup_column(connection, table, column)
        for index_name in index_names_on_column(connection, table, column):
            try:
                drop_index(connection, table, index_name)
            except DatabaseError:
                logger.warning(
                    "LoveOS: حذفِ ایندکس %s روی %s.%s نشد", index_name, table, column,
                    exc_info=True,
                )
        drop_column(connection, table, column)
        dropped.append(column)
    if dropped:
        logger.info("LoveOS: ستون‌های یتیمِ %s پاک شدند: %s", table, ", ".join(dropped))
    return dropped
