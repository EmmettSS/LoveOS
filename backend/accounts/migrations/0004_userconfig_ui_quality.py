from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0003_userconfig_search_disabled_sources_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="userconfig",
            name="ui_quality",
            field=models.CharField(
                choices=[
                    ("auto", "خودکار"),
                    ("lite", "مهتاب"),
                    ("balanced", "بلور"),
                    ("dream", "کهکشان"),
                ],
                default="auto",
                max_length=12,
                verbose_name="کیفیت سه‌بعدی",
            ),
        ),
    ]
