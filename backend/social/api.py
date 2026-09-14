"""
API اجتماعی: چت، بغل (با ویبره)، یادآورهای مهربان، مرکز اعلان، ترمینال، رازها، دستاوردها، آب‌وهوا.
"""
import json
import random
from datetime import timedelta

import requests
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from accounts.models import UserConfig
from content.models import TerminalCommand
from core.auth import require_session
from core.models import Achievement, AchievementUnlock, OSNotification
from core.services import (
    bump,
    effective_daughter_location,
    get_counter,
    log_activity,
    push_notification,
    reset_counter,
    trigger_easter_egg,
)
from core.soroush import notify_daddy
from social.models import ChatMessage, Hug, HugSettings, Reminder, ReminderLog


# ------------------------------------------------------------------ چت ----
def chat_json(m: ChatMessage) -> dict:
    return {
        "id": m.id,
        "sender": m.sender,
        "text": m.text,
        "via": m.via,
        "created_at": m.created_at.isoformat(),
        "is_read": m.is_read,
    }


@api_view(["GET", "POST"])
@require_session
def chat(request):
    if request.method == "POST":
        text = str(request.data.get("text", "")).strip()
        if not text:
            return Response({"ok": False}, status=400)
        msg = ChatMessage.objects.create(sender="daughter", text=text, via="app")
        cfg = UserConfig.get_solo()
        notify_daddy("chat", f"💬 {cfg.daughter_name}: {text}")
        log_activity("پیام چت", "chat", text[:60])
        # راز ۱۳: نوشتن «دوستت دارم»
        egg = None
        low = text.lower()
        if "دوستت دارم" in text or "love you" in low or "دوست دارم" in text:
            egg = trigger_easter_egg("chat_love")
        return Response({"ok": True, "item": chat_json(msg), "egg": egg})

    since = request.GET.get("since")
    qs = ChatMessage.objects.all()
    if since:
        qs = qs.filter(id__gt=int(since))
    items = [chat_json(m) for m in qs[:200]]
    ChatMessage.objects.filter(sender="daddy", is_read=False).update(is_read=True)
    return Response({"items": items})


# ----------------------------------------------------------------- بغل ----
def hug_settings_json(s: HugSettings) -> dict:
    return {
        "incoming_title": s.incoming_title,
        "incoming_message": s.incoming_message,
        "vibration_pattern": s.pattern_list,
        "warm_color": s.warm_color,
        "heartbeat_sound": s.heartbeat_sound.url if s.heartbeat_sound else None,
    }


@api_view(["GET"])
@require_session
def hug_state(request):
    """وضعیت بغل: شمارنده‌ها + بغل‌های دیده‌نشده‌ی بابا + تنظیمات ویبره."""
    settings_obj = HugSettings.get_solo()
    pending = Hug.objects.filter(direction="daddy_to_daughter", seen=False).order_by("created_at")
    return Response(
        {
            "received": Hug.objects.filter(direction="daddy_to_daughter").count(),
            "sent": Hug.objects.filter(direction="daughter_to_daddy").count(),
            "pending": [{"id": h.id, "text": h.text or settings_obj.incoming_message} for h in pending],
            "settings": hug_settings_json(settings_obj),
        }
    )


@api_view(["POST"])
@require_session
def hug_send(request):
    """دخترم بابا را بغل می‌کند — ویبره سمت کلاینت + پیام فوری سروش."""
    s = HugSettings.get_solo()
    hug = Hug.objects.create(direction="daughter_to_daddy", text=s.outgoing_message)
    notify_daddy("hug", s.outgoing_message)
    count = bump("hug_sent")
    log_activity("بغل کردن بابا", "hug")
    # راز ۱۲: سه بار پشت‌سرهم
    streak = bump("hug_streak")
    egg = None
    if streak >= 3:
        egg = trigger_easter_egg("hug_3")
        notify_daddy("hug_miss", "دخترت خیلی دلش برات تنگ شده ❤")
        reset_counter("hug_streak")
    return Response(
        {
            "ok": True,
            "id": hug.id,
            "sent_total": count,
            "vibration_pattern": s.pattern_list,
            "warm_color": s.warm_color,
            "egg": egg,
        }
    )


