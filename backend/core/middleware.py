"""
core.middleware — دروازه‌ی پنل بابا و هدر noindex

AdminGateMiddleware:
    قبل از صفحه‌ی لاگین جنگو یک رمز ساده می‌پرسد (لایه‌ی دوم امنیتی).
    اگر ADMIN_GATE_PASSCODE خالی باشد، دروازه غیرفعال است.

NoIndexMiddleware:
    به همه‌ی پاسخ‌ها هدر X-Robots-Tag: noindex می‌دهد تا این دنیای کوچک
    هیچ‌وقت در موتورهای جست‌وجو پیدا نشود.
"""
from django.conf import settings
from django.http import HttpResponse
from django.shortcuts import render
from django.utils.html import escape

GATE_SESSION_KEY = "loveos_admin_gate"


class AdminGateMiddleware:
    """دروازه‌ی رمزدار جلوی مسیر مخفی پنل بابا."""

    def __init__(self, get_response):
        self.get_response = get_response
        self.prefix = f"/{settings.ADMIN_PATH}/"

    def __call__(self, request):
        passcode = settings.ADMIN_GATE_PASSCODE
        if not passcode or not request.path.startswith(self.prefix):
            return self.get_response(request)

        if request.session.get(GATE_SESSION_KEY):
            return self.get_response(request)

        # فرم دروازه ارسال شده است
        if request.method == "POST" and "gate" in request.POST:
            if request.POST.get("gate") == passcode:
                request.session[GATE_SESSION_KEY] = True
                # ریدایرکت نرم به همان آدرس تا فرم دوباره ارسال نشود
                return HttpResponse(
                    '<meta http-equiv="refresh" content="0;url=' + escape(request.path) + '">'
                )
            return render(request, "admin_gate.html", {"error": "رمز درست نیست"}, status=401)

        return render(request, "admin_gate.html", {"error": ""}, status=401)


class NoIndexMiddleware:
    """هیچ موتور جست‌وجویی نباید این‌جا را ببیند."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response["X-Robots-Tag"] = "noindex, nofollow, noarchive"
        return response
