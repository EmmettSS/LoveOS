"""
dreamhome.api — اندپوینت‌های خانه‌ی رویایی

  GET    /api/home/overview              همه‌چیز: ویژگی‌ها، اتاق‌ها، گالری، چک‌لیست، پیشرفت
  GET    /api/home/features              ویژگی‌ها (+ فیلتر دسته/اهمیت)
  POST   /api/home/features              افزودن ویژگی (با عکس)
  PATCH  /api/home/features/<pk>         ویرایش / تیک زدن
  DELETE /api/home/features/<pk>         حذف
  GET    /api/home/rooms                 اتاق‌های نقشه
  POST   /api/home/rooms                 افزودن اتاق
  PATCH  /api/home/rooms/<pk>            جابجایی/تغییر اندازه/رنگ
  DELETE /api/home/rooms/<pk>            حذف اتاق
  POST   /api/home/rooms/<pk>/ideas      ایده‌ی اتاق (رنگ، مبلمان، دکور)
  GET    /api/home/inspirations          گالری الهام
  POST   /api/home/inspirations          آپلود عکس الهام
  POST   /api/home/inspirations/<pk>/comments  کامنت روی عکس
  GET    /api/home/categories            دسته‌بندی‌ها
  GET    /api/home/stats                 پیشرفت و آمار
"""
from __future__ import annotations

from django.db.models import Q
from rest_framework.decorators import api_view
from rest_framework.response import Response

from accounts.models import UserConfig
from core.auth import require_session
from core.services import bump, log_activity, push_notification
from core.soroush import notify_daddy
from dreamhome.models import (
    IMPORTANCE,
    OWNER,
    DreamHomeCategory,
    DreamHomeFeature,
    DreamHomeInspiration,
    DreamHomeRoom,
    DreamHomeRoomIdea,
    InspirationComment,
)

OWNER_LABEL = dict(OWNER)
IMPORTANCE_LABEL = dict(IMPORTANCE)


def _label(owner: str) -> str:
    cfg = UserConfig.get_solo()
    return (cfg.daddy_name or "بابا") if owner == "daddy" else (cfg.daughter_nickname or cfg.daughter_name or "دخترم")


def _owner_from(data: dict, default: str = "daughter") -> str:
    value = str(data.get("owner") or data.get("added_by") or default)
    return value if value in OWNER_LABEL else default


def _feature_json(f: DreamHomeFeature) -> dict:
    return {
        "id": f.id,
        "title": f.title,
        "category": f.category_id,
        "category_name": f.category.name if f.category else "",
        "category_icon": f.category.icon if f.category else "🏡",
        "importance": f.importance,
        "importance_label": IMPORTANCE_LABEL.get(f.importance, f.importance),
        "description": f.description,
        "photo": f.photo.url if f.photo else None,
        "added_by": f.added_by,
        "added_by_label": _label(f.added_by),
        "is_done": f.is_done,
        "linked_plan": f.linked_plan_id,
        "order": f.order,
        "created_at": f.created_at.isoformat(),
    }


def _room_json(r: DreamHomeRoom, with_ideas: bool = False) -> dict:
    data = {
        "id": r.id,
        "name": r.name,
        "description": r.description,
        "floor": r.floor,
        "x": r.x,
        "y": r.y,
        "w": r.w,
        "h": r.h,
        "color": r.color,
        "icon": r.icon,
        "added_by": r.added_by,
        "added_by_label": _label(r.added_by),
        "order": r.order,
        "inspirations_count": r.inspirations.count(),
    }
    if with_ideas:
        data["ideas"] = [
            {
                "id": i.id,
                "kind": i.kind,
                "kind_label": i.get_kind_display(),
                "text": i.text,
                "color_value": i.color_value,
                "added_by": i.added_by,
                "added_by_label": _label(i.added_by),
            }
            for i in r.ideas.all()
        ]
    return data


def _inspiration_json(i: DreamHomeInspiration, with_comments: bool = False) -> dict:
    data = {
        "id": i.id,
        "photo": i.photo.url if i.photo else None,
        "title": i.title,
        "category": i.category_id,
        "category_name": i.category.name if i.category else "",
        "room": i.room_id,
        "room_name": i.room.name if i.room else "",
        "description": i.description,
        "uploaded_by": i.uploaded_by,
        "uploaded_by_label": _label(i.uploaded_by),
        "created_at": i.created_at.isoformat(),
        "comments_count": i.comments.count(),
    }
    if with_comments:
        data["comments"] = [
            {
                "id": c.id,
                "owner": c.owner,
                "owner_label": _label(c.owner),
                "text": c.text,
                "created_at": c.created_at.isoformat(),
            }
            for c in i.comments.all()
        ]
    return data


