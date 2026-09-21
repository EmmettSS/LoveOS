# ساخت پازل توسط دخترم — فیلد سازنده
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("games", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="puzzle",
            name="created_by",
            field=models.CharField(
                choices=[("daddy", "بابا"), ("daughter", "دخترم")],
                default="daddy",
                max_length=10,
                verbose_name="سازنده",
            ),
        ),
    ]
