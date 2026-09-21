"""پنل بابا — کتابخانه."""
from django.contrib import admin

from core.services import push_notification
from library.models import Book, Bookmark, Chapter, MarginNote, Page, Paragraph


class ParagraphInline(admin.TabularInline):
    model = Paragraph
    extra = 1
    fields = ("order", "text", "author", "audio", "is_draft")


class PageInline(admin.TabularInline):
    model = Page
    extra = 1
    fields = ("order", "image", "audio")


class ChapterInline(admin.TabularInline):
    model = Chapter
    extra = 1
    fields = ("order", "title", "author", "is_published")


@admin.register(Book)
class BookAdmin(admin.ModelAdmin):
    list_display = ("title", "created_by", "allow_daughter_edit", "is_active")
    inlines = [ChapterInline]


@admin.register(Chapter)
class ChapterAdmin(admin.ModelAdmin):
    list_display = ("book", "order", "title", "author", "is_published")
    list_filter = ("book", "author", "is_published")
    inlines = [PageInline]

    def save_model(self, request, obj, form, change):
        was_published = Chapter.objects.filter(pk=obj.pk, is_published=True).exists() if obj.pk else False
        super().save_model(request, obj, form, change)
        if obj.is_published and not was_published and obj.author == "daddy":
            push_notification("book", "بابا یه فصل جدید نوشت ❤", obj.title, action_app="library")


@admin.register(Page)
class PageAdmin(admin.ModelAdmin):
    list_display = ("chapter", "order")
    inlines = [ParagraphInline]


@admin.register(Paragraph)
class ParagraphAdmin(admin.ModelAdmin):
    list_display = ("page", "order", "short", "author", "is_draft")
    list_filter = ("author", "is_draft")

    @admin.display(description="متن")
    def short(self, obj):
        return obj.text[:60]


@admin.register(MarginNote)
class MarginNoteAdmin(admin.ModelAdmin):
    list_display = ("paragraph", "author", "text", "approved")
    list_filter = ("author", "approved")


@admin.register(Bookmark)
class BookmarkAdmin(admin.ModelAdmin):
    list_display = ("page", "label", "created_at")
