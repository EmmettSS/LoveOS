"""
calls.api — اندپوینت‌های هماهنگ‌کننده‌ی تماس

  GET    /api/calls/overview          یک نگاه کامل: بازه‌های مشترک، تماس بعدی، آمار
  GET    /api/calls/slots             بازه‌های آزاد (هر دو طرف)
  POST   /api/calls/slots             ثبت بازه‌ی آزاد
  DELETE /api/calls/slots/<pk>        حذف بازه
  GET    /api/calls/appointments      لیست پیشنهاد/تأییدها
  POST   /api/calls/appointments      پیشنهاد تماس جدید
  POST   /api/calls/appointments/<pk>/respond   تأیید / رد / پیشنهاد جایگزین
  GET    /api/calls/logs              ثبت‌های تماس
  POST   /api/calls/logs              «تماس انجام شد»
  POST   /api/calls/logs/<pk>/note    ویرایش یادداشت/حال و هوا
  GET    /api/calls/stats             آمار تماس (محاسبه‌شده)
"""
from __future__ import annotations

from datetime import datetime, time, timedelta

from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from accounts.models import UserConfig
from calls.models import CallAppointment, CallFreeSlot, CallLog, CallSettings, MOODS, OWNER
from core.auth import require_session
from core.services import bump, effective_daughter_location, log_activity, push_notification
from core.soroush import notify_daddy
from core.utils import bounded_int, file_url, validate_upload

try:  # منطقه‌ی زمانی محلی هر طرف (برای تبدیل خودکار ساعت‌ها)
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None  # type: ignore

# ------------------------------------------------------------------ helpers --
OWNER_LABEL = dict(OWNER)


def _other(owner: str) -> str:
    return "daddy" if owner == "daughter" else "daughter"


def _label(owner: str) -> str:
    cfg = UserConfig.get_solo()
    if owner == "daddy":
        return cfg.daddy_name or "بابا"
    return cfg.daughter_nickname or cfg.daughter_name or "دخترم"


def _tz_for(owner: str):
    """منطقه‌ی زمانی هر طرف؛ شهر دخترم از موقعیت واقعی‌اش می‌آید."""
    if ZoneInfo is None:
        return None
    cfg = UserConfig.get_solo()
    name = cfg.daddy_timezone if owner == "daddy" else effective_daughter_location(cfg)["timezone"]
    try:
        return ZoneInfo(name)
    except Exception:
        return None


def _sides_time(owner: str, date, slot_time) -> dict:
    """ساعت یک لحظه را به وقت محلی هر دو طرف برمی‌گرداند (تبدیل خودکار منطقه‌ی زمانی)."""
    cfg = UserConfig.get_solo()
    daughter_location = effective_daughter_location(cfg)

    def local(tz_name: str, fallback_label: str) -> dict:
        def payload(local_time: str, local_date: str, day_offset: int = 0) -> dict:
            # label/date قرارداد قدیمی‌اند؛ city/timezone/day_offset قرارداد خواناتر
            # برای کلاینت‌های جدیدند. هر دو را نگه می‌داریم تا API سازگار بماند.
            return {
                "label": fallback_label,
                "city": fallback_label,
                "timezone": tz_name,
                "time": local_time,
                "date": local_date,
                "day_offset": day_offset,
            }

        if ZoneInfo is None:
            return payload(slot_time.strftime("%H:%M"), str(date))
        try:
            zone = ZoneInfo(tz_name)
        except Exception:
            return payload(slot_time.strftime("%H:%M"), str(date))
        # لحظه‌ی قرار در منطقه‌ی زمانی پیشنهاددهنده ساخته و به مقصد تبدیل می‌شود.
        base = datetime.combine(date, slot_time)
        anchor = timezone.make_aware(base, _tz_for(owner) or zone)
        shifted = anchor.astimezone(zone)
        return payload(shifted.strftime("%H:%M"), shifted.date().isoformat(), shifted.date().toordinal() - date.toordinal())

    return {
        "daddy": local(cfg.daddy_timezone, cfg.daddy_city),
        "daughter": local(daughter_location["timezone"], daughter_location["city"]),
    }


def _slot_json(s: CallFreeSlot) -> dict:
    return {
        "id": s.id,
        "owner": s.owner,
        "owner_label": _label(s.owner),
        "weekday": s.weekday,
        "weekday_label": s.get_weekday_display(),
        "start": s.start_time.strftime("%H:%M"),
        "end": s.end_time.strftime("%H:%M"),
        "minutes": s.minutes,
        "note": s.note,
    }


