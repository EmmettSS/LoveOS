"""
language.api — اندپوینت‌های پل زبان

  GET    /api/language/overview           دیکشنری + دسته‌ها + پیشرفت + پیشنهاد تمرین
  GET    /api/language/entries            لیست ورودی‌ها (+ فیلتر نوع/دسته/زبان + جستجو)
  POST   /api/language/entries            افزودن کلمه یا اصطلاح (با فایل تلفظ)
  PATCH  /api/language/entries/<pk>       ویرایش (و آپلود تلفظ از خود اپ)
  DELETE /api/language/entries/<pk>       حذف
  GET    /api/language/entries/<pk>/audio پخش تلفظ (فایل ضمیمه)
  GET    /api/language/categories         دسته‌ها
  GET    /api/language/flashcards         کارت‌های فلش (با فیلتر دسته)
  POST   /api/language/practice           ثبت نتیجه‌ی فلش‌کارت → streak و شمارش کلمات
  GET    /api/language/quiz               سؤال‌های کوییز (از پنل بابا)
  POST   /api/language/quiz/submit        ثبت پاسخ کوییز
  GET    /api/language/stats              پیشرفت هر دو طرف
"""
from __future__ import annotations

import random

from django.db.models import Q
from rest_framework.decorators import api_view
from rest_framework.response import Response

from accounts.models import UserConfig
from core.auth import require_session
from core.services import bump, log_activity, push_notification
from core.soroush import notify_daddy
from core.utils import bounded_int, fa_digits, file_url, validate_upload
from language.models import (
    LANGUAGES,
    OWNER,
    LanguageAttempt,
    LanguageCategory,
    LanguageEntry,
    LanguageProgress,
    LanguageQuiz,
)

OWNER_LABEL = dict(OWNER)
LANG_LABEL = dict(LANGUAGES)


def _label(owner: str) -> str:
    cfg = UserConfig.get_solo()
    return (cfg.daddy_name or "بابا") if owner == "daddy" else (cfg.daughter_nickname or cfg.daughter_name or "دخترم")


def _owner_from(data: dict, default: str = "daughter") -> str:
    value = str(data.get("owner") or data.get("added_by") or default)
    return value if value in OWNER_LABEL else default


def _entry_json(e: LanguageEntry) -> dict:
    return {
        "id": e.id,
        "kind": e.kind,
        "kind_label": e.get_kind_display(),
        "text": e.text,
        "language": e.language,
        "language_label": e.get_language_display(),
        "translations": e.translations or {},
        "translation_labels": e.translation_labels,
        "literal_meaning": e.literal_meaning,
        "real_meaning": e.real_meaning,
        "example": e.example,
        "pronunciation": file_url(e.pronunciation),
        "category": e.category_id,
        "category_name": e.category.name if e.category else "",
        "category_icon": e.category.icon if e.category else "💬",
        "added_by": e.added_by,
        "added_by_label": _label(e.added_by),
        "created_at": e.created_at.isoformat(),
    }


