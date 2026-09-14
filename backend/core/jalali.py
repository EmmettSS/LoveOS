"""core.jalali — تبدیل میلادی ↔ جلالی (بدون وابستگی خارجی).

الگوریتم با jalaali-js (همان کتابخانه‌ای که فرانت‌اند استفاده می‌کند)
کاراکتر‌به‌کاراکتر یکسان است:
  • نقطه‌ی لنگر: ۱۴۰۰/۰۱/۰۱ جلالی == ۲۰۲۱/۰۳/۲۱ میلادی
  • چرخه‌ی ۳۳ ساله از سال ۱۳۴۲؛ سال‌های کبیسه در آفست‌های {0,4,8,12,16,20,24,28}
  • ماه‌های ۱ تا ۶: ۳۱ روز؛ ماه‌های ۷ تا ۱۱: ۳۰ روز؛ اسفند: ۳۰ (کبیسه) یا ۲۹
"""
from __future__ import annotations

import datetime

_ANCHOR = datetime.date(2021, 3, 21)  # ۱۴۰۰/۰۱/۰۱ جلالی
_ANCHOR_JY = 1400
_LEAP_OFFSETS = {0, 4, 8, 12, 16, 20, 24, 28}


def is_leap(jy: int) -> bool:
    return (jy - 1342) % 33 in _LEAP_OFFSETS


def year_length(jy: int) -> int:
    return 366 if is_leap(jy) else 365


def month_length(jy: int, jm: int) -> int:
    if jm <= 6:
        return 31
    if jm <= 11:
        return 30
    return 30 if is_leap(jy) else 29


def to_jalali(d: datetime.date) -> tuple[int, int, int]:
    """میلادی → (سال، ماه، روز) جلالی"""
    offset = (d - _ANCHOR).days
    jy = _ANCHOR_JY
    if offset >= 0:
        while offset >= year_length(jy):
            offset -= year_length(jy)
            jy += 1
    else:
        while offset < 0:
            offset += year_length(jy - 1)
            jy -= 1
    for jm in range(1, 13):
        ml = month_length(jy, jm)
        if offset < ml:
            return jy, jm, offset + 1
        offset -= ml
    # دست‌نرس (الگوریتم همیشه داخل سال می‌ماند)
    return jy, 12, 30


def from_jalali(jy: int, jm: int, jd: int) -> datetime.date:
    """جلالی → تاریخ میلادی"""
    offset = 0
    if jy >= _ANCHOR_JY:
        for y in range(_ANCHOR_JY, jy):
            offset += year_length(y)
    else:
        for y in range(jy, _ANCHOR_JY):
            offset -= year_length(y)
    for m in range(1, jm):
        offset += month_length(jy, m)
    offset += jd - 1
    return _ANCHOR + datetime.timedelta(days=offset)