# ----------------------------------------------------------------- ویژگی‌ها --
@api_view(["GET", "POST"])
@require_session
def features(request):
    if request.method == "GET":
        qs = DreamHomeFeature.objects.select_related("category")
        category = request.GET.get("category")
        if category and str(category).isdigit():
            qs = qs.filter(category_id=int(category))
        importance = request.GET.get("importance")
        if importance in IMPORTANCE_LABEL:
            qs = qs.filter(importance=importance)
        text = (request.GET.get("q") or "").strip()
        if text:
            qs = qs.filter(Q(title__icontains=text) | Q(description__icontains=text))
        return Response({"items": [_feature_json(f) for f in qs[:200]]})

    data = request.data if isinstance(request.data, dict) else {}
    title = str(data.get("title") or "").strip()
    if not title:
        return Response({"ok": False, "message": "عنوان ویژگی را بنویس"}, status=400)

    feature = DreamHomeFeature(
        title=title[:160],
        importance=data.get("importance") if data.get("importance") in IMPORTANCE_LABEL else "must",
        description=str(data.get("description") or ""),
        added_by=_owner_from(data, "daughter"),
    )
    if data.get("category"):
        feature.category = DreamHomeCategory.objects.filter(pk=data["category"]).first()
    if data.get("linked_plan"):
        from content.models import FuturePlan

        feature.linked_plan = FuturePlan.objects.filter(pk=data["linked_plan"]).first()
    photo = request.FILES.get("photo")
    if photo:
        feature.photo = photo
    feature.save()

    if feature.added_by == "daughter":
        push_notification(
            "home", f"{_label('daughter')} یه ویژگی جدید برای خونه‌ی رویایی‌مون اضافه کرد 🏡", feature.title,
            icon="dreamhome", action_app="dreamhome",
        )
        notify_daddy("home_feature", f"🏡 {_label('daughter')} ویژگی جدید اضافه کرد: {feature.title}")
    else:
        push_notification("home", "یه ویژگی جدید برای خونه‌ی رویایی‌مون 🏡", feature.title, icon="dreamhome", action_app="dreamhome")
        notify_daddy("home_feature", f"🏡 ویژگی جدید: {feature.title}")

    bump("home_features")
    log_activity("ویژگی خانه‌ی رویایی", "dreamhome", feature.title[:60])
    return Response({"ok": True, "item": _feature_json(feature)})


@api_view(["PATCH", "POST", "DELETE"])
@require_session
def feature_item(request, pk: int):
    feature = DreamHomeFeature.objects.filter(pk=pk).first()
    if not feature:
        return Response({"ok": False}, status=404)
    if request.method == "DELETE":
        feature.delete()
        return Response({"ok": True})

    data = request.data if isinstance(request.data, dict) else {}
    for field, limit in (("title", 160),):
        if field in data:
            setattr(feature, field, str(data[field])[:limit])
    if "description" in data:
        feature.description = str(data["description"])
    if data.get("importance") in IMPORTANCE_LABEL:
        feature.importance = data["importance"]
    if "is_done" in data:
        feature.is_done = bool(data["is_done"])
    if "category" in data:
        feature.category = DreamHomeCategory.objects.filter(pk=data["category"]).first() if data["category"] else None
    photo = request.FILES.get("photo")
    if photo:
        feature.photo = photo
    feature.save()
    return Response({"ok": True, "item": _feature_json(feature)})


# -------------------------------------------------------------------- اتاق ---
@api_view(["GET", "POST"])
@require_session
def rooms(request):
    if request.method == "GET":
        return Response({"items": [_room_json(r, with_ideas=True) for r in DreamHomeRoom.objects.all()]})

    data = request.data if isinstance(request.data, dict) else {}
    name = str(data.get("name") or "").strip()
    if not name:
        return Response({"ok": False, "message": "اسم اتاق را بنویس"}, status=400)

    def _num(key: str, default: float, low: float, high: float) -> float:
        try:
            return max(low, min(high, float(data.get(key, default))))
        except (TypeError, ValueError):
            return default

    room = DreamHomeRoom.objects.create(
        name=name[:120],
        description=str(data.get("description") or ""),
        floor=str(data.get("floor") or "")[:60],
        x=_num("x", 10, 0, 90),
        y=_num("y", 10, 0, 90),
        w=_num("w", 22, 6, 60),
        h=_num("h", 18, 6, 60),
        color=str(data.get("color") or "#f9a8d4")[:20],
        icon=str(data.get("icon") or "🛋")[:8],
        added_by=_owner_from(data, "daughter"),
    )
    push_notification("home", f"یه اتاق جدید روی نقشه‌ی خونه‌مون نشست 🏠", room.name, icon="dreamhome", action_app="dreamhome")
    notify_daddy("home_room", f"🏠 اتاق جدید در نقشه‌ی خانه‌ی رویایی: {room.name}")
    bump("home_rooms")
    log_activity("اتاق خانه‌ی رویایی", "dreamhome", room.name[:60])
    return Response({"ok": True, "item": _room_json(room, with_ideas=True)})


