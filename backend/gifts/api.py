"""
gifts.api — اندپوینت‌های دفتر هدیه‌ها

  GET    /api/gifts            لیست + فیلتر (هدیه‌دهنده، مناسبت، سال، رنج قیمت) + جستجو
  POST   /api/gifts            ثبت هدیه‌ی جدید (از پنل بابا یا از خود اپ توسط دخترم)
  PATCH  /api/gifts/<pk>       ویرایش
  DELETE /api/gifts/<pk>       حذف
  GET    /api/gifts/stats      آمار دفتر (محاسبه‌شده)
  GET    /api/gifts/occasions  مناسبت‌های قابل تنظیم
"""
from __future__ import annotations

from datetime import datetime

from django.db.models import Q
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from accounts.models import UserConfig
from core.auth import require_session
from core.services import bump, log_activity, push_notification
from core.soroush import notify_daddy
from core.utils import bounded_int, file_url, validate_upload
from gifts.models import OWNER, PRICE_BANDS, Gift, GiftOccasion

OWNER_LABEL = dict(OWNER)


def _label(owner: str) -> str:
    cfg = UserConfig.get_solo()
    return (cfg.daddy_name or "بابا") if owner == "daddy" else (cfg.daughter_nickname or cfg.daughter_name or "دخترم")


def _gift_json(g: Gift) -> dict:
    return {
        "id": g.id,
        "name": g.name,
        "given_on": g.given_on.isoformat(),
        "year": g.year,
        "occasion": g.occasion_id,
        "occasion_name": g.occasion.name if g.occasion else "",
        "occasion_icon": g.occasion.icon if g.occasion else "🎁",
        "giver": g.giver,
        "giver_label": _label(g.giver),
        "receiver": g.receiver,
        "receiver_label": _label(g.receiver),
        "price": float(g.price) if g.price is not None else None,
        "currency": g.currency,
        "price_band": g.effective_price_band,
        "description": g.description,
        "reaction": g.reaction,
        "photo": file_url(g.photo),
        "is_favorite": g.is_favorite,
        "memory": g.memory_id,
        "recorded_by": g.recorded_by,
        "recorded_by_label": _label(g.recorded_by),
        "created_at": g.created_at.isoformat(),
    }


def _parse_date(value, fallback):
    if not value:
        return fallback
    try:
        return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()
    except ValueError:
        return fallback


def _apply_payload(gift: Gift, data: dict) -> Gift:
    if "name" in data:
        gift.name = str(data["name"]).strip()[:160]
    if data.get("given_on"):
        gift.given_on = _parse_date(data["given_on"], gift.given_on)
    if "occasion" in data:
        occasion_id = data.get("occasion")
        gift.occasion = GiftOccasion.objects.filter(pk=occasion_id).first() if occasion_id else None
    for field in ("giver", "receiver"):
        if data.get(field) in OWNER_LABEL:
            setattr(gift, field, data[field])
    if "price" in data:
        raw = data.get("price")
        if raw in (None, ""):
            gift.price = None
        else:
            try:
                gift.price = round(float(raw))
            except (TypeError, ValueError):
                pass
    if "currency" in data:
        gift.currency = str(data.get("currency") or "")[:12]
    if data.get("price_band") in dict(PRICE_BANDS):
        gift.price_band = data["price_band"]
    elif "price_band" in data:
        gift.price_band = ""
    if "description" in data:
        gift.description = str(data.get("description") or "")
    if "reaction" in data:
        gift.reaction = str(data.get("reaction") or "")[:255]
    if "is_favorite" in data:
        gift.is_favorite = bool(data["is_favorite"])
    if "recorded_by" in data and data["recorded_by"] in OWNER_LABEL:
        gift.recorded_by = data["recorded_by"]
    return gift


@api_view(["GET", "POST"])
@require_session
def gifts(request):
    if request.method == "GET":
        qs = Gift.objects.select_related("occasion")
        giver = request.GET.get("giver")
        if giver in OWNER_LABEL:
            qs = qs.filter(giver=giver)
        receiver = request.GET.get("receiver")
        if receiver in OWNER_LABEL:
            qs = qs.filter(receiver=receiver)
        occasion = request.GET.get("occasion")
        if occasion and str(occasion).isdigit():
            qs = qs.filter(occasion_id=int(occasion))
        year = request.GET.get("year")
        if year and str(year).isdigit():
            # «سال» در LoveOS یعنی سال شمسی؛ فیلتر به بازه‌ی میلادی تبدیل می‌شود
            from core.jalali import from_jalali

            jy = int(year)
            try:
                start = from_jalali(jy, 1, 1)
                end = from_jalali(jy + 1, 1, 1)
                qs = qs.filter(given_on__gte=start, given_on__lt=end)
            except (ValueError, OverflowError):
                pass
        band = request.GET.get("band")
        if band in dict(PRICE_BANDS):
            # هم رنج دستی و هم رنج محاسبه‌شده از قیمت، هر دو معیارند
            ids = [g.id for g in qs if g.effective_price_band == band]
            qs = Gift.objects.filter(id__in=ids).select_related("occasion")
        text = (request.GET.get("q") or "").strip()
        if text:
            qs = qs.filter(Q(name__icontains=text) | Q(description__icontains=text) | Q(reaction__icontains=text))
        limit = bounded_int(request.GET.get("limit", 100), default=100, minimum=1, maximum=300)
        items = [_gift_json(g) for g in qs[:limit]]
        return Response({"items": items, "count": len(items)})

    data = request.data if isinstance(request.data, dict) else {}
    if not str(data.get("name") or "").strip():
        return Response({"ok": False, "message": "اسم هدیه را بنویس"}, status=400)

    gift = _apply_payload(Gift(), data)
    upload = request.FILES.get("photo")
    upload_error = validate_upload(upload, "image")
    if upload_error:
        return Response({"ok": False, "message": upload_error}, status=400)
    if upload:
        gift.photo = upload
    gift.save()

    # آرشیو نمی‌شود بدون خبر ماندن: طرف مقابل باید بداند
    if gift.recorded_by == "daddy":
        push_notification(
            "gift",
            f"{_label('daddy')} یه هدیه‌ی جدید به دفتر اضافه کرد 🎁",
            gift.name,
            icon="gift",
            action_app="gifts",
        )
        notify_daddy("gift_added", f"🎁 هدیه‌ی جدید ثبت شد: {gift.name}")
    else:
        push_notification("gift", "یه هدیه‌ی جدید در دفتر ثبت شد 🎁", gift.name, icon="gift", action_app="gifts")
        notify_daddy("gift_added", f"🎁 {_label('daughter')} یه هدیه‌ی جدید ثبت کرد: {gift.name}")

    bump("gifts_recorded")
    log_activity("ثبت هدیه", "gifts", gift.name[:60])
    return Response({"ok": True, "item": _gift_json(gift)})


