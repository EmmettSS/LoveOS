"""
API محتوای احساسی: ویس، موسیقی، خاطره، نامه، شمارش معکوس، باغچه، ستاره‌ها،
سینما، کوییز، آرزوها، حال دل، صندوقچه، آموزش.
"""
import random

from django.utils import timezone
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from accounts.models import UserConfig
from content.models import (
    CinemaItem,
    Constellation,
    Countdown,
    Flower,
    FlowerMessage,
    FuturePlan,
    Letter,
    Memory,
    MoodLog,
    MoodMessage,
    CustomMood,
    QuizQuestion,
    QuizResult,
    QuizReward,
    Song,
    TutorialChapter,
    VaultItem,
    Voice,
)
from core.auth import require_session
from core.services import bump, log_activity, push_notification
from core.soroush import notify_daddy
from core.utils import bounded_int, file_url, validate_upload


# ------------------------------------------------------------------ ویس ----
def voice_json(v: Voice) -> dict:
    return {
        "id": v.id,
        "title": v.title,
        "category": v.category,
        "category_label": v.get_category_display(),
        "audio": file_url(v.audio),
        "note": v.note,
        "duration": v.duration,
        "play_count": v.play_count,
    }


@api_view(["GET"])
@require_session
def voices(request):
    qs = Voice.objects.filter(is_active=True)
    category = request.GET.get("category")
    if category and category != "random":
        qs = qs.filter(category=category)
    return Response({"items": [voice_json(v) for v in qs]})


@api_view(["GET"])
@require_session
def voice_random(request):
    qs = list(Voice.objects.filter(is_active=True))
    if not qs:
        return Response({"item": None})
    return Response({"item": voice_json(random.choice(qs))})


@api_view(["POST"])
@require_session
def voice_played(request, pk: int):
    v = Voice.objects.filter(pk=pk).first()
    if not v:
        return Response({"ok": False}, status=404)
    v.play_count += 1
    v.save(update_fields=["play_count"])
    bump("voice_played")
    log_activity("پخش ویس", "voice", v.title)
    notify_daddy("voice_played", f"دخترت ویس «{v.title}» رو گوش داد 🎧")
    return Response({"ok": True})


# ----------------------------------------------------------------- آهنگ ----
def song_json(s: Song) -> dict:
    return {
        "id": s.id,
        "title": s.title,
        "artist": s.artist,
        "audio": file_url(s.audio),
        "cover": file_url(s.cover),
        "is_main": s.is_main,
        "why_this_song": s.why_this_song,
        "lyrics": s.lyrics,
        "uploaded_by": s.uploaded_by,
        "play_count": s.play_count,
    }


@api_view(["GET"])
@require_session
def songs(request):
    return Response({"items": [song_json(s) for s in Song.objects.filter(is_active=True)]})


@api_view(["POST"])
@parser_classes([MultiPartParser, FormParser])
@require_session
def song_upload(request):
    """آپلود موسیقی توسط دخترم (اگر بابا اجازه داده باشد)."""
    cfg = UserConfig.get_solo()
    if not cfg.allow_daughter_music_upload:
        return Response({"ok": False, "message": "فعلاً آپلود موسیقی خاموشه دخترم"}, status=403)
    audio = request.FILES.get("audio")
    if not audio:
        return Response({"ok": False, "message": "فایل آهنگ رو انتخاب کن"}, status=400)
    upload_error = validate_upload(audio, "audio") or validate_upload(request.FILES.get("cover"), "image")
    if upload_error:
        return Response({"ok": False, "message": upload_error}, status=400)
    song = Song.objects.create(
        title=request.data.get("title") or audio.name.rsplit(".", 1)[0],
        artist=request.data.get("artist", ""),
        audio=audio,
        cover=request.FILES.get("cover"),
        uploaded_by="daughter",
    )
    log_activity("آپلود آهنگ", "music", song.title)
    notify_daddy("song_uploaded", f"دخترت یه آهنگ جدید اضافه کرد 🎵 «{song.title}»")
    push_notification("system", "آهنگت اضافه شد 🎵", song.title, action_app="music")
    return Response({"ok": True, "item": song_json(song)})


