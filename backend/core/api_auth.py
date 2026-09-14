"""
API — قفل، باز کردن قفل، نشست، پیکربندی عمومی
Endpoints: /api/boot, /api/auth/unlock, /api/auth/forgot, /api/auth/help, /api/auth/logout
"""
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from accounts.models import DeviceSession, UnlockAttempt, UserConfig
from core.auth import get_session, require_session
from core.services import bump, log_activity, push_notification
from core.soroush import notify_daddy


def _media(field) -> str | None:
    try:
        return field.url if field else None
    except ValueError:
        return None


def public_config(cfg: UserConfig) -> dict:
    """اطلاعاتی که حتی پشت صفحه‌ی قفل لازم است (بدون هیچ رازی)."""
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
    data = public_config(cfg)
    data.update(
        {
            "daddy_city": cfg.daddy_city,
            "daddy_lat": cfg.daddy_lat,
            "daddy_lng": cfg.daddy_lng,
            "daddy_timezone": cfg.daddy_timezone,
            "daughter_city": cfg.daughter_city,
            "daughter_lat": cfg.daughter_lat,
            "daughter_lng": cfg.daughter_lng,
            "daughter_timezone": cfg.daughter_timezone,
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


@api_view(["POST"])
@require_session
def update_settings(request):
    """تنظیمات سمت دخترم: زبان، تم، صدا، اندازه فونت."""
    cfg = UserConfig.get_solo()
    for field in ("language", "theme", "sound_enabled", "font_scale"):
        if field in request.data:
            setattr(cfg, field, request.data[field])
    cfg.save()
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