# ------------------------------------------------------------------ دیکشنری --
@api_view(["GET", "POST"])
@require_session
def entries(request):
    if request.method == "GET":
        qs = LanguageEntry.objects.filter(is_active=True).select_related("category")
        kind = request.GET.get("kind")
        if kind in dict(LanguageEntry._meta.get_field("kind").choices):
            qs = qs.filter(kind=kind)
        category = request.GET.get("category")
        if category and str(category).isdigit():
            qs = qs.filter(category_id=int(category))
        language = request.GET.get("language")
        if language in LANG_LABEL:
            qs = qs.filter(language=language)
        text = (request.GET.get("q") or "").strip()
        if text:
            qs = qs.filter(
                Q(text__icontains=text)
                | Q(literal_meaning__icontains=text)
                | Q(real_meaning__icontains=text)
                | Q(example__icontains=text)
            )
        return Response({"items": [_entry_json(e) for e in qs[:300]]})

    data = request.data if isinstance(request.data, dict) else {}
    text_value = str(data.get("text") or "").strip()
    if not text_value:
        return Response({"ok": False, "message": "کلمه یا اصطلاح را بنویس"}, status=400)

    translations = data.get("translations") or {}
    if not isinstance(translations, dict):
        translations = {}
    translations = {k: str(v).strip()[:200] for k, v in translations.items() if str(v).strip()}

    entry = LanguageEntry.objects.create(
        kind=data.get("kind") if data.get("kind") in dict(LanguageEntry._meta.get_field("kind").choices) else "word",
        text=text_value[:200],
        language=data.get("language") if data.get("language") in LANG_LABEL else "mzn",
        translations=translations,
        literal_meaning=str(data.get("literal_meaning") or "")[:255],
        real_meaning=str(data.get("real_meaning") or "")[:255],
        example=str(data.get("example") or "")[:255],
        added_by=_owner_from(data, "daughter"),
    )
    if data.get("category"):
        entry.category = LanguageCategory.objects.filter(pk=data["category"]).first()
    audio = request.FILES.get("pronunciation")
    upload_error = validate_upload(audio, "audio")
    if upload_error:
        return Response({"ok": False, "message": upload_error}, status=400)
    if audio:
        entry.pronunciation = audio
    entry.save()

    if entry.added_by == "daddy":
        push_notification(
            "language",
            f"{_label('daddy')} یه {entry.get_kind_display()} جدید {entry.get_language_display()} اضافه کرد 💬",
            entry.text,
            icon="language",
            action_app="language",
        )
        notify_daddy("language_entry", f"💬 {entry.get_kind_display()} جدید: {entry.text}")
    else:
        push_notification(
            "language", f"یه {entry.get_kind_display()} جدید در پل زبان 💬", entry.text, icon="language", action_app="language"
        )
        notify_daddy(
            "language_entry",
            f"💬 {_label('daughter')} یه {entry.get_kind_display()} جدید گذاشت: {entry.text}",
        )

    bump("language_entries")
    log_activity("افزودن کلمه/اصطلاح", "language", entry.text[:60])
    return Response({"ok": True, "item": _entry_json(entry)})


@api_view(["GET", "PATCH", "POST", "DELETE"])
@require_session
def entry_item(request, pk: int):
    entry = LanguageEntry.objects.filter(pk=pk).first()
    if not entry:
        return Response({"ok": False}, status=404)
    if request.method == "GET":
        return Response({"item": _entry_json(entry)})
    if request.method == "DELETE":
        entry.is_active = False
        entry.save(update_fields=["is_active", "updated_at"])
        return Response({"ok": True})

    data = request.data if isinstance(request.data, dict) else {}
    for field, limit in (("text", 200), ("literal_meaning", 255), ("real_meaning", 255), ("example", 255)):
        if field in data:
            setattr(entry, field, str(data[field])[:limit])
    if data.get("language") in LANG_LABEL:
        entry.language = data["language"]
    if data.get("kind") in dict(LanguageEntry._meta.get_field("kind").choices):
        entry.kind = data["kind"]
    if isinstance(data.get("translations"), dict):
        entry.translations = {k: str(v).strip()[:200] for k, v in data["translations"].items() if str(v).strip()}
    if "category" in data:
        entry.category = LanguageCategory.objects.filter(pk=data["category"]).first() if data["category"] else None
    audio = request.FILES.get("pronunciation")
    upload_error = validate_upload(audio, "audio")
    if upload_error:
        return Response({"ok": False, "message": upload_error}, status=400)
    if audio:
        entry.pronunciation = audio
    entry.save()
    log_activity("ویرایش کلمه/اصطلاح", "language", entry.text[:60])
    return Response({"ok": True, "item": _entry_json(entry)})


