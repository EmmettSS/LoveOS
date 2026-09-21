"""
content/legacy.py — ترمیمِ «حال دل» روی دیتابیس‌های قدیمی

داستانِ این باگ (۲۰ سپتامبر، همان چیزی که در ترمینالِ خانه دیده شد):

    Internal Server Error: /api/moods/set
    sqlite3.IntegrityError: NOT NULL constraint failed: content_moodlog.note
    ... content/api.py, in mood_set → MoodLog.objects.create(mood=mood)

در نسخه‌ی قدیمی‌ترِ پروژه، ``MoodLog`` یک فیلدِ ``note`` داشت (یادداشتِ دخترم
کنارِ حالش) و مایگریشنش هم روی دیتابیس اجرا شده بود. بعد آن فیلد از مدل
حذف شد، ولی ستونِ ``note`` با قیدِ ``NOT NULL`` در دیتابیسِ آن نصب‌ها ماند.
مدلِ امروز دیگر ``note`` را نمی‌شناسد، پس اورم آن را در ``INSERT`` نمی‌فرستد
و SQLite می‌گوید «ستون نمی‌تواند NULL باشد» — نتیجه: هر بار لمسِ یک حال،
پنج‌صد.

این ماژول دو کار می‌کند:
  ۱) ``ensure_moodlog_writable`` — ترمیمِ درجا (وسطِ درخواست): اگر نوشتن در
     ``content_moodlog`` با خطای «ستونِ NOT NULL» شکست، همان ستونِ یتیم
     (با پشتیبان‌گیری از مقدارهایش) حذف می‌شود و یک‌بار دیگر تلاش می‌شود.
     نتیجه‌اش این است که اپ حتی اگر کسی یادش برود ``migrate`` بزند هم
     از کار نمی‌افتد؛ ولی مسیرِ رسمی و کامل، مایگریشنِ ``content.0003`` است.
  ۲) ``restore_preserved_notes`` — برگرداندنِ یادداشت‌های پشتیبان‌گیری‌شده به
     ستونِ تازه‌ی ``note`` (که مایگریشنِ ``content.0004`` می‌سازد). این‌طوری
     یادداشت‌های قدیمی دخترم گم نمی‌شوند؛ به فیلدِ نو منتقل می‌شوند.

ستون‌های «مسدودکننده» با قاعده‌ی دقیقِ ``core.schema`` کشف می‌شوند: در جدول
هستند، در مدل نیستند، ``NOT NULL``‌اند و پیش‌فرضِ دیتابیسی ندارند.
"""
from __future__ import annotations

import logging

from django.db import DatabaseError

from core.schema import (
    backup_column,
    blocking_column_from_error,
    drop_column,
    drop_index,
    index_names_on_column,
    preserved_values,
    repair_blocking_columns,
    table_exists,
)

logger = logging.getLogger(__name__)

TABLE = "content_moodlog"
# ستونِ تاریخچه‌ای که این باگ را ساخته (برای پیام‌های روشن و پشتیبان‌گیری).
LEGACY_NOTE_COLUMN = "note"

# ترمیمِ درجا فقط یک‌بار در عمرِ هر پروسه تلاش می‌شود؛ اگر بعد از ترمیم هم
# نوشتن شکست بخورد، معنی‌اش مشکلِ دیگری است و نباید هر درخواست DDL بزند.
_runtime_repair_done = False


def model_columns() -> list[str]:
    """نامِ ستون‌های واقعیِ مدلِ ``MoodLog`` (منبعِ حقیقتِ امروز)."""
    from content.models import MoodLog

    return [field.name for field in MoodLog._meta.local_fields]


def table_column_names(connection) -> set[str]:
    from core.schema import table_columns

    if not table_exists(connection, TABLE):
        return set()
    try:
        return table_columns(connection, TABLE)
    except DatabaseError:
        return set()


def repair_blockers(connection) -> list[str]:
    """همه‌ی ستون‌های یتیمِ ``content_moodlog`` را (با پشتیبان‌گیری) پاک می‌کند."""
    return repair_blocking_columns(connection, TABLE, model_columns())


