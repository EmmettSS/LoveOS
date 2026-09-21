"""
gifts.models — دفتر سوابق هدیه‌ها (Gift History)

این اپ «لیست ایده‌های کادو» نیست؛ آرشیو تاریخی هدیه‌هایی است که بین بابا و
دخترم رد و بدل شده‌اند. هر هدیه یک خاطره‌ی کوچک است: مناسبتش، هدیه‌دهنده،
واکنش دخترم و عکسش.

  • GiftOccasion → مناسبت‌های قابل تنظیم از پنل بابا (تولد، سالگرد، بدون مناسبت، ...)
  • Gift         → خود هدیه با همه‌ی جزئیات
"""
from django.db import models
from django.utils import timezone

from core.models import TimeStamped

OWNER = [("daddy", "بابا"), ("daughter", "دخترم")]
PRICE_BANDS = [
    ("low", "کم"),
    ("medium", "متوسط"),
    ("high", "بالا"),
]


class GiftOccasion(TimeStamped):
    """مناسبت‌ها؛ بابا هر وقت خواست از پنل اضافه یا کم می‌کند."""

    name = models.CharField("نام مناسبت", max_length=80, unique=True)
    icon = models.CharField("آیکن (ایموجی)", max_length=8, default="🎁")
    order = models.PositiveIntegerField("ترتیب", default=0)
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "مناسبت هدیه"
        verbose_name_plural = "مناسبت‌های هدیه"
        ordering = ["order", "name"]

    def __str__(self) -> str:
        return self.name


class Gift(TimeStamped):
    """یک هدیه‌ی ثبت‌شده در دفتر."""

    name = models.CharField("نام هدیه", max_length=160)
    given_on = models.DateField("تاریخ هدیه", default=timezone.localdate)
    occasion = models.ForeignKey(
        GiftOccasion, verbose_name="مناسبت", null=True, blank=True, on_delete=models.SET_NULL, related_name="gifts"
    )
    giver = models.CharField("هدیه‌دهنده", max_length=10, choices=OWNER, default="daddy")
    receiver = models.CharField("هدیه‌گیرنده", max_length=10, choices=OWNER, default="daughter")
    price = models.DecimalField("قیمت", max_digits=12, decimal_places=0, null=True, blank=True)
    currency = models.CharField("واحد پول", max_length=12, blank=True, default="")
    price_band = models.CharField("رنج قیمت", max_length=10, choices=PRICE_BANDS, blank=True, default="")
    description = models.TextField("توضیح کوتاه", blank=True)
    reaction = models.CharField("واکنش هدیه‌گیرنده", max_length=255, blank=True)
    photo = models.ImageField("عکس هدیه", upload_to="gifts/", blank=True)
    is_favorite = models.BooleanField("هدیه‌ی خاص (نمایش در خاطره‌ها)", default=False)
    memory = models.ForeignKey(
        "content.Memory",
        verbose_name="خاطره‌ی مرتبط",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="gifts",
    )
    recorded_by = models.CharField("ثبت‌کننده", max_length=10, choices=OWNER, default="daddy")

    class Meta:
        verbose_name = "هدیه"
        verbose_name_plural = "۲۶) دفتر هدیه‌ها"
        ordering = ["-given_on", "-created_at"]
        indexes = [models.Index(fields=["giver", "given_on"]), models.Index(fields=["-given_on"])]

    def __str__(self) -> str:
        return f"{self.name} ({self.given_on:%Y-%m-%d})"

    # ------------------------------------------------------------- helpers --
    @property
    def year(self) -> int:
        return self.given_on.year

    @property
    def effective_price_band(self) -> str:
        """اگر بابا رنج را دستی انتخاب نکرده باشد، از قیمت تخمین می‌زند."""
        if self.price_band:
            return self.price_band
        if self.price is None:
            return ""
        value = float(self.price)
        if value <= 500:
            return "low"
        if value <= 3000:
            return "medium"
        return "high"

    @classmethod
    def price_summary(cls, giver: str) -> dict:
        """خلاصه‌ی قیمت هدیه‌های یک طرف (تعداد، میانگین، مجموع) — برای بخش آمار."""
        priced = [g for g in cls.objects.filter(giver=giver) if g.price is not None]
        if not priced:
            return {"count": 0, "average": None, "total": None}
        total = sum(float(g.price) for g in priced)
        return {"count": len(priced), "average": round(total / len(priced)), "total": round(total)}
