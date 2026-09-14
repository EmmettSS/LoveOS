"""پنل بابا — پازل قلب."""
from django.contrib import admin

from games.models import Puzzle, PuzzleRecord


@admin.register(Puzzle)
class PuzzleAdmin(admin.ModelAdmin):
    list_display = ("title", "level", "max_hints", "is_active")
    list_filter = ("level", "is_active")


@admin.register(PuzzleRecord)
class PuzzleRecordAdmin(admin.ModelAdmin):
    list_display = ("puzzle", "best_time", "plays", "completions")