@api_view(["GET", "PATCH", "POST", "DELETE"])
@require_session
def gift_item(request, pk: int):
    gift = Gift.objects.select_related("occasion").filter(pk=pk).first()
    if not gift:
        return Response({"ok": False, "message": "این هدیه پیدا نشد"}, status=404)

    if request.method in ("GET",):
        return Response({"item": _gift_json(gift)})

    if request.method == "DELETE":
        name = gift.name
        gift.delete()
        log_activity("حذف هدیه", "gifts", name[:60])
        return Response({"ok": True})

    data = request.data if isinstance(request.data, dict) else {}
    _apply_payload(gift, data)
    upload = request.FILES.get("photo")
    upload_error = validate_upload(upload, "image")
    if upload_error:
        return Response({"ok": False, "message": upload_error}, status=400)
    if upload:
        gift.photo = upload
    gift.save()
    log_activity("ویرایش هدیه", "gifts", gift.name[:60])
    return Response({"ok": True, "item": _gift_json(gift)})


@api_view(["GET"])
@require_session
def occasions(request):
    from core.jalali import to_jalali

    items = GiftOccasion.objects.filter(is_active=True)
    years = sorted({to_jalali(g.given_on)[0] for g in Gift.objects.all()}, reverse=True)
    return Response(
        {
            "items": [
                {"id": o.id, "name": o.name, "icon": o.icon, "count": o.gifts.count()} for o in items
            ],
            "years": years,
            "bands": [{"key": k, "label": v} for k, v in PRICE_BANDS],
        }
    )


@api_view(["GET"])
@require_session
def stats(request):
    """آمار دفتر: تعداد دریافتی/داده‌شده، ارزش کل و نمودار سالانه."""
    gifts_qs = list(Gift.objects.select_related("occasion"))
    received_by_daughter = [g for g in gifts_qs if g.receiver == "daughter"]
    given_by_daughter = [g for g in gifts_qs if g.giver == "daughter"]
    given_by_daddy = [g for g in gifts_qs if g.giver == "daddy"]
    priced = [g for g in gifts_qs if g.price is not None]
    total_value = round(sum(float(g.price) for g in priced)) if priced else None

    from core.jalali import to_jalali

    years: dict[int, dict] = {}
    for g in gifts_qs:
        jy = to_jalali(g.given_on)[0]
        bucket = years.setdefault(jy, {"year": jy, "count": 0, "from_daddy": 0, "from_daughter": 0, "value": 0})
        bucket["count"] += 1
        if g.giver == "daddy":
            bucket["from_daddy"] += 1
        else:
            bucket["from_daughter"] += 1
        if g.price is not None:
            bucket["value"] += float(g.price)

    per_year = [years[y] for y in sorted(years)]
    for row in per_year:
        row["value"] = round(row["value"])
    max_count = max([row["count"] for row in per_year], default=1)

    by_occasion: dict[str, dict] = {}
    for g in gifts_qs:
        key = g.occasion.name if g.occasion else "بدون مناسبت"
        bucket = by_occasion.setdefault(key, {"name": key, "icon": g.occasion.icon if g.occasion else "🎁", "count": 0})
        bucket["count"] += 1

    latest = max(gifts_qs, key=lambda g: g.given_on, default=None)
    return Response({
        "received_count": len(received_by_daughter),
        "given_count": len(given_by_daughter),
        "from_daddy_count": len(given_by_daddy),
        "total_count": len(gifts_qs),
        "total_value": total_value,
        "has_prices": bool(priced),
        "average_value": round(total_value / len(priced)) if priced and total_value else None,
        "years": per_year,
        "max_year_count": max_count,
        "by_occasion": sorted(by_occasion.values(), key=lambda x: -x["count"]),
        "favorites": [_gift_json(g) for g in gifts_qs if g.is_favorite][:12],
        "latest": _gift_json(latest) if latest else None,
        "today": timezone.localdate().isoformat(),
    })
