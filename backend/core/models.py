"""
core.models — مدل‌های زیرساختی LoveOS
شامل: اعلان‌های داخل سیستم‌عامل، صف ارسال سروش، دستاوردها، تخم‌مرغ‌های شانسی و لاگ‌ها.
Infrastructure models: OS notifications, Soroush outbox, achievements, easter eggs, logs.
"""
from django.db import models
from django.utils import timezone


class TimeStamped(models.Model):
    """مدل پایه با زمان ساخت/ویرایش."""

    created_at = models.DateTimeField("زمان ساخت", auto_now_add=True)
    updated_at = models.DateTimeField("آخرین ویرایش", auto_now=True)

    class Meta:
        abstract = True


# --------------------------------------------------------------- اعلان‌ها ----
class OSNotification(TimeStamped):
    """اعلان‌هایی که داخل LoveOS به دخترم نمایش داده می‌شود (مرکز اعلان)."""

    KIND = [
        ("daddy", "پیام بابا"),
        ("achievement", "دستاورد"),
        ("chat", "چت"),
        ("memory", "خاطره باز شد"),
        ("reminder", "یادآور مهربان"),
        ("hug", "بغل"),
        ("med", "دارو"),
        ("book", "کتاب"),
        ("easter", "راز"),
        ("system", "سیستم"),
        ("call", "تماس"),
        ("gift", "هدیه"),
        ("home", "خانه‌ی رویایی"),
        ("language", "پل زبان"),
    ]
    kind = models.CharField("نوع", max_length=20, choices=KIND, default="daddy")
    title = models.CharField("عنوان", max_length=160)
    text = models.TextField("متن", blank=True)
    icon = models.CharField("آیکن", max_length=40, blank=True)
    payload = models.JSONField("داده اضافه", default=dict, blank=True)
    action_app = models.CharField("باز کردن اپ", max_length=40, blank=True)
    is_read = models.BooleanField("خوانده شده", default=False)
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "اعلان سیستم"
        verbose_name_plural = "۱۷) اعلان‌های سیستم"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.get_kind_display()} — {self.title}"


class SoroushOutbox(TimeStamped):
    """صف پیام‌های سروش‌پلاس به بابا؛ با retry و لاگ خطا."""

    STATUS = [("pending", "در صف"), ("sent", "ارسال شد"), ("failed", "ناموفق")]
    event = models.CharField("رویداد", max_length=60)
    text = models.TextField("متن پیام")
    chat_id = models.CharField("chat_id", max_length=64, blank=True)
    status = models.CharField("وضعیت", max_length=10, choices=STATUS, default="pending")
    tries = models.PositiveIntegerField("تعداد تلاش", default=0)
    last_error = models.TextField("آخرین خطا", blank=True)
    sent_at = models.DateTimeField("زمان ارسال", null=True, blank=True)
    response = models.JSONField("پاسخ سرور", default=dict, blank=True)

    class Meta:
        verbose_name = "پیام سروش"
        verbose_name_plural = "۱۸) صندوق خروجی سروش"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"[{self.status}] {self.event}"


class ActivityLog(TimeStamped):
    """لاگ فعالیت‌های دخترم داخل سیستم (برای بابا)."""

    action = models.CharField("فعالیت", max_length=80)
    app = models.CharField("اپ", max_length=40, blank=True)
    detail = models.CharField("جزئیات", max_length=255, blank=True)
    meta = models.JSONField("داده", default=dict, blank=True)

    class Meta:
        verbose_name = "لاگ فعالیت"
        verbose_name_plural = "۱۹) لاگ فعالیت‌ها"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.action} @ {self.app}"


# ------------------------------------------------------------- دستاوردها ----
class Achievement(TimeStamped):
    """نشان‌ها؛ کد یکتا دارد و موتور دستاورد با همان کد آن را باز می‌کند."""

    code = models.SlugField("کد", max_length=60, unique=True)
    title = models.CharField("عنوان", max_length=120)
    description = models.CharField("توضیح", max_length=255, blank=True)
    icon = models.CharField("آیکن", max_length=40, default="star")
    secret_message = models.TextField("پیام مخفی بابا", blank=True)
    threshold = models.PositiveIntegerField("آستانه", default=1)
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "دستاورد"
        verbose_name_plural = "۱۶) دستاوردها"
        ordering = ["code"]

    def __str__(self) -> str:
        return self.title


class AchievementUnlock(TimeStamped):
    achievement = models.ForeignKey(Achievement, on_delete=models.CASCADE, related_name="unlocks")
    seen = models.BooleanField("دیده شده", default=False)

    class Meta:
        verbose_name = "دستاورد باز شده"
        verbose_name_plural = "دستاوردهای باز شده"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["achievement"], name="unique_achievement_unlock"),
        ]

    def __str__(self) -> str:
        return f"{self.achievement.title} ✓"


class Counter(models.Model):
    """شمارنده‌های عمومی برای موتور دستاورد (مثلاً hug_received=12)."""

    key = models.CharField("کلید", max_length=60, unique=True)
    value = models.IntegerField("مقدار", default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "شمارنده"
        verbose_name_plural = "شمارنده‌ها"

    def __str__(self) -> str:
        return f"{self.key}={self.value}"


# ------------------------------------------------------------ رازهای مخفی ---
class EasterEgg(TimeStamped):
    """۱۵ راز ثابت؛ تریگر ثابت است ولی پیام/پیوست از پنل بابا قابل ویرایش."""

    TRIGGERS = [
        ("click_logo_5", "۵ بار کلیک روی لوگو"),
        ("type_love", "تایپ کلمه love"),
        ("konami", "کد کونامی"),
        ("terminal_rm", "ترمینال: sudo rm -rf /loneliness"),
        ("terminal_sandwich", "ترمینال: sudo make me a sandwich"),
        ("midnight", "ساعت ۰۰:۰۰ تا ۰۵:۰۰"),
        ("birthday", "روز تولد دخترم"),
        ("anniversary", "سالگرد ما"),
        ("map_zoom", "زوم روی خانه بابا"),
        ("star_double_click", "دوبار کلیک روی ستاره مرکزی"),
        ("garden_5_water", "۵ بار آب دادن به یک گل"),
        ("hug_3", "۳ بار پشت‌سرهم بغل کردن بابا"),
        ("chat_love", "نوشتن «دوستت دارم» در چت"),
        ("music_3_play", "۳ بار پخش آهنگ اصلی"),
        ("lock_5_wrong", "۵ رمز اشتباه"),
        ("custom", "دلخواه"),
    ]
    title = models.CharField("عنوان", max_length=120)
    trigger_type = models.CharField("نوع تریگر", max_length=30, choices=TRIGGERS, unique=True)
    message = models.TextField("پیام")
    attachment = models.FileField("پیوست (صدا/عکس/ویدیو)", upload_to="eggs/", blank=True)
    extra = models.JSONField("تنظیم اضافه", default=dict, blank=True)
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "راز مخفی"
        verbose_name_plural = "۲۴) رازهای مخفی"
        ordering = ["trigger_type"]

    def __str__(self) -> str:
        return self.title


class EasterEggLog(models.Model):
    egg = models.ForeignKey(EasterEgg, on_delete=models.CASCADE, related_name="logs")
    activated_at = models.DateTimeField("زمان کشف", default=timezone.now)

    class Meta:
        verbose_name = "کشف راز"
        verbose_name_plural = "کشف رازها"
        ordering = ["-activated_at"]

    def __str__(self) -> str:
        return f"{self.egg.title} — {self.activated_at:%Y-%m-%d %H:%M}"
