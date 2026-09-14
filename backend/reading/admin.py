"""پنل بابا — کتاب‌خوانی مشترک."""
from django.contrib import admin
from django.utils.html import format_html

from reading.models import (
    ChapterComment,
    ReadingBook,
    ReadingChapter,
    ReadingNote,
    ReadingProgress,
    ReadingQuote,
)


class ReadingChapterInline(admin.TabularInline):
    model = ReadingChapter
    extra = 0
    fields = ("order", "title", "text", "page_from", "page_to")
    ordering = ("order",)


class ReadingProgressInline(admin.TabularInline):
    model = ReadingProgress
    extra = 0
    fields = ("owner", "current_chapter", "percent", "updated_note")


@admin.register(ReadingBook)
class ReadingBookAdmin(admin.ModelAdmin):
    list_display = ("title", "author", "status", "chapters_count", "progress_badges", "added_by", "cover_thumb")
    list_filter = ("status", "added_by", "is_physical")
    search_fields = ("title", "author", "summary")
    inlines = [ReadingChapterInline, ReadingProgressInline]
    readonly_fields = ("cover_thumb", "created_at", "updated_at")
    fieldsets = (
        ("کتاب", {"fields": ("title", "author", "cover", "cover_thumb", "summary", "why_this_book")}),
        ("قفسه و فایل", {"fields": ("status", "pdf", "link", "is_physical", "total_chapters", "library_book")}),
        ("تاریخ‌ها", {"fields": ("added_by", "started_on", "finished_on", "is_active")}),
        ("سیستم", {"fields": ("created_at", "updated_at")}),
    )

    @admin.display(description="فصل‌ها")
    def chapters_count(self, obj):
        return obj.chapters_count

    @admin.display(description="پیشرفت بابا / دخترم")
    def progress_badges(self, obj):
        return f"{obj.percent_for_daddy}٪ / {obj.percent_for_daughter}٪"

    @admin.display(description="جلد")
    def cover_thumb(self, obj):
        if not obj.cover:
            return "—"
        return format_html('<img src="{}" style="height:64px;border-radius:8px" />', obj.cover.url)


@admin.register(ReadingChapter)
class ReadingChapterAdmin(admin.ModelAdmin):
    list_display = ("book", "order", "title", "notes_count", "comments_count")
    list_filter = ("book",)
    search_fields = ("title", "text")
    ordering = ("book", "order")

    @admin.display(description="یادداشت‌ها")
    def notes_count(self, obj):
        return obj.notes.count()

    @admin.display(description="پیام‌ها")
    def comments_count(self, obj):
        return obj.comments.count()


@admin.register(ReadingNote)
class ReadingNoteAdmin(admin.ModelAdmin):
    list_display = ("owner", "book", "chapter", "rating", "is_finished", "created_at")
    list_filter = ("owner", "is_finished", "rating")
    search_fields = ("text",)
    date_hierarchy = "created_at"


@admin.register(ReadingQuote)
class ReadingQuoteAdmin(admin.ModelAdmin):
    list_display = ("book", "chapter", "owner", "short_text", "created_at")
    list_filter = ("owner", "book")
    search_fields = ("text", "comment")

    @admin.display(description="متن")
    def short_text(self, obj):
        return obj.text[:70]


@admin.register(ChapterComment)
class ChapterCommentAdmin(admin.ModelAdmin):
    list_display = ("chapter", "owner", "short_text", "created_at")
    list_filter = ("owner",)
    search_fields = ("text",)

    @admin.display(description="پیام")
    def short_text(self, obj):
        return obj.text[:70]


@admin.register(ReadingProgress)
class ReadingProgressAdmin(admin.ModelAdmin):
    list_display = ("owner", "book", "current_chapter", "percent", "updated_at")
    list_filter = ("owner",)