def _appointment_json(a: CallAppointment) -> dict:
    log = a.logs.order_by("-created_at").first()
    return {
        "id": a.id,
        "proposer": a.proposer,
        "proposer_label": _label(a.proposer),
        "proposee": a.proposee,
        "proposee_label": _label(a.proposee),
        "date": a.date.isoformat(),
        "time": a.time.strftime("%H:%M"),
        "duration_minutes": a.duration_minutes,
        "topic": a.topic,
        "status": a.status,
        "status_label": a.get_status_display(),
        "message": a.message,
        "answer_note": a.answer_note,
        "answered_at": a.answered_at.isoformat() if a.answered_at else None,
        "alternative_of": a.alternative_of_id,
        "seconds_to_start": a.seconds_to_start,
        "is_upcoming": a.is_upcoming,
        "sides_time": _sides_time(a.proposer, a.date, a.time),
        "logged": bool(log),
    }


def _log_json(log: CallLog) -> dict:
    return {
        "id": log.id,
        "appointment": log.appointment_id,
        "happened_on": log.happened_on.isoformat(),
        "happened_at": log.happened_at.strftime("%H:%M") if log.happened_at else None,
        "kind": log.kind,
        "kind_label": log.get_kind_display(),
        "duration_minutes": log.duration_minutes,
        "duration_label": log.duration_label,
        "topic": log.topic,
        "daddy_mood": log.daddy_mood,
        "daughter_mood": log.daughter_mood,
        "note": log.note,
        "attachment": file_url(log.attachment),
        "recorded_by": log.recorded_by,
        "recorded_by_label": _label(log.recorded_by),
        "created_at": log.created_at.isoformat(),
    }


def _parse_time(value, fallback: time) -> time:
    if not value:
        return fallback
    try:
        return datetime.strptime(str(value)[:5], "%H:%M").time()
    except ValueError:
        return fallback


def _parse_date(value, fallback):
    if not value:
        return fallback
    try:
        return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()
    except ValueError:
        return fallback


# ------------------------------------------------------------ بازه‌های آزاد --
@api_view(["GET", "POST"])
@require_session
def slots(request):
    if request.method == "GET":
        qs = CallFreeSlot.objects.filter(is_active=True)
        owner = request.GET.get("owner")
        if owner in OWNER_LABEL:
            qs = qs.filter(owner=owner)
        return Response({"items": [_slot_json(s) for s in qs], "overlap": _overlaps()})

    data = request.data if isinstance(request.data, dict) else {}
    owner = data.get("owner") if data.get("owner") in OWNER_LABEL else "daughter"
    start = _parse_time(data.get("start"), time(20, 0))
    end = _parse_time(data.get("end"), time(21, 0))
    if end <= start:
        return Response({"ok": False, "message": "ساعت پایان باید بعد از شروع باشد"}, status=400)
    weekday = bounded_int(data.get("weekday", 0), default=0, minimum=0, maximum=6)

    slot = CallFreeSlot.objects.create(
        owner=owner,
        weekday=weekday,
        start_time=start,
        end_time=end,
        note=str(data.get("note") or "")[:120],
    )
    log_activity("بازه‌ی آزاد تماس", "calls", f"{_label(owner)} {slot.get_weekday_display()} {start:%H:%M}-{end:%H:%M}")
    return Response({"ok": True, "item": _slot_json(slot), "overlap": _overlaps()})


@api_view(["DELETE", "POST"])
@require_session
def slot_item(request, pk: int):
    slot = CallFreeSlot.objects.filter(pk=pk).first()
    if not slot:
        return Response({"ok": False}, status=404)
    slot.is_active = False
    slot.save(update_fields=["is_active", "updated_at"])
    return Response({"ok": True, "overlap": _overlaps()})


def _overlaps() -> list[dict]:
    """بازه‌های مشترک هفته — قلبِ این اپ: وقت‌هایی که هر دو آزادیم."""
    result: list[dict] = []
    for weekday in range(7):
        mine = list(CallFreeSlot.objects.filter(owner="daughter", weekday=weekday, is_active=True))
        his = list(CallFreeSlot.objects.filter(owner="daddy", weekday=weekday, is_active=True))
        for a in mine:
            for b in his:
                start = max(a.start_time, b.start_time)
                end = min(a.end_time, b.end_time)
                if end > start:
                    result.append(
                        {
                            "weekday": weekday,
                            "weekday_label": a.get_weekday_display(),
                            "start": start.strftime("%H:%M"),
                            "end": end.strftime("%H:%M"),
                            "minutes": (end.hour * 60 + end.minute) - (start.hour * 60 + start.minute),
                        }
                    )
    result.sort(key=lambda x: (x["weekday"], x["start"]))
    return result


