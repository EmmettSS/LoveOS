"""
accounts.models — پیکربندی کاربر (دخترم) و نشست‌های دستگاه
UserConfig is a singleton row holding everything about "her" and "us".
"""
from datetime import timedelta

from django.contrib.auth.hashers import check_password, make_password
from django.db import models
from django.utils import timezone
from django.utils.crypto import get_random_string

from core.models import TimeStamped


class UserConfig(TimeStamped):
    """تنظیمات اصلی؛ فقط یک ردیف (singleton) — همه‌چیز از پنل بابا."""

    # --- هویت
    daughter_name = models.CharField("اسم دخترم", max_length=60, default="مریم")
    daughter_nickname = models.CharField("اسم نازی", max_length=60, default="دخترم")
    daddy_name = models.CharField("اسم بابا", max_length=60, default="بابا")
    daughter_birthday = models.DateField("تولد دخترم", null=True, blank=True)
    relationship_start = models.DateField("روز شروع ما", null=True, blank=True)
    anniversary = models.DateField("سالگرد ما", null=True, blank=True)
    next_meeting = models.DateTimeField("دیدار بعدی", null=True, blank=True)

    # --- شهرها (نقشه/آب‌وهوا)
    daddy_city = models.CharField("شهر بابا", max_length=60, default="تهران")
    daddy_lat = models.FloatField("عرض جغرافیایی بابا", default=35.6892)
    daddy_lng = models.FloatField("طول جغرافیایی بابا", default=51.3890)
    daddy_timezone = models.CharField("منطقه زمانی بابا", max_length=60, default="Asia/Tehran")
    daughter_city = models.CharField("شهر دخترم", max_length=60, default="استانبول")
    daughter_lat = models.FloatField("عرض جغرافیایی دخترم", default=41.0082)
    daughter_lng = models.FloatField("طول جغرافیایی دخترم", default=28.9784)
    daughter_timezone = models.CharField("منطقه زمانی دخترم", max_length=60, default="Europe/Istanbul")

    # --- امنیت
    passcode_hash = models.CharField("رمز ورود (هش)", max_length=200, blank=True)
    security_question = models.CharField("سؤال امنیتی", max_length=200, default="اسم گربه‌ی کوچولوی ما چی بود؟")
    security_answer_hash = models.CharField("پاسخ امنیتی (هش)", max_length=200, blank=True)
    vault_passcode_hash = models.CharField("رمز صندوقچه (هش)", max_length=200, blank=True)

    # --- ظاهر و متن‌ها
    boot_logo = models.ImageField("لوگوی LoveOS", upload_to="branding/", blank=True)
    boot_background = models.ImageField("پس‌زمینه بوت", upload_to="branding/", blank=True)
    lock_background = models.ImageField("پس‌زمینه قفل", upload_to="branding/", blank=True)
    desktop_background_day = models.ImageField("پس‌زمینه روز", upload_to="branding/", blank=True)
    desktop_background_night = models.ImageField("پس‌زمینه شب", upload_to="branding/", blank=True)
    boot_greeting = models.CharField("سلام بوت", max_length=200, default="سلام دخترم. خوش اومدی به دنیای کوچیک بابا.")
    wrong_pass_message = models.CharField("پیام رمز اشتباه", max_length=200, default="اینو که بابا یادت داده بود دخترم 🥺")
    lock_help_message = models.CharField(
        "پیام کمک بابا", max_length=255, default="عزیزم، رمز رو یادت رفت؟ بابا خودش کمکت می‌کنه"
    )
    about_text = models.TextField("درباره LoveOS", blank=True)
    today_message = models.CharField("پیام امروز", max_length=255, blank=True)

    # --- تنظیمات دخترم (قابل تغییر از اپ تنظیمات)
    language = models.CharField("زبان", max_length=2, choices=[("fa", "فارسی"), ("en", "English")], default="fa")
    theme = models.CharField(
        "تم", max_length=10, choices=[("auto", "خودکار"), ("day", "روز"), ("night", "شب")], default="auto"
    )
    sound_enabled = models.BooleanField("صدا", default=True)
    font_scale = models.FloatField("اندازه فونت", default=1.0)
    allow_daughter_music_upload = models.BooleanField("اجازه آپلود موسیقی به دخترم", default=True)

    class Meta:
        verbose_name = "پیکربندی دخترم"
        verbose_name_plural = "۰۱) پیکربندی دخترم"

    def __str__(self) -> str:
        return f"LoveOS — {self.daughter_name}"

    # ------------------------------------------------------------- helpers --
    @classmethod
    def get_solo(cls) -> "UserConfig":
        obj = cls.objects.first()
        if obj is None:
            obj = cls.objects.create()
        return obj

    def set_passcode(self, raw: str) -> None:
        self.passcode_hash = make_password(raw)

    def check_passcode(self, raw: str) -> bool:
        return bool(self.passcode_hash) and check_password(raw, self.passcode_hash)

    def set_security_answer(self, raw: str) -> None:
        self.security_answer_hash = make_password(raw.strip().lower())

    def check_security_answer(self, raw: str) -> bool:
        return bool(self.security_answer_hash) and check_password(raw.strip().lower(), self.security_answer_hash)

    def set_vault_passcode(self, raw: str) -> None:
        self.vault_passcode_hash = make_password(raw)

    def check_vault_passcode(self, raw: str) -> bool:
        return bool(self.vault_passcode_hash) and check_password(raw, self.vault_passcode_hash)

    @property
    def days_together(self) -> int:
        if not self.relationship_start:
            return 0
        return (timezone.localdate() - self.relationship_start).days


class DeviceSession(TimeStamped):
    """نشست دستگاه دخترم بعد از باز کردن قفل."""

    token = models.CharField("توکن", max_length=64, unique=True, db_index=True)
    user_agent = models.CharField("دستگاه", max_length=255, blank=True)
    ip = models.GenericIPAddressField("آی‌پی", null=True, blank=True)
    expires_at = models.DateTimeField("انقضا")
    vault_until = models.DateTimeField("اعتبار صندوقچه", null=True, blank=True)
    last_seen = models.DateTimeField("آخرین بازدید", default=timezone.now)

    class Meta:
        verbose_name = "نشست دستگاه"
        verbose_name_plural = "نشست‌های دستگاه"
        ordering = ["-last_seen"]

    def __str__(self) -> str:
        return f"{self.token[:8]}… تا {self.expires_at:%Y-%m-%d}"

    @classmethod
    def issue(cls, hours: int, **kwargs) -> "DeviceSession":
        return cls.objects.create(
            token=get_random_string(48),
            expires_at=timezone.now() + timedelta(hours=hours),
            **kwargs,
        )

    @property
    def is_valid(self) -> bool:
        return self.expires_at > timezone.now()

    @property
    def vault_open(self) -> bool:
        return bool(self.vault_until and self.vault_until > timezone.now())


class UnlockAttempt(models.Model):
    """تلاش‌های باز کردن قفل (برای شمارش ۵ رمز اشتباه)."""

    created_at = models.DateTimeField(auto_now_add=True)
    success = models.BooleanField(default=False)
    ip = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        verbose_name = "تلاش ورود"
        verbose_name_plural = "تلاش‌های ورود"
        ordering = ["-created_at"]
