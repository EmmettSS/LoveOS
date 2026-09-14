"""
پنل بابا — چرخه و مراقبت
این بخش حساس است: هر بار ورود لاگ می‌شود (Double Confirm از طریق صفحه‌ی تأیید).
"""
from django.contrib import admin

from health.models import (
    CareReminder,
    CycleEntry,
    HealthAccessLog,
    Medication,
    MedicationLog,
    SymptomLog,
)


class HealthAccessMixin:
    """هر بار که بابا لیست را باز می‌کند، لاگ دسترسی ثبت می‌شود."""

    def changelist_view(self, request, extra_context=None):
        HealthAccessLog.objects.create(who=request.user.get_username(), path=request.path)
        return super().changelist_view(request, extra_context)


@admin.register(CycleEntry)
class CycleEntryAdmin(HealthAccessMixin, admin.ModelAdmin):
    list_display = ("start_date", "end_date", "length")


@admin.register(SymptomLog)
class SymptomLogAdmin(HealthAccessMixin, admin.ModelAdmin):
    list_display = ("day", "mood", "energy", "sleep", "severity")
    list_filter = ("mood", "energy")


@admin.register(Medication)
class MedicationAdmin(HealthAccessMixin, admin.ModelAdmin):
    list_display = ("name", "dose", "pills_per_time", "times", "duration", "is_active")
    list_filter = ("is_active", "duration")


@admin.register(MedicationLog)
class MedicationLogAdmin(HealthAccessMixin, admin.ModelAdmin):
    list_display = ("medication", "scheduled_for", "status", "acted_at")
    list_filter = ("status",)


@admin.register(CareReminder)
class CareReminderAdmin(admin.ModelAdmin):
    list_display = ("text", "hour", "minute", "enabled")


@admin.register(HealthAccessLog)
class HealthAccessLogAdmin(admin.ModelAdmin):
    list_display = ("created_at", "who", "path")

    def has_add_permission(self, request):
        return False
