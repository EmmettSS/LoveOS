"""
calls.models — هماهنگ‌کننده‌ی تماس (Call Sync)

بابا و دخترم در دو شهر (و اغلب دو منطقه‌ی زمانی) هستند؛ این اپ تضمین می‌کند
تماس‌هایشان همیشه سرِ وقت و بدون سردرگمی اتفاق بیفتد:

  • CallFreeSlot    → بازه‌های آزاد هفتگی هر کدام
  • CallAppointment → پیشنهاد/تأیید/رد/جایگزین تماس
  • CallLog         → آن‌چه واقعاً اتفاق افتاد (مدت، حال هر دو، یادداشت، ضمیمه)
  • CallSettings    → الگوی نوتیف‌ها (از پنل بابا)

آمار تماس‌ها (CallStats در پرامپت) محاسبه‌شده است و در API ساخته می‌شود؛
ذخیره‌ی مقادیر مشتق‌شده فقط باعث ناهماهنگی داده می‌شود.
"""
from datetime import timedelta

from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone

from core.models import TimeStamped

OWNER = [("daddy", "بابا"), ("daughter", "دخترم")]
MOODS = [
    ("happy", "خوشحال"),
    ("normal", "معمولی"),
    ("missing", "دلتنگ"),
]

def hhmm(value) -> str:
    """ساعت را «HH:MM» نشان می‌دهد — چه TimeField باشد چه رشته‌ی خام."""
    if value is None:
        return "--:--"
    return value.strftime("%H:%M") if hasattr(value, "strftime") else str(value)


WEEKDAYS = [
    (0, "شنبه"),
    (1, "یکشنبه"),
    (2, "دوشنبه"),
    (3, "سه‌شنبه"),
    (4, "چهارشنبه"),
    (5, "پنجشنبه"),
    (6, "جمعه"),
]


class CallFreeSlot(TimeStamped):
    """یک بازه‌ی آزاد در هفته که «بابا» یا «دخترم» علامت زده است."""

    owner = models.CharField("صاحب بازه", max_length=10, choices=OWNER, default="daughter")
    weekday = models.PositiveSmallIntegerField("روز هفته", choices=WEEKDAYS, default=0)
    start_time = models.TimeField("ساعت شروع")
    end_time = models.TimeField("ساعت پایان")
    note = models.CharField("یادداشت", max_length=120, blank=True)
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "بازه‌ی آزاد تماس"
        verbose_name_plural = "بازه‌های آزاد تماس"
        ordering = ["owner", "weekday", "start_time"]
        indexes = [models.Index(fields=["owner", "weekday"])]

    def __str__(self) -> str:
        return (
            f"{self.get_owner_display()} — {self.get_weekday_display()} "
            f"{hhmm(self.start_time)}-{hhmm(self.end_time)}"
        )

    @property
    def minutes(self) -> int:
        start = self.start_time.hour * 60 + self.start_time.minute
        end = self.end_time.hour * 60 + self.end_time.minute
        return max(0, end - start)


class CallAppointment(TimeStamped):
    """یک تماس پیشنهادشده؛ تا وقتی طرف مقابل تأیید نکند «قطعی» نیست."""

    STATUS = [
        ("pending", "در انتظار جواب"),
        ("approved", "تأیید شده"),
        ("rejected", "رد شده"),
        ("rescheduled", "پیشنهاد جایگزین"),
        ("done", "انجام شد"),
        ("canceled", "لغو شد"),
    ]

    proposer = models.CharField("پیشنهاددهنده", max_length=10, choices=OWNER, default="daughter")
    proposee = models.CharField("طرف مقابل", max_length=10, choices=OWNER, default="daddy")
    date = models.DateField("تاریخ")
    time = models.TimeField("ساعت")
    duration_minutes = models.PositiveIntegerField(
        "مدت تقریبی (دقیقه)", default=30, validators=[MinValueValidator(5)]
    )
    topic = models.CharField("موضوع", max_length=160, blank=True)
    status = models.CharField("وضعیت", max_length=12, choices=STATUS, default="pending")
    message = models.CharField("پیام همراه", max_length=255, blank=True)
    answer_note = models.CharField("یادداشت جواب", max_length=255, blank=True)
    answered_at = models.DateTimeField("زمان جواب", null=True, blank=True)
    # اگر طرف مقابل «جایگزین» پیشنهاد داده باشد، این رکورد به پیشنهاد اصلی وصل است
    alternative_of = models.ForeignKey(
        "self", verbose_name="جایگزین برای", null=True, blank=True, on_delete=models.SET_NULL, related_name="alternatives"
    )
    reminder_sent = models.BooleanField("یادآوری فرستاده شد", default=False)

    class Meta:
        verbose_name = "تماس هماهنگ‌شده"
        verbose_name_plural = "تماس‌های هماهنگ‌شده"
        ordering = ["date", "time"]
        indexes = [models.Index(fields=["status", "date"])]

    def __str__(self) -> str:
        return (
            f"{self.get_proposer_display()} → {self.get_proposee_display()} | "
            f"{self.date} {hhmm(self.time)} ({self.get_status_display()})"
        )

    # ------------------------------------------------------------- helpers --
    @property
    def starts_at(self):
        """زمان دقیق شروع تماس (به وقت محلی سرور)."""
        naive = timezone.datetime.combine(self.date, self.time)
        return timezone.make_aware(naive) if timezone.is_naive(naive) else naive

    @property
    def ends_at(self):
        return self.starts_at + timedelta(minutes=self.duration_minutes)

    @property
    def is_upcoming(self) -> bool:
        return self.status in ("pending", "approved") and self.ends_at > timezone.now()

    @property
    def seconds_to_start(self) -> int:
        return int((self.starts_at - timezone.now()).total_seconds())

    @classmethod
    def next_call(cls):
        """نزدیک‌ترین تماس تأییدشده‌ای که هنوز تمام نشده (برای شمارش معکوس و یادآوری)."""
        return (
            cls.objects.filter(status="approved", date__gte=timezone.localdate())
            .order_by("date", "time")
            .first()
        )