@api_view(["GET"])
@require_session
def categories(request):
    items = LanguageCategory.objects.filter(is_active=True)
    return Response(
        {
            "items": [
                {"id": c.id, "name": c.name, "icon": c.icon, "detail": c.detail, "count": c.entries.count()}
                for c in items
            ],
            "languages": [{"key": k, "label": v} for k, v in LANGUAGES],
        }
    )


# -------------------------------------------------------------- تمرین‌ها ---
@api_view(["GET"])
@require_session
def flashcards(request):
    """کارت‌های فلش؛ به‌صورت تصادفی و با اولویت کلماتی که یاد نگرفته‌ایم."""
    owner = request.GET.get("owner") if request.GET.get("owner") in OWNER_LABEL else "daughter"
    target = request.GET.get("target") if request.GET.get("target") in LANG_LABEL else "tr"
    count = bounded_int(request.GET.get("count", 12), default=12, minimum=1, maximum=50)

    qs = list(LanguageEntry.objects.filter(is_active=True).select_related("category"))
    category = request.GET.get("category")
    if category and str(category).isdigit():
        qs = [e for e in qs if e.category_id == int(category)]

    known = set(LanguageProgress.get_for(owner).learned_ids or [])
    fresh = [e for e in qs if e.id not in known]
    random.shuffle(fresh)
    cards = fresh[:count] or qs[:count]
    return Response(
        {
            "items": [e.to_flashcard(target) for e in cards],
            "remaining": len([e for e in qs if e.id not in known]),
            "total": len(qs),
        }
    )


@api_view(["POST"])
@require_session
def practice(request):
    """ثبت یک دور تمرین: کدام کلمه‌ها را یاد گرفتی، امتیاز و streak."""
    data = request.data if isinstance(request.data, dict) else {}
    owner = _owner_from(data, "daughter")
    mode = data.get("mode") if data.get("mode") in ("flash", "quiz") else "flash"
    learned_ids = data.get("learned_ids") or []
    if not isinstance(learned_ids, list):
        learned_ids = []
    correct = bounded_int(data.get("correct") or 0, default=0, minimum=0, maximum=1000)
    total = bounded_int(data.get("total") or 0, default=0, minimum=0, maximum=1000)

    progress = LanguageProgress.get_for(owner)
    candidate_ids = {bounded_int(entry_id, default=-1, minimum=-1) for entry_id in learned_ids[:200]}
    valid_ids = set(LanguageEntry.objects.filter(is_active=True, id__in=candidate_ids).values_list("id", flat=True))
    for entry_id in valid_ids:
        progress.mark_learned(entry_id)
    progress.save()

    LanguageAttempt.objects.create(owner=owner, mode=mode, correct=correct, total=total)
    bump("language_practiced")

    if data.get("notify_partner", True):
        push_notification(
            "language",
            f"{_label(owner)} امروز {fa_digits(len(valid_ids))} کلمه‌ی جدید یاد گرفت 💬",
            f"🔥 {fa_digits(progress.streak)} روز پشت‌سرهم",
            icon="language",
            action_app="language",
        )
        notify_daddy(
            "language_practice",
            f"💬 {_label(owner)} تمرین زبان کرد — {fa_digits(correct)}/{fa_digits(total)} درست، "
            f"{fa_digits(progress.streak)} روز پشت‌سرهم 🔥",
        )
    log_activity("تمرین زبان", "language", f"{mode} {correct}/{total}")
    return Response({"ok": True, "progress": _progress_json(owner)})


def _progress_json(owner: str) -> dict:
    p = LanguageProgress.get_for(owner)
    return {
        "owner": owner,
        "owner_label": _label(owner),
        "learned_count": p.learned_count,
        "streak": p.streak,
        "best_streak": p.best_streak,
        "last_practiced": p.last_practiced.isoformat() if p.last_practiced else None,
        "total_entries": LanguageEntry.objects.filter(is_active=True).count(),
    }


