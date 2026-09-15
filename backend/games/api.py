"""API پازل قلب.

  GET    /api/puzzles             لیست پازل‌های فعال
  POST   /api/puzzles/upload      ساخت پازل توسط دخترم (عکس + عنوان + سطح)
  POST   /api/puzzles/<pk>/start  شروع بازی
  POST   /api/puzzles/<pk>/complete  تکمیل بازی
  DELETE /api/puzzles/<pk>       حذف (فقط پازل‌هایی که خودِ دختر ساخته)
"""
from __future__ import annotations

from django.db import transaction
from django.db.models import Prefetch, F
from PIL import Image, UnidentifiedImageError
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from core.auth import require_session
from core.services import bump, log_activity, push_notification
from core.soroush import notify_daddy
from core.utils import bounded_int, file_url
from games.models import Puzzle, PuzzleRecord

MAX_PUZZLE_IMAGE_BYTES = 10 * 1024 * 1024


def puzzle_json(p: Puzzle) -> dict:
    # این لیست با prefetch ساخته می‌شود؛ fallback برای استفاده‌ی پنل/تست‌هاست.
    records = getattr(p, "prefetched_records", None)
    record = records[0] if records else (PuzzleRecord.objects.filter(puzzle=p).first() if records is None else None)
    return {
        "id": p.id,
        "title": p.title,
        "level": p.level,
        "level_label": p.get_level_display(),
        "image": file_url(p.image),
        "hint_text": p.hint_text,
        "max_hints": p.max_hints,
        "best_time": record.best_time if record else 0,
        "plays": record.plays if record else 0,
        "completions": record.completions if record else 0,
        "created_by": p.created_by,
    }


def active_puzzles():
    """پازل‌های فعال را با رکوردشان در یک query اصلی و یک prefetch می‌خواند."""
    return Puzzle.objects.filter(is_active=True).prefetch_related(
        Prefetch("records", queryset=PuzzleRecord.objects.order_by("pk"), to_attr="prefetched_records")
    )


@api_view(["GET"])
@require_session
def puzzles(request):
    return Response({"items": [puzzle_json(p) for p in active_puzzles()]})


@api_view(["POST"])
@parser_classes([MultiPartParser, FormParser])
@require_session
def puzzle_upload(request):
    """دخترم خودش تصویر می‌فرستد و پازل می‌سازد؛ روی سرور ذخیره می‌شود."""
    image = request.FILES.get("image")
    if not image:
        return Response({"ok": False, "message": "یه عکس برای پازل انتخاب کن"}, status=400)
    if image.size > MAX_PUZZLE_IMAGE_BYTES:
        return Response({"ok": False, "message": "عکس پازل باید کوچک‌تر از ۱۰ مگابایت باشد"}, status=400)
    try:
        # ImageField به‌تنهایی محتوای فایل را validate نمی‌کند.
        with Image.open(image) as opened:
            opened.verify()
        image.seek(0)
    except (UnidentifiedImageError, OSError, ValueError):
        return Response({"ok": False, "message": "فایل انتخاب‌شده یک تصویر معتبر نیست"}, status=400)

    level = bounded_int(request.data.get("level"), default=3)
    if level not in (3, 4, 5):
        level = 3
    title = str(request.data.get("title") or "").strip()[:140]
    if not title:
        title = image.name.rsplit(".", 1)[0][:140] or "پازل من"
    p = Puzzle.objects.create(
        title=title,
        level=level,
        image=image,
        created_by="daughter",
        end_message="آفرین دخترم، خودت ساختیش و خودت حلش کردی! 🧩❤",
    )
    log_activity("ساخت پازل", "puzzle", title)
    notify_daddy("puzzle_created", f"دخترت با عکس خودش پازل ساخت 🧩 «{title}»")
    push_notification("system", "پازل جدید ساخته شد 🧩", title, action_app="puzzle")
    return Response({"ok": True, "item": puzzle_json(p)})


@api_view(["POST"])
@require_session
def puzzle_start(request, pk: int):
    with transaction.atomic():
        p = Puzzle.objects.filter(pk=pk, is_active=True).first()
        if not p:
            return Response({"ok": False}, status=404)
        record, _ = PuzzleRecord.objects.select_for_update().get_or_create(puzzle=p)
        PuzzleRecord.objects.filter(pk=record.pk).update(plays=F("plays") + 1)
        record.refresh_from_db(fields=["plays"])
    return Response({"ok": True, "plays": record.plays})


@api_view(["POST"])
@require_session
def puzzle_complete(request, pk: int):
    seconds = bounded_int(request.data.get("seconds"), default=0, minimum=0, maximum=24 * 60 * 60)
    with transaction.atomic():
        p = Puzzle.objects.filter(pk=pk, is_active=True).first()
        if not p:
            return Response({"ok": False}, status=404)
        record, _ = PuzzleRecord.objects.select_for_update().get_or_create(puzzle=p)
        record.completions += 1
        is_record = record.best_time == 0 or (0 < seconds < record.best_time)
        if is_record:
            record.best_time = seconds
        record.save(update_fields=["completions", "best_time", "updated_at"])

    bump("puzzle_done")
    log_activity("تکمیل پازل", "puzzle", p.title)
    notify_daddy("puzzle", f"دخترت پازل «{p.title}» رو حل کرد 🧩 ({seconds} ثانیه)")
    return Response(
        {
            "ok": True,
            "message": p.end_message,
            "voice": file_url(p.end_voice),
            "best_time": record.best_time,
            "new_record": is_record,
        }
    )


@api_view(["DELETE"])
@require_session
def puzzle_delete(request, pk: int):
    """دخترم فقط پازل‌هایی را پاک می‌کند که خودش ساخته."""
    p = Puzzle.objects.filter(pk=pk).first()
    if not p:
        return Response({"ok": False}, status=404)
    if p.created_by != "daughter":
        return Response({"ok": False, "message": "این پازل رو بابا ساخته"}, status=403)
    title = p.title
    p.delete()
    log_activity("حذف پازل", "puzzle", title)
    return Response({"ok": True})
