"""تحویل امن فایل‌های آپلودی با URL امضاشده و کوتاه‌عمر.

فایل‌های LoveOS خاطره/صدا/صندوقچه‌اند و نباید با مسیر خام /media قابل حدس باشند.
این endpoint برای img/audio/video هم مناسب است، چون URL امضا شده به header احراز
هویت مرورگر وابسته نیست.
"""
from __future__ import annotations

import mimetypes
from pathlib import Path
from urllib.parse import quote

from django.conf import settings
from django.core import signing
from django.http import FileResponse, Http404, HttpResponse
from django.views.decorators.http import require_GET

SIGNER_SALT = "loveos-private-media-v1"
SIGNATURE_MAX_AGE = 60 * 60  # یک ساعت؛ API در هر بار پاسخ URL تازه می‌سازد.


def signed_media_url(name: str) -> str:
    token = signing.TimestampSigner(salt=SIGNER_SALT).sign(name)
    return f"/api/media/{quote(name, safe='/')}?sig={quote(token, safe='')}"


def _safe_path(name: str) -> Path:
    root = Path(settings.MEDIA_ROOT).resolve()
    candidate = (root / name).resolve()
    if root != candidate and root not in candidate.parents:
        raise Http404
    return candidate


@require_GET
def protected_media(request, path: str):
    try:
        name = signing.TimestampSigner(salt=SIGNER_SALT).unsign(
            request.GET.get("sig", ""), max_age=SIGNATURE_MAX_AGE
        )
    except signing.BadSignature:
        return HttpResponse("Not found", status=404)
    if name != path:
        return HttpResponse("Not found", status=404)

    file_path = _safe_path(name)
    if not file_path.is_file():
        raise Http404
    content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
    # SVG/HTML آپلودی را inline اجرا نکن؛ این endpoint فقط برای media مصرفی است.
    if content_type in {"image/svg+xml", "text/html", "application/xhtml+xml"}:
        content_type = "application/octet-stream"
    response = FileResponse(file_path.open("rb"), content_type=content_type)
    response["Cache-Control"] = "private, max-age=300"
    response["X-Content-Type-Options"] = "nosniff"
    safe_name = file_path.name.replace('"', "").replace("\r", "").replace("\n", "")
    response["Content-Disposition"] = f'inline; filename="{safe_name}"'
    response["Cross-Origin-Resource-Policy"] = "same-origin"
    response["Referrer-Policy"] = "same-origin"
    return response
