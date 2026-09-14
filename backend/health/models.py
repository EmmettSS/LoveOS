"""
health.models — چرخه و مراقبت (Cycle & Care)
پریود، علائم روزانه، داروها (بحرانی‌ترین بخش) و یادآورهای مراقبتی.
Disclaimer shown in UI: this app is not a substitute for a doctor.
"""
from django.db import models
from datetime import timedelta

from django.utils import timezone

from core.models import TimeStamped


class CycleEntry(TimeStamped):
    """یک دوره‌ی پریود: شروع و پایان."""

    start_date = models.DateField("تاریخ شروع")
    end_date = models.DateField("تاریخ پایان", null=True, blank=True)
    note = models.CharField("یادداشت", max_length=255, blank=True)

    class Meta:
        verbose_name = "دوره پریود"
        verbose_name_plural = "۲۳) چرخه و مراقبت — دوره‌ها"
        ordering = ["-start_date"]

    def __str__(self) -> str:
        return f"{self.start_date} → {self.end_date or '...'}"

    @property
    def length(self) -> int | None:
        if self.end_date:
            return (self.end_date - self.start_date).days + 1
        return None


class SymptomLog(TimeStamped):
    """علائم روزانه."""

    MOOD = [("good", "خوب"), ("ok", "معمولی"), ("bad", "بد")]
    ENERGY = [("high", "زیاد"), ("mid", "متوسط"), ("low", "کم")]
    SLEEP = [("good", "خوب"), ("bad", "بد")]
    APPETITE = [("high", "زیاد"), ("normal", "معمولی"), ("low", "کم")]

    day = models.DateField("تاریخ", default=timezone.localdate, unique=True)
    mood = models.CharField("حال", max_length=6, choices=MOOD, blank=True)
    energy = models.CharField("انرژی", max_length=6, choices=ENERGY, blank=True)
    headache = models.BooleanField("سردرد", default=False)
    backache = models.BooleanField("کمردرد", default=False)
    stomachache = models.BooleanField("دل‌درد", default=False)
    nausea = models.BooleanField("حالت تهوع", default=False)
    sleep = models.CharField("خواب", max_length=6, choices=SLEEP, blank=True)
    appetite = models.CharField("اشتها", max_length=8, choices=APPETITE, blank=True)
    note = models.CharField("یادداشت", max_length=255, blank=True)

    class Meta:
        verbose_name = "علائم روزانه"
        verbose_name_plural = "چرخه و مراقبت — علائم"
        ordering = ["-day"]

    def __str__(self) -> str:
        return str(self.day)

    @property
    def severity(self) -> int:
        """شدت علائم برای تشخیص روزهای سخت."""
        score = sum([self.headache, self.backache, self.stomachache, self.nausea])
        if self.mood == "bad":
            score += 1
        if self.energy == "low":
            score += 1
        return score


class Medication(TimeStamped):
    """دارو + زمان‌های مصرف (مهم‌ترین بخش اپ)."""

    DURATION = [("7", "۷ روزه"), ("30", "۳۰ روزه"), ("ongoing", "همیشگی")]
    name = models.CharField("اسم دارو", max_length=140)
    dose = models.CharField("دوز", max_length=80, blank=True)
    pills_per_time = models.PositiveSmallIntegerField("تعداد در هر نوبت", default=1)
    times = models.JSONField("ساعت‌های مصرف (مثلاً 08:00 و 20:00)", default=list)
    duration = models.CharField("مدت", max_length=10, choices=DURATION, default="ongoing")
    start_date = models.DateField("شروع", default=timezone.localdate)
    note = models.CharField("یادداشت (مثلاً بعد از غذا)", max_length=200, blank=True)
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "دارو"
        verbose_name_plural = "چرخه و مراقبت — داروها"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name

    @property
    def end_date(self):
        if self.duration == "ongoing":
            return None
        return self.start_date + timedelta(days=int(self.duration))


class MedicationLog(TimeStamped):
    STATUS = [("taken", "خوردم"), ("snoozed", "بعداً"), ("skipped", "نمی‌تونم بخورم"), ("pending", "منتظر")]
    medication = models.ForeignKey(Medication, on_delete=models.CASCADE, related_name="logs")
    scheduled_for = models.DateTimeField("زمان برنامه‌ریزی")
    status = models.CharField("وضعیت", max_length=10, choices=STATUS, default="pending")
    acted_at = models.DateTimeField("زمان اقدام", null=True, blank=True)
    snooze_until = models.DateTimeField("یادآوری مجدد", null=True, blank=True)

    class Meta:
        verbose_name = "لاگ دارو"
        verbose_name_plural = "چرخه و مراقبت — لاگ داروها"
        ordering = ["-scheduled_for"]
        unique_together = [("medication", "scheduled_for")]

    def __str__(self) -> str:
        return f"{self.medication.name} @ {self.scheduled_for:%Y-%m-%d %H:%M} = {self.status}"


class CareReminder(TimeStamped):
    """یادآورهای مراقبتی پیش‌فرض که دخترم می‌تواند خاموش/روشن کند."""

    text = models.CharField("متن", max_length=200)
    hour = models.PositiveSmallIntegerField("ساعت", default=10)
    minute = models.PositiveSmallIntegerField("دقیقه", default=0)
    enabled = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "یادآور مراقبتی"
        verbose_name_plural = "چرخه و مراقبت — مراقبت از خود"
        ordering = ["hour", "minute"]

    def __str__(self) -> str:
        return f"{self.hour:02d}:{self.minute:02d} — {self.text}"


class HealthAccessLog(TimeStamped):
    """لاگ دسترسی بابا به بخش سلامت (Double Confirm)."""

    who = models.CharField("چه کسی", max_length=40, default="daddy")
    path = models.CharField("مسیر", max_length=200, blank=True)

    class Meta:
        verbose_name = "لاگ دسترسی سلامت"
        verbose_name_plural = "چرخه و مراقبت — لاگ دسترسی"
        ordering = ["-created_at"]
