"""
language.models — پل زبان (Language Bridge)

بابا مازندرانی حرف می‌زند و دخترم ترکی؛ این اپ زبان مادری همدیگر را یاد
می‌گیریم: دیکشنری، اصطلاح و ضرب‌المثل، تلفظ، فلش‌کارت و کوییز.

  • LanguageCategory → دسته‌ها (روزمره، عاشقانه، بامزه، خانوادگی، غذا، احساسات و ...)
  • LanguageEntry    → یک کلمه یا اصطلاح با معادل‌های چندزبانه و فایل تلفظ
  • LanguageQuiz     → سؤال‌های کوییز (کاملاً از پنل بابا)
  • LanguageProgress → کلمات یادگرفته‌شده و streak هر طرف
"""
from django.db import models

from core.models import TimeStamped

OWNER = [("daddy", "بابا"), ("daughter", "دخترم")]
LANGUAGES = [
    ("mzn", "مازندرانی"),
    ("tr", "ترکی"),
    ("fa", "فارسی"),
    ("en", "English"),
]
KINDS = [("word", "کلمه"), ("idiom", "اصطلاح و ضرب‌المثل")]


class LanguageCategory(TimeStamped):
    name = models.CharField("نام دسته", max_length=80, unique=True)
    icon = models.CharField("آیکن (ایموجی)", max_length=8, default="💬")
    detail = models.CharField("توضیح", max_length=200, blank=True)
    order = models.PositiveIntegerField("ترتیب", default=0)
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "دسته‌ی زبان"
        verbose_name_plural = "دسته‌های زبان"
        ordering = ["order", "name"]

    def __str__(self) -> str:
        return self.name


class LanguageEntry(TimeStamped):
    """
    یک ورودی دیکشنری/اصطلاح.

    معادل‌ها در یک فیلد JSON نگه داشته می‌شوند تا هر ورودی بتواند چند زبان
    داشته باشد (مازندرانی ↔ ترکی ↔ فارسی) و بعداً زبان تازه هم اضافه شود.
    """

    kind = models.CharField("نوع", max_length=10, choices=KINDS, default="word")
    text = models.CharField("متن اصلی", max_length=200)
    language = models.CharField("زبان اصلی", max_length=4, choices=LANGUAGES, default="mzn")
    translations = models.JSONField(
        "معادل‌ها", default=dict, blank=True, help_text='مثال: {"fa": "سلام", "tr": "Merhaba"}'
    )
    literal_meaning = models.CharField("معنی تحت‌اللفظی (برای اصطلاح)", max_length=255, blank=True)
    real_meaning = models.CharField("معنی واقعی", max_length=255, blank=True)
    example = models.CharField("مثال در جمله", max_length=255, blank=True)
    pronunciation = models.FileField("فایل تلفظ", upload_to="language/audio/", blank=True)
    category = models.ForeignKey(
        LanguageCategory, verbose_name="دسته", null=True, blank=True, on_delete=models.SET_NULL, related_name="entries"
    )
    added_by = models.CharField("افزوده‌شده توسط", max_length=10, choices=OWNER, default="daddy")
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "کلمه یا اصطلاح"
        verbose_name_plural = "۲۹) دیکشنری پل زبان"
        ordering = ["category__order", "-created_at"]
        indexes = [models.Index(fields=["kind", "language"])]

    def __str__(self) -> str:
        return f"{self.text} ({self.get_language_display()})"

    # ------------------------------------------------------------- helpers --
    def translation_for(self, lang: str) -> str:
        return (self.translations or {}).get(lang, "")

    @property
    def translation_labels(self) -> str:
        """«فارسی: سلام • ترکی: Merhaba» — برای کارت‌های فلش."""
        labels = dict(LANGUAGES)
        parts = [f"{labels.get(k, k)}: {v}" for k, v in (self.translations or {}).items() if v]
        return " • ".join(parts)

    def to_flashcard(self, target_lang: str = "tr") -> dict:
        return {
            "id": self.id,
            "kind": self.kind,
            "question": self.text,
            "language": self.language,
            "language_label": self.get_language_display(),
            "answer": self.translation_for(target_lang) or self.real_meaning or "",
            "target_language": target_lang,
            "example": self.example,
            "literal": self.literal_meaning,
            "real": self.real_meaning,
            "pronunciation": self.pronunciation.url if self.pronunciation else None,
            "category": self.category.name if self.category else "",
            "category_icon": self.category.icon if self.category else "💬",
        }


