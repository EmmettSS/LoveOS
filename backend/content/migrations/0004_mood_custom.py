"""
۰۰۰۴ — «حال دل» تازه: حالِ دلخواهی که خودِ دخترم می‌سازد + برگرداندنِ یادداشت‌ها

چه چیزی عوض می‌شود؟
  ۱) ``MoodMessage`` (فهرستِ حال‌ها + پیام/ویسِ بابا):
       • ``label``   — برچسبِ دلخواه («حالم خوبه ولی خستم»)؛ خالی باشد،
                        برچسبِ پیش‌فرضِ همان حالِ آماده نشان داده می‌شود.
       • ``emoji``   — ایموجیِ دلخواه.
       • ``added_by``— «بابا» یا «دخترم»؛ حال‌هایی که خودش می‌سازد با
                        ``added_by="daughter"`` ذخیره می‌شوند.
       • ``mood``    — از ۱۲ به ۳۲ کاراکتر (کلیدِ حال‌های سفارشی مثل
                        ``custom-3f9a2b71`` جا شود).
       • ``message`` — ``blank`` شد؛ حالِ تازه ممکن است هنوز پیامی از بابا
                        نداشته باشد و بعداً بابا از پنل برایش بنویسد.
  ۲) ``MoodLog`` (هر باری که حالش را می‌گوید):
       • ``label`` / ``emoji`` — همان لحظه‌ی ثبت نگه داشته می‌شوند تا
         تاریخچه حتی بعد از حذفِ آن حال از فهرست خوانا بماند.
       • ``note``  — یادداشتِ خودش (فیلدِ تاریخچه‌ای که این باگ را ساخت،
         این بار به‌شکلِ درست و با پیش‌فرضِ خالی برمی‌گردد).
       • ``added_by``.

برگرداندنِ یادداشت‌های قدیمی:
  مایگریشنِ ۰۰۰۳ مقدارهای ستونِ یتیمِ ``note`` را قبل از حذف در جدولِ
  ``content_moodlog_legacy_note`` پشتیبان‌گیری کرد. آخرِ همین مایگریشن،
  آن یادداشت‌ها به ستونِ تازه‌ی ``note`` منتقل می‌شوند (فقط روی ردیف‌هایی که
  هنوز خالی‌اند). جدولِ پشتیبان عمداً پاک نمی‌شود؛ ماندنش ضرری ندارد و اگر
  روزی لازم شد، تاریخچه دست‌نخورده باقی می‌ماند.
"""
from django.db import migrations, models


def restore_legacy_notes(apps, schema_editor):
    """یادداشت‌های پشتیبان‌گیری‌شده‌ی ۰۰۰۳ را به ستونِ تازه برمی‌گرداند."""
    from content import legacy

    legacy.restore_preserved_notes(schema_editor.connection)


class Migration(migrations.Migration):
    dependencies = [
        ("content", "0003_repair_legacy_moodlog_note"),
    ]

    operations = [
        # ---------------------------------------------------- پیام‌های حال --
        migrations.AddField(
            model_name="moodmessage",
            name="label",
            field=models.CharField(
                blank=True,
                help_text="اگر خالی باشد، برچسبِ پیش‌فرضِ همان حال نشان داده می‌شود.",
                max_length=40,
                verbose_name="برچسب حال",
            ),
        ),
        migrations.AddField(
            model_name="moodmessage",
            name="emoji",
            field=models.CharField(blank=True, max_length=8, verbose_name="ایموجی"),
        ),
        migrations.AddField(
            model_name="moodmessage",
            name="added_by",
            field=models.CharField(
                choices=[("daddy", "بابا"), ("daughter", "دخترم")],
                default="daddy",
                max_length=10,
                verbose_name="ساخته‌ی",
            ),
        ),
        migrations.AlterField(
            model_name="moodmessage",
            name="mood",
            field=models.CharField(
                choices=[
                    ("happy", "خوشحال"),
                    ("missing", "دلتنگ"),
                    ("tired", "خسته"),
                    ("sad", "ناراحت"),
                    ("excited", "پر انرژی"),
                    ("sleepy", "خواب‌آلود"),
                ],
                max_length=32,
                unique=True,
                verbose_name="کلید حال",
            ),
        ),
        migrations.AlterField(
            model_name="moodmessage",
            name="message",
            field=models.TextField(blank=True, verbose_name="پیام بابا"),
        ),
        # ------------------------------------------------------ ثبتِ حال --
        migrations.AddField(
            model_name="moodlog",
            name="label",
            field=models.CharField(blank=True, max_length=40, verbose_name="برچسب حال"),
        ),
        migrations.AddField(
            model_name="moodlog",
            name="emoji",
            field=models.CharField(blank=True, max_length=8, verbose_name="ایموجی"),
        ),
        migrations.AddField(
            model_name="moodlog",
            name="note",
            field=models.TextField(
                blank=True, default="", verbose_name="یادداشت دخترم"
            ),
        ),
        migrations.AddField(
            model_name="moodlog",
            name="added_by",
            field=models.CharField(
                choices=[("daddy", "بابا"), ("daughter", "دخترم")],
                default="daughter",
                max_length=10,
                verbose_name="ثبت‌شده توسط",
            ),
        ),
        migrations.AlterField(
            model_name="moodlog",
            name="mood",
            field=models.CharField(max_length=32, verbose_name="کلید حال"),
        ),
        # ------------------------------------------------- یادداشت‌های قدیمی --
        migrations.RunPython(restore_legacy_notes, migrations.RunPython.noop),
    ]
