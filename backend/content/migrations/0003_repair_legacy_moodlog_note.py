"""
۰۰۰۳ — ترمیمِ دیتابیس‌های قدیمی: حذفِ ستونِ یتیمِ ``note`` از «حال دلم»

زمینه (چرا این مایگریشن لازم است؟):
  در نسخه‌ی قدیمی‌ترِ پروژه، ``MoodLog`` فیلدِ ``note`` داشت و مایگریشنش روی
  دیتابیسِ نصب‌های واقعی اجرا شده بود. بعد آن فیلد از مدل حذف شد، ولی ستونِ
  ``note`` با قیدِ ``NOT NULL`` (بدون پیش‌فرض) در دیتابیس ماند:

      CREATE TABLE content_moodlog (... , note text NOT NULL)

  مدلِ امروز ``note`` را نمی‌شناسد، پس اورم آن را در ``INSERT`` نمی‌فرستد و
  دیتابیس جلوی نوشتن را می‌گیرد. همین خطا در ترمینالِ خانه دیده شد:

      sqlite3.IntegrityError: NOT NULL constraint failed: content_moodlog.note
      POST /api/moods/set → 500

  نکته: مدلِ امروز (بعد از ۰۰۰۴) خودش فیلدِ ``note`` دارد — یعنی همان ستونِ
  قدیمی اگر سرِ جایش بماند، ``AddField``ِ ۰۰۰۴ هم با «duplicate column name»
  می‌شکند. پس اول باید پاک شود.

این مایگریشن چه می‌کند (فقط روی دیتابیس؛ state مدل‌ها دست‌نخورده می‌ماند):
  ۱) همه‌ی ستون‌های «مسدودکننده»ی ``content_moodlog`` را با قاعده‌ی دقیقِ
     ``core.schema`` پیدا می‌کند: در جدول هستند، در مدلِ همین مرحله نیستند،
     ``NOT NULL``‌اند و ``DEFAULT`` ندارند. (امروز فقط ``note`` است؛ ولی اگر
     ستونِ یتیمِ دیگری هم اضافه شده باشد، همان هم پاک می‌شود.)
  ۲) پیش از حذف، مقدارهای ستون در جدولِ ``content_moodlog_legacy_note``
     پشتیبان‌گیری می‌شوند — یادداشت‌هایی که دخترم سال‌ها نوشته گم نمی‌شوند.
     مایگریشنِ ۰۰۰۴ بعد از ساختنِ فیلدِ تازه‌ی ``note`` آن‌ها را برمی‌گرداند.
  ۳) ایندکس‌های روی ستون (اگر باشند) اول DROP می‌شوند؛ SQLite حذفِ مستقیمِ
     ستونِ ایندکس‌دار را رد می‌کند. روی SQLiteهای خیلی قدیمی (بدون
     ``ALTER TABLE ... DROP COLUMN``) جدول با همان نوع‌ها و پیش‌فرض‌ها از نو
     ساخته و داده‌ها منتقل می‌شود (پناهگاهِ ``core.schema``).

روی نصبِ تازه کاملاً بی‌اثر است؛ تکرارش هم بی‌خطر (idempotency) — هر قدم با
کشفِ وضعیتِ فعلی شروع می‌شود.

برگشت: یک‌طرفه (reverse=noop). ستون مربوط به فیلدی است که دیگر در مدل نیست؛
مقدارهایش هم قبل از حذف پشتیبان‌گیری شده‌اند.
"""
from django.db import migrations

from core.schema import repair_blocking_columns

TABLE = "content_moodlog"


def repair_legacy_moodlog_note(apps, schema_editor):
    """ستون‌های یتیم (به‌ویژه ``note``) را از ``content_moodlog`` پاک می‌کند.

    نامِ همین تابع را تست‌ها مستقیم صدا می‌زنند
    (``LegacyMoodNoteRepairTests`` در ``content/tests.py``) — عوضش نکنید.
    """
    moodlog = apps.get_model("content", "MoodLog")
    known = [field.name for field in moodlog._meta.local_fields]
    repair_blocking_columns(schema_editor.connection, TABLE, known)


class Migration(migrations.Migration):
    dependencies = [
        ("content", "0002_drop_legacy_sky_kind"),
    ]

    operations = [
        migrations.RunPython(repair_legacy_moodlog_note, migrations.RunPython.noop),
    ]