@api_view(["DELETE"])
@require_session
def song_delete(request, pk: int):
    """دخترم فقط آهنگ‌های خودش را می‌تواند پاک کند."""
    song = Song.objects.filter(pk=pk, uploaded_by="daughter").first()
    if not song:
        return Response({"ok": False, "message": "این آهنگ مال بابائه، نمی‌تونم پاکش کنم"}, status=403)
    song.delete()
    return Response({"ok": True})


@api_view(["POST"])
@require_session
def song_played(request, pk: int):
    s = Song.objects.filter(pk=pk).first()
    if not s:
        return Response({"ok": False}, status=404)
    s.play_count += 1
    s.save(update_fields=["play_count"])
    if s.is_main:
        bump("main_song_play")
    log_activity("پخش آهنگ", "music", s.title)
    return Response({"ok": True, "play_count": s.play_count})


# ---------------------------------------------------------------- خاطره ----
def memory_json(m: Memory) -> dict:
    locked = m.is_future and not m.is_unlocked
    return {
        "id": m.id,
        "title": m.title if not locked else "؟؟؟",
        "text": "" if locked else m.text,
        "photo": None if locked else file_url(m.photo),
        "happened_on": m.happened_on.isoformat() if m.happened_on else None,
        "place": "" if locked else m.place,
        "is_future": m.is_future,
        "locked": locked,
        "locked_text": m.locked_text,
        "unlock_at": m.unlock_at.isoformat() if m.unlock_at else None,
        "voice": file_url(m.voice.audio) if m.voice else None,
    }


@api_view(["GET", "POST"])
@parser_classes([MultiPartParser, FormParser])
@require_session
def memories(request):
    if request.method == "POST":
        title = str(request.data.get("title") or "خاطره‌ی من").strip()[:160]
        text = str(request.data.get("text") or "").strip()
        place = str(request.data.get("place") or "").strip()[:140]
        is_future = str(request.data.get("is_future") or "").lower() in ("1", "true", "yes", "on")
        happened_on = request.data.get("happened_on")
        # تاریخ اختیاری
        from datetime import date as date_cls
        parsed_date = None
        if happened_on:
            try:
                parsed_date = date_cls.fromisoformat(str(happened_on)[:10])
            except Exception:
                parsed_date = None
        photo = request.FILES.get("photo")
        voice_file = request.FILES.get("voice")
        upload_error = validate_upload(photo, "image") or validate_upload(voice_file, "audio")
        if upload_error:
            return Response({"ok": False, "message": upload_error}, status=400)
        m = Memory.objects.create(
            title=title,
            text=text,
            place=place,
            is_future=is_future,
            happened_on=parsed_date,
            photo=photo,
        )
        # اگر ویس هم فرستاده شده باشد، یک Voice بسازیم و وصل کنیم
        if voice_file:
            v = Voice.objects.create(
                title=f"{title} - ویس",
                category="random",
                audio=voice_file,
            )
            m.voice = v
            m.save(update_fields=["voice"])
        log_activity("ثبت خاطره", "memories", f"{'آینده' if is_future else 'گذشته'}: {title}")
        notify_daddy("memory_add", f"دخترت یه خاطره‌ی {'آینده' if is_future else 'گذشته'} اضافه کرد ✨ «{title}»")
        return Response({"ok": True, "item": memory_json(m)})
    qs = Memory.objects.filter(is_active=True)
    return Response({"items": [memory_json(m) for m in qs]})


@api_view(["DELETE"])
@require_session
def memory_item(request, pk: int):
    m = Memory.objects.filter(pk=pk).first()
    if not m:
        return Response({"ok": False}, status=404)
    m.delete()
    log_activity("حذف خاطره", "memories", m.title)
    return Response({"ok": True})


