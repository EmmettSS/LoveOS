"""
content.models — محتوای احساسی LoveOS
ویس‌ها، آهنگ‌ها، خاطره‌ها، نامه‌ها، شمارش معکوس، باغچه، آسمان ستاره، سینما،
کوییز، آرزوها، حال دل، صندوقچه، آموزش.
All of these are 100% managed from the Daddy panel.
"""
from django.db import models

from core.models import TimeStamped


# ------------------------------------------------------------------ ویس ----
class Voice(TimeStamped):
    CATEGORY = [
        ("morning", "صبح‌ها"),
        ("night", "شب‌ها"),
        ("missing", "وقتی دلت تنگه"),
        ("happy", "وقتی خوشحالی"),
        ("sad", "وقتی ناراحتی"),
        ("sleepless", "وقتی نمی‌تونی بخوابی"),
        ("random", "تصادفی"),
    ]
    title = models.CharField("عنوان", max_length=120)
    category = models.CharField("دسته", max_length=20, choices=CATEGORY, default="random")
    audio = models.FileField("فایل صدا", upload_to="voices/")
    note = models.CharField("یادداشت بابا", max_length=255, blank=True)
    duration = models.PositiveIntegerField("مدت (ثانیه)", default=0)
    play_count = models.PositiveIntegerField("تعداد پخش", default=0)
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "ویس بابا"
        verbose_name_plural = "۰۲) صندوق صدای بابا"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.title} ({self.get_category_display()})"


# ----------------------------------------------------------------- آهنگ ----
class Song(TimeStamped):
    UPLOADER = [("daddy", "بابا"), ("daughter", "دخترم")]
    title = models.CharField("عنوان", max_length=140)
    artist = models.CharField("خواننده", max_length=140, blank=True)
    audio = models.FileField("فایل آهنگ", upload_to="songs/")
    cover = models.ImageField("کاور", upload_to="songs/covers/", blank=True)
    is_main = models.BooleanField("آهنگ اصلی ما", default=False)
    why_this_song = models.TextField("چرا این آهنگ؟", blank=True)
    lyrics = models.TextField("متن آهنگ", blank=True)
    uploaded_by = models.CharField("آپلود توسط", max_length=10, choices=UPLOADER, default="daddy")
    play_count = models.PositiveIntegerField("تعداد پخش", default=0)
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "آهنگ"
        verbose_name_plural = "۰۳) موسیقی ما"
        ordering = ["-is_main", "-created_at"]

    def __str__(self) -> str:
        return self.title


# ---------------------------------------------------------------- خاطره ----
class Memory(TimeStamped):
    title = models.CharField("عنوان", max_length=160)
    text = models.TextField("متن خاطره", blank=True)
    photo = models.ImageField("عکس", upload_to="memories/", blank=True)
    happened_on = models.DateField("تاریخ", null=True, blank=True)
    place = models.CharField("مکان", max_length=140, blank=True)
    is_future = models.BooleanField("خاطره‌ی آینده (قفل)", default=False)
    unlock_at = models.DateTimeField("زمان باز شدن", null=True, blank=True)
    is_unlocked = models.BooleanField("باز شده", default=False)
    locked_text = models.CharField(
        "متن حالت قفل", max_length=200, default="این خاطره هنوز نوشته نشده..."
    )
    voice = models.ForeignKey(Voice, verbose_name="ویس همراه", null=True, blank=True, on_delete=models.SET_NULL)
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "خاطره"
        verbose_name_plural = "۰۴) خاطره‌ها و رؤیاها"
        ordering = ["-happened_on", "-created_at"]

    def __str__(self) -> str:
        return self.title


# ----------------------------------------------------------------- نامه ----
class Letter(TimeStamped):
    title = models.CharField("عنوان", max_length=160)
    body = models.TextField("متن نامه")
    open_at = models.DateTimeField("زمان باز شدن", null=True, blank=True)
    is_opened = models.BooleanField("خوانده شده", default=False)
    opened_at = models.DateTimeField("زمان خواندن", null=True, blank=True)
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "نامه"
        verbose_name_plural = "۰۵) نامه‌های نجوا"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.title