class LanguageQuiz(TimeStamped):
    """سؤال کوییز (چندگزینه‌ای) — همه از پنل بابا."""

    question = models.CharField("سؤال", max_length=255)
    options = models.JSONField("گزینه‌ها", default=list, blank=True, help_text='مثال: ["سلام", "خداحافظ", "ممنون"]')
    answer = models.CharField("پاسخ درست", max_length=200)
    fun_feedback = models.CharField("بازخورد بامزه", max_length=200, blank=True)
    category = models.ForeignKey(
        LanguageCategory, verbose_name="دسته", null=True, blank=True, on_delete=models.SET_NULL, related_name="quizzes"
    )
    order = models.PositiveIntegerField("ترتیب", default=0)
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "سؤال کوییز زبان"
        verbose_name_plural = "سؤال‌های کوییز زبان"
        ordering = ["order", "id"]

    def __str__(self) -> str:
        return self.question


class LanguageAttempt(TimeStamped):
    """نتیجه‌ی هر بار تمرین/کوییز، برای streak و آمار."""

    owner = models.CharField("کاربر", max_length=10, choices=OWNER, default="daughter")
    mode = models.CharField(
        "حالت", max_length=12, choices=[("flash", "فلش‌کارت"), ("quiz", "کوییز")], default="flash"
    )
    correct = models.PositiveIntegerField("درست", default=0)
    total = models.PositiveIntegerField("کل", default=0)

    class Meta:
        verbose_name = "تمرین زبان"
        verbose_name_plural = "تمرین‌های زبان"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.get_owner_display()} — {self.correct}/{self.total}"


class LanguageProgress(TimeStamped):
    owner = models.CharField("کاربر", max_length=10, choices=OWNER, default="daughter", unique=True)
    learned_count = models.PositiveIntegerField("تعداد کلمات یادگرفته", default=0)
    streak = models.PositiveIntegerField("روزهای پیوسته", default=0)
    best_streak = models.PositiveIntegerField("بهترین streak", default=0)
    last_practiced = models.DateField("آخرین تمرین", null=True, blank=True)
    learned_ids = models.JSONField("شناسه‌ی کلمات یادگرفته‌شده", default=list, blank=True)

    class Meta:
        verbose_name = "پیشرفت زبان"
        verbose_name_plural = "پیشرفت زبان"

    def __str__(self) -> str:
        return f"{self.get_owner_display()} — {self.learned_count} کلمه"

    # ------------------------------------------------------------- helpers --
    def mark_learned(self, entry_id: int) -> None:
        """یک کلمه را «یادگرفتم» علامت می‌زند و streak را به‌روز می‌کند."""
        from django.utils import timezone

        ids = set(self.learned_ids or [])
        ids.add(int(entry_id))
        self.learned_ids = sorted(ids)
        self.learned_count = len(ids)

        today = timezone.localdate()
        if self.last_practiced == today:
            pass
        elif self.last_practiced and (today - self.last_practiced).days == 1:
            self.streak += 1
        else:
            self.streak = 1
        self.best_streak = max(self.best_streak, self.streak)
        self.last_practiced = today
        self.save()

    @classmethod
    def get_for(cls, owner: str) -> "LanguageProgress":
        obj, _ = cls.objects.get_or_create(owner=owner)
        return obj