@api_view(["POST"])
@require_session
def hug_open(request, pk: int):
    """دخترم بغل بابا را باز می‌کند: ویبره + رنگ گرم + پیام."""
    hug = Hug.objects.filter(pk=pk, direction="daddy_to_daughter").first()
    if not hug:
        return Response({"ok": False}, status=404)
    s = HugSettings.get_solo()
    if not hug.seen:
        hug.seen = True
        hug.seen_at = timezone.now()
        hug.save(update_fields=["seen", "seen_at"])
        bump("hug_received")
        reset_counter("hug_streak")
        notify_daddy("hug_seen", "دخترت بغلت رو حس کرد 🤗")
    return Response(
        {
            "ok": True,
            "message": hug.text or s.incoming_message,
            "vibration_pattern": s.pattern_list,
            "warm_color": s.warm_color,
            "heartbeat_sound": s.heartbeat_sound.url if s.heartbeat_sound else None,
        }
    )


# ------------------------------------------------------------- اعلان‌ها ----
@api_view(["GET"])
@require_session
def notifications(request):
    qs = OSNotification.objects.filter(is_active=True)[:60]
    return Response(
        {
            "unread": OSNotification.objects.filter(is_active=True, is_read=False).count(),
            "items": [
                {
                    "id": n.id,
                    "kind": n.kind,
                    "title": n.title,
                    "text": n.text,
                    "icon": n.icon,
                    "payload": n.payload,
                    "action_app": n.action_app,
                    "is_read": n.is_read,
                    "created_at": n.created_at.isoformat(),
                }
                for n in qs
            ],
        }
    )


@api_view(["POST"])
@require_session
def notification_read(request, pk: int):
    n = OSNotification.objects.filter(pk=pk).first()
    if not n:
        return Response({"ok": False}, status=404)
    n.is_read = True
    n.save(update_fields=["is_read"])
    if n.kind == "reminder" and n.payload.get("reminder_id"):
        log = ReminderLog.objects.filter(reminder_id=n.payload["reminder_id"], viewed_at__isnull=True).first()
        if log:
            log.viewed_at = timezone.now()
            log.save(update_fields=["viewed_at"])
            notify_daddy("reminder_viewed", f"دخترت یادآور «{n.title}» رو دید 👀")
    return Response({"ok": True})


@api_view(["POST"])
@require_session
def notifications_read_all(request):
    OSNotification.objects.filter(is_read=False).update(is_read=True)
    return Response({"ok": True})


# ------------------------------------------------------- یادآور مهربان ----
@api_view(["GET"])
@require_session
def reminders(request):
    return Response(
        {
            "items": [
                {
                    "id": r.id,
                    "type": r.rtype,
                    "title": r.title,
                    "text": r.text,
                    "when": r.when.isoformat() if r.when else None,
                    "muted": r.muted_by_daughter,
                }
                for r in Reminder.objects.filter(is_active=True)
            ]
        }
    )


@api_view(["POST"])
@require_session
def reminder_mute(request, pk: int):
    r = Reminder.objects.filter(pk=pk).first()
    if not r:
        return Response({"ok": False}, status=404)
    r.muted_by_daughter = not r.muted_by_daughter
    r.save(update_fields=["muted_by_daughter"])
    return Response({"ok": True, "muted": r.muted_by_daughter})


# -------------------------------------------------------------- ترمینال ---
BUILTIN_HELP = [
    ("help", "لیست دستورها"),
    ("whoami", "تو کی هستی؟"),
    ("ls /heart", "چی توی قلب بابا هست"),
    ("cd /us", "برو به پوشه‌ی ما"),
    ("love --status", "وضعیت عشق"),
    ("heartbeat --live", "ضربان زنده"),
    ("distance --km", "فاصله‌ی ما"),
    ("open map", "باز کردن نقشه"),
    ("play voice --random", "یه ویس تصادفی"),
    ("music --list", "لیست آهنگ‌ها"),
    ("sudo kiss", "یه بوسه"),
    ("sudo hug --force", "بغل محکم"),
    ("future --countdown", "تا دیدار بعدی"),
    ("memory --random", "یه خاطره"),
    ("clear", "پاک کردن صفحه"),
    ("exit", "خروج"),
]


