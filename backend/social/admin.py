"""پنل بابا — چت، بغل، یادآورها."""
from django.contrib import admin, messages

from core.services import push_notification
from core.soroush import notify_daddy
from social.models import ChatMessage, Hug, HugSettings, Reminder, ReminderLog


@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    """بابا می‌تواند از همین‌جا مستقیم به دخترش پیام بدهد."""

    list_display = ("created_at", "sender", "short", "via", "is_read")
    list_filter = ("sender", "via")
    search_fields = ("text",)

    @admin.display(description="متن")
    def short(self, obj):
        return obj.text[:60]

    def save_model(self, request, obj, form, change):
        if not change and obj.sender == "daddy":
            obj.via = "admin"
        super().save_model(request, obj, form, change)
        if not change and obj.sender == "daddy":
            push_notification("chat", "پیام تازه از بابا 💬", obj.text[:160], action_app="chat")


@admin.register(Hug)
class HugAdmin(admin.ModelAdmin):
    """ساخت رکورد بغل = فرستادن بغل به دخترم (با ویبره سمت او)."""

    list_display = ("created_at", "direction", "text", "seen")
    list_filter = ("direction", "seen")
    actions = ["send_hug_now"]

    def save_model(self, request, obj, form, change):
        settings_obj = HugSettings.get_solo()
        if not obj.text:
            obj.text = settings_obj.incoming_message
        super().save_model(request, obj, form, change)
        if not change and obj.direction == "daddy_to_daughter":
            push_notification(
                "hug", settings_obj.incoming_title, "بزن روی اعلان تا بغلش کنی ❤",
                action_app="hug", payload={"hug_id": obj.id},
            )

    @admin.action(description="همین حالا یه بغل بفرست")
    def send_hug_now(self, request, queryset):
        settings_obj = HugSettings.get_solo()
        hug = Hug.objects.create(direction="daddy_to_daughter", text=settings_obj.incoming_message)
        push_notification(
            "hug", settings_obj.incoming_title, "بزن روی اعلان تا بغلش کنی ❤",
            action_app="hug", payload={"hug_id": hug.id},
        )
        messages.success(request, "بغل فرستاده شد 🤗")


@admin.register(HugSettings)
class HugSettingsAdmin(admin.ModelAdmin):
    list_display = ("incoming_title", "vibration_pattern", "warm_color")

    def has_add_permission(self, request):
        return not HugSettings.objects.exists()


@admin.register(Reminder)
class ReminderAdmin(admin.ModelAdmin):
    list_display = ("title", "rtype", "when", "repeat", "is_active", "muted_by_daughter")
    list_filter = ("rtype", "is_active")
    actions = ["send_now"]

    @admin.action(description="همین حالا نمایش بده")
    def send_now(self, request, queryset):
        for r in queryset:
            push_notification("reminder", r.title, r.text, payload={"reminder_id": r.id})
            ReminderLog.objects.create(reminder=r)
            notify_daddy("reminder_sent", f"یادآور «{r.title}» برای دخترت ارسال شد")
        messages.success(request, "ارسال شد.")


@admin.register(ReminderLog)
class ReminderLogAdmin(admin.ModelAdmin):
    list_display = ("reminder", "sent_at", "viewed_at")
