"""
games.models — پازل قلب
سه سطح ثابت ۳×۳، ۴×۴ و ۵×۵ با تصویر و پیام پایان از پنل بابا.
"""
from django.db import models

from core.models import TimeStamped


class Puzzle(TimeStamped):
    LEVELS = [(3, "۳×۳ آسان"), (4, "۴×۴ متوسط"), (5, "۵×۵ سخت")]
    AUTHORS = [("daddy", "بابا"), ("daughter", "دخترم")]
    title = models.CharField("عنوان", max_length=140)
    level = models.PositiveSmallIntegerField("سطح", choices=LEVELS, default=3)
    image = models.ImageField("تصویر پازل", upload_to="puzzles/")
    end_message = models.TextField("پیام پایان", default="حلش کردی دخترم ❤")
    end_voice = models.FileField("ویس پایان", upload_to="puzzles/", blank=True)
    hint_text = models.CharField("متن راهنما", max_length=200, default="بابا اومد کمکت ❤")
    max_hints = models.PositiveSmallIntegerField("حداکثر راهنما", default=3)
    is_active = models.BooleanField("فعال", default=True)
    created_by = models.CharField("سازنده", max_length=10, choices=AUTHORS, default="daddy")

    class Meta:
        verbose_name = "پازل"
        verbose_name_plural = "۲۶) پازل قلب"
        ordering = ["level"]

    def __str__(self) -> str:
        return f"{self.title} ({self.get_level_display()})"


class PuzzleRecord(TimeStamped):
    puzzle = models.ForeignKey(Puzzle, on_delete=models.CASCADE, related_name="records", verbose_name="پازل")
    best_time = models.PositiveIntegerField("بهترین زمان (ثانیه)", default=0)
    plays = models.PositiveIntegerField("تعداد بازی", default=0)
    completions = models.PositiveIntegerField("تعداد تکمیل", default=0)

    class Meta:
        verbose_name = "رکورد پازل"
        verbose_name_plural = "پازل — رکوردها"

    def __str__(self) -> str:
        return f"{self.puzzle.title}: {self.best_time}s"
