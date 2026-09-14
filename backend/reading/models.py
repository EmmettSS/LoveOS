"""
reading.models — کتاب‌خوانی مشترک (Read Together)

لازم نیست همزمان بخوانیم: هر کدام در وقت خودش می‌خواند و حاشیه‌نویسی می‌کند،
بعد همدیگر را می‌خوانیم. سه قفسه داریم — الان داریم می‌خونیم، خوندیم،
می‌خوایم بخونیم — و برای هر فصل یک صفحه‌ی گفتگو.

این اپ از اپ «کتابخانه» (که بابا داستان خودش را می‌نویسد) جدا است، ولی
قفسه‌شان یکی است: کتاب‌های کتابخانه هم در فهرست این اپ دیده می‌شوند.

  • ReadingBook     → عنوان، نویسنده، جلد، وضعیت، PDF/لینک، کتاب فیزیکی
  • ReadingChapter  → فصل‌های هر کتاب (+ متن اختیاری)
  • ReadingProgress → هر نفر تا کجا خوانده
  • ReadingNote     → یادداشت حاشیه‌ی فصل (+ امتیاز قلب)
  • ReadingQuote    → نقل‌قول محبوب
  • ChapterComment  → گفتگوی فصل (ترد)
"""
from django.db import models
from django.utils import timezone

from core.models import TimeStamped

OWNER = [("daddy", "بابا"), ("daughter", "دخترم")]
STATUS = [
    ("reading", "الان داریم می‌خونیم"),
    ("finished", "خوندیم"),
    ("want", "می‌خوایم بخونیم"),
]


class ReadingBook(TimeStamped):
    """یک کتاب در قفسه‌ی مشترک ما."""

    title = models.CharField("عنوان", max_length=200)
    author = models.CharField("نویسنده", max_length=160, blank=True)
    cover = models.ImageField("جلد", upload_to="reading/covers/", blank=True)
    status = models.CharField("وضعیت", max_length=10, choices=STATUS, default="want")
    summary = models.TextField("چکیده", blank=True)
    why_this_book = models.CharField("چرا این کتاب؟", max_length=255, blank=True)
    pdf = models.FileField("فایل PDF", upload_to="reading/pdf/", blank=True)
    link = models.URLField("لینک (نسخه‌ی آنلاین)", blank=True)
    is_physical = models.BooleanField("کتاب کاغذی داریم", default=False)
    total_chapters = models.PositiveIntegerField("تعداد فصل", default=0)
    added_by = models.CharField("اضافه شده توسط", max_length=10, choices=OWNER, default="daddy")
    started_on = models.DateField("شروع", null=True, blank=True)
    finished_on = models.DateField("تمام شد در", null=True, blank=True)
    # اگر این کتاب از اپ کتابخانه‌ی ما آمده باشد، این‌جا وصل می‌شود
    library_book = models.ForeignKey(
        "library.Book", verbose_name="کتاب کتابخانه", null=True, blank=True, on_delete=models.SET_NULL, related_name="reading_entries"
    )
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "کتاب مشترک"
        verbose_name_plural = "۲۷) کتاب‌های مشترک"
        ordering = ["status", "-created_at"]

    def __str__(self) -> str:
        return self.title

    @property
    def chapters_count(self) -> int:
        return self.chapters.count() or self.total_chapters

    @property
    def percent_for_daddy(self) -> int:
        return self.progress_percent("daddy")

    @property
    def percent_for_daughter(self) -> int:
        return self.progress_percent("daughter")

    def progress_percent(self, owner: str) -> int:
        """درصد پیشرفت یک طرف بر اساس آخرین فصلِ علامت‌خورده."""
        row = self.progress.filter(owner=owner).first()
        if row:
            return row.percent
        total = self.chapters_count
        if not total:
            return 100 if self.status == "finished" else 0
        read_count = self.chapters.filter(notes__owner=owner).distinct().count()
        return min(100, round(read_count * 100 / total))

    def refresh_status(self) -> None:
        """اگر هر دو تمام کردند، کتاب خودش می‌رود در قفسه‌ی «خوندیم»."""
        if self.percent_for_daddy >= 100 and self.percent_for_daughter >= 100 and self.status != "finished":
            self.status = "finished"
            self.finished_on = self.finished_on or timezone.localdate()
            self.save(update_fields=["status", "finished_on", "updated_at"])


