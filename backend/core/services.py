"""
core.services — موتورهای مشترک LoveOS
اعلان داخل سیستم، شمارنده‌ها، موتور دستاورد، لاگ فعالیت، تخم‌مرغ‌های شانسی.
"""
from __future__ import annotations

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


# ------------------------------------------------------------- اعلان‌ها -----
def push_notification(kind: str, title: str, text: str = "", **kwargs) -> OSNotification:
    """یک کارت اعلان در مرکز اعلان دخترم می‌سازد."""
    return OSNotification.objects.create(kind=kind, title=title, text=text, **kwargs)


def log_activity(action: str, app: str = "", detail: str = "", **meta) -> ActivityLog:
    return ActivityLog.objects.create(action=action, app=app, detail=detail, meta=meta)


# ----------------------------------------------------------- شمارنده‌ها -----
def bump(key: str, amount: int = 1) -> int:
    counter, _ = Counter.objects.get_or_create(key=key)
    counter.value += amount
    counter.save(update_fields=["value", "updated_at"])
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
            AchievementUnlock.objects.create(achievement=ach)
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
        "attachment": egg.attachment.url if egg.attachment else None,
        "extra": egg.extra,
        "first_time": first_time,
    }
