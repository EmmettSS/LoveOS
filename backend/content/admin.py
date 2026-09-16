"""پنل بابا — محتوای احساسی."""
from django.contrib import admin

from content.models import (
    CinemaItem,
    Constellation,
    Countdown,
    Flower,
    FlowerMessage,
    FuturePlan,
    Letter,
    Memory,
    MoodLog,
    MoodMessage,
    QuizQuestion,
    QuizResult,
    QuizReward,
    Song,
    TerminalCommand,
    TutorialChapter,
    VaultItem,
    Voice,
)


@admin.register(Voice)
class VoiceAdmin(admin.ModelAdmin):
    list_display = ("title", "category", "play_count", "is_active", "created_at")
    list_filter = ("category", "is_active")
    search_fields = ("title", "note")


@admin.register(Song)
class SongAdmin(admin.ModelAdmin):
    list_display = ("title", "artist", "is_main", "uploaded_by", "play_count", "is_active")
    list_filter = ("is_main", "uploaded_by", "is_active")
    search_fields = ("title", "artist")


@admin.register(Memory)
class MemoryAdmin(admin.ModelAdmin):
    list_display = ("title", "happened_on", "is_future", "is_unlocked", "unlock_at")
    list_filter = ("is_future", "is_unlocked")
    search_fields = ("title", "text")
    actions = ["unlock_now"]

    @admin.action(description="همین حالا باز کن")
    def unlock_now(self, request, queryset):
        queryset.update(is_unlocked=True)


@admin.register(Letter)
class LetterAdmin(admin.ModelAdmin):
    list_display = ("title", "open_at", "is_opened", "opened_at")
    list_filter = ("is_opened",)


@admin.register(Countdown)
class CountdownAdmin(admin.ModelAdmin):
    list_display = ("title", "target", "is_active")


@admin.register(Flower)
class FlowerAdmin(admin.ModelAdmin):
    list_display = ("name", "emoji", "color", "water_count", "is_active")


@admin.register(FlowerMessage)
class FlowerMessageAdmin(admin.ModelAdmin):
    list_display = ("text", "is_active")


@admin.register(Constellation)
class ConstellationAdmin(admin.ModelAdmin):
    list_display = ("order", "letter", "is_active")
    ordering = ("order",)


@admin.register(CinemaItem)
class CinemaItemAdmin(admin.ModelAdmin):
    list_display = ("title", "kind", "status", "rating", "added_by")
    list_filter = ("kind", "status", "added_by")


@admin.register(QuizQuestion)
class QuizQuestionAdmin(admin.ModelAdmin):
    list_display = ("order", "question", "correct", "is_active")
    ordering = ("order",)


@admin.register(QuizResult)
class QuizResultAdmin(admin.ModelAdmin):
    list_display = ("created_at", "score", "total")


@admin.register(QuizReward)
class QuizRewardAdmin(admin.ModelAdmin):
    list_display = ("message", "is_active")


@admin.register(FuturePlan)
class FuturePlanAdmin(admin.ModelAdmin):
    list_display = ("title", "category", "is_done", "added_by")
    list_filter = ("category", "is_done", "added_by")
    search_fields = ("title", "note")


@admin.register(MoodMessage)
class MoodMessageAdmin(admin.ModelAdmin):
    list_display = ("mood", "is_active")


@admin.register(MoodLog)
class MoodLogAdmin(admin.ModelAdmin):
    list_display = ("created_at", "mood")


@admin.register(VaultItem)
class VaultItemAdmin(admin.ModelAdmin):
    list_display = ("title", "kind", "is_active")
    list_filter = ("kind",)


@admin.register(TutorialChapter)
class TutorialChapterAdmin(admin.ModelAdmin):
    list_display = ("order", "key", "title", "is_active")
    ordering = ("order",)


@admin.register(TerminalCommand)
class TerminalCommandAdmin(admin.ModelAdmin):
    list_display = ("command", "help_text", "hidden", "is_active")
