"""
API چرخه و مراقبت — پریود، علائم، داروها، گزارش‌ها
مهم: تحلیل‌ها فقط از تاریخچه‌ی خود دخترم محاسبه می‌شوند.
"""
from datetime import datetime, timedelta
from statistics import mean

from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from core.auth import require_session
from core.services import bump, log_activity, push_notification
from core.soroush import notify_daddy
from core.utils import bounded_int, iso_date
from health.models import CareReminder, CycleEntry, Medication, MedicationLog, SymptomLog

DISCLAIMER = "این اپ جایگزین مشاوره پزشک نیست."


# --------------------------------------------------------------- تحلیل ----
def cycle_stats() -> dict:
    entries = list(CycleEntry.objects.order_by("start_date"))
    gaps = [
        (entries[i + 1].start_date - entries[i].start_date).days
        for i in range(len(entries) - 1)
    ]
    lengths = [e.length for e in entries if e.length]
    avg_cycle = round(mean(gaps)) if gaps else 28
    avg_period = round(mean(lengths)) if lengths else 5
    messages: list[str] = []
    alert = False
    if gaps:
        last = gaps[-1]
        if last < 21 or last > 35:
            alert = True
            messages.append("طول چرخه‌ات از حالت معمول خارج شده؛ بهتره با پزشک مشورت کنی.")
        elif max(gaps[-3:]) - min(gaps[-3:]) <= 3:
            messages.append("چرخه‌ات منظمه 🌸")
        if len(gaps) >= 3 and mean(gaps[-3:]) + 3 < mean(gaps[:-3] or gaps):
            messages.append("۳ ماهه طول چرخه‌ات کوتاه‌تر شده، شاید بهتره با پزشک مشورت کنی.")
    last_start = entries[-1].start_date if entries else None
    next_start = last_start + timedelta(days=avg_cycle) if last_start else None
    return {
        "avg_cycle": avg_cycle,
        "avg_period": avg_period,
        "gaps": gaps[-12:],
        "messages": messages,
        "alert": alert,
        "last_start": last_start.isoformat() if last_start else None,
        "next_start": next_start.isoformat() if next_start else None,
        "next_end": (next_start + timedelta(days=avg_period - 1)).isoformat() if next_start else None,
        "ovulation": (next_start - timedelta(days=14)).isoformat() if next_start else None,
    }


@api_view(["GET"])
@require_session
def cycle_overview(request):
    entries = CycleEntry.objects.order_by("-start_date")[:24]
    stats = cycle_stats()
    active = CycleEntry.objects.filter(end_date__isnull=True).order_by("-start_date").first()
    return Response(
        {
            "disclaimer": DISCLAIMER,
            "active_period": {"id": active.id, "start_date": active.start_date.isoformat()} if active else None,
            "entries": [
                {
                    "id": e.id,
                    "start_date": e.start_date.isoformat(),
                    "end_date": e.end_date.isoformat() if e.end_date else None,
                    "length": e.length,
                }
                for e in entries
            ],
            "stats": stats,
        }
    )


@api_view(["POST"])
@require_session
def cycle_start(request):
    today = timezone.localdate()
    if CycleEntry.objects.filter(end_date__isnull=True).exists():
        return Response({"ok": False, "message": "یه دوره‌ی باز داری، اول پایانش رو ثبت کن"})
    entry = CycleEntry.objects.create(start_date=today)
    stats = cycle_stats()
    notify_daddy("period_start", "دخترت شروع پریودش رو ثبت کرد 🌸 هواشو داشته باش")
    if stats["alert"]:
        notify_daddy("cycle_anomaly", "⚠️ طول چرخه‌ی دخترت غیرعادی شده؛ یادش بنداز به پزشک سر بزنه")
    log_activity("شروع پریود", "cycle")
    return Response({"ok": True, "id": entry.id, "stats": stats})


@api_view(["POST"])
@require_session
def cycle_end(request):
    entry = CycleEntry.objects.filter(end_date__isnull=True).order_by("-start_date").first()
    if not entry:
        return Response({"ok": False, "message": "دوره‌ی بازی وجود نداره"})
    entry.end_date = timezone.localdate()
    entry.save(update_fields=["end_date"])
    notify_daddy("period_end", "پریود دخترت تموم شد ✅")
    months = CycleEntry.objects.count()
    if months:
        bump("cycle_months", 0)
        from core.models import Counter

        Counter.objects.update_or_create(key="cycle_months", defaults={"value": months})
    return Response({"ok": True, "stats": cycle_stats()})


# --------------------------------------------------------------- علائم ----
SYMPTOM_FIELDS = ["mood", "energy", "headache", "backache", "stomachache", "nausea", "sleep", "appetite", "note"]


@api_view(["GET", "POST"])
@require_session
def symptoms(request):
    if request.method == "POST":
        day = iso_date(request.data.get("day"), timezone.localdate())
        log, _ = SymptomLog.objects.get_or_create(day=day)
        for f in SYMPTOM_FIELDS:
            if f in request.data:
                setattr(log, f, request.data[f])
        log.save()
        if log.severity >= 4:
            notify_daddy("symptoms", "دخترت امروز حالش خوب نیست 🥺 یه پیام بهش بده")
        return Response({"ok": True, "severity": log.severity})

    days = bounded_int(request.GET.get("days", 60), default=60, minimum=1, maximum=366)
    since = timezone.localdate() - timedelta(days=days)
    qs = SymptomLog.objects.filter(day__gte=since)
    return Response(
        {
            "items": [
                {"day": s.day.isoformat(), **{f: getattr(s, f) for f in SYMPTOM_FIELDS}, "severity": s.severity}
                for s in qs
            ]
        }
    )


