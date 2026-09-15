"""ابزارهای کوچک و مشترک برای ورودی‌های API.

این توابع عمداً مستقل از مدل‌ها هستند تا همه‌ی اپ‌ها یک رفتار یکسان برای
پارامترهای عددی و فایل‌های اختیاری داشته باشند و ورودی خراب به خطای ۵۰۰ تبدیل
نشود.
"""
from __future__ import annotations

from datetime import date
from math import isfinite
from pathlib import Path
from typing import Any

from PIL import Image, UnidentifiedImageError

from core.media import signed_media_url


def bounded_int(value: Any, default: int = 0, minimum: int | None = None, maximum: int | None = None) -> int:
    """یک عدد صحیح امن و محدودشده برمی‌گرداند."""
    try:
        result = int(value)
    except (TypeError, ValueError, OverflowError):
        result = default
    if minimum is not None:
        result = max(minimum, result)
    if maximum is not None:
        result = min(maximum, result)
    return result


def bounded_float(value: Any, default: float = 0.0, minimum: float | None = None, maximum: float | None = None) -> float:
    """یک عدد اعشاری امن و محدودشده برمی‌گرداند؛ NaN و بی‌نهایت رد می‌شوند."""
    try:
        result = float(value)
    except (TypeError, ValueError, OverflowError):
        result = default
    if not isfinite(result):
        result = default
    if minimum is not None:
        result = max(minimum, result)
    if maximum is not None:
        result = min(maximum, result)
    return result


def file_url(field: Any) -> str | None:
    """URL فایل جنگو را بدون شکستن پاسخ API برای فایل حذف‌شده برمی‌گرداند."""
    try:
        name = getattr(field, "name", "") if field else ""
        if not name:
            return None
        storage = getattr(field, "storage", None)
        if storage is not None and not storage.exists(name):
            return None
        return signed_media_url(name)
    except (AttributeError, OSError, ValueError):
        return None


def iso_date(value: Any, default: date | None = None) -> date | None:
    """تاریخ ISO را از ورودی API بدون تبدیل خطای کاربر به ۵۰۰ می‌خواند."""
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)) if value else default
    except (TypeError, ValueError):
        return default


UPLOAD_LIMITS = {
    "image": 10 * 1024 * 1024,
    "audio": 50 * 1024 * 1024,
    "document": 25 * 1024 * 1024,
    "any": 50 * 1024 * 1024,
}


def validate_upload(upload: Any, kind: str = "any") -> str | None:
    """فایل آپلودی را قبل از ذخیره از نظر اندازه و محتوای پایه بررسی می‌کند."""
    if not upload:
        return None
    limit = UPLOAD_LIMITS.get(kind, UPLOAD_LIMITS["any"])
    if getattr(upload, "size", 0) > limit:
        return f"حجم فایل نباید بیشتر از {limit // (1024 * 1024)} مگابایت باشد"

    if kind == "image":
        try:
            with Image.open(upload) as opened:
                opened.verify()
            upload.seek(0)
        except (AttributeError, OSError, UnidentifiedImageError, ValueError):
            return "فایل انتخاب‌شده یک تصویر معتبر نیست"
    elif kind == "document":
        if Path(str(getattr(upload, "name", ""))).suffix.lower() != ".pdf":
            return "فقط فایل PDF قابل قبول است"
        try:
            if upload.read(5) != b"%PDF-":
                return "فایل PDF معتبر نیست"
            upload.seek(0)
        except (AttributeError, OSError):
            return "فایل PDF معتبر نیست"
    return None