@api_view(["PATCH", "POST", "DELETE"])
@require_session
def room_item(request, pk: int):
    room = DreamHomeRoom.objects.filter(pk=pk).first()
    if not room:
        return Response({"ok": False}, status=404)
    if request.method == "DELETE":
        room.delete()
        return Response({"ok": True})

    data = request.data if isinstance(request.data, dict) else {}
    for field, limit in (("name", 120), ("floor", 60), ("color", 20), ("icon", 8)):
        if field in data:
            setattr(room, field, str(data[field])[:limit])
    if "description" in data:
        room.description = str(data["description"])
    for field, low, high in (("x", 0, 90), ("y", 0, 90), ("w", 6, 60), ("h", 6, 60)):
        if field in data:
            try:
                setattr(room, field, max(low, min(high, float(data[field]))))
            except (TypeError, ValueError):
                pass
    room.save()
    return Response({"ok": True, "item": _room_json(room, with_ideas=True)})


@api_view(["POST", "GET"])
@require_session
def room_ideas(request, pk: int):
    room = DreamHomeRoom.objects.filter(pk=pk).first()
    if not room:
        return Response({"ok": False}, status=404)
    if request.method == "GET":
        ideas = [i for i in room.ideas.all()]
        return Response(
            {
                "items": [
                    {
                        "id": i.id,
                        "kind": i.kind,
                        "kind_label": i.get_kind_display(),
                        "text": i.text,
                        "color_value": i.color_value,
                        "added_by_label": _label(i.added_by),
                    }
                    for i in ideas
                ]
            }
        )

    data = request.data if isinstance(request.data, dict) else {}
    text = str(data.get("text") or "").strip()
    if not text:
        return Response({"ok": False, "message": "متن ایده را بنویس"}, status=400)
    kind = data.get("kind") if data.get("kind") in dict(DreamHomeRoomIdea.KIND) else "idea"
    idea = DreamHomeRoomIdea.objects.create(
        room=room,
        kind=kind,
        text=text[:255],
        color_value=str(data.get("color_value") or "")[:20],
        added_by=_owner_from(data, "daughter"),
    )
    notify_daddy("home_idea", f"💡 ایده‌ی جدید برای اتاق «{room.name}»: {text[:120]}")
    return Response(
        {
            "ok": True,
            "item": {
                "id": idea.id,
                "kind": idea.kind,
                "kind_label": idea.get_kind_display(),
                "text": idea.text,
                "color_value": idea.color_value,
                "added_by_label": _label(idea.added_by),
            },
        }
    )


# ------------------------------------------------------------------ گالری ---
@api_view(["GET", "POST"])
@require_session
def inspirations(request):
    if request.method == "GET":
        qs = DreamHomeInspiration.objects.select_related("category", "room")
        category = request.GET.get("category")
        if category and str(category).isdigit():
            qs = qs.filter(category_id=int(category))
        room = request.GET.get("room")
        if room and str(room).isdigit():
            qs = qs.filter(room_id=int(room))
        return Response({"items": [_inspiration_json(i) for i in qs[:120]]})

    data = request.data if isinstance(request.data, dict) else {}
    photo = request.FILES.get("photo")
    if not photo:
        return Response({"ok": False, "message": "عکس الهام را انتخاب کن"}, status=400)
    insp = DreamHomeInspiration.objects.create(
        photo=photo,
        title=str(data.get("title") or "")[:160],
        description=str(data.get("description") or ""),
        uploaded_by=_owner_from(data, "daughter"),
    )
    if data.get("category"):
        insp.category = DreamHomeCategory.objects.filter(pk=data["category"]).first()
    if data.get("room"):
        insp.room = DreamHomeRoom.objects.filter(pk=data["room"]).first()
    insp.save()

    push_notification(
        "home", "یه عکس الهام جدید برای خونه‌مون 🖼", insp.title or "", icon="dreamhome", action_app="dreamhome"
    )
    notify_daddy("home_inspiration", f"🖼 عکس الهام جدید ({_label(insp.uploaded_by)}): {insp.title or '—'}")
    bump("home_inspirations")
    log_activity("عکس الهام", "dreamhome", insp.title[:60])
    return Response({"ok": True, "item": _inspiration_json(insp, with_comments=True)})