# ----------------------------------------------------------------- نامه ----
def letter_json(le: Letter) -> dict:
    locked = bool(le.open_at and le.open_at > timezone.now())
    return {
        "id": le.id,
        "title": le.title,
        "body": "" if locked else le.body,
        "locked": locked,
        "open_at": le.open_at.isoformat() if le.open_at else None,
        "is_opened": le.is_opened,
        "created_at": le.created_at.isoformat(),
    }


@api_view(["GET"])
@require_session
def letters(request):
    return Response({"items": [letter_json(x) for x in Letter.objects.filter(is_active=True)]})


@api_view(["POST"])
@require_session
def letter_open(request, pk: int):
    le = Letter.objects.filter(pk=pk, is_active=True).first()
    if not le:
        return Response({"ok": False}, status=404)
    if le.open_at and le.open_at > timezone.now():
        return Response({"ok": False, "message": "این نامه هنوز وقتش نرسیده دخترم ⏳"})
    if not le.is_opened:
        le.is_opened = True
        le.opened_at = timezone.now()
        le.save(update_fields=["is_opened", "opened_at"])
        bump("letters_opened")
        notify_daddy("letter_opened", f"دخترت نامه‌ی «{le.title}» رو باز کرد 💌")
    return Response({"ok": True, "item": letter_json(le)})


@api_view(["GET"])
@require_session
def letter_random(request):
    qs = list(Letter.objects.filter(is_active=True, open_at__isnull=True))
    if not qs:
        return Response({"item": None})
    return Response({"item": letter_json(random.choice(qs))})


