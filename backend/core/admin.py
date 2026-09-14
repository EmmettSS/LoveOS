"""پنل بابا — اعلان‌ها، سروش، لاگ‌ها، دستاوردها، رازها."""
from django.contrib import admin, messages

from core.models import (
    Achievement,
    AchievementUnlock,
    ActivityLog,
    Counter,
    EasterEgg,
    EasterEggLog,
    OSNotification,
    SoroushOutbox,
)
from core.soroush import flush_one, get_provider


@admin.register(OSNotification)
class OSNotificationAdmin(admin.ModelAdmin):
    """بابا از همین‌جا می‌تواند پیام زنده به دسکتاپ دخترم بفرستد."""

    list_display = ("title", "kind", "is_read", "created_at")
    list_filter = ("kind", "is_read")
    search_fields = ("title", "text")
    fields = ("kind", "title", "text", "icon", "action_app", "payload", "is_active", "is_read")


@admin.register(SoroushOutbox)
class SoroushOutboxAdmin(admin.ModelAdmin):
    list_display = ("event", "status", "tries", "created_at", "sent_at")
    list_filter = ("status", "event")
    readonly_fields = ("response", "last_error", "sent_at", "tries")
    actions = ["retry_send", "test_bot"]

    @admin.action(description="تلاش دوباره برای ارسال")
    def retry_send(self, request, queryset):
        ok = sum(1 for m in queryset if flush_one(m))
        messages.success(request, f"{ok} پیام ارسال شد.")

    @admin.action(description="تست اتصال بات (getMe)")
    def test_bot(self, request, queryset):
        result = get_provider().call("getMe")
        if result.get("ok"):
            messages.success(request, f"بات سالمه: {result.get('result')}")
        else:
            messages.error(request, f"خطا: {result.get('description')}")


@admin.register(ActivityLog)
class ActivityLogAdmin(admin.ModelAdmin):
    list_display = ("created_at", "action", "app", "detail")
    list_filter = ("app",)
    search_fields = ("action", "detail")


@admin.register(Achievement)
class AchievementAdmin(admin.ModelAdmin):
    list_display = ("title", "code", "threshold", "is_active")
    search_fields = ("title", "code")


@admin.register(AchievementUnlock)
class AchievementUnlockAdmin(admin.ModelAdmin):
    list_display = ("achievement", "created_at", "seen")


@admin.register(Counter)
class CounterAdmin(admin.ModelAdmin):
    list_display = ("key", "value", "updated_at")


@admin.register(EasterEgg)
class EasterEggAdmin(admin.ModelAdmin):
    """۱۵ راز ثابت؛ فقط پیام/پیوست قابل ویرایش است (تریگر ثابت می‌ماند)."""

    list_display = ("title", "trigger_type", "is_active", "discovered")
    list_filter = ("is_active",)

    @admin.display(description="کشف شده", boolean=True)
    def discovered(self, obj):
        return obj.logs.exists()


@admin.register(EasterEggLog)
class EasterEggLogAdmin(admin.ModelAdmin):
    list_display = ("egg", "activated_at")
