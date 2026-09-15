"""سرو کردن فرانت‌اند SPA و static توسط خودِ جنگو.

این ماژول برای هاست‌های تک‌ورودی cPanel/Passenger است. فایل‌های media خصوصی
از endpoint جداگانه‌ی URL امضاشده در ``core.media`` تحویل داده می‌شوند.
"""
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404, HttpResponse
from django.views.static import serve


def _is_inside(child: Path, parent: Path) -> bool:
    """بررسی می‌کند مسیر فرزند واقعاً داخل پوشه‌ی والد باشد."""
    try:
        child.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def _serve_from_root(root, request, path):
    """یک فایل static را بدون اجازه‌ی path traversal سرو می‌کند."""
    if not path:
        raise Http404
    root = Path(root).resolve()
    candidate = (root / path).resolve()
    if not _is_inside(candidate, root):
        raise Http404
    return serve(request, str(candidate.relative_to(root)), document_root=str(root))


def spa(request, path: str = ""):
    """فایل build شده یا fallback مربوط به مسیرهای داخلی React را برمی‌گرداند."""
    dist = Path(settings.FRONTEND_DIST).resolve()
    if not dist.is_dir():
        return HttpResponse("فرانت‌اند هنوز build نشده است", status=501)

    if path:
        candidate = (dist / path).resolve()
        if _is_inside(candidate, dist) and candidate.is_file():
            return serve(request, str(candidate.relative_to(dist)), document_root=str(dist))

    index = dist / "index.html"
    if not index.is_file():
        return HttpResponse("فرانت‌اند هنوز build نشده است", status=501)
    response = FileResponse(index.open("rb"), content_type="text/html")
    response["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response


def static_file(request, path):
    """سرو فایل‌های static جنگو (collectstatic شده) با محافظت path traversal."""
    return _serve_from_root(settings.STATIC_ROOT, request, path)
