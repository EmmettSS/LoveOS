"""
API — قفل، باز کردن قفل، نشست، پیکربندی عمومی
Endpoints: /api/boot, /api/auth/unlock, /api/auth/forgot, /api/auth/help, /api/auth/logout
"""
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from accounts.models import DeviceSession, LiveLocation, UnlockAttempt, UserConfig
from core.auth import get_session, require_session
from core.services import bump, effective_daughter_location, log_activity, push_notification
from core.soroush import notify_daddy


def _media(field) -> str | None:
    try:
        return field.url if field else None
    except ValueError:
        return None


def public_config(cfg: UserConfig) -> dict:
    """اطلاعاتی که حتی پشت صفحه‌ی قفل لازم است (بدون هیچ رازی)."""
    effective = effective_daughter_location(cfg)
    live_payload = effective if effective["is_live"] else None
    today = timezone.localdate()
    next_meeting = cfg.next_meeting
    delta = None
    if next_meeting:
        diff = next_meeting - timezone.now()
        if diff.total_seconds() > 0:
            delta = {"days": diff.days, "hours": diff.seconds // 3600}
    return {
        "daughter_name": cfg.daughter_name,
        "daughter_nickname": cfg.daughter_nickname,
        "daddy_name": cfg.daddy_name,
        "days_together": cfg.days_together,
        "next_meeting": next_meeting.isoformat() if next_meeting else None,
        "next_meeting_delta": delta,
        "boot_greeting": cfg.boot_greeting,
        "wrong_pass_message": cfg.wrong_pass_message,
        "lock_help_message": cfg.lock_help_message,
        "security_question": cfg.security_question,
        "language": cfg.language,
        "theme": cfg.theme,
        "sound_enabled": cfg.sound_enabled,
        "font_scale": cfg.font_scale,
        "logo": _media(cfg.boot_logo),
        "boot_background": _media(cfg.boot_background),
        "lock_background": _media(cfg.lock_background),
        "desktop_background_day": _media(cfg.desktop_background_day),
        "desktop_background_night": _media(cfg.desktop_background_night),
        "is_birthday": bool(cfg.daughter_birthday and (cfg.daughter_birthday.month, cfg.daughter_birthday.day) == (today.month, today.day)),
        "is_anniversary": bool(cfg.anniversary and (cfg.anniversary.month, cfg.anniversary.day) == (today.month, today.day)),
        "has_passcode": bool(cfg.passcode_hash),
        "daughter_city": effective["city"],
        "live_location": live_payload,
    }


@api_view(["GET"])
def boot(request):
    """اطلاعات صفحه‌ی بوت و قفل + وضعیت نشست."""
    cfg = UserConfig.get_solo()
    session = get_session(request)
    recent_fails = UnlockAttempt.objects.filter(
        success=False, created_at__gte=timezone.now() - timedelta(minutes=30)
    ).count()
    return Response(
        {
            "config": public_config(cfg),
            "unlocked": session is not None,
            "failed_attempts": recent_fails,
            "show_help_button": recent_fails >= settings.LOVEOS["MAX_UNLOCK_ATTEMPTS"],
        }
    )


@api_view(["POST"])
def unlock(request):
    """باز کردن قفل با رمز. ۵ بار اشتباه → دکمه‌ی «کمک از بابا» (راز ۱۵)."""
    cfg = UserConfig.get_solo()
    code = str(request.data.get("passcode", ""))
    ip = request.META.get("REMOTE_ADDR")
    if cfg.check_passcode(code):
        UnlockAttempt.objects.create(success=True, ip=ip)
        UnlockAttempt.objects.filter(success=False).delete()
        session = DeviceSession.issue(
            hours=settings.LOVEOS["SESSION_TTL_HOURS"],
            user_agent=request.META.get("HTTP_USER_AGENT", "")[:255],
            ip=ip,
        )
        bump("login")
        log_activity("ورود دخترم", "lock")
        notify_daddy("login", f"{cfg.daughter_name} الان وارد LoveOS شد ❤")
        return Response({"ok": True, "token": session.token, "expires_at": session.expires_at})

    UnlockAttempt.objects.create(success=False, ip=ip)
    fails = UnlockAttempt.objects.filter(
        success=False, created_at__gte=timezone.now() - timedelta(minutes=30)
    ).count()
    payload = {
        "ok": False,
        "message": cfg.wrong_pass_message,
        "failed_attempts": fails,
        "show_help_button": fails >= settings.LOVEOS["MAX_UNLOCK_ATTEMPTS"],
    }
    if payload["show_help_button"]:
        payload["help_message"] = cfg.lock_help_message
    return Response(payload, status=200)


@api_view(["POST"])
def forgot(request):
    """سؤال امنیتی؛ پاسخ درست = باز شدن قفل."""
    cfg = UserConfig.get_solo()
    answer = str(request.data.get("answer", ""))
    if cfg.check_security_answer(answer):
        session = DeviceSession.issue(
            hours=settings.LOVEOS["SESSION_TTL_HOURS"],
            user_agent=request.META.get("HTTP_USER_AGENT", "")[:255],
            ip=request.META.get("REMOTE_ADDR"),
        )
        UnlockAttempt.objects.filter(success=False).delete()
        notify_daddy("forgot_ok", "دخترت با سؤال امنیتی وارد شد 🔑")
        return Response({"ok": True, "token": session.token})
    return Response({"ok": False, "message": "جوابش این نبود دخترم 🥺"})


@api_view(["POST"])
def ask_help(request):
    """دکمه‌ی «کمک از بابا» — به بابا پیام سروش می‌دهد."""
    cfg = UserConfig.get_solo()
    notify_daddy("lock_help", f"{cfg.daughter_name} پشت در مونده و رمز یادش رفته 🔐 کمکش کن باباجان")
    log_activity("درخواست کمک", "lock")
    return Response({"ok": True, "message": "به بابا خبر دادم، الان میاد کمکت ❤"})


@api_view(["POST"])
@require_session
def logout(request):
    request.loveos_session.delete()
    return Response({"ok": True})


@api_view(["GET"])
@require_session
def me(request):
    """پیکربندی کامل بعد از باز شدن قفل."""
    cfg = UserConfig.get_solo()
    eff = effective_daughter_location(cfg)
    data = public_config(cfg)
    data.update(
        {
            "daddy_city": cfg.daddy_city,
            "daddy_lat": cfg.daddy_lat,
            "daddy_lng": cfg.daddy_lng,
            "daddy_timezone": cfg.daddy_timezone,
            "daughter_city": eff["city"],
            "daughter_lat": eff["lat"],
            "daughter_lng": eff["lng"],
            "daughter_timezone": eff["timezone"],
            "daughter_is_live": eff["is_live"],
            "live_location": eff if eff["is_live"] else None,
            "today_message": cfg.today_message,
            "about_text": cfg.about_text,
            "birthday": cfg.daughter_birthday.isoformat() if cfg.daughter_birthday else None,
            "anniversary": cfg.anniversary.isoformat() if cfg.anniversary else None,
            "relationship_start": cfg.relationship_start.isoformat() if cfg.relationship_start else None,
            "allow_daughter_music_upload": cfg.allow_daughter_music_upload,
            "vault_open": request.loveos_session.vault_open,
        }
    )
    return Response(data)


BACKGROUND_FIELDS = ("lock_background", "desktop_background_day", "desktop_background_night")


@api_view(["GET", "POST", "PATCH", "PUT"])
@parser_classes([JSONParser, MultiPartParser, FormParser])
@require_session
def update_settings(request):
    """
    تنظیمات سمت دخترم: زبان، تم، صدا، اندازه فونت و تصاویر پس‌زمینه.

    • زبان/تم/صدا/فونت: JSON معمولی (PATCH با application/json)
    • تصاویر (پس‌زمینه‌ی قفل و دسکتاپ): multipart با فیلد عکس؛ مقدار خالی = حذف
      هر دو طرف (بابا و دخترم) می‌توانند این تصاویر را عوض کنند.
    """
    cfg = UserConfig.get_solo()
    if request.method == "GET":
        return Response({"ok": True, "config": public_config(cfg)})

    raw = request.data
    data = dict(raw.items()) if hasattr(raw, 'items') and not isinstance(raw, dict) else (raw if isinstance(raw, dict) else {})

    validators = {
        "language": ("fa", "en"),
        "theme": ("auto", "day", "night"),
    }
    for field in ("language", "theme"):
        if field in data and str(data[field]) in validators[field]:
            setattr(cfg, field, str(data[field]))
    if "sound_enabled" in data:
        val = data["sound_enabled"]
        # DRF JSON true/false, or string "true"/"false", or 0/1
        if isinstance(val, bool):
            cfg.sound_enabled = val
        elif isinstance(val, str):
            cfg.sound_enabled = val.lower() in ("true", "1", "yes", "on")
        else:
            cfg.sound_enabled = bool(val)
    if "font_scale" in data:
        try:
            cfg.font_scale = min(1.6, max(0.7, float(data["font_scale"])))
        except (TypeError, ValueError):
            pass

    changed_bg = []
    for field in BACKGROUND_FIELDS:
        upload = request.FILES.get(field)
        if upload is not None:
            setattr(cfg, field, upload)
            changed_bg.append(field)
        elif data.get(field) == "":
            setattr(cfg, field, None)
            changed_bg.append(f"{field}=reset")

    cfg.save()
    log_activity(
        "تغییر تنظیمات",
        "settings",
        (", ".join(sorted(data.keys())) + (" " if changed_bg else "") + " ".join(changed_bg))[:120],
    )
    return Response({"ok": True, "config": public_config(cfg)})


@api_view(["POST"])
@require_session
def vault_unlock(request):
    """رمز مجزای صندوقچه؛ نشست کوتاه‌مدت باز می‌کند."""
    cfg = UserConfig.get_solo()
    if cfg.check_vault_passcode(str(request.data.get("passcode", ""))):
        session = request.loveos_session
        session.vault_until = timezone.now() + timedelta(minutes=settings.LOVEOS["VAULT_SESSION_MINUTES"])
        session.save(update_fields=["vault_until"])
        log_activity("باز کردن صندوقچه", "vault")
        return Response({"ok": True, "until": session.vault_until})
    push_notification("system", "تلاش برای باز کردن صندوقچه", "رمز اشتباه بود")
    return Response({"ok": False, "message": "رمز صندوقچه درست نیست 🔐"})


# ----------------------------------------------------------- موقعیت زنده ---
def _location_json(cfg: UserConfig) -> dict:
    eff = effective_daughter_location(cfg)
    return {
        "lat": eff["lat"],
        "lng": eff["lng"],
        "accuracy": eff["accuracy"],
        "city": eff["city"],
        "timezone": eff["timezone"],
        "source": eff["source"],
        "captured_at": eff["captured_at"],
        "is_live": eff["is_live"],
    }


@api_view(["GET", "POST"])
@require_session
def location(request):
    cfg = UserConfig.get_solo()

    if request.method == "GET":
        return Response({"ok": True, "location": _location_json(cfg)})

    data = request.data if isinstance(request.data, dict) else {}
    try:
        lat = float(data.get("lat"))
        lng = float(data.get("lng"))
    except (TypeError, ValueError):
        return Response({"ok": False, "message": "مختصات نامعتبر است"}, status=400)
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return Response({"ok": False, "message": "مختصات بیرون از محدوده است"}, status=400)

    accuracy = data.get("accuracy")
    try:
        accuracy = int(accuracy) if accuracy is not None else None
    except (TypeError, ValueError):
        accuracy = None
    city = str(data.get("city") or "").strip()[:60]
    tz_name = str(data.get("timezone") or "").strip()[:60]

    previous = LiveLocation.current()
    live = LiveLocation.store(lat=lat, lng=lng, accuracy=accuracy, city=city, timezone_name=tz_name)

    moved_km = _distance_km(cfg.daughter_lat, cfg.daughter_lng, lat, lng)
    city_changed = bool(city) and city != cfg.daughter_city
    tz_changed = bool(tz_name) and tz_name != cfg.daughter_timezone
    should_sync = cfg.location_auto_sync and (
        moved_km >= cfg.location_sync_km or city_changed or tz_changed
    )

    if should_sync:
        old_city = cfg.daughter_city
        cfg.daughter_city = city or cfg.daughter_city
        cfg.daughter_lat = lat
        cfg.daughter_lng = lng
        cfg.daughter_timezone = tz_name or cfg.daughter_timezone
        cfg.save(update_fields=["daughter_city", "daughter_lat", "daughter_lng", "daughter_timezone", "updated_at"])
        log_activity(
            "به‌روزرسانی موقعیت",
            "location",
            f"{old_city} → {cfg.daughter_city} ({moved_km:.1f} کیلومتر)",
            moved_km=round(moved_km, 2),
        )
        if old_city != cfg.daughter_city:
            notify_daddy("location_change", f"📍 دخترم از «{old_city}» به «{cfg.daughter_city}» رسید")

    log_activity("ثبت موقعیت زنده", "location", f"{city or '—'} ({lat:.3f}, {lng:.3f})")
    return Response({"ok": True, "location": _location_json(cfg), "synced": should_sync, "moved_km": round(moved_km, 2)})


def _distance_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    import math

    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(max(0.0, min(1.0, a))))


