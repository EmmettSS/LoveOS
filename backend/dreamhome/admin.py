"""پنل بابا — خانه‌ی رویایی."""
from django.contrib import admin
from django.utils.html import format_html

from dreamhome.models import (
    DreamHomeCategory,
    DreamHomeFeature,
    DreamHomeInspiration,
    DreamHomeRoom,
    DreamHomeRoomIdea,
    InspirationComment,
)


@admin.register(DreamHomeCategory)
class DreamHomeCategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "icon", "detail", "feature_count", "order", "is_active")
    list_editable = ("icon", "order", "is_active")
    search_fields = ("name",)

    @admin.display(description="ویژگی‌ها")
    def feature_count(self, obj):
        return obj.features.count()


class DreamHomeRoomIdeaInline(admin.TabularInline):
    model = DreamHomeRoomIdea
    extra = 0
    fields = ("kind", "text", "color_value", "added_by")


@admin.register(DreamHomeFeature)
class DreamHomeFeatureAdmin(admin.ModelAdmin):
    list_display = ("title", "category", "importance", "added_by", "is_done", "linked_plan", "thumb")
    list_filter = ("importance", "category", "added_by", "is_done")
    list_editable = ("is_done",)
    search_fields = ("title", "description")
    autocomplete_fields = ("linked_plan",)
    readonly_fields = ("thumb", "created_at", "updated_at")
    fieldsets = (
        ("ویژگی", {"fields": ("title", "category", "importance", "description")}),
        ("عکس و لینک", {"fields": ("photo", "thumb", "linked_plan")}),
        ("وضعیت", {"fields": ("added_by", "is_done", "order")}),
        ("سیستم", {"fields": ("created_at", "updated_at")}),
    )

    @admin.display(description="عکس")
    def thumb(self, obj):
        if not obj.photo:
            return "—"
        return format_html('<img src="{}" style="height:52px;border-radius:10px" />', obj.photo.url)


@admin.register(DreamHomeRoom)
class DreamHomeRoomAdmin(admin.ModelAdmin):
    list_display = ("name", "floor", "x", "y", "w", "h", "color_chip", "ideas_count", "added_by")
    list_editable = ("x", "y", "w", "h")
    search_fields = ("name", "description")
    inlines = [DreamHomeRoomIdeaInline]
    fieldsets = (
        ("اتاق", {"fields": ("name", "description", "floor", "icon", "color")}),
        (
            "نقشه (۰ تا ۱۰۰)",
            {
                "fields": ("x", "y", "w", "h"),
                "description": "مختصات نسبی روی نقشه‌ی خانه؛ در خود اپ هم می‌شود اتاق‌ها را کشید و جابجا کرد.",
            },
        ),
        ("سیستم", {"fields": ("added_by", "order")}),
    )

    @admin.display(description="رنگ")
    def color_chip(self, obj):
        return format_html(
            '<span style="display:inline-block;width:38px;height:16px;border-radius:6px;background:{}"></span>', obj.color
        )

    @admin.display(description="ایده‌ها")
    def ideas_count(self, obj):
        return obj.ideas.count()


@admin.register(DreamHomeInspiration)
class DreamHomeInspirationAdmin(admin.ModelAdmin):
    list_display = ("title", "category", "room", "uploaded_by", "comments_count", "thumb", "created_at")
    list_filter = ("category", "room", "uploaded_by")
    search_fields = ("title", "description")
    readonly_fields = ("thumb", "created_at", "updated_at")

    @admin.display(description="عکس")
    def thumb(self, obj):
        if not obj.photo:
            return "—"
        return format_html('<img src="{}" style="height:56px;border-radius:10px" />', obj.photo.url)

    @admin.display(description="کامنت‌ها")
    def comments_count(self, obj):
        return obj.comments.count()


@admin.register(InspirationComment)
class InspirationCommentAdmin(admin.ModelAdmin):
    list_display = ("inspiration", "owner", "short_text", "created_at")
    list_filter = ("owner",)
    search_fields = ("text",)

    @admin.display(description="متن")
    def short_text(self, obj):
        return obj.text[:60]


@admin.register(DreamHomeRoomIdea)
class DreamHomeRoomIdeaAdmin(admin.ModelAdmin):
    list_display = ("room", "kind", "text", "added_by")
    list_filter = ("kind", "added_by")
    search_fields = ("text",)