@api_view(["POST"])
@require_session
def terminal(request):
    """اجرای دستور ترمینال؛ خروجی‌ها از پنل بابا قابل ویرایش‌اند."""
    raw = str(request.data.get("command", "")).strip()
    cmd = " ".join(raw.split()).lower()
    cfg = UserConfig.get_solo()
    log_activity("دستور ترمینال", "terminal", cmd[:60])

    # رازهای ترمینال (۴ و ۵)
    if cmd == "sudo rm -rf /loneliness":
        egg = trigger_easter_egg("terminal_rm")
        return Response({"output": (egg or {}).get("message", "حذف شد. حالا فقط ما هستیم. ❤"), "egg": egg})
    if cmd == "sudo make me a sandwich":
        egg = trigger_easter_egg("terminal_sandwich")
        return Response({"output": (egg or {}).get("message", "ساندویچ آماده‌ست، با یه بوس اضافه 🥪❤"), "egg": egg})

    custom = TerminalCommand.objects.filter(command=cmd, is_active=True).first()
    if custom:
        return Response({"output": custom.output})

    if cmd == "help":
        lines = ["دستورهایی که بلدم:"]
        lines += [f"  {c:<22} {d}" for c, d in BUILTIN_HELP]
        extra = TerminalCommand.objects.filter(is_active=True, hidden=False)
        lines += [f"  {c.command:<22} {c.help_text}" for c in extra]
        return Response({"output": "\n".join(lines)})
    if cmd == "whoami":
        return Response({"output": f"{cfg.daughter_name} — دخترِ {cfg.daddy_name} ❤"})
    if cmd == "ls /heart":
        return Response({"output": "عشق/  دلتنگی/  خنده‌هات/  صدات/  آینده‌مون/  یه گوشه فقط برای تو/"})
    if cmd == "cd /us":
        return Response({"output": "/us > اینجا خونه‌ی ماست. هیچ‌وقت ازش بیرون نرو."})
    if cmd == "love --status":
        return Response({"output": f"وضعیت: فعال ✅  |  مدت: {cfg.days_together} روز  |  قطع شدنی: هرگز"})
    if cmd == "distance --km":
        return Response({"output": "فاصله فقط یه عدده. قلبمون همیشه یکیه."})
    if cmd == "clear":
        return Response({"output": "", "clear": True})
    if cmd == "exit":
        return Response({"output": "خداحافظ دخترم ❤", "exit": True})
    if cmd in {"open map", "map"}:
        return Response({"output": "در حال باز کردن نقشه‌ی ما...", "open_app": "map"})
    if cmd == "music --list":
        return Response({"output": "در حال باز کردن موسیقی...", "open_app": "music"})
    if cmd == "play voice --random":
        return Response({"output": "یه ویس تصادفی از بابا...", "open_app": "voice", "action": "random"})
    if cmd == "memory --random":
        return Response({"output": "یه خاطره از جعبه‌ی ما...", "open_app": "memories"})
    if cmd == "future --countdown":
        return Response({"output": "تا دیدار بعدی...", "open_app": "countdown"})
    if cmd == "heartbeat --live":
        return Response({"output": "هر ضربان، یه بار دوستت دارم.", "open_app": "heartbeat"})
    if cmd == "sudo kiss":
        return Response({"output": "", "sudo": "kiss"})
    if cmd in {"sudo hug --force", "sudo hug"}:
        return Response({"output": "", "sudo": "hug"})
    return Response({"output": f"دستور «{raw}» رو بلد نیستم دخترم. بنویس help تا لیست رو ببینی."})


@api_view(["POST"])
@require_session
def terminal_sudo(request):
    """مرحله‌ی دوم sudo (بعد از گرفتن رمز الکی)."""
    kind = request.data.get("kind")
    if kind == "kiss":
        return Response({"output": "رمز درست بود. یه بوسه پرواز کرد سمتت. ❤", "effect": "kiss"})
    if kind == "hug":
        s = HugSettings.get_solo()
        Hug.objects.create(direction="daddy_to_daughter", text="بابا از راه ترمینال بغلت کرد 🤗")
        bump("hug_received")
        return Response(
            {
                "output": "بغل اجباری اجرا شد 🤗",
                "effect": "hug",
                "vibration_pattern": s.pattern_list,
                "warm_color": s.warm_color,
            }
        )
    return Response({"output": "..."})


# ------------------------------------------------------------- رازها ------
@api_view(["POST"])
@require_session
def easter_egg(request):
    """کلاینت تریگر را گزارش می‌دهد؛ محتوا از دیتابیس می‌آید."""
    trigger = request.data.get("trigger", "")
    egg = trigger_easter_egg(trigger)
    if not egg:
        return Response({"found": False})
    return Response({"found": True, **egg})


# ---------------------------------------------------------- دستاوردها -----
@api_view(["GET"])
@require_session
def achievements(request):
    unlocked = {u.achievement_id: u for u in AchievementUnlock.objects.all()}
    items = []
    for a in Achievement.objects.filter(is_active=True):
        u = unlocked.get(a.id)
        items.append(
            {
                "id": a.id,
                "code": a.code,
                "title": a.title,
                "description": a.description,
                "icon": a.icon,
                "unlocked": bool(u),
                "unlocked_at": u.created_at.isoformat() if u else None,
                "secret_message": a.secret_message if u else "",
            }
        )
    return Response({"items": items, "unlocked": len(unlocked), "total": len(items)})