# --------------------------------------------------------------- کوییز ----
@api_view(["GET"])
@require_session
def quiz(request):
    """سؤال‌های کوییز — همه از پنل بابا؛ گزینه‌ها در لحظه شافل می‌شوند."""
    count = bounded_int(request.GET.get("count", 8), default=8, minimum=1, maximum=30)

    qs = list(LanguageQuiz.objects.filter(is_active=True).select_related("category"))
    random.shuffle(qs)
    items = []
    for q in qs[:count]:
        options = [str(o) for o in (q.options or []) if str(o).strip()]
        if q.answer not in options:
            options.append(q.answer)
        random.shuffle(options)
        items.append(
            {
                "id": q.id,
                "question": q.question,
                "options": options,
                "category": q.category.name if q.category else "",
                "category_icon": q.category.icon if q.category else "💬",
                "feedback": q.fun_feedback,
            }
        )
    return Response({"items": items, "count": len(items)})


@api_view(["POST"])
@require_session
def quiz_submit(request):
    data = request.data if isinstance(request.data, dict) else {}
    owner = _owner_from(data, "daughter")
    answers = data.get("answers") or []
    if not isinstance(answers, list):
        answers = []

    correct = 0
    details = []
    for row in answers[:50]:
        if not isinstance(row, dict):
            continue
        question = LanguageQuiz.objects.filter(pk=row.get("id")).first()
        if not question:
            continue
        given = str(row.get("answer") or "")
        is_ok = given.strip() == question.answer.strip()
        correct += 1 if is_ok else 0
        details.append(
            {
                "id": question.id,
                "given": given,
                "answer": question.answer,
                "correct": is_ok,
                "feedback": question.fun_feedback,
                "explanation": question.question,
            }
        )

    total = len(details)
    LanguageAttempt.objects.create(owner=owner, mode="quiz", correct=correct, total=total)
    progress = LanguageProgress.get_for(owner)
    if total:
        # streak فقط با تمرین واقعی جلو می‌رود (نه با باز کردن صفحه)
        from django.utils import timezone

        today = timezone.localdate()
        if progress.last_practiced != today:
            if progress.last_practiced and (today - progress.last_practiced).days == 1:
                progress.streak += 1
            else:
                progress.streak = 1
            progress.best_streak = max(progress.best_streak, progress.streak)
            progress.last_practiced = today
            progress.save()
    bump("language_quiz")

    if total:
        notify_daddy("language_quiz", f"💬 {_label(owner)} کوییز زبان داد: {fa_digits(correct)} از {fa_digits(total)}")
    return Response(
        {
            "ok": True,
            "correct": correct,
            "total": total,
            "details": details,
            "progress": _progress_json(owner),
            "message": "آفرین دخترم! 🌟" if total and correct == total else "خوب بود! دفعه‌ی بعد بهتر ❤",
        }
    )


def _stats_payload() -> dict:
    entries = LanguageEntry.objects.filter(is_active=True)
    return {
        "words": entries.filter(kind="word").count(),
        "idioms": entries.filter(kind="idiom").count(),
        "with_audio": entries.exclude(pronunciation="").count(),
        "quiz_count": LanguageQuiz.objects.filter(is_active=True).count(),
        "progress": [_progress_json("daddy"), _progress_json("daughter")],
        "by_language": [
            {"key": key, "label": label, "count": entries.filter(language=key).count()} for key, label in LANGUAGES
        ],
    }


@api_view(["GET"])
@require_session
def stats(request):
    return Response(_stats_payload())


@api_view(["GET"])
@require_session
def overview(request):
    entries_qs = LanguageEntry.objects.filter(is_active=True).select_related("category")
    return Response(
        {
            "entries": [_entry_json(e) for e in entries_qs[:200]],
            "categories": [
                {"id": c.id, "name": c.name, "icon": c.icon, "detail": c.detail, "count": c.entries.count()}
                for c in LanguageCategory.objects.filter(is_active=True)
            ],
            "languages": [{"key": k, "label": v} for k, v in LANGUAGES],
            "stats": _stats_payload(),
        }
    )
