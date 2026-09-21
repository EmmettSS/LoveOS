"""پنل بابا — هماهنگ‌کننده‌ی تماس."""
from django.contrib import admin

from calls.models import CallAppointment, CallFreeSlot, CallLog, CallSettings


@admin.register(CallFreeSlot)
class CallFreeSlotAdmin(admin.ModelAdmin):
    list_display = ("owner", "get_weekday_display", "start_time", "end_time", "minutes_label", "is_active")
    list_filter = ("owner", "weekday", "is_active")
    list_editable = ("is_active",)
    ordering = ("owner", "weekday", "start_time")

    @admin.display(description="مدت")
    def minutes_label(self, obj):
        return f"{obj.minutes} دقیقه"


@admin.register(CallAppointment)
class CallAppointmentAdmin(admin.ModelAdmin):
    list_display = ("date", "time", "proposer", "proposee", "duration_minutes", "status", "topic")
    list_filter = ("status", "proposer", "proposee")
    search_fields = ("topic", "message", "answer_note")
    date_hierarchy = "date"
    readonly_fields = ("answered_at", "reminder_sent", "created_at", "updated_at")
    fieldsets = (
        ("زمان", {"fields": ("date", "time", "duration_minutes")}),
        ("طرفین", {"fields": ("proposer", "proposee", "topic")}),
        ("وضعیت", {"fields": ("status", "message", "answer_note", "answered_at", "alternative_of")}),
        ("سیستم", {"fields": ("reminder_sent", "created_at", "updated_at")}),
    )
    actions = ["mark_approved", "mark_done"]

    @admin.action(description="تأیید تماس‌های انتخاب‌شده")
    def mark_approved(self, request, queryset):
        count = queryset.update(status="approved")
        self.message_user(request, f"{count} تماس تأیید شد.")

    @admin.action(description="علامت‌گذاری به‌عنوان انجام‌شده")
    def mark_done(self, request, queryset):
        count = queryset.update(status="done")
        self.message_user(request, f"{count} تماس انجام‌شده شد.")


@admin.register(CallLog)
class CallLogAdmin(admin.ModelAdmin):
    list_display = ("happened_on", "kind", "duration_label", "topic", "daddy_mood", "daughter_mood", "recorded_by")
    list_filter = ("kind", "daddy_mood", "daughter_mood", "recorded_by")
    search_fields = ("topic", "note")
    date_hierarchy = "happened_on"
    readonly_fields = ("created_at", "updated_at")

    @admin.display(description="مدت")
    def duration_label(self, obj):
        return obj.duration_label


@admin.register(CallSettings)
class CallSettingsAdmin(admin.ModelAdmin):
    """الگوی نوتیف‌ها و پیش‌فرض‌های اپ تماس."""

    fieldsets = (
        ("یادآوری", {"fields": ("notify_reminder", "reminder_minutes", "reminder_template")}),
        ("کدام رویدادها نوتیف بدهند", {"fields": ("notify_on_propose", "notify_on_answer", "notify_on_log")}),
        ("متن نوتیف‌ها", {"fields": ("propose_template", "approved_template", "rejected_template", "log_template", "streak_message")}),
        ("پیش‌فرض‌ها", {"fields": ("default_duration", "is_active")}),
    )

    def has_add_permission(self, request):
        return not CallSettings.objects.exists()
