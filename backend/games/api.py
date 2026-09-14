"""API پازل قلب."""
from rest_framework.decorators import api_view
from rest_framework.response import Response

from core.auth import require_session
from core.services import bump, log_activity
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
    }


@api_view(["GET"])
@require_session
def puzzles(request):
    return Response({"items": [puzzle_json(p) for p in Puzzle.objects.filter(is_active=True)]})


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
