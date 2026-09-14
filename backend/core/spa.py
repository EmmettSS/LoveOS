"""
core.spa — سرو کردن فرانت‌اند SPA و فایل‌های static/media توسط خودِ جنگو

این ماژول فقط وقتی فعال می‌شود که SERVE_FRONTEND=True باشد؛ یعنی هاست‌هایی
مثل cPanel/Passenger که فقط «یک» اپ WSGI در اختیار کاربر می‌گذارند و nginx
برای جدا کردن فرانت‌اند از API وجود ندارد. در این حالت جنگو هم API را جواب
می‌دهد، هم اپ React ساخته‌شده (frontend/dist) و هم static/media را.

This module serves the built React app (frontend/dist) plus Django's
static/media files through the single WSGI app, for single-entry hosts
(cPanel/Passenger) where nginx isn't available.
"""
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404, HttpResponse
from django.views.static import serve


def _is_inside(child: Path, parent: Path) -> bool:
    """
    بررسی امن: آیا child واقعاً داخل parent است؟

    با resolve() مسیرها را (شامل symlinkها) به شکل مطلق در می‌آوریم و با
    relative_to چک می‌کنیم. اگر child خارج از parent باشد ValueError می‌گیریم
    و False برمی‌گردانیم — این یعنی path traversal ممکن نیست.

    Security: resolves both paths (so symlinks can't escape) and checks that
    `child` is really a descendant of `parent` before any file is served.
    """
    try:
        child.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def _serve_from_root(root, request, path):
    """
    سرو امن یک فایل از یک پوشه‌ی ریشه (media یا static).

    مسیر را resolve می‌کنیم، مطمئن می‌شویم داخل ریشه است و بعد فقط همان مسیر
    نسبی را به django.views.static.serve می‌دهیم (که خودش هم safe_join دارد).
    """
    if not path:
        raise Http404

    root = Path(root).resolve()
    candidate = (root / path).resolve()
    if not _is_inside(candidate, root):
        raise Http404

    return serve(request, str(candidate.relative_to(root)), document_root=str(root))


def spa(request, path: str = ""):
    """
    اپ تک‌صفحه‌ای React: اگر مسیر به یک فایل واقعی داخل dist اشاره داشت همان را
    بده؛ وگرنه index.html را برگردان (fallback مسیرهای داخلی SPA مثل /desktop).

    Single-page app entrypoint: real files are served as-is, everything else
    falls back to index.html so client-side routes like /desktop work.
    """
    dist = Path(settings.FRONTEND_DIST).resolve()

    # اگر پوشه‌ی build وجود نداشت، با پیام فارسی و کد 501 اطلاع بده
    if not dist.is_dir():
        return HttpResponse("فرانت‌اند هنوز build نشده است", status=501)

    # اگر مسیر به یک فایل واقعی داخل dist اشاره داشت، همان را بده
    if path:
        candidate = (dist / path).resolve()
        if _is_inside(candidate, dist) and candidate.is_file():
            return serve(request, str(candidate.relative_to(dist)), document_root=str(dist))

    # در غیر این صورت index.html (fallback مسیرهای داخلی SPA)
    index = dist / "index.html"
    if not index.is_file():
        return HttpResponse("فرانت‌اند هنوز build نشده است", status=501)

    response = FileResponse(open(index, "rb"), content_type="text/html")
    # index.html نباید کش شود تا آپدیت‌های جدید فوراً دیده شوند
    response["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response


def media_file(request, path):
    """سرو فایل‌های media (عکس پازل، ویس، آهنگ و…) با محافظت path traversal."""
    return _serve_from_root(settings.MEDIA_ROOT, request, path)


def static_file(request, path):
    """سرو فایل‌های static جنگو (collectstatic شده) با محافظت path traversal."""
    return _serve_from_root(settings.STATIC_ROOT, request, path)