# --------------------------------------------------------- شمارش معکوس ----
class Countdown(TimeStamped):
    title = models.CharField("عنوان", max_length=160)
    target = models.DateTimeField("تاریخ هدف")
    icon = models.CharField("آیکن", max_length=40, default="heart")
    done_message = models.CharField("پیام رسیدن", max_length=255, default="رسیدیم دخترم! 🎉")
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "شمارش معکوس"
        verbose_name_plural = "۰۶) شمارش معکوس‌ها"
        ordering = ["target"]

    def __str__(self) -> str:
        return self.title


# ---------------------------------------------------------------- باغچه ----
class Flower(TimeStamped):
    name = models.CharField("اسم گل", max_length=80)
    color = models.CharField("رنگ", max_length=20, default="#f9a8d4")
    emoji = models.CharField("شکل", max_length=8, default="🌸")
    water_count = models.PositiveIntegerField("تعداد آب دادن", default=0)
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "گل باغچه"
        verbose_name_plural = "۰۷) باغچه‌ی ما"

    def __str__(self) -> str:
        return self.name


class FlowerMessage(models.Model):
    """پیام‌های تصادفی شکوفه‌دادن."""

    text = models.CharField("پیام", max_length=255)
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "پیام شکوفه"
        verbose_name_plural = "پیام‌های شکوفه"

    def __str__(self) -> str:
        return self.text


# ----------------------------------------------------------- آسمان ستاره ---
class Constellation(TimeStamped):
    letter = models.CharField("حرف", max_length=2)
    order = models.PositiveIntegerField("ترتیب", default=0)
    message = models.TextField("پیام ستاره مرکزی", blank=True)
    stars = models.JSONField("ستاره‌ها [[x,y],...]", default=list, blank=True)
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "صورت فلکی"
        verbose_name_plural = "۰۸) آسمان ستاره‌ها"
        ordering = ["order"]

    def __str__(self) -> str:
        return f"{self.order}. {self.letter}"


# ---------------------------------------------------------------- سینما ----
class CinemaItem(TimeStamped):
    KIND = [("film", "فیلم"), ("series", "سریال")]
    STATUS = [("todo", "ندیدم"), ("watching", "در حال تماشا"), ("done", "دیدم")]
    ADDED_BY = [("daddy", "بابا"), ("daughter", "دخترم")]
    title = models.CharField("عنوان", max_length=180)
    kind = models.CharField("نوع", max_length=10, choices=KIND, default="film")
    link = models.URLField("لینک تماشا", blank=True)
    status = models.CharField("وضعیت", max_length=10, choices=STATUS, default="todo")
    rating = models.PositiveSmallIntegerField("امتیاز (۱-۵ قلب)", default=0)
    note = models.CharField("یادداشت", max_length=255, blank=True)
    poster = models.ImageField("پوستر", upload_to="cinema/", blank=True)
    added_by = models.CharField("اضافه شده توسط", max_length=10, choices=ADDED_BY, default="daddy")

    class Meta:
        verbose_name = "فیلم/سریال"
        verbose_name_plural = "۰۹) سینمای ما"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.title


# ---------------------------------------------------------------- کوییز ----
class QuizQuestion(TimeStamped):
    question = models.CharField("سؤال", max_length=255)
    option_a = models.CharField("گزینه ۱", max_length=140)
    option_b = models.CharField("گزینه ۲", max_length=140)
    option_c = models.CharField("گزینه ۳", max_length=140, blank=True)
    option_d = models.CharField("گزینه ۴", max_length=140, blank=True)
    correct = models.CharField(
        "پاسخ درست", max_length=1, choices=[("a", "۱"), ("b", "۲"), ("c", "۳"), ("d", "۴")], default="a"
    )
    explanation = models.CharField("توضیح", max_length=255, blank=True)
    order = models.PositiveIntegerField("ترتیب", default=0)
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "سؤال کوییز"
        verbose_name_plural = "۱۰) کوییز ما"
        ordering = ["order"]

    def __str__(self) -> str:
        return self.question


class QuizResult(TimeStamped):
    score = models.PositiveIntegerField("امتیاز", default=0)
    total = models.PositiveIntegerField("کل", default=0)

    class Meta:
        verbose_name = "نتیجه کوییز"
        verbose_name_plural = "نتایج کوییز"
        ordering = ["-created_at"]


class QuizReward(models.Model):
    """پیام مخفی نمره‌ی کامل."""

    message = models.TextField("پیام نمره کامل", default="نمره‌ی کاملت رو گرفتی دخترم ❤ تو منو از خودم بهتر بلدی.")
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "جایزه کوییز"
        verbose_name_plural = "جایزه کوییز"