# --------------------------------------------------------- جستجوی سراسری ---
@api_view(["GET"])
@require_session
def search(request):
    from core.search import log_query, run_search, smart_suggestions
    from core.services import cached

    cfg = UserConfig.get_solo()
    today = timezone.localdate().isoformat()

    if request.GET.get("suggest") in ("1", "true", "yes"):
        return Response({"items": cached(f"suggest:{today}", smart_suggestions, ttl=120)})

    query = str(request.GET.get("q") or "").strip()
    if len(query) < 2:
        return Response(
            {
                "query": query,
                "total": 0,
                "groups": [],
                "sources": [],
                "suggestions": cached(f"suggest:{today}", smart_suggestions, ttl=120),
            }
        )

    date_from = _parse_iso_date(request.GET.get("from"))
    date_to = _parse_iso_date(request.GET.get("to"))
    only = request.GET.get("app") or request.GET.get("kind") or ""
    disabled = cfg.search_disabled_sources or []

    cache_key = (
        f"search:{today}:{query}:{only}:{date_from}:{date_to}:{','.join(sorted(str(x) for x in disabled))}"
    )
    payload = cached(
        cache_key,
        lambda: run_search(
            query,
            disabled=disabled,
            only=only or None,
            date_from=date_from,
            date_to=date_to,
        ),
        ttl=45,
    )
    log_query(query)
    return Response(payload)


def _parse_iso_date(value):
    if not value:
        return None
    from datetime import date as date_cls

    try:
        return date_cls.fromisoformat(str(value)[:10])
    except ValueError:
        return None