class ReadingChapter(TimeStamped):
    """فصل‌های کتاب. متن اختیاری است (برای کتاب کاغذی فقط عنوان)."""

    book = models.ForeignKey(ReadingBook, verbose_name="کتاب", on_delete=models.CASCADE, related_name="chapters")
    order = models.PositiveIntegerField("شماره فصل", default=1)
    title = models.CharField("عنوان فصل", max_length=200, blank=True)
    text = models.TextField("متن (اختیاری)", blank=True)
    page_from = models.PositiveIntegerField("از صفحه", null=True, blank=True)
    page_to = models.PositiveIntegerField("تا صفحه", null=True, blank=True)

    class Meta:
        verbose_name = "فصل کتاب مشترک"
        verbose_name_plural = "فصل‌های کتاب مشترک"
        ordering = ["book", "order"]
        unique_together = ("book", "order")

    def __str__(self) -> str:
        return f"{self.book.title} — فصل {self.order}"

    @property
    def label(self) -> str:
        return self.title or f"فصل {self.order}"


class ReadingProgress(TimeStamped):
    """پیشرفت هر طرف در هر کتاب."""

    owner = models.CharField("کاربر", max_length=10, choices=OWNER, default="daughter")
    book = models.ForeignKey(ReadingBook, verbose_name="کتاب", on_delete=models.CASCADE, related_name="progress")
    current_chapter = models.PositiveIntegerField("فصل جاری", default=1)
    percent = models.PositiveSmallIntegerField("درصد", default=0)
    updated_note = models.CharField("آخرین یادداشت", max_length=200, blank=True)

    class Meta:
        verbose_name = "پیشرفت کتاب‌خوانی"
        verbose_name_plural = "پیشرفت کتاب‌خوانی"
        unique_together = ("owner", "book")
        ordering = ["book", "owner"]

    def __str__(self) -> str:
        return f"{self.get_owner_display()} — {self.book.title} ({self.percent}٪)"

    def save(self, *args, **kwargs):
        total = self.book.chapters_count or 0
        if total and self.current_chapter:
            self.percent = min(100, round(self.current_chapter * 100 / total))
        super().save(*args, **kwargs)


class ReadingNote(TimeStamped):
    """یادداشت حاشیه‌ی هر فصل؛ دو طرف یادداشت‌های هم را کنار هم می‌بینند."""

    owner = models.CharField("نویسنده", max_length=10, choices=OWNER, default="daughter")
    book = models.ForeignKey(ReadingBook, verbose_name="کتاب", on_delete=models.CASCADE, related_name="notes")
    chapter = models.ForeignKey(ReadingChapter, verbose_name="فصل", on_delete=models.CASCADE, related_name="notes")
    text = models.TextField("یادداشت")
    rating = models.PositiveSmallIntegerField("امتیاز (۱-۵ قلب)", default=0)
    is_finished = models.BooleanField("این فصل را خواندم", default=False)
    page_hint = models.CharField("نزدیک صفحه‌ی", max_length=20, blank=True)

    class Meta:
        verbose_name = "یادداشت فصل"
        verbose_name_plural = "یادداشت‌های فصل"
        ordering = ["chapter__order", "-created_at"]

    def __str__(self) -> str:
        return f"{self.get_owner_display()} — {self.chapter}"


class ReadingQuote(TimeStamped):
    """نقل‌قول‌های محبوب؛ گالری‌شان یکی از قشنگ‌ترین جاهای این اپ است."""

    owner = models.CharField("ثبت‌کننده", max_length=10, choices=OWNER, default="daughter")
    book = models.ForeignKey(ReadingBook, verbose_name="کتاب", on_delete=models.CASCADE, related_name="quotes")
    chapter = models.ForeignKey(
        ReadingChapter, verbose_name="فصل", null=True, blank=True, on_delete=models.SET_NULL, related_name="quotes"
    )
    text = models.TextField("متن نقل‌قول")
    comment = models.CharField("چرا این جمله؟", max_length=255, blank=True)

    class Meta:
        verbose_name = "نقل‌قول کتاب"
        verbose_name_plural = "۲۷) نقل‌قول‌های محبوب"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.text[:60]


class ChapterComment(TimeStamped):
    """گفتگوی هر فصل — یک ترد کوچک بین بابا و دخترم."""

    owner = models.CharField("نویسنده", max_length=10, choices=OWNER, default="daughter")
    chapter = models.ForeignKey(ReadingChapter, verbose_name="فصل", on_delete=models.CASCADE, related_name="comments")
    text = models.TextField("پیام")
    reply_to = models.ForeignKey(
        "self", verbose_name="پاسخ به", null=True, blank=True, on_delete=models.SET_NULL, related_name="replies"
    )

    class Meta:
        verbose_name = "پیام فصل"
        verbose_name_plural = "گفتگوی فصل‌ها"
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"{self.get_owner_display()}: {self.text[:40]}"
