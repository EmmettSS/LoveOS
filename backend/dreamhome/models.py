"""
dreamhome.models — خانه‌ی رویایی (Dream Home)

بابا و دخترم با هم خانه‌ی آینده‌شان را طراحی می‌کنند: چه چیزهایی باید داشته
باشد، نقشه‌ی اتاق‌ها چه شکلی است، چه عکس‌هایی الهام‌شان است و کدام‌ها «ضروری»اند.

  • DreamHomeCategory    → دسته‌بندی‌ها (مکان، اندازه، اتاق‌ها، حیاط، دکور، ...)
  • DreamHomeFeature     → ویژگی‌های رویایی (با اهمیت: ضروری/خوب/لوکس)
  • DreamHomeRoom        → اتاق‌های نقشه‌ی خانه (شکلشون به‌صورت JSON/SVG ذخیره می‌شود)
  • DreamHomeInspiration → گالری الهام
  • InspirationComment   → کامنت روی عکس‌های الهام
"""
from django.db import models

from core.models import TimeStamped

OWNER = [("daddy", "بابا"), ("daughter", "دخترم")]
IMPORTANCE = [
    ("must", "ضروری"),
    ("nice", "خوبه داشته باشیم"),
    ("luxury", "لوکس"),
]


class DreamHomeCategory(TimeStamped):
    name = models.CharField("نام دسته", max_length=80, unique=True)
    icon = models.CharField("آیکن (ایموجی)", max_length=8, default="🏡")
    detail = models.CharField("توضیح", max_length=200, blank=True)
    order = models.PositiveIntegerField("ترتیب", default=0)
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "دسته‌بندی خانه"
        verbose_name_plural = "دسته‌بندی‌های خانه"
        ordering = ["order", "name"]

    def __str__(self) -> str:
        return self.name


class DreamHomeFeature(TimeStamped):
    """یک ویژگی که یکی از ما دوست دارد خانه‌مان داشته باشد."""

    title = models.CharField("عنوان ویژگی", max_length=160)
    category = models.ForeignKey(
        DreamHomeCategory, verbose_name="دسته", null=True, blank=True, on_delete=models.SET_NULL, related_name="features"
    )
    importance = models.CharField("اهمیت", max_length=10, choices=IMPORTANCE, default="must")
    description = models.TextField("توضیح", blank=True)
    photo = models.ImageField("عکس نمونه", upload_to="dreamhome/features/", blank=True)
    added_by = models.CharField("افزوده‌شده توسط", max_length=10, choices=OWNER, default="daddy")
    is_done = models.BooleanField("تیک خورده (قطعی شد)", default=False)
    # می‌تواند به یکی از آرزوهای بوکت‌لیست وصل شود
    linked_plan = models.ForeignKey(
        "content.FuturePlan",
        verbose_name="لینک به آرزوی ما",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="home_features",
    )
    order = models.PositiveIntegerField("ترتیب", default=0)

    class Meta:
        verbose_name = "ویژگی خانه‌ی رویایی"
        verbose_name_plural = "۲۸) ویژگی‌های خانه‌ی رویایی"
        ordering = ["importance", "order", "-created_at"]
        indexes = [models.Index(fields=["importance"])]

    def __str__(self) -> str:
        return f"{self.title} ({self.get_importance_display()})"


class DreamHomeRoom(TimeStamped):
    """
    یک اتاق روی نقشه‌ی خانه.

    شکل اتاق به‌صورت ساده ذخیره می‌شود: x, y, w, h در یک بوم نسبی (۰ تا ۱۰۰)
    تا روی هر صفحه‌ای درست بنشیند. رنگ و آیکن هم از پنل تنظیم می‌شود.
    """

    name = models.CharField("نام اتاق", max_length=120)
    description = models.TextField("توضیح", blank=True)
    floor = models.CharField("طبقه", max_length=60, blank=True)
    x = models.FloatField("موقعیت افقی", default=10)
    y = models.FloatField("موقعیت عمودی", default=10)
    w = models.FloatField("پهنا", default=20)
    h = models.FloatField("ارتفاع", default=20)
    color = models.CharField("رنگ", max_length=20, default="#f9a8d4")
    icon = models.CharField("آیکن (ایموجی)", max_length=8, default="🛋")
    added_by = models.CharField("افزوده‌شده توسط", max_length=10, choices=OWNER, default="daddy")
    order = models.PositiveIntegerField("ترتیب", default=0)

    class Meta:
        verbose_name = "اتاق خانه‌ی رویایی"
        verbose_name_plural = "اتاق‌های خانه‌ی رویایی"
        ordering = ["order", "id"]

    def __str__(self) -> str:
        return self.name

    @property
    def color_choices(self) -> list[str]:
        return ["#f9a8d4", "#fcd34d", "#86efac", "#93c5fd", "#c4b5fd", "#fca5a5", "#5eead4"]


class DreamHomeRoomIdea(TimeStamped):
    """ایده‌ی اتاق‌به‌اتاق: برای هر اتاق، ایده / رنگ / مبلمان / دکور."""

    KIND = [
        ("idea", "ایده"),
        ("color", "رنگ"),
        ("furniture", "مبلمان"),
        ("decor", "دکور"),
    ]

    room = models.ForeignKey(DreamHomeRoom, verbose_name="اتاق", on_delete=models.CASCADE, related_name="ideas")
    kind = models.CharField("نوع", max_length=12, choices=KIND, default="idea")
    text = models.CharField("متن", max_length=255)
    color_value = models.CharField("کد رنگ", max_length=20, blank=True)
    added_by = models.CharField("افزوده‌شده توسط", max_length=10, choices=OWNER, default="daddy")

    class Meta:
        verbose_name = "ایده‌ی اتاق"
        verbose_name_plural = "ایده‌های اتاق‌به‌اتاق"
        ordering = ["kind", "-created_at"]

    def __str__(self) -> str:
        return f"{self.room.name}: {self.text[:40]}"


class DreamHomeInspiration(TimeStamped):
    """عکس الهام‌بخش؛ دسته‌بندی‌شده بر اساس اتاق یا سبک."""

    photo = models.ImageField("عکس", upload_to="dreamhome/inspiration/")
    title = models.CharField("عنوان", max_length=160, blank=True)
    category = models.ForeignKey(
        DreamHomeCategory, verbose_name="دسته", null=True, blank=True, on_delete=models.SET_NULL, related_name="inspirations"
    )
    room = models.ForeignKey(
        DreamHomeRoom, verbose_name="اتاق", null=True, blank=True, on_delete=models.SET_NULL, related_name="inspirations"
    )
    description = models.TextField("توضیح", blank=True)
    uploaded_by = models.CharField("آپلود شده توسط", max_length=10, choices=OWNER, default="daddy")

    class Meta:
        verbose_name = "عکس الهام"
        verbose_name_plural = "گالری الهام"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.title or f"الهام #{self.pk}"


class InspirationComment(TimeStamped):
    owner = models.CharField("نویسنده", max_length=10, choices=OWNER, default="daughter")
    inspiration = models.ForeignKey(DreamHomeInspiration, verbose_name="عکس", on_delete=models.CASCADE, related_name="comments")
    text = models.CharField("متن", max_length=500)

    class Meta:
        verbose_name = "کامنت الهام"
        verbose_name_plural = "کامنت‌های الهام"
        ordering = ["created_at"]

    def __str__(self) -> str:
        return self.text[:50]
