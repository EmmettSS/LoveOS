"""API پازل قلب.

  GET    /api/puzzles             لیست پازل‌های فعال
  POST   /api/puzzles/upload      ساخت پازل توسط دخترم (عکس + عنوان + سطح)
  POST   /api/puzzles/<pk>/start  شروع بازی
  POST   /api/puzzles/<pk>/complete  تکمیل بازی
  DELETE /api/puzzles/<pk>       حذف (فقط پازل‌هایی که خودِ دختر ساخته)
"""
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from core.auth import require_session
from core.services import bump, log_activity, push_notification
from core.soroush import notify_daddy
from games.models import Puzzle, PuzzleRecord


def puzzle_json(p: Puzzle) -> dict:
    record = PuzzleRecord.objects.filter(puzzle=p).first()
    return {
        "id": p.id,
        "title": p.title,
        "level": p.level,
        "level_label": p.get_level_display(),
        "image": p.image.url if p.image else None,
        "hint_text": p.hint_text,
        "max_hints": p.max_hints,
        "best_time": record.best_time if record else 0,
        "plays": record.plays if record else 0,
        "completions": record.completions if record else 0,
        "created_by": p.created_by,
    }


@api_view(["GET"])
@require_session
def puzzles(request):
    return Response({"items": [puzzle_json(p) for p in Puzzle.objects.filter(is_active=True)]})


@api_view(["POST"])
@parser_classes([MultiPartParser, FormParser])
@require_session
def puzzle_upload(request):
    """دخترم خودش تصویر می‌فرستد و پازل می‌سازد؛ روی سرور ذخیره می‌شود."""
    image = request.FILES.get("image")
    if not image:
        return Response({"ok": False, "message": "یه عکس برای پازل انتخاب کن"}, status=400)
    level = int(request.data.get("level") or 3)
    if level not in (3, 4, 5):
        level = 3
    title = str(request.data.get("title") or image.name.rsplit(".", 1)[0])[:140]
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
    p = Puzzle.objects.filter(pk=pk).first()
    if not p:
        return Response({"ok": False}, status=404)
    record, _ = PuzzleRecord.objects.get_or_create(puzzle=p)
    record.plays += 1
    record.save(update_fields=["plays"])
    return Response({"ok": True, "plays": record.plays})


@api_view(["POST"])
@require_session
def puzzle_complete(request, pk: int):
    p = Puzzle.objects.filter(pk=pk).first()
    if not p:
        return Response({"ok": False}, status=404)
    seconds = int(request.data.get("seconds") or 0)
    record, _ = PuzzleRecord.objects.get_or_create(puzzle=p)
    record.completions += 1
    is_record = record.best_time == 0 or (0 < seconds < record.best_time)
    if is_record:
        record.best_time = seconds
    record.save()
    bump("puzzle_done")
    log_activity("تکمیل پازل", "puzzle", p.title)
    notify_daddy("puzzle", f"دخترت پازل «{p.title}» رو حل کرد 🧩 ({seconds} ثانیه)")
    return Response(
        {
            "ok": True,
            "message": p.end_message,
            "voice": p.end_voice.url if p.end_voice else None,
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
