"""
social.models — چت، بغل، یادآورهای مهربان
Chat with Daddy (via Soroush), hugs (with vibration!), gentle reminders.
"""
from django.db import models
from django.utils import timezone

from core.models import TimeStamped


class ChatMessage(TimeStamped):
    SENDER = [("daughter", "دخترم"), ("daddy", "بابا")]
    sender = models.CharField("فرستنده", max_length=10, choices=SENDER)
    text = models.TextField("متن")
    via = models.CharField("از طریق", max_length=20, default="app")  # app | soroush | admin
    soroush_message_id = models.CharField("شناسه پیام سروش", max_length=64, blank=True)
    is_read = models.BooleanField("خوانده شده", default=False)

    class Meta:
        verbose_name = "پیام چت"
        verbose_name_plural = "۲۰) چت با بابا"
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"{self.get_sender_display()}: {self.text[:40]}"


class Hug(TimeStamped):
    """بغل! ویبره و انیمیشن سمت کلاینت اجرا می‌شود."""

    DIRECTION = [("daddy_to_daughter", "بابا ← دخترم"), ("daughter_to_daddy", "دخترم ← بابا")]
    direction = models.CharField("جهت", max_length=20, choices=DIRECTION)
    text = models.CharField("پیام بغل", max_length=255, blank=True)
    seen = models.BooleanField("دیده شد", default=False)
    seen_at = models.DateTimeField("زمان دیدن", null=True, blank=True)

    class Meta:
        verbose_name = "بغل"
        verbose_name_plural = "۲۱) بغل‌ها"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.get_direction_display()} — {self.created_at:%Y-%m-%d %H:%M}"


class HugSettings(models.Model):
    """متن‌ها و الگوی ویبره‌ی بغل — همه از پنل بابا قابل ویرایش."""

    incoming_title = models.CharField("عنوان اعلان ورودی", max_length=140, default="بابا داره بغلت می‌کنه...")
    incoming_message = models.CharField("پیام بعد از باز کردن", max_length=255, default="بابا الان بغلت کرد.")
    outgoing_message = models.CharField("پیام سروش به بابا", max_length=255, default="دخترت الان بغلت کرد ❤")
    vibration_pattern = models.CharField(
        "الگوی ویبره (میلی‌ثانیه، با کاما)", max_length=120, default="200,100,100,100,100,100,200"
    )
    warm_color = models.CharField("رنگ گرم پس‌زمینه", max_length=20, default="#ffd6a5")
    heartbeat_sound = models.FileField("صدای ضربان", upload_to="hug/", blank=True)

    class Meta:
        verbose_name = "تنظیمات بغل"
        verbose_name_plural = "تنظیمات بغل"

    def __str__(self) -> str:
        return "تنظیمات بغل"

    @classmethod
    def get_solo(cls) -> "HugSettings":
        return cls.objects.first() or cls.objects.create()

    @property
    def pattern_list(self) -> list[int]:
        out = []
        for part in self.vibration_pattern.split(","):
            part = part.strip()
            if part.isdigit():
                out.append(int(part))
        return out or [200, 100, 100, 100, 100, 100, 200]


class Reminder(TimeStamped):
    """یادآورهای مهربان — فقط در مرکز اعلان، بدون آیکن دسکتاپ."""

    TYPES = [
        ("manual", "دستی"),
        ("weather_rain", "باران"),
        ("weather_snow", "برف"),
        ("weather_hot", "گرما"),
        ("weather_cold", "سرما"),
        ("cycle_before", "۲ روز قبل پریود"),
        ("cycle_start", "روز اول پریود"),
        ("anniversary", "سالگرد"),
        ("birthday", "تولد"),
        ("random", "تصادفی"),
    ]
    REPEAT = [("once", "یک‌بار"), ("every_n", "هر N روز")]
    rtype = models.CharField("نوع", max_length=20, choices=TYPES, default="manual")
    title = models.CharField("عنوان", max_length=140)
    text = models.CharField("متن", max_length=255)
    when = models.DateTimeField("زمان", null=True, blank=True)
    repeat = models.CharField("تکرار", max_length=10, choices=REPEAT, default="once")
    repeat_days = models.PositiveIntegerField("هر چند روز", default=0)
    is_active = models.BooleanField("فعال", default=True)
    muted_by_daughter = models.BooleanField("بی‌صدا شده توسط دخترم", default=False)

    class Meta:
        verbose_name = "یادآور مهربان"
        verbose_name_plural = "۲۲) یادآورهای مهربان"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.title} ({self.get_rtype_display()})"


class ReminderLog(models.Model):
    reminder = models.ForeignKey(Reminder, on_delete=models.CASCADE, related_name="logs")
    sent_at = models.DateTimeField("زمان ارسال", default=timezone.now)
    viewed_at = models.DateTimeField("زمان دیدن", null=True, blank=True)

    class Meta:
        verbose_name = "لاگ یادآور"
        verbose_name_plural = "لاگ یادآورها"
        ordering = ["-sent_at"]
