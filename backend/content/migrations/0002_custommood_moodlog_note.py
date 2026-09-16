from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("content", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="CustomMood",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="زمان ساخت")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="آخرین ویرایش")),
                ("label", models.CharField(max_length=40, verbose_name="برچسب")),
                ("emoji", models.CharField(default="💖", max_length=8, verbose_name="ایموجی")),
                ("color", models.CharField(default="#f687b3", max_length=20, verbose_name="رنگ")),
                ("created_by", models.CharField(default="daughter", max_length=10, verbose_name="سازنده")),
                ("is_active", models.BooleanField(default=True, verbose_name="فعال")),
            ],
            options={
                "verbose_name": "حال دلخواه",
                "verbose_name_plural": "حال‌های دلخواه",
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddField(
            model_name="moodlog",
            name="note",
            field=models.CharField(blank=True, max_length=200, verbose_name="یادداشت دل"),
        ),
        migrations.AlterField(
            model_name="moodlog",
            name="mood",
            field=models.CharField(max_length=40, verbose_name="حال"),
        ),
        migrations.AddField(
            model_name="moodlog",
            name="custom",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="logs",
                to="content.custommood",
                verbose_name="حال سفارشی",
            ),
        ),
    ]