@api_view(["GET", "POST", "DELETE"])
@require_session
def inspiration_item(request, pk: int):
    insp = DreamHomeInspiration.objects.filter(pk=pk).first()
    if not insp:
        return Response({"ok": False}, status=404)
    if request.method == "DELETE":
        insp.delete()
        return Response({"ok": True})
    if request.method == "GET":
        return Response({"item": _inspiration_json(insp, with_comments=True)})

    data = request.data if isinstance(request.data, dict) else {}
    if "title" in data:
        insp.title = str(data["title"])[:160]
    if "description" in data:
        insp.description = str(data["description"])
    if "category" in data:
        insp.category = DreamHomeCategory.objects.filter(pk=data["category"]).first() if data["category"] else None
    if "room" in data:
        insp.room = DreamHomeRoom.objects.filter(pk=data["room"]).first() if data["room"] else None
    insp.save()
    return Response({"ok": True, "item": _inspiration_json(insp, with_comments=True)})


@api_view(["POST", "GET"])
@require_session
def inspiration_comments(request, pk: int):
    insp = DreamHomeInspiration.objects.filter(pk=pk).first()
    if not insp:
        return Response({"ok": False}, status=404)
    if request.method == "GET":
        return Response(
            {
                "items": [
                    {"id": c.id, "owner": c.owner, "owner_label": _label(c.owner), "text": c.text, "created_at": c.created_at.isoformat()}
                    for c in insp.comments.all()
                ]
            }
        )

    data = request.data if isinstance(request.data, dict) else {}
    text = str(data.get("text") or "").strip()
    if not text:
        return Response({"ok": False, "message": "کامنتت را بنویس"}, status=400)
    owner = _owner_from(data, "daughter")
    comment = InspirationComment.objects.create(owner=owner, inspiration=insp, text=text[:500])
    push_notification(
        "home", f"کامنت جدید روی عکس الهام 💬", f"{_label(owner)}: {text[:120]}", icon="chat", action_app="dreamhome"
    )
    notify_daddy("home_comment", f"💬 {_label(owner)} روی عکس الهام کامنت گذاشت: {text[:120]}")
    return Response(
        {
            "ok": True,
            "item": {
                "id": comment.id,
                "owner": comment.owner,
                "owner_label": _label(comment.owner),
                "text": comment.text,
                "created_at": comment.created_at.isoformat(),
            },
        }
    )


# ------------------------------------------------------------ دسته و آمار ---
@api_view(["GET"])
@require_session
def categories(request):
    return Response(
        {
            "items": [
                {"id": c.id, "name": c.name, "icon": c.icon, "detail": c.detail, "count": c.features.count()}
                for c in DreamHomeCategory.objects.filter(is_active=True)
            ]
        }
    )


def _stats_payload() -> dict:
    features_qs = list(DreamHomeFeature.objects.all())
    must = [f for f in features_qs if f.importance == "must"]
    nice = [f for f in features_qs if f.importance == "nice"]
    luxury = [f for f in features_qs if f.importance == "luxury"]
    done = [f for f in features_qs if f.is_done]
    total = len(features_qs)
    percent = round(len(done) * 100 / total) if total else 0
    return {
        "features_total": total,
        "must": len(must),
        "nice": len(nice),
        "luxury": len(luxury),
        "done": len(done),
        "percent": percent,
        "percent_label": f"{percent}٪ خانه‌ی رویایی طراحی شده",
        "rooms_total": DreamHomeRoom.objects.count(),
        "inspirations_total": DreamHomeInspiration.objects.count(),
        "comments_total": InspirationComment.objects.count(),
        "checklist": {
            "must": [_feature_json(f) for f in must[:50]],
            "nice": [_feature_json(f) for f in nice[:50]],
        },
        "room_progress": [
            {
                "room": r.name,
                "icon": r.icon,
                "ideas": r.ideas.count(),
                "inspirations": r.inspirations.count(),
            }
            for r in DreamHomeRoom.objects.all()
        ],
    }


@api_view(["GET"])
@require_session
def stats(request):
    return Response(_stats_payload())


@api_view(["GET"])
@require_session
def overview(request):
    return Response(
        {
            "features": [_feature_json(f) for f in DreamHomeFeature.objects.select_related("category")[:200]],
            "rooms": [_room_json(r, with_ideas=True) for r in DreamHomeRoom.objects.all()],
            "inspirations": [_inspiration_json(i) for i in DreamHomeInspiration.objects.select_related("category", "room")[:60]],
            "categories": [
                {"id": c.id, "name": c.name, "icon": c.icon, "detail": c.detail, "count": c.features.count()}
                for c in DreamHomeCategory.objects.filter(is_active=True)
            ],
            "stats": _stats_payload(),
        }
    )
