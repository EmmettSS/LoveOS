"""
accounts.models — پیکربندی کاربر (دخترم) و نشست‌های دستگاه
UserConfig is a singleton row holding everything about "her" and "us".
"""
from datetime import timedelta

from django.contrib.auth.hashers import check_password, make_password
from django.db import models
from django.utils import timezone
from django.utils.timezone import now as tz_now
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

    # --- موقعیت زنده‌ی دخترم
    location_enabled = models.BooleanField("استفاده از موقعیت زنده‌ی دستگاه دخترم", default=True)
    location_ttl_minutes = models.PositiveIntegerField("اعتبار موقعیت زنده (دقیقه)", default=60)
    location_auto_sync = models.BooleanField("به‌روزرسانی خودکار شهر/مختصات پنل از موقعیت واقعی", default=True)
    location_sync_km = models.FloatField("حداقل جابجایی برای به‌روزرسانی پنل (کیلومتر)", default=2.0)
    location_city_lookup = models.BooleanField("تشخیص خودکار نام شهر از مختصات", default=True)

    # --- جستجوی سراسری
    search_disabled_sources = models.JSONField(
        "منابع خاموش جستجوی سراسری",
        default=list,
        blank=True,
        help_text="کلید منابعی که نمی‌خواهی در جستجو دیده شوند؛ مثال: [\"easter_eggs\", \"chat\"]",
    )
    search_log_enabled = models.BooleanField("ثبت عبارت‌های پرجستجو", default=False)

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

    # لایه‌ی کیفیتِ رابطِ سه‌بعدی. مقدارِ پیش‌فرض ``auto`` است: خودِ دستگاه
    # با سنجه‌ی توان (WebGL، حافظه، تعداد هسته، FPS زنده) یکی از سه لایه را
    # برمی‌گزیند و در حینِ کار هم اصلاحش می‌کند.
    #
    # نکته‌ی مهم درباره‌ی نام‌گذاری: مقدارهای ذخیره‌شده **فنی**‌اند
    # (lite/balanced/dream) نه نمایشی (مهتاب/بلور/کهکشان). این عمدی است تا
    # اگر روزی اسمِ کاربرپسند عوض شد، نیاز به مایگریشنِ داده نباشد — ترجمه‌ی
    # نام‌ها کارِ فایل‌های locale است.
    #
    # این تنظیم هم روی سرور ذخیره می‌شود و هم محلی روی دستگاه؛ چون کیفیت
    # **خاصِ هر دستگاه** است (گوشی او با لپ‌تاپ بابا فرق دارد)، اولویت با
    # نسخه‌ی محلی است — دقیقاً همان الگوی font_scale و theme.
    UI_QUALITY = [
        ("auto", "خودکار (با تشخیص دستگاه)"),
        ("lite", "سبک — مهتاب"),
        ("balanced", "متعادل — بلور"),
        ("dream", "رویایی — کهکشان"),
    ]
    ui_quality = models.CharField("کیفیتِ رابطِ سه‌بعدی", max_length=10, choices=UI_QUALITY, default="auto")

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


class LiveLocation(TimeStamped):
    """
    آخرین موقعیت واقعی دستگاه دخترم.

    «خانه‌ی ثبت‌شده» در UserConfig فقط پیش‌فرض است؛ اگر دخترم سفر کند یا شهرش
    عوض شود، همه‌ی اپ‌ها (نقشه، آب‌وهوا، فاصله، ساعت محلی) باید بر اساس همین
    ردیف حساب کنند. یک ردیف برای هر کاربر کافی است و همیشه به‌روز می‌شود.
    """

    SOURCES = [("device", "دستگاه دخترم"), ("config", "پنل بابا")]

    lat = models.FloatField("عرض جغرافیایی", default=0)
    lng = models.FloatField("طول جغرافیایی", default=0)
    accuracy = models.PositiveIntegerField("دقت (متر)", null=True, blank=True)
    city = models.CharField("شهر", max_length=60, blank=True)
    timezone = models.CharField("منطقه زمانی", max_length=60, blank=True)
    source = models.CharField("منبع", max_length=10, choices=SOURCES, default="device")
    captured_at = models.DateTimeField("زمان ثبت", default=tz_now)
    is_live = models.BooleanField("زنده", default=True)

    class Meta:
        verbose_name = "موقعیت زنده"
        verbose_name_plural = "موقعیت زنده‌ی دخترم"
        ordering = ["-captured_at"]

    def __str__(self) -> str:
        return f"{self.city or '—'} ({self.lat:.3f}, {self.lng:.3f})"

    # ------------------------------------------------------------- helpers --
    @classmethod
    def current(cls) -> "LiveLocation | None":
        return cls.objects.filter(is_live=True).order_by("-captured_at").first()

    @classmethod
    def store(cls, *, lat: float, lng: float, accuracy=None, city: str = "", timezone_name: str = "",
              source: str = "device") -> "LiveLocation":
        """موقعیت تازه را ثبت می‌کند و نسخه‌های قدیمی را غیرزنده می‌کند."""
        cls.objects.filter(is_live=True).update(is_live=False)
        return cls.objects.create(
            lat=lat, lng=lng, accuracy=accuracy, city=city, timezone=timezone_name,
            source=source, captured_at=timezone.now(), is_live=True,
        )

    def age_minutes(self) -> float:
        return (timezone.now() - self.captured_at).total_seconds() / 60

    def is_fresh(self, minutes: int = 60) -> bool:
        return self.is_live and self.age_minutes() <= minutes


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