# ------------------------------------------------------------- هماهنگی تماس --
def _notify(event: str, text_daddy: str, title: str, body: str, app: str = "call") -> None:
    push_notification("call", title, body, icon="call", action_app=app)
    notify_daddy(event, text_daddy)


@api_view(["GET", "POST"])
@require_session
def appointments(request):
    settings_obj = CallSettings.get_solo()

    if request.method == "GET":
        qs = CallAppointment.objects.all()
        status_filter = request.GET.get("status")
        if status_filter in dict(CallAppointment.STATUS):
            qs = qs.filter(status=status_filter)
        limit = bounded_int(request.GET.get("limit", 60), default=60, minimum=1, maximum=200)
        return Response({"items": [_appointment_json(a) for a in qs[:limit]]})

    data = request.data if isinstance(request.data, dict) else {}
    proposer = data.get("proposer") if data.get("proposer") in OWNER_LABEL else "daughter"
    date = _parse_date(data.get("date"), timezone.localdate())
    slot_time = _parse_time(data.get("time"), time(20, 0))
    duration = bounded_int(data.get("duration_minutes") or settings_obj.default_duration, default=settings_obj.default_duration, minimum=5, maximum=600)

    appt = CallAppointment.objects.create(
        proposer=proposer,
        proposee=_other(proposer),
        date=date,
        time=slot_time,
        duration_minutes=duration,
        topic=str(data.get("topic") or "")[:160],
        message=str(data.get("message") or "")[:255],
        status="pending",
    )
    if settings_obj.notify_on_propose:
        if proposer == "daughter":
            _notify(
                "call_proposed",
                f"📞 {_label('daughter')} یه تماس پیشنهاد داده: {date} ساعت {slot_time:%H:%M}",
                settings_obj.propose_template,
                f"{date} • {slot_time:%H:%M} • {duration} دقیقه",
            )
        else:
            _notify(
                "call_proposed",
                f"📞 بابا برای {_label('daughter')} تماس پیشنهاد داده: {date} ساعت {slot_time:%H:%M}",
                f"{_label('daddy')} یه تماس پیشنهاد داده ❤",
                f"{date} • {slot_time:%H:%M} • {duration} دقیقه",
            )
    log_activity("پیشنهاد تماس", "calls", f"{_label(proposer)} → {date} {slot_time:%H:%M}")
    return Response({"ok": True, "item": _appointment_json(appt)})


@api_view(["POST"])
@require_session
def appointment_respond(request, pk: int):
    """تأیید / رد / پیشنهاد جایگزین."""
    appt = CallAppointment.objects.filter(pk=pk).first()
    if not appt:
        return Response({"ok": False, "message": "این تماس پیدا نشد"}, status=404)

    data = request.data if isinstance(request.data, dict) else {}
    action = str(data.get("action") or "").strip()
    note = str(data.get("note") or "")[:255]
    settings_obj = CallSettings.get_solo()

    if action == "approve":
        appt.status = "approved"
        appt.answer_note = note
        appt.answered_at = timezone.now()
        appt.save(update_fields=["status", "answer_note", "answered_at", "updated_at"])
        if settings_obj.notify_on_answer:
            _notify(
                "call_approved",
                f"✅ تماس {appt.date} ساعت {appt.time:%H:%M} تأیید شد",
                settings_obj.approved_template,
                f"{appt.date} • {appt.time:%H:%M} • {appt.duration_minutes} دقیقه",
            )

    elif action == "reject":
        appt.status = "rejected"
        appt.answer_note = note
        appt.answered_at = timezone.now()
        appt.save(update_fields=["status", "answer_note", "answered_at", "updated_at"])
        if settings_obj.notify_on_answer:
            _notify(
                "call_rejected",
                f"❌ تماس {appt.date} رد شد: {note or '—'}",
                settings_obj.rejected_template,
                note or "",
            )

    elif action == "reschedule":
        new_date = _parse_date(data.get("date"), appt.date)
        new_time = _parse_time(data.get("time"), appt.time)
        new_duration = bounded_int(data.get("duration_minutes") or appt.duration_minutes, default=appt.duration_minutes, minimum=5, maximum=600)
        appt.status = "rescheduled"
        appt.answer_note = note
        appt.answered_at = timezone.now()
        appt.save(update_fields=["status", "answer_note", "answered_at", "updated_at"])
        alternative = CallAppointment.objects.create(
            proposer=appt.proposee,
            proposee=appt.proposer,
            date=new_date,
            time=new_time,
            duration_minutes=new_duration,
            topic=appt.topic,
            message=note,
            alternative_of=appt,
            status="pending",
        )
        if settings_obj.notify_on_answer:
            _notify(
                "call_rescheduled",
                f"🔁 پیشنهاد جایگزین: {new_date} ساعت {new_time:%H:%M}",
                "یه زمان دیگه پیشنهاد شد 🔁",
                f"{new_date} • {new_time:%H:%M} • {new_duration} دقیقه",
            )
        return Response({"ok": True, "item": _appointment_json(appt), "alternative": _appointment_json(alternative)})

    else:
        return Response({"ok": False, "message": "عملیات نامعتبر"}, status=400)

    log_activity(f"جواب تماس: {appt.get_status_display()}", "calls", f"{appt.date} {appt.time:%H:%M}")
    return Response({"ok": True, "item": _appointment_json(appt)})