# --------------------------------------------------------------- آرزوها ----
class FuturePlan(TimeStamped):
    CATEGORY = [("travel", "سفر"), ("work", "کار"), ("wish", "آرزو"), ("home", "خانه")]
    ADDED_BY = [("daddy", "بابا"), ("daughter", "دخترم")]
    title = models.CharField("عنوان", max_length=180)
    category = models.CharField("دسته", max_length=10, choices=CATEGORY, default="wish")
    is_done = models.BooleanField("انجام شد", default=False)
    added_by = models.CharField("توسط", max_length=10, choices=ADDED_BY, default="daddy")
    note = models.CharField("یادداشت", max_length=255, blank=True)

    class Meta:
        verbose_name = "آرزو"
        verbose_name_plural = "۱۱) آرزوهای ما"
        ordering = ["is_done", "-created_at"]

    def __str__(self) -> str:
        return self.title


# -------------------------------------------------------------- حال دل ----
class MoodMessage(TimeStamped):
    MOODS = [
        ("happy", "خوشحال"),
        ("missing", "دلتنگ"),
        ("tired", "خسته"),
        ("sad", "ناراحت"),
        ("excited", "پر انرژی"),
        ("sleepy", "خواب‌آلود"),
    ]
    mood = models.CharField("حال", max_length=12, choices=MOODS, unique=True)
    message = models.TextField("پیام بابا")
    voice = models.ForeignKey(Voice, verbose_name="ویس", null=True, blank=True, on_delete=models.SET_NULL)
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "پیام حال دل"
        verbose_name_plural = "۱۲) پیام‌های حال دل"

    def __str__(self) -> str:
        return self.get_mood_display()


class MoodLog(TimeStamped):
    mood = models.CharField("حال", max_length=40)
    note = models.CharField("یادداشت دل", max_length=200, blank=True)
    custom = models.ForeignKey(
        "CustomMood",
        verbose_name="حال سفارشی",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="logs",
    )

    class Meta:
        verbose_name = "ثبت حال"
        verbose_name_plural = "ثبت حال‌ها"
        ordering = ["-created_at"]


class CustomMood(TimeStamped):
    """حال دلخواهِ دختر با ایموجی — آزاد بدون تأیید بابا."""

    label = models.CharField("برچسب", max_length=40)
    emoji = models.CharField("ایموجی", max_length=8, default="💖")
    color = models.CharField("رنگ", max_length=20, default="#f687b3")
    created_by = models.CharField("سازنده", max_length=10, default="daughter")
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "حال دلخواه"
        verbose_name_plural = "حال‌های دلخواه"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.emoji} {self.label}"


# ------------------------------------------------------------ صندوقچه -----
class VaultItem(TimeStamped):
    KIND = [("video", "ویدیو"), ("audio", "صدا"), ("image", "عکس"), ("text", "متن")]
    title = models.CharField("عنوان", max_length=160)
    kind = models.CharField("نوع", max_length=10, choices=KIND, default="text")
    file = models.FileField("فایل", upload_to="vault/", blank=True)
    text = models.TextField("متن", blank=True)
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "محتوای صندوقچه"
        verbose_name_plural = "۱۳) صندوقچه‌ی خصوصی"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.title


# -------------------------------------------------------------- آموزش -----
class TutorialChapter(TimeStamped):
    key = models.SlugField("کلید (اسم اپ)", max_length=40, unique=True)
    title = models.CharField("عنوان", max_length=160)
    body = models.TextField("متن درس")
    order = models.PositiveIntegerField("ترتیب", default=0)
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "درس آموزش"
        verbose_name_plural = "۱۵) آموزش سیستم‌عامل"
        ordering = ["order"]

    def __str__(self) -> str:
        return self.title


# ------------------------------------------------------------- ترمینال ----
class TerminalCommand(TimeStamped):
    """خروجی دستورهای ترمینال، قابل ویرایش از پنل بابا."""

    command = models.CharField("دستور", max_length=80, unique=True)
    output = models.TextField("خروجی")
    help_text = models.CharField("توضیح در help", max_length=200, blank=True)
    hidden = models.BooleanField("مخفی از help", default=False)
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "دستور ترمینال"
        verbose_name_plural = "۱۴) دستورهای ترمینال"
        ordering = ["command"]

    def __str__(self) -> str:
        return self.command
