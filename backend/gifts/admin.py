"""پنل بابا — دفتر هدیه‌ها."""
from django.contrib import admin
from django.utils.html import format_html

from gifts.models import Gift, GiftOccasion


@admin.register(GiftOccasion)
class GiftOccasionAdmin(admin.ModelAdmin):
    list_display = ("name", "icon", "order", "gift_count", "is_active")
    list_editable = ("icon", "order", "is_active")
    search_fields = ("name",)

    @admin.display(description="تعداد هدیه")
    def gift_count(self, obj):
        return obj.gifts.count()


@admin.register(Gift)
class GiftAdmin(admin.ModelAdmin):
    list_display = ("name", "given_on", "occasion", "giver", "receiver", "price_label", "thumb", "is_favorite")
    list_filter = ("giver", "receiver", "occasion", "price_band", "is_favorite")
    search_fields = ("name", "description", "reaction")
    date_hierarchy = "given_on"
    autocomplete_fields = ("memory",)
    readonly_fields = ("created_at", "updated_at", "thumb")
    fieldsets = (
        ("هدیه", {"fields": ("name", "given_on", "occasion")}),
        ("طرفین", {"fields": ("giver", "receiver", "recorded_by")}),
        ("جزئیات", {"fields": ("price", "currency", "price_band", "description", "reaction")}),
        ("عکس و خاطره", {"fields": ("photo", "thumb", "is_favorite", "memory")}),
        ("سیستم", {"fields": ("created_at", "updated_at")}),
    )

    @admin.display(description="قیمت")
    def price_label(self, obj):
        if obj.price is None:
            return "—"
        return f"{int(obj.price):,} {obj.currency}".strip()

    @admin.display(description="پیش‌نمایش")
    def thumb(self, obj):
        if not obj.photo:
            return "—"
        return format_html('<img src="{}" style="height:52px;border-radius:10px" />', obj.photo.url)
