"""
library.models — کتابخانه‌ی ما
کتاب مشترک «داستان ما»: فصل، صفحه، پاراگراف (با رنگ نویسنده)، صدا، حاشیه‌نویسی، بوکمارک.
"""
from django.db import models

from core.models import TimeStamped

AUTHORS = [("daddy", "بابا"), ("daughter", "دخترم")]


class Book(TimeStamped):
    title = models.CharField("عنوان کتاب", max_length=180, default="داستان ما")
    subtitle = models.CharField("زیرعنوان", max_length=180, blank=True)
    cover = models.ImageField("جلد", upload_to="books/", blank=True)
    description = models.TextField("توضیح", blank=True)
    created_by = models.CharField("ساخته شده توسط", max_length=10, choices=AUTHORS, default="daddy")
    allow_daughter_edit = models.BooleanField("دخترم بتواند بنویسد", default=True)
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "کتاب"
        verbose_name_plural = "۲۵) کتابخانه‌ی ما"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.title


class Chapter(TimeStamped):
    book = models.ForeignKey(Book, on_delete=models.CASCADE, related_name="chapters", verbose_name="کتاب")
    title = models.CharField("عنوان فصل", max_length=180)
    order = models.PositiveIntegerField("ترتیب", default=0)
    author = models.CharField("نویسنده", max_length=10, choices=AUTHORS, default="daddy")
    is_published = models.BooleanField("منتشر شده", default=False)

    class Meta:
        verbose_name = "فصل"
        verbose_name_plural = "کتابخانه — فصل‌ها"
        ordering = ["order"]

    def __str__(self) -> str:
        return f"{self.book.title} — {self.title}"


class Page(TimeStamped):
    chapter = models.ForeignKey(Chapter, on_delete=models.CASCADE, related_name="pages", verbose_name="فصل")
    order = models.PositiveIntegerField("شماره صفحه", default=1)
    image = models.ImageField("تصویر صفحه", upload_to="books/pages/", blank=True)
    audio = models.FileField("صدای صفحه", upload_to="books/audio/", blank=True)

    class Meta:
        verbose_name = "صفحه"
        verbose_name_plural = "کتابخانه — صفحه‌ها"
        ordering = ["order"]

    def __str__(self) -> str:
        return f"{self.chapter.title} — ص {self.order}"


class Paragraph(TimeStamped):
    page = models.ForeignKey(Page, on_delete=models.CASCADE, related_name="paragraphs", verbose_name="صفحه")
    order = models.PositiveIntegerField("ترتیب", default=0)
    text = models.TextField("متن")
    author = models.CharField("نویسنده", max_length=10, choices=AUTHORS, default="daddy")
    audio = models.FileField("صدای پاراگراف", upload_to="books/audio/", blank=True)
    is_draft = models.BooleanField("پیش‌نویس", default=False)

    class Meta:
        verbose_name = "پاراگراف"
        verbose_name_plural = "کتابخانه — پاراگراف‌ها"
        ordering = ["order"]

    def __str__(self) -> str:
        return self.text[:50]


class MarginNote(TimeStamped):
    paragraph = models.ForeignKey(Paragraph, on_delete=models.CASCADE, related_name="notes", verbose_name="پاراگراف")
    author = models.CharField("نویسنده", max_length=10, choices=AUTHORS, default="daughter")
    text = models.CharField("یادداشت حاشیه", max_length=255)
    color = models.CharField("رنگ", max_length=20, default="#f472b6")
    approved = models.BooleanField("تأیید شده", default=True)

    class Meta:
        verbose_name = "یادداشت حاشیه"
        verbose_name_plural = "کتابخانه — یادداشت‌های حاشیه"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.text[:40]


class Bookmark(TimeStamped):
    page = models.ForeignKey(Page, on_delete=models.CASCADE, related_name="bookmarks", verbose_name="صفحه")
    label = models.CharField("برچسب", max_length=120, blank=True)

    class Meta:
        verbose_name = "نشانک"
        verbose_name_plural = "کتابخانه — نشانک‌ها"
        ordering = ["-created_at"]