# -------------------------------------------------------------- داروها ----
def med_json(m: Medication) -> dict:
    return {
        "id": m.id,
        "name": m.name,
        "dose": m.dose,
        "pills_per_time": m.pills_per_time,
        "times": m.times,
        "duration": m.duration,
        "start_date": m.start_date.isoformat(),
        "note": m.note,
        "is_active": m.is_active,
    }


@api_view(["GET", "POST"])
@require_session
def medications(request):
    if request.method == "POST":
        raw_times = request.data.get("times") or []
        if not isinstance(raw_times, list):
            raw_times = []
        valid_times = []
        for raw_time in raw_times[:24]:
            try:
                valid_times.append(datetime.strptime(str(raw_time), "%H:%M").strftime("%H:%M"))
            except (TypeError, ValueError):
                continue
        med = Medication.objects.create(
            name=request.data.get("name", ""),
            dose=request.data.get("dose", ""),
            pills_per_time=bounded_int(request.data.get("pills_per_time"), default=1, minimum=1, maximum=20),
            times=valid_times,
            duration=request.data.get("duration", "ongoing"),
            note=request.data.get("note", ""),
        )
        notify_daddy("med_added", f"دخترت داروی «{med.name}» رو اضافه کرد 💊")
        return Response({"ok": True, "item": med_json(med)})
    return Response({"items": [med_json(m) for m in Medication.objects.filter(is_active=True)]})


@api_view(["GET"])
@require_session
def medication_today(request):
    """نوبت‌های امروز + وضعیت هرکدام."""
    today = timezone.localdate()
    logs = MedicationLog.objects.filter(scheduled_for__date=today)
    by_key = {(l.medication_id, l.scheduled_for.strftime("%H:%M")): l for l in logs}
    items = []
    for med in Medication.objects.filter(is_active=True):
        for t in med.times:
            log = by_key.get((med.id, t))
            items.append(
                {
                    "medication_id": med.id,
                    "name": med.name,
                    "dose": med.dose,
                    "pills": med.pills_per_time,
                    "note": med.note,
                    "time": t,
                    "log_id": log.id if log else None,
                    "status": log.status if log else "pending",
                }
            )
    items.sort(key=lambda x: x["time"])
    return Response({"items": items, "disclaimer": DISCLAIMER})


@api_view(["POST"])
@require_session
def medication_act(request):
    """«خوردم» / «بعداً» / «نمی‌تونم بخورم» — هرکدام رویداد سروش دارد."""
    med_id = request.data.get("medication_id")
    time_str = request.data.get("time", "08:00")
    action = str(request.data.get("action") or "taken")
    med = Medication.objects.filter(pk=med_id).first()
    if not med:
        return Response({"ok": False}, status=404)
    if action not in {"taken", "snooze", "skip", "skipped"}:
        return Response({"ok": False, "message": "عملیات نامعتبر"}, status=400)
    try:
        parsed_time = datetime.strptime(str(time_str), "%H:%M").time()
    except (TypeError, ValueError):
        return Response({"ok": False, "message": "ساعت نامعتبر"}, status=400)
    scheduled = timezone.make_aware(datetime.combine(timezone.localdate(), parsed_time))
    log, _ = MedicationLog.objects.get_or_create(medication=med, scheduled_for=scheduled)
    log.acted_at = timezone.now()
    if action == "taken":
        log.status = "taken"
        bump("med_streak")
        notify_daddy("med_taken", f"دخترت قرص «{med.name}» رو خورد ✅")
    elif action == "snooze":
        log.status = "snoozed"
        log.snooze_until = timezone.now() + timedelta(minutes=15)
        push_notification("med", f"یادآوری دوباره: {med.name}", "۱۵ دقیقه دیگه یادت میندازم ⏰")
    else:
        log.status = "skipped"
        notify_daddy("med_skipped", f"⚠️ دخترت قرص «{med.name}» رو نخورد")
    log.save()
    return Response({"ok": True, "status": log.status})


@api_view(["GET"])
@require_session
def medication_report(request):
    """نمودار پایبندی ۳۰ روز اخیر."""
    since = timezone.now() - timedelta(days=30)
    logs = MedicationLog.objects.filter(scheduled_for__gte=since)
    taken = logs.filter(status="taken").count()
    skipped = logs.filter(status="skipped").count()
    total = logs.count()
    by_day: dict[str, dict] = {}
    for log in logs:
        key = log.scheduled_for.date().isoformat()
        slot = by_day.setdefault(key, {"taken": 0, "skipped": 0})
        if log.status == "taken":
            slot["taken"] += 1
        elif log.status == "skipped":
            slot["skipped"] += 1
    return Response(
        {
            "taken": taken,
            "skipped": skipped,
            "total": total,
            "adherence": round(taken / total * 100) if total else 0,
            "by_day": [{"day": k, **v} for k, v in sorted(by_day.items())],
            "disclaimer": DISCLAIMER,
        }
    )


# ------------------------------------------------------ مراقبت از خود ----
@api_view(["GET"])
@require_session
def care_reminders(request):
    return Response(
        {
            "items": [
                {"id": c.id, "text": c.text, "hour": c.hour, "minute": c.minute, "enabled": c.enabled}
                for c in CareReminder.objects.all()
            ]
        }
    )


@api_view(["POST"])
@require_session
def care_toggle(request, pk: int):
    c = CareReminder.objects.filter(pk=pk).first()
    if not c:
        return Response({"ok": False}, status=404)
    c.enabled = not c.enabled
    c.save(update_fields=["enabled"])
    return Response({"ok": True, "enabled": c.enabled})
