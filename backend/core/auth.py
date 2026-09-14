"""
core.auth — احراز هویت ساده‌ی LoveOS
یک کاربر (دخترم) + توکن نشست. هیچ سیستم ثبت‌نامی وجود ندارد.
"""
from functools import wraps

from django.http import JsonResponse
from rest_framework.response import Response

from accounts.models import DeviceSession


def get_session(request) -> DeviceSession | None:
    """توکن را از هدر Authorization یا پارامتر ?t= می‌خواند."""
    token = ""
    header = request.META.get("HTTP_AUTHORIZATION", "")
    if header.lower().startswith("token "):
        token = header[6:].strip()
    if not token:
        token = request.GET.get("t", "") or request.headers.get("X-LoveOS-Token", "")
    if not token:
        return None
    session = DeviceSession.objects.filter(token=token).first()
    if session and session.is_valid:
        return session
    return None


def require_session(view_func):
    """دکوراتور: فقط با نشست معتبر (برای viewهای DRF تابعی)."""

    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        session = get_session(request)
        if session is None:
            return Response({"detail": "قفله دخترم 🔒", "code": "locked"}, status=401)
        request.loveos_session = session
        return view_func(request, *args, **kwargs)

    return wrapper


def require_session_plain(view_func):
    """نسخه‌ی Django خالص (برای serve media)."""

    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        session = get_session(request)
        if session is None:
            return JsonResponse({"detail": "locked"}, status=401)
        request.loveos_session = session
        return view_func(request, *args, **kwargs)

    return wrapper