# --------------------------------------------------------- شمارش معکوس ----
@api_view(["GET", "POST"])
@require_session
def countdowns(request):
    if request.method == "POST":
        title = str(request.data.get("title") or "یادآور").strip()[:160]
        target = request.data.get("target")
        icon = str(request.data.get("icon") or "heart")[:40]
        done_message = str(request.data.get("done_message") or "رسیدیم! 🎉")[:255]
        from django.utils.dateparse import parse_datetime
        from datetime import timedelta
        dt = None
        if target:
            try:
                dt = parse_datetime(str(target))
                if dt is None:
                    # تلاش با تاریخ ساده
                    from datetime import datetime
                    dt = datetime.fromisoformat(str(target).replace("Z", "+00:00"))
            except Exception:
                dt = None
        if dt is None:
            return Response({"ok": False, "message": "تاریخ نامعتبر است"}, status=400)
        # اگر timezone نداشت، از تنظیمات سرور استفاده کن
        if timezone.is_naive(dt):
            dt = timezone.make_aware(dt)
        c = Countdown.objects.create(
            title=title,
            target=dt,
            icon=icon,
            done_message=done_message,
        )
        log_activity("افزودن شمارش معکوس", "countdown", title)
        notify_daddy("countdown_add", f"دخترت یه شمارش جدید اضافه کرد ⏳ «{title}»")
        return Response({"ok": True, "id": c.id})
    items = []
    for c in Countdown.objects.filter(is_active=True):
        diff = c.target - timezone.now()
        items.append(
            {
                "id": c.id,
                "title": c.title,
                "target": c.target.isoformat(),
                "icon": c.icon,
                "done_message": c.done_message,
                "days": max(diff.days, 0),
                "hours": max(diff.seconds // 3600, 0) if diff.total_seconds() > 0 else 0,
                "minutes": max((diff.seconds % 3600) // 60, 0) if diff.total_seconds() > 0 else 0,
                "reached": diff.total_seconds() <= 0,
            }
        )
    return Response({"items": items})


@api_view(["DELETE"])
@require_session
def countdown_item(request, pk: int):
    c = Countdown.objects.filter(pk=pk).first()
    if not c:
        return Response({"ok": False}, status=404)
    title = c.title
    c.delete()
    log_activity("حذف شمارش", "countdown", title)
    return Response({"ok": True})


# ---------------------------------------------------------------- باغچه ----
@api_view(["GET"])
@require_session
def garden(request):
    return Response(
        {
            "items": [
                {"id": f.id, "name": f.name, "color": f.color, "emoji": f.emoji, "water_count": f.water_count}
                for f in Flower.objects.filter(is_active=True)
            ]
        }
    )


@api_view(["POST"])
@require_session
def garden_reset(request):
    """با هر ورود تازه‌ی دخترم به پروژه، گل‌ها به مرحله‌ی اول برمی‌گردند."""
    updated = Flower.objects.filter(is_active=True).update(water_count=0)
    return Response({"ok": True, "reset": updated})


@api_view(["POST"])
@require_session
def garden_water(request, pk: int):
    flower = Flower.objects.filter(pk=pk, is_active=True).first()
    if not flower:
        return Response({"ok": False}, status=404)
    flower.water_count += 1
    flower.save(update_fields=["water_count"])
    messages = list(FlowerMessage.objects.filter(is_active=True).values_list("text", flat=True))
    log_activity("آب دادن به گل", "garden", flower.name)
    return Response(
        {
            "ok": True,
            "water_count": flower.water_count,
            "message": random.choice(messages) if messages else "شکوفه داد 🌸",
        }
    )


# ---------------------------------------------------------- آسمان ستاره ----
@api_view(["GET"])
@require_session
def starmap(request):
    return Response(
        {
            "items": [
                {"id": c.id, "letter": c.letter, "order": c.order, "message": c.message, "stars": c.stars}
                for c in Constellation.objects.filter(is_active=True)
            ]
        }
    )


# ---------------------------------------------------------------- سینما ----
def cinema_json(c: CinemaItem) -> dict:
    return {
        "id": c.id,
        "title": c.title,
        "kind": c.kind,
        "link": c.link,
        "status": c.status,
        "rating": c.rating,
        "note": c.note,
        "poster": file_url(c.poster),
        "added_by": c.added_by,
        "created_at": c.created_at.isoformat(),
    }


@api_view(["GET", "POST"])
@parser_classes([MultiPartParser, FormParser])
@require_session
def cinema(request):
    if request.method == "POST":
        item = CinemaItem(
            title=request.data.get("title", "بدون اسم"),
            kind=request.data.get("kind", "film"),
            link=request.data.get("link", ""),
            status=request.data.get("status", "todo"),
            rating=bounded_int(request.data.get("rating") or 0, default=0, minimum=0, maximum=5),
            note=request.data.get("note", ""),
            added_by="daughter",
        )
        poster = request.FILES.get("poster")
        upload_error = validate_upload(poster, "image")
        if upload_error:
            return Response({"ok": False, "message": upload_error}, status=400)
        if poster:
            item.poster = poster
        item.save()
        notify_daddy("cinema_add", f"دخترت «{item.title}» رو به لیست تماشا اضافه کرد 🎬")
        return Response({"ok": True, "item": cinema_json(item)})
    return Response({"items": [cinema_json(c) for c in CinemaItem.objects.all()]})


@api_view(["PATCH", "POST", "DELETE"])
@parser_classes([MultiPartParser, FormParser])
@require_session
def cinema_item(request, pk: int):
    item = CinemaItem.objects.filter(pk=pk).first()
    if not item:
        return Response({"ok": False}, status=404)
    if request.method == "DELETE":
        if item.added_by != "daughter":
            return Response({"ok": False, "message": "این رو بابا اضافه کرده"}, status=403)
        item.delete()
        return Response({"ok": True})
    for field in ("status", "rating", "note", "title", "link"):
        if field in request.data:
            setattr(item, field, request.data[field])
    # پوستر: هم با POST (فرم) و هم با PATCH (فرم) قابل آپلود است
    poster = request.FILES.get("poster")
    upload_error = validate_upload(poster, "image")
    if upload_error:
        return Response({"ok": False, "message": upload_error}, status=400)
    if poster:
        item.poster = poster
    item.save()
    return Response({"ok": True, "item": cinema_json(item)})


# ---------------------------------------------------------------- کوییز ----
@api_view(["GET"])
@require_session
def quiz(request):
    items = [
        {
            "id": q.id,
            "question": q.question,
            "options": [q.option_a, q.option_b, q.option_c, q.option_d],
            "explanation": q.explanation,
        }
        for q in QuizQuestion.objects.filter(is_active=True)
    ]
    return Response({"items": items})


@api_view(["POST"])
@require_session
def quiz_submit(request):
    answers = request.data.get("answers", {})  # {question_id: "a"|"b"|...}
    questions = QuizQuestion.objects.filter(is_active=True)
    score = sum(1 for q in questions if answers.get(str(q.id)) == q.correct)
    total = questions.count()
    QuizResult.objects.create(score=score, total=total)
    perfect = total > 0 and score == total
    reward = None
    if perfect:
        bump("quiz_perfect")
        rw = QuizReward.objects.filter(is_active=True).first()
        reward = rw.message if rw else "نمره‌ی کامل! ❤"
        notify_daddy("quiz_perfect", "دخترت کوییز رو کامل زد 💯")
    correct_map = {str(q.id): q.correct for q in questions}
    return Response({"score": score, "total": total, "perfect": perfect, "reward": reward, "correct": correct_map})


# --------------------------------------------------------------- آرزوها ----
@api_view(["GET", "POST"])
@require_session
def plans(request):
    if request.method == "POST":
        p = FuturePlan.objects.create(
            title=request.data.get("title", ""),
            category=request.data.get("category", "wish"),
            added_by="daughter",
        )
        notify_daddy("plan_add", f"دخترت یه آرزوی جدید نوشت ✨ «{p.title}»")
        return Response({"ok": True, "id": p.id})
    return Response(
        {
            "items": [
                {
                    "id": p.id,
                    "title": p.title,
                    "category": p.category,
                    "is_done": p.is_done,
                    "added_by": p.added_by,
                    "note": p.note,
                }
                for p in FuturePlan.objects.all()
            ]
        }
    )


@api_view(["PATCH", "DELETE"])
@require_session
def plan_item(request, pk: int):
    p = FuturePlan.objects.filter(pk=pk).first()
    if not p:
        return Response({"ok": False}, status=404)
    if request.method == "DELETE":
        if p.added_by != "daughter":
            return Response({"ok": False}, status=403)
        p.delete()
        return Response({"ok": True})
    if "is_done" in request.data:
        p.is_done = bool(request.data["is_done"])
        if p.is_done:
            notify_daddy("plan_done", f"یه آرزو تیک خورد ✅ «{p.title}»")
    p.save()
    return Response({"ok": True})


# -------------------------------------------------------------- حال دل ----
@api_view(["GET"])
@require_session
def moods(request):
    items = [{"mood": m.mood, "label": m.get_mood_display()} for m in MoodMessage.objects.filter(is_active=True)]
    customs = [
        {
            "mood": f"custom:{c.id}",
            "label": c.label,
            "emoji": c.emoji,
            "color": c.color,
            "custom_id": c.id,
            "is_custom": True,
        }
        for c in CustomMood.objects.filter(is_active=True).order_by("-created_at")[:40]
    ]
    history = []
    for log in MoodLog.objects.all()[:20]:
        label = log.mood
        emoji = ""
        if log.custom_id:
            label = log.custom.label if log.custom else log.mood
            emoji = log.custom.emoji if log.custom else "💖"
        else:
            mm = MoodMessage.objects.filter(mood=log.mood).first()
            label = mm.get_mood_display() if mm else log.mood
        history.append(
            {
                "id": log.id,
                "mood": log.mood,
                "label": label,
                "emoji": emoji,
                "note": log.note or "",
                "created_at": log.created_at.isoformat(),
            }
        )
    return Response({"items": items, "customs": customs, "history": history})


@api_view(["POST"])
@require_session
def mood_set(request):
    note = str(request.data.get("note") or "")[:200]
    custom_id = request.data.get("custom_id")
    custom = None
    mood = str(request.data.get("mood") or "")
    if custom_id:
        custom = CustomMood.objects.filter(pk=custom_id, is_active=True).first()
        if custom:
            mood = f"custom:{custom.id}"
    MoodLog.objects.create(mood=mood or "custom", note=note, custom=custom)
    mm = None if custom else MoodMessage.objects.filter(mood=mood, is_active=True).first()
    label = f"{custom.emoji} {custom.label}" if custom else (mm.get_mood_display() if mm else mood)
    notify_daddy("mood", f"حال دل دخترت الان: {label}" + (f" — {note}" if note else ""))
    log_activity("ثبت حال", "mood", label[:60])
    return Response(
        {
            "ok": True,
            "message": (mm.message if mm else "فهمیدم دخترم، کنارتم ❤"),
            "voice": file_url(mm.voice.audio) if (mm and mm.voice) else None,
        }
    )


@api_view(["POST"])
@require_session
def mood_custom_add(request):
    """دخترم حال تازه‌ای با ایموجی دلخواه می‌سازد (بدون تأیید)."""
    label = str(request.data.get("label") or "").strip()[:40]
    emoji = str(request.data.get("emoji") or "💖").strip()[:8] or "💖"
    color = str(request.data.get("color") or "#f687b3").strip()[:20]
    if not label:
        return Response({"ok": False, "message": "یه اسم برای حالت بنویس"}, status=400)
    if CustomMood.objects.filter(is_active=True).count() >= 24:
        return Response({"ok": False, "message": "به سقف حال‌های دلخواه رسیدی"}, status=400)
    c = CustomMood.objects.create(label=label, emoji=emoji, color=color, created_by="daughter")
    notify_daddy("mood", f"دخترت حال تازه‌ای ساخت: {emoji} {label}")
    log_activity("حال دلخواه", "mood", label)
    return Response(
        {
            "ok": True,
            "item": {
                "mood": f"custom:{c.id}",
                "label": c.label,
                "emoji": c.emoji,
                "color": c.color,
                "custom_id": c.id,
                "is_custom": True,
            },
        }
    )


# ------------------------------------------------------------ صندوقچه -----
def _vault_json(v: VaultItem) -> dict:
    return {"id": v.id, "title": v.title, "kind": v.kind, "file": file_url(v.file), "text": v.text}


@api_view(["GET", "POST"])
@require_session
def vault(request):
    if not request.loveos_session.vault_open:
        if request.method == "POST":
            return Response({"ok": False, "message": "صندوقچه قفل است"}, status=403)
        return Response({"locked": True, "items": []})
    if request.method == "POST":
        return vault_add(request)
    items = [_vault_json(v) for v in VaultItem.objects.filter(is_active=True)]
    return Response({"locked": False, "items": items})


def vault_add(request):
    """دخترم خودش محتوا اضافه می‌کند: متن، عکس، صدا یا ویدیو."""
    title = str(request.data.get("title") or "").strip()
    if not title:
        return Response({"ok": False, "message": "یه اسم برای صندوقچه‌ات بنویس"}, status=400)
    kind = str(request.data.get("kind") or "text")
    if kind not in ("video", "audio", "image", "text"):
        kind = "text"
    upload_file = request.FILES.get("file")
    upload_error = validate_upload(upload_file, "image" if kind == "image" else "any")
    if upload_error:
        return Response({"ok": False, "message": upload_error}, status=400)
    item = VaultItem.objects.create(
        title=title[:160],
        kind=kind if upload_file else "text",
        file=upload_file,
        text=str(request.data.get("text") or ""),
    )
    bump("vault_items")
    log_activity("افزودن به صندوقچه", "vault", item.title[:60])
    notify_daddy("vault_add", f"💎 دخترت یه چیز تازه تو صندوقچه گذاشت: «{item.title}»")
    return Response({"ok": True, "item": _vault_json(item)})


# -------------------------------------------------------------- آموزش -----
@api_view(["GET"])
@require_session
def tutorial(request):
    key = request.GET.get("key")
    qs = TutorialChapter.objects.filter(is_active=True)
    if key:
        qs = qs.filter(key=key)
    return Response(
        {"items": [{"id": t.id, "key": t.key, "title": t.title, "body": t.body, "order": t.order} for t in qs]}
    )