@api_view(["POST", "DELETE"])
@require_session
def appointment_cancel(request, pk: int):
    appt = CallAppointment.objects.filter(pk=pk).first()
    if not appt:
        return Response({"ok": False}, status=404)
    appt.status = "canceled"
    appt.save(update_fields=["status", "updated_at"])
    log_activity("لغو تماس", "calls", f"{appt.date} {appt.time:%H:%M}")
    return Response({"ok": True, "item": _appointment_json(appt)})


# ---------------------------------------------------------------- ثبت تماس --
@api_view(["GET", "POST"])
@require_session
def logs(request):
    if request.method == "GET":
        limit = bounded_int(request.GET.get("limit", 60), default=60, minimum=1, maximum=200)
        return Response({"items": [_log_json(log) for log in CallLog.objects.all()[:limit]]})

    data = request.data if isinstance(request.data, dict) else {}
    settings_obj = CallSettings.get_solo()
    appointment = None
    if data.get("appointment"):
        appointment = CallAppointment.objects.filter(pk=data["appointment"]).first()

    duration = bounded_int(data.get("duration_minutes") or 0, default=0, minimum=0, maximum=24 * 60)

    log = CallLog.objects.create(
        appointment=appointment,
        happened_on=_parse_date(data.get("happened_on"), timezone.localdate()),
        happened_at=_parse_time(data.get("happened_at"), None) if data.get("happened_at") else timezone.localtime().time(),
        kind=data.get("kind") if data.get("kind") in dict(CallLog.KINDS) else "video",
        duration_minutes=duration,
        topic=str(data.get("topic") or "")[:160],
        daddy_mood=data.get("daddy_mood") if data.get("daddy_mood") in dict(MOODS) else "happy",
        daughter_mood=data.get("daughter_mood") if data.get("daughter_mood") in dict(MOODS) else "happy",
        note=str(data.get("note") or "")[:255],
        recorded_by=data.get("recorded_by") if data.get("recorded_by") in OWNER_LABEL else "daddy",
    )

    # ضمیمه: یا فایل آپلودی، یا صدای ضبط‌شده در مرورگر
    upload = request.FILES.get("attachment")
    upload_error = validate_upload(upload, "any")
    if upload_error:
        return Response({"ok": False, "message": upload_error}, status=400)
    if upload:
        log.attachment = upload
        log.save(update_fields=["attachment", "updated_at"])

    if appointment:
        appointment.status = "done"
        appointment.save(update_fields=["status", "updated_at"])

    # دستاوردها روی شمارنده‌های عمومی سوار می‌شوند
    bump("call_logged")
    if duration:
        bump("call_total_minutes", duration)

    if settings_obj.notify_on_log:
        notify_daddy(
            "call_logged",
            f"📞 تماس ثبت شد — {log.duration_label}\n{log.topic or 'بدون موضوع'}\n"
            f"حال بابا: {log.get_daddy_mood_display()} | حال دخترم: {log.get_daughter_mood_display()}",
        )
    log_activity("ثبت تماس", "calls", f"{log.duration_minutes} دقیقه")
    return Response({"ok": True, "item": _log_json(log)})


