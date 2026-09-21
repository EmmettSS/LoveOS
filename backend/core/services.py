"""
core.services — موتورهای مشترک LoveOS
اعلان داخل سیستم، شمارنده‌ها، موتور دستاورد، لاگ فعالیت، تخم‌مرغ‌های شانسی.
"""
from __future__ import annotations

from django.db.models import F
from django.utils import timezone

from core.models import (
    Achievement,
    AchievementUnlock,
    ActivityLog,
    Counter,
    EasterEgg,
    EasterEggLog,
    OSNotification,
)
from core.soroush import notify_daddy
from core.utils import file_url


# --------------------------------------------------- موقعیت زنده‌ی دخترم ---
def effective_daughter_location(cfg=None) -> dict:
    """
    موقعیت مؤثری که همه‌ی اپ‌ها باید استفاده کنند.

    ترتیب اولویت:
      ۱) موقعیت زنده‌ی دستگاه دخترم (اگر تازه باشد و بابا آن را فعال کرده باشد)
      ۲) مقدار ثبت‌شده در پنل بابا (خانه/شهر پیش‌فرض)

    خروجی: lat, lng, city, timezone, is_live, captured_at, accuracy, source
    """
    from accounts.models import LiveLocation  # local import: جلوگیری از حلقه

    if cfg is None:
        from accounts.models import UserConfig

        cfg = UserConfig.get_solo()

    fallback = {
        "lat": cfg.daughter_lat,
        "lng": cfg.daughter_lng,
        "city": cfg.daughter_city,
        "timezone": cfg.daughter_timezone,
        "is_live": False,
        "captured_at": None,
        "accuracy": None,
        "source": "config",
    }
    if not getattr(cfg, "location_enabled", True):
        return fallback

    live = LiveLocation.current()
    if not live or not live.is_fresh(getattr(cfg, "location_ttl_minutes", 60)):
        return fallback

    return {
        "lat": live.lat,
        "lng": live.lng,
        "city": live.city or cfg.daughter_city,
        "timezone": live.timezone or cfg.daughter_timezone,
        "is_live": True,
        "captured_at": live.captured_at.isoformat(),
        "accuracy": live.accuracy,
        "source": live.source,
    }


def daughter_timezone_name(cfg=None) -> str:
    return effective_daughter_location(cfg).get("timezone") or "Europe/Istanbul"


# ------------------------------------------------------------- اعلان‌ها -----
def push_notification(kind: str, title: str, text: str = "", **kwargs) -> OSNotification:
    """یک کارت اعلان در مرکز اعلان دخترم می‌سازد."""
    return OSNotification.objects.create(kind=kind, title=title, text=text, **kwargs)


def log_activity(action: str, app: str = "", detail: str = "", **meta) -> ActivityLog:
    return ActivityLog.objects.create(action=action, app=app, detail=detail, meta=meta)


# ----------------------------------------------------------- شمارنده‌ها -----
def bump(key: str, amount: int = 1) -> int:
    """شمارنده را اتمیک زیاد می‌کند تا دو درخواست همزمان مقدار هم را نپوشانند."""
    counter, _ = Counter.objects.get_or_create(key=key)
    Counter.objects.filter(pk=counter.pk).update(value=F("value") + amount)
    counter.refresh_from_db(fields=["value"])
    check_achievements()
    return counter.value


def get_counter(key: str) -> int:
    counter = Counter.objects.filter(key=key).first()
    return counter.value if counter else 0


def reset_counter(key: str) -> None:
    Counter.objects.filter(key=key).update(value=0)