# ------------------------------------------------------------ آب‌وهوا -----
WEATHER_CODES = {
    0: ("آفتابی", "sun"), 1: ("کمی ابری", "sun"), 2: ("نیمه‌ابری", "cloud"), 3: ("ابری", "cloud"),
    45: ("مه", "fog"), 48: ("مه", "fog"), 51: ("نم‌نم باران", "rain"), 53: ("باران خفیف", "rain"),
    55: ("باران", "rain"), 61: ("باران", "rain"), 63: ("باران", "rain"), 65: ("باران شدید", "rain"),
    71: ("برف", "snow"), 73: ("برف", "snow"), 75: ("برف سنگین", "snow"), 80: ("رگبار", "rain"),
    81: ("رگبار", "rain"), 82: ("رگبار شدید", "rain"), 95: ("رعد و برق", "storm"),
}


def fetch_weather(lat: float, lng: float, tz: str) -> dict:
    """Open-Meteo — بدون کلید، رایگان."""
    try:
        resp = requests.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": lat,
                "longitude": lng,
                "current": "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m",
                "daily": "sunrise,sunset",
                "timezone": tz,
                "forecast_days": 1,
            },
            timeout=8,
        )
        data = resp.json()
        cur = data.get("current", {})
        code = int(cur.get("weather_code", 0))
        label, icon = WEATHER_CODES.get(code, ("نامعلوم", "cloud"))
        daily = data.get("daily", {})
        return {
            "ok": True,
            "temp": cur.get("temperature_2m"),
            "humidity": cur.get("relative_humidity_2m"),
            "wind": cur.get("wind_speed_10m"),
            "code": code,
            "label": label,
            "icon": icon,
            "sunrise": (daily.get("sunrise") or [None])[0],
            "sunset": (daily.get("sunset") or [None])[0],
        }
    except Exception as exc:  # offline sandbox fallback
        return {"ok": False, "error": str(exc), "temp": None, "label": "—", "icon": "cloud"}


@api_view(["GET"])
@require_session
def weather(request):
    cfg = UserConfig.get_solo()
    eff = effective_daughter_location(cfg)
    daddy = fetch_weather(cfg.daddy_lat, cfg.daddy_lng, cfg.daddy_timezone)
    daughter = fetch_weather(eff["lat"], eff["lng"], eff["timezone"])
    message = ""
    if daddy.get("temp") is not None and daughter.get("temp") is not None:
        diff = abs(daddy["temp"] - daughter["temp"])
        if diff >= 10:
            message = "هوامون خیلی فرق داره، ولی دلمون یکیه ❤"
        elif diff <= 2:
            message = "امروز هوای جفتمون یه شکله؛ انگار کنار همیم ☁️❤"
    return Response(
        {
            "daddy": {"city": cfg.daddy_city, **daddy},
            "daughter": {"city": eff["city"], "is_live": eff["is_live"], **daughter},
            "message": message,
        }
    )


# ------------------------------------------------------------- نقشه ------
@api_view(["GET"])
@require_session
def map_data(request):
    """داده‌ی نقشه‌ی ما: دو نقطه، فاصله، اختلاف ساعت، شب/روز."""
    import math
    from zoneinfo import ZoneInfo

    cfg = UserConfig.get_solo()
    eff = effective_daughter_location(cfg)
    r = 6371.0
    p1, p2 = math.radians(cfg.daddy_lat), math.radians(eff["lat"])
    dp = math.radians(eff["lat"] - cfg.daddy_lat)
    dl = math.radians(eff["lng"] - cfg.daddy_lng)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    distance = round(2 * r * math.asin(math.sqrt(a)))

    def local(tz_name: str) -> dict:
        try:
            now = timezone.now().astimezone(ZoneInfo(tz_name))
        except Exception:
            now = timezone.localtime()
        return {"time": now.strftime("%H:%M"), "hour": now.hour, "is_night": now.hour < 6 or now.hour >= 19}

    return Response(
        {
            "daddy": {
                "city": cfg.daddy_city,
                "lat": cfg.daddy_lat,
                "lng": cfg.daddy_lng,
                "is_live": False,
                **local(cfg.daddy_timezone),
            },
            "daughter": {
                "city": eff["city"],
                "lat": eff["lat"],
                "lng": eff["lng"],
                "is_live": eff["is_live"],
                "accuracy": eff["accuracy"],
                "captured_at": eff["captured_at"],
                **local(eff["timezone"]),
            },
            "distance_km": distance,
            "end_message": "فاصله فقط یه عدده. قلبمون همیشه یکیه.",
        }
    )