def ensure_moodlog_writable(connection, error: BaseException | None = None) -> list[str]:
    """ترمیمِ درجا بعد از یک خطای نوشتن. خروجی: ستون‌های پاک‌شده.

    اگر پیامِ خطا ستونِ دقیق را بگوید، فقط همان ستون حذف می‌شود (سریع‌ترین و
    کم‌خطرترین حالت)؛ وگرنه همه‌ی ستون‌های مسدودکننده.
    """
    global _runtime_repair_done
    if _runtime_repair_done:
        return []
    column = blocking_column_from_error(error, TABLE) if error else None
    dropped: list[str] = []
    try:
        if column and column not in model_columns():
            backup_column(connection, TABLE, column)
            for index_name in index_names_on_column(connection, TABLE, column):
                try:
                    drop_index(connection, TABLE, index_name)
                except DatabaseError:
                    logger.warning(
                        "LoveOS: حذفِ ایندکس %s نشد", index_name, exc_info=True
                    )
            drop_column(connection, TABLE, column)
            dropped.append(column)
        else:
            dropped = repair_blockers(connection)
    except DatabaseError:
        logger.error("LoveOS: ترمیمِ content_moodlog نشد", exc_info=True)
        return dropped
    _runtime_repair_done = True
    if dropped:
        logger.warning(
            "LoveOS: ستون‌های یتیمِ content_moodlog در زمان اجرا پاک شدند: %s"
            " (برای هم‌ترازیِ کاملِ تاریخچه‌ی مایگریشن‌ها `manage.py migrate` را بزنید)",
            ", ".join(dropped),
        )
    return dropped


def missing_model_columns(connection) -> list[str]:
    """ستون‌هایی که مدل دارد ولی جدول ندارد (یعنی دیتابیس ``migrate`` نشده)."""
    present = table_column_names(connection)
    if not present:
        return []
    return [name for name in model_columns() if name not in present]


def diagnose_write_failure(connection, error: BaseException | None = None) -> str:
    """یک جمله‌ی روشنِ فارسی برای لاگ: دقیقاً چه چیزی جلوی نوشتن را گرفته.

    این ترمیمِ درجا *همه‌کاره نیست* و عمداً هم نیست: فقط ستونِ یتیم را پاک
    می‌کند. اگر مشکل این باشد که دیتابیس ``migrate`` نشده (ستون‌های تازه‌ی مدل
    در جدول نیستند)، درست‌ترین کار اجرای ``manage.py migrate`` است — نه ساختِ
    دستیِ ستون‌ها وسطِ درخواست (که بعداً مایگریشن را با «duplicate column» می‌شکند).
    """
    blocking = blocking_column_from_error(error, TABLE) if error else None
    if blocking:
        return (
            f"دیتابیسِ LoveOS یک ستونِ قدیمیِ «{blocking}» در {TABLE} دارد که مدل دیگر "
            "نمی‌شناسد. مسیرِ رسمی: `python manage.py migrate` (مایگریشنِ content.0003 "
            "همان را با پشتیبان‌گیری پاک می‌کند؛ خودِ اپ هم هنگامِ نوشتن ترمیمش می‌کند)."
        )
    missing = missing_model_columns(connection)
    if missing:
        return (
            f"دیتابیسِ LoveOS با کدِ امروز هم‌خوان نیست: ستون‌های {missing} در {TABLE} "
            "نیستند. یعنی `python manage.py migrate` اجرا نشده — بعد از آن همه‌چیز "
            "درست می‌شود (چیزی از دست نمی‌رود)."
        )
    return f"نوشتن در {TABLE} نشد؛ جزئیات در لاگِ همین استثناست."


def restore_preserved_notes(connection) -> int:
    """یادداشت‌های پشتیبان‌گیری‌شده را به ستونِ تازهٔ ``note`` برمی‌گرداند.

    خروجی: تعدادِ یادداشت‌های برگردانده‌شده. اگر جدولِ پشتیبان نباشد
    (نصبِ تازه) بی‌اثر است؛ پس تکرارش هم بی‌خطر است.
    """
    values = preserved_values(connection, TABLE, LEGACY_NOTE_COLUMN)
    if not values:
        return 0
    if LEGACY_NOTE_COLUMN not in table_column_names(connection):
        return 0
    qn = connection.ops.quote_name
    restored = 0
    with connection.cursor() as cursor:
        for row_id, note in values.items():
            cursor.execute(
                f"UPDATE {qn(TABLE)} SET {qn(LEGACY_NOTE_COLUMN)} = %s"
                f" WHERE {qn('id')} = %s AND ({qn(LEGACY_NOTE_COLUMN)} IS NULL"
                f" OR {qn(LEGACY_NOTE_COLUMN)} = '')",
                [note, row_id],
            )
            if cursor.rowcount:
                restored += 1
    if restored:
        logger.info("LoveOS: %s یادداشتِ قدیمیِ حال دل برگردانده شد", restored)
    return restored