# ------------------------------------------------------- موتور دستاورد -----
# نگاشت کد دستاورد ← کلید شمارنده
ACHIEVEMENT_RULES: dict[str, str] = {
    "first_login": "login",
    "first_voice": "voice_played",
    "days_100": "days_together",
    "quiz_perfect": "quiz_perfect",
    "all_letters": "letters_opened",
    "puzzle_player": "puzzle_done",
    "puzzle_master": "puzzle_done",
    "hug_bunny": "hug_received",
    "kind_daughter": "hug_sent",
    "med_regular": "med_streak",
    "self_care": "cycle_months",
    "writer": "chapters_written",
    "storyteller": "paragraphs_written",
    "secret_finder": "eggs_found",
    "secret_master": "eggs_found",
    "know_it_all": "eggs_found",
    # --- شش اپ تازه
    "first_call": "call_logged",
    "calls_10": "call_logged",
    "hours_100": "call_total_minutes",       # آستانه‌اش ۶۰۰۰ دقیقه است
    "first_gift": "gifts_recorded",
    "gifts_10": "gifts_recorded",
    "gifts_50": "gifts_recorded",
    "first_book": "reading_books",
    "books_5": "reading_books",
    "books_10": "reading_books",
    "notes_100": "reading_notes",
    "home_features_10": "home_features",
    "home_features_50": "home_features",
    "first_room": "home_rooms",
    "first_word": "language_entries",
    "words_100": "language_words",
    "language_master": "language_practiced",
}


def check_achievements() -> list[str]:
    """هر دستاوردی که آستانه‌اش رد شده را باز می‌کند و اعلان می‌سازد."""
    unlocked: list[str] = []
    values = {c.key: c.value for c in Counter.objects.all()}
    for ach in Achievement.objects.filter(is_active=True):
        if AchievementUnlock.objects.filter(achievement=ach).exists():
            continue
        counter_key = ACHIEVEMENT_RULES.get(ach.code)
        if not counter_key:
            continue
        if values.get(counter_key, 0) >= ach.threshold:
            _, created = AchievementUnlock.objects.get_or_create(achievement=ach)
            if not created:
                continue
            push_notification(
                "achievement",
                f"نشان جدید: {ach.title}",
                ach.secret_message or ach.description,
                icon=ach.icon,
                action_app="achievements",
            )
            notify_daddy("achievement", f"دخترت نشان «{ach.title}» رو گرفت 🏅")
            unlocked.append(ach.code)
    return unlocked


# -------------------------------------------------- کش سبک (فقط خواندنی) ---
_SEARCH_CACHE: dict[str, tuple[float, object]] = {}
CACHE_TTL_SECONDS = 45


def cached(key: str, builder, ttl: int = CACHE_TTL_SECONDS):
    """
    یک کش خیلی سبک در حافظه‌ی پروسه برای منابع پرمصرف جستجوی سراسری.
    اگر داده تازه شود، بابا از پنل پاکش می‌کند یا خودش بعد از ttl منقضی می‌شود.
    """
    import time

    now = time.time()
    hit = _SEARCH_CACHE.get(key)
    if hit and now - hit[0] < ttl:
        return hit[1]
    value = builder()
    _SEARCH_CACHE[key] = (now, value)
    return value


def clear_app_cache() -> int:
    """پاک کردن کش؛ از پنل بابا با یک کلیک."""
    count = len(_SEARCH_CACHE)
    _SEARCH_CACHE.clear()
    return count


# ------------------------------------------------------ تخم‌مرغ شانسی ------
def trigger_easter_egg(trigger_type: str) -> dict | None:
    """
    یک راز را فعال می‌کند: لاگ + اعلان + پیام سروش برای بابا.
    محتوا از پنل بابا می‌آید؛ فقط منطق تریگر در کد ثابت است.
    """
    egg = EasterEgg.objects.filter(trigger_type=trigger_type, is_active=True).first()
    if not egg:
        return None
    first_time = not EasterEggLog.objects.filter(egg=egg).exists()
    EasterEggLog.objects.create(egg=egg, activated_at=timezone.now())
    if first_time:
        bump("eggs_found")
        notify_daddy("easter_egg", f"دخترت یه راز مخفی پیدا کرد! 🥚 {egg.title}")
    return {
        "id": egg.id,
        "title": egg.title,
        "trigger_type": egg.trigger_type,
        "message": egg.message,
        "attachment": file_url(egg.attachment),
        "extra": egg.extra,
        "first_time": first_time,
    }