@api_view(["PATCH", "POST"])
@require_session
def log_item(request, pk: int):
    log = CallLog.objects.filter(pk=pk).first()
    if not log:
        return Response({"ok": False}, status=404)
    data = request.data if isinstance(request.data, dict) else {}
    for field, limit in (("topic", 160), ("note", 255)):
        if field in data:
            setattr(log, field, str(data[field])[:limit])
    if "duration_minutes" in data:
        log.duration_minutes = bounded_int(data.get("duration_minutes"), default=log.duration_minutes, minimum=0, maximum=24 * 60)
    for field in ("daddy_mood", "daughter_mood"):
        if data.get(field) in dict(MOODS):
            setattr(log, field, data[field])
    if data.get("kind") in dict(CallLog.KINDS):
        log.kind = data["kind"]
    log.save()
    return Response({"ok": True, "item": _log_json(log)})


# -------------------------------------------------------------------- آمار --
def compute_stats() -> dict:
    """آمار تماس‌ها: این ماه، شش ماه گذشته، رکورد و میانگین (همه محاسبه‌شده)."""
    today = timezone.localdate()
    month_start = today.replace(day=1)
    logs = list(CallLog.objects.all())

    month_logs = [x for x in logs if x.happened_on >= month_start]
    month_minutes = sum(x.duration_minutes for x in month_logs)
    total_minutes = sum(x.duration_minutes for x in logs)
    longest = max(logs, key=lambda x: x.duration_minutes, default=None)

    # نمودار شش ماه گذشته
    months: list[dict] = []
    cursor = month_start
    for _ in range(6):
        first = cursor.replace(day=1)
        next_first = (first + timedelta(days=32)).replace(day=1)
        in_month = [x for x in logs if first <= x.happened_on < next_first]
        months.append(
            {
                "key": first.isoformat(),
                "label": first.strftime("%Y-%m"),
                "count": len(in_month),
                "minutes": sum(x.duration_minutes for x in in_month),
            }
        )
        cursor = first - timedelta(days=1)
    months.reverse()

    return {
        "month_count": len(month_logs),
        "month_minutes": month_minutes,
        "month_label": f"{month_minutes // 60} ساعت و {month_minutes % 60} دقیقه",
        "total_count": len(logs),
        "total_minutes": total_minutes,
        "total_label": f"{total_minutes // 60} ساعت و {total_minutes % 60} دقیقه",
        "longest": _log_json(longest) if longest else None,
        "record_title": (
            f"رکورد تماس: {longest.duration_label} در تاریخ {longest.happened_on:%Y-%m-%d}" if longest else ""
        ),
        "average_minutes": round(total_minutes / len(logs)) if logs else 0,
        "months": months,
        "mood_breakdown": {
            "happy": sum(1 for x in logs if x.daughter_mood == "happy"),
            "normal": sum(1 for x in logs if x.daughter_mood == "normal"),
            "missing": sum(1 for x in logs if x.daughter_mood == "missing"),
        },
    }


@api_view(["GET"])
@require_session
def stats(request):
    return Response(compute_stats())


# ------------------------------------------------------------------ overview --
@api_view(["GET"])
@require_session
def overview(request):
    """یک درخواست، همه‌ی چیزی که اپ لازم دارد — سریع‌تر روی موبایل."""
    settings_obj = CallSettings.get_solo()
    next_call = CallAppointment.next_call()
    return Response(
        {
            "slots": [_slot_json(s) for s in CallFreeSlot.objects.filter(is_active=True)],
            "overlap": _overlaps(),
            "appointments": [_appointment_json(a) for a in CallAppointment.objects.all()[:30]],
            "next": _appointment_json(next_call) if next_call else None,
            "logs": [_log_json(log) for log in CallLog.objects.all()[:10]],
            "stats": compute_stats(),
            "settings": {
                "reminder_minutes": settings_obj.reminder_minutes,
                "default_duration": settings_obj.default_duration,
                "notify_on_propose": settings_obj.notify_on_propose,
                "notify_on_answer": settings_obj.notify_on_answer,
                "notify_on_log": settings_obj.notify_on_log,
                "notify_reminder": settings_obj.notify_reminder,
            },
        }
    )


@api_view(["GET"])
@require_session
def next_call(request):
    """برای ویجت شمارش معکوس روی دسکتاپ."""
    appt = CallAppointment.next_call()
    return Response({"item": _appointment_json(appt) if appt else None})