class CallLog(TimeStamped):
    """آن‌چه پس از تماس ثبت می‌شود — «تماس انجام شد»."""

    KINDS = [("video", "ویدیویی"), ("voice", "صوتی"), ("in_person", "حضوری")]

    appointment = models.ForeignKey(
        CallAppointment, verbose_name="تماس", null=True, blank=True, on_delete=models.SET_NULL, related_name="logs"
    )
    happened_on = models.DateField("تاریخ تماس", default=timezone.localdate)
    happened_at = models.TimeField("ساعت تماس", null=True, blank=True)
    kind = models.CharField("نوع", max_length=12, choices=KINDS, default="video")
    duration_minutes = models.PositiveIntegerField("مدت واقعی (دقیقه)", default=0)
    topic = models.CharField("موضوع", max_length=160, blank=True)
    daddy_mood = models.CharField("حال بابا", max_length=10, choices=MOODS, default="happy")
    daughter_mood = models.CharField("حال دخترم", max_length=10, choices=MOODS, default="happy")
    note = models.CharField("یادداشت کوتاه", max_length=255, blank=True)
    attachment = models.FileField("ضمیمه (ویس/عکس)", upload_to="calls/", blank=True)
    recorded_by = models.CharField("ثبت‌کننده", max_length=10, choices=OWNER, default="daddy")

    class Meta:
        verbose_name = "ثبت تماس"
        verbose_name_plural = "ثبت تماس‌ها"
        ordering = ["-happened_on", "-created_at"]

    def __str__(self) -> str:
        return f"{self.happened_on} — {self.duration_minutes} دقیقه"

    @property
    def duration_label(self) -> str:
        hours, minutes = divmod(self.duration_minutes, 60)
        if hours and minutes:
            return f"{hours} ساعت و {minutes} دقیقه"
        if hours:
            return f"{hours} ساعت"
        return f"{minutes} دقیقه"


class CallSettings(TimeStamped):
    """الگوی نوتیف‌ها و پیش‌فرض‌های اپ تماس — همه از پنل بابا."""

    reminder_minutes = models.PositiveIntegerField("یادآوری چند دقیقه قبل از تماس", default=30)
    notify_on_propose = models.BooleanField("نوتیف برای پیشنهاد تماس", default=True)
    notify_on_answer = models.BooleanField("نوتیف برای تأیید/رد/جایگزین", default=True)
    notify_on_log = models.BooleanField("نوتیف برای ثبت تماس", default=True)
    notify_reminder = models.BooleanField("یادآوری قبل از تماس", default=True)
    default_duration = models.PositiveIntegerField("مدت پیش‌فرض (دقیقه)", default=30)
    propose_template = models.CharField(
        "متن نوتیف پیشنهاد تماس", max_length=200, default="دخترم یه تماس پیشنهاد داده ❤"
    )
    approved_template = models.CharField("متن نوتیف تأیید", max_length=200, default="بابا تماس رو قبول کرد ❤")
    rejected_template = models.CharField("متن نوتیف رد", max_length=200, default="این ساعت نشد؛ یه زمان دیگه بذاریم")
    reminder_template = models.CharField("متن یادآوری", max_length=200, default="الان تماس داریم ❤ {minutes} دقیقه دیگه")
    log_template = models.CharField("متن ثبت تماس", max_length=200, default="تماس ثبت شد: {minutes} دقیقه")
    streak_message = models.CharField(
        "پیام رکورد تماس", max_length=200, default="بابا و دخترم هنوز رکورددار تماس‌های طولانی‌اند"
    )
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "تنظیمات تماس"
        verbose_name_plural = "تنظیمات تماس"

    def __str__(self) -> str:
        return "تنظیمات تماس"

    @classmethod
    def get_solo(cls) -> "CallSettings":
        obj = cls.objects.first()
        if obj is None:
            obj = cls.objects.create()
        return obj

    @classmethod
    def reminder_window(cls) -> int:
        return cls.get_solo().reminder_minutes
