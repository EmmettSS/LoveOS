"""پنل بابا — پیکربندی دخترم (تنظیم رمزها با فرم امن)."""
from django import forms
from django.contrib import admin, messages

from accounts.models import DeviceSession, UnlockAttempt, UserConfig


class UserConfigForm(forms.ModelForm):
    """رمزها به‌صورت متن ساده گرفته و هش‌شده ذخیره می‌شوند."""

    new_passcode = forms.CharField(label="رمز جدید ورود", required=False, widget=forms.PasswordInput)
    new_security_answer = forms.CharField(label="پاسخ سؤال امنیتی (جدید)", required=False)
    new_vault_passcode = forms.CharField(label="رمز جدید صندوقچه", required=False, widget=forms.PasswordInput)

    class Meta:
        model = UserConfig
        exclude = ("passcode_hash", "security_answer_hash", "vault_passcode_hash")


@admin.register(UserConfig)
class UserConfigAdmin(admin.ModelAdmin):
    form = UserConfigForm
    fieldsets = (
        ("دخترم و ما", {
            "fields": (
                "daughter_name", "daughter_nickname", "daddy_name", "daughter_birthday",
                "relationship_start", "anniversary", "next_meeting",
            )
        }),
        ("شهرها", {
            "fields": (
                "daddy_city", "daddy_lat", "daddy_lng", "daddy_timezone",
                "daughter_city", "daughter_lat", "daughter_lng", "daughter_timezone",
            )
        }),
        ("رمزها 🔐", {
            "fields": ("new_passcode", "security_question", "new_security_answer", "new_vault_passcode")
        }),
        ("ظاهر", {
            "fields": (
                "boot_logo", "boot_background", "lock_background",
                "desktop_background_day", "desktop_background_night",
            )
        }),
        ("متن‌ها", {
            "fields": ("boot_greeting", "wrong_pass_message", "lock_help_message", "today_message", "about_text")
        }),
        ("تنظیمات", {
            "fields": ("language", "theme", "sound_enabled", "font_scale", "allow_daughter_music_upload")
        }),
    )

    def has_add_permission(self, request):
        return not UserConfig.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False

    def save_model(self, request, obj, form, change):
        if form.cleaned_data.get("new_passcode"):
            obj.set_passcode(form.cleaned_data["new_passcode"])
            messages.success(request, "رمز ورود دخترم به‌روز شد.")
        if form.cleaned_data.get("new_security_answer"):
            obj.set_security_answer(form.cleaned_data["new_security_answer"])
        if form.cleaned_data.get("new_vault_passcode"):
            obj.set_vault_passcode(form.cleaned_data["new_vault_passcode"])
        super().save_model(request, obj, form, change)


@admin.register(DeviceSession)
class DeviceSessionAdmin(admin.ModelAdmin):
    list_display = ("token_short", "user_agent", "ip", "expires_at", "last_seen")
    readonly_fields = ("token", "created_at", "updated_at")

    @admin.display(description="توکن")
    def token_short(self, obj):
        return obj.token[:10] + "…"


@admin.register(UnlockAttempt)
class UnlockAttemptAdmin(admin.ModelAdmin):
    list_display = ("created_at", "success", "ip")
    list_filter = ("success",)
