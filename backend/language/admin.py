"""پنل بابا — پل زبان (دیکشنری، اصطلاحات، کوییز، تلفظ)."""
from django.contrib import admin

from language.models import (
    LanguageAttempt,
    LanguageCategory,
    LanguageEntry,
    LanguageProgress,
    LanguageQuiz,
)


@admin.register(LanguageCategory)
class LanguageCategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "icon", "detail", "entries_count", "order", "is_active")
    list_editable = ("icon", "order", "is_active")
    search_fields = ("name",)

    @admin.display(description="ورودی‌ها")
    def entries_count(self, obj):
        return obj.entries.count()


@admin.register(LanguageEntry)
class LanguageEntryAdmin(admin.ModelAdmin):
    list_display = ("text", "kind", "language", "translation_summary", "category", "has_audio", "added_by")
    list_filter = ("kind", "language", "category", "added_by")
    search_fields = ("text", "literal_meaning", "real_meaning", "example")
    list_editable = ("category",)
    fieldsets = (
        ("ورودی", {"fields": ("kind", "text", "language", "category")}),
        ("معادل‌ها", {"fields": ("translations",), "description": 'مثال: {"fa": "سلام", "tr": "Merhaba"}'}),
        ("معنی و مثال", {"fields": ("literal_meaning", "real_meaning", "example")}),
        ("تلفظ", {"fields": ("pronunciation",), "description": "بابا از این‌جا فایل صدا آپلود می‌کند؛ دخترم هم می‌تواند در خود اپ ضبط کند."}),
        ("سیستم", {"fields": ("added_by", "is_active")}),
    )

    @admin.display(description="معادل‌ها")
    def translation_summary(self, obj):
        return obj.translation_labels or "—"

    @admin.display(boolean=True, description="تلفظ دارد")
    def has_audio(self, obj):
        return bool(obj.pronunciation)


@admin.register(LanguageQuiz)
class LanguageQuizAdmin(admin.ModelAdmin):
    list_display = ("question", "answer", "category", "order", "is_active")
    list_filter = ("category", "is_active")
    search_fields = ("question", "answer")
    list_editable = ("order", "is_active")
    fieldsets = (
        ("سؤال", {"fields": ("question", "options", "answer", "fun_feedback")}),
        ("دسته و ترتیب", {"fields": ("category", "order", "is_active")}),
    )


@admin.register(LanguageProgress)
class LanguageProgressAdmin(admin.ModelAdmin):
    list_display = ("owner", "learned_count", "streak", "best_streak", "last_practiced")
    list_filter = ("owner",)
    readonly_fields = ("learned_ids",)


@admin.register(LanguageAttempt)
class LanguageAttemptAdmin(admin.ModelAdmin):
    list_display = ("owner", "mode", "correct", "total", "created_at")
    list_filter = ("owner", "mode")
    date_hierarchy = "created_at"
