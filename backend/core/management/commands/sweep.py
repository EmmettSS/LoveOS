"""
manage.py sweep — موتور زمان‌بندی مرکزی LoveOS
هر دقیقه با cron اجرا می‌شود و کارهای زمان‌دار را انجام می‌دهد:
  • باز کردن خاطره‌های آینده که وقتشان رسیده
  • نامه‌های زمان‌دار
  • نوبت داروها → اعلان + سروش
  • یادآورهای مهربان (دستی + قوانین خودکار: هوا، پریود، سالگرد، تولد، تصادفی)
  • یادآورهای مراقبتی
  • خالی کردن صف سروش
Cron:  * * * * * cd /srv/loveos/backend && .venv/bin/python manage.py sweep
"""
import random
from datetime import datetime, timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from accounts.models import UserConfig
from calls.models import CallAppointment, CallSettings
from content.models import Letter, Memory
from core.models import OSNotification
from core.services import effective_daughter_location, push_notification
from core.soroush import flush_outbox, notify_daddy
from health.models import CareReminder, CycleEntry, Medication, MedicationLog
from social.models import Reminder, ReminderLog

RANDOM_MESSAGES = [
    "بابا بهت فکر می‌کنه ❤",
    "یه نفس عمیق بکش 🌸",
    "یه کم به خودت برس 🌿",
]
WEATHER_RULES = {
    "weather_rain": "چتر یادت نره ☔",
    "weather_snow": "خودت رو گرم نگه دار ❄",
    "weather_hot": "آب بیشتری بخور ☀",
    "weather_cold": "یه چای گرم بخور 🍵",
}
MAX_ACTIVE_REMINDERS = 5


class Command(BaseCommand):
    help = "اجرای کارهای زمان‌بندی‌شده‌ی LoveOS (هر دقیقه)"

    def handle(self, *args, **options):
        now = timezone.now()
        cfg = UserConfig.get_solo()
        done = []

        done.append(f"memories={self.unlock_memories(now)}")
        done.append(f"letters={self.open_letters(now)}")
        done.append(f"meds={self.medication_slots(now)}")
        done.append(f"care={self.care_reminders(now)}")
        done.append(f"reminders={self.gentle_reminders(now, cfg)}")
        done.append(f"calls={self.call_reminders(now)}")
        done.append(f"outbox={flush_outbox()}")

        self.stdout.write(self.style.SUCCESS("sweep ok: " + " ".join(done)))

    # ------------------------------------------------------ یادآور تماس ----
    def call_reminders(self, now) -> int:
        """
        نیم ساعت (یا هر عددی که بابا تنظیم کرده) قبل از تماس تأییدشده،
        به هر دو طرف خبر می‌دهد و در سروش هم به بابا پیام می‌رود.
        """
        settings_obj = CallSettings.get_solo()
        if not settings_obj.notify_reminder:
            return 0
        window = min(max(5, settings_obj.reminder_minutes), 180)
        count = 0
        for appt in CallAppointment.objects.filter(status="approved", reminder_sent=False, date__gte=now.date()):
            seconds = appt.seconds_to_start
            if 0 < seconds <= window * 60:
                minutes_left = max(1, seconds // 60)
                push_notification(
                    "call",
                    "تماس بعدی نزدیکه ❤",
                    f"{minutes_left} دقیقه تا تماس با «{(appt.proposee == 'daddy') and (UserConfig.get_solo().daddy_name or 'بابا') or 'دخترم'}» — {appt.topic or 'بدون موضوع'}",
                    icon="call",
                    action_app="call",
                )
                notify_daddy(
                    "call_reminder",
                    f"⏰ {minutes_left} دقیقه تا تماس با {appt.proposee == 'daddy' and 'دخترم' or 'بابا'} "
                    f"({appt.date} ساعت {appt.time:%H:%M})",
                )
                appt.reminder_sent = True
                appt.save(update_fields=["reminder_sent", "updated_at"])
                count += 1
        return count

    # ------------------------------------------------------------ خاطره‌ها
    def unlock_memories(self, now) -> int:
        qs = Memory.objects.filter(is_future=True, is_unlocked=False, unlock_at__lte=now)
        count = 0
        for m in qs:
            m.is_unlocked = True
            m.save(update_fields=["is_unlocked"])
            push_notification("memory", "یه خاطره باز شد ✨", m.title, action_app="memories")
            notify_daddy("memory_unlocked", f"خاطره‌ی «{m.title}» برای دخترت باز شد ✨")
            count += 1
        return count

    # -------------------------------------------------------------- نامه‌ها
    def open_letters(self, now) -> int:
        qs = Letter.objects.filter(is_active=True, is_opened=False, open_at__lte=now)
        count = 0
        for le in qs:
            push_notification("daddy", "یه نامه برات باز شد 💌", le.title, action_app="whisper")
            count += 1
        return count

    # --------------------------------------------------------------- داروها
    def medication_slots(self, now) -> int:
        local = timezone.localtime(now)
        created = 0
        for med in Medication.objects.filter(is_active=True):
            if med.end_date and local.date() > med.end_date:
                continue
            for t in med.times:
                try:
                    hh, mm = (int(x) for x in str(t).split(":"))
                except ValueError:
                    continue
                scheduled = timezone.make_aware(
                    datetime.combine(local.date(), datetime.min.time()).replace(hour=hh, minute=mm)
                )
                if not (0 <= (now - scheduled).total_seconds() <= 120):
                    continue
                log, is_new = MedicationLog.objects.get_or_create(medication=med, scheduled_for=scheduled)
                if is_new:
                    push_notification(
                        "med",
                        f"وقت قرصته: {med.name} 💊",
                        f"{med.pills_per_time} عدد — {med.note}".strip(" —"),
                        action_app="cycle",
                        payload={"medication_id": med.id, "time": f"{hh:02d}:{mm:02d}"},
                    )
                    created += 1
            # یادآوری‌های snooze شده
            for log in MedicationLog.objects.filter(
                medication=med, status="snoozed", snooze_until__lte=now
            ):
                log.status = "pending"
                log.save(update_fields=["status"])
                push_notification("med", f"دوباره یادآوری: {med.name} 💊", med.note, action_app="cycle")
        return created

    # ------------------------------------------------------- مراقبت از خود
    def care_reminders(self, now) -> int:
        local = timezone.localtime(now)
        count = 0
        for care in CareReminder.objects.filter(enabled=True):
            if care.hour == local.hour and care.minute == local.minute:
                push_notification("reminder", "مراقب خودت باش 🌿", care.text)
                count += 1
        return count

    # ---------------------------------------------------- یادآور مهربان --
    def gentle_reminders(self, now, cfg) -> int:
        """حداکثر ۵ یادآور فعال هم‌زمان؛ بدون یادآور روزانه‌ی تکراری."""
        active = OSNotification.objects.filter(kind="reminder", is_read=False, is_active=True).count()
        if active >= MAX_ACTIVE_REMINDERS:
            return 0
        local = timezone.localtime(now)
        today = local.date()
        fired = 0

        def fire(reminder: Reminder):
            nonlocal fired, active
            if active >= MAX_ACTIVE_REMINDERS or reminder.muted_by_daughter:
                return
            push_notification(
                "reminder",
                reminder.title,
                reminder.text,
                payload={"reminder_id": reminder.id},
            )
            ReminderLog.objects.create(reminder=reminder)
            notify_daddy("reminder_sent", f"یادآور «{reminder.title}» برای دخترت ارسال شد")
            fired += 1
            active += 1

        # ۱) یادآورهای دستی
        for r in Reminder.objects.filter(is_active=True, rtype="manual", when__lte=now):
            last = r.logs.order_by("-sent_at").first()
            if r.repeat == "once":
                if last:
                    continue
                fire(r)
            else:
                gap = timedelta(days=max(r.repeat_days, 1))
                if not last or (now - last.sent_at) >= gap:
                    fire(r)

        # فقط یک‌بار در روز قوانین خودکار را بررسی کن (ساعت ۹ صبح)
        if local.hour == 9 and local.minute == 0:
            # ۲) سالگرد و تولد
            if cfg.anniversary and (cfg.anniversary.month, cfg.anniversary.day) == (today.month, today.day):
                self.auto_fire("anniversary", "روز ماست 🎉", "امروز روز ماست 🎉", fire)
            if cfg.daughter_birthday and (cfg.daughter_birthday.month, cfg.daughter_birthday.day) == (
                today.month,
                today.day,
            ):
                self.auto_fire("birthday", "تولدت مبارک 🎂", "تولدت مبارک دخترم 🎂", fire)

            # ۳) پریود
            last_cycle = CycleEntry.objects.order_by("-start_date").first()
            if last_cycle:
                predicted = last_cycle.start_date + timedelta(days=28)
                if (predicted - today).days == 2:
                    self.auto_fire("cycle_before", "دو روز مونده", "شکلات بخر، آماده باش 🍫", fire)
                if predicted == today:
                    self.auto_fire("cycle_start", "امروز روز توئه", "امروز خودت رو بیشتر دوست داشته باش ❤", fire)

            # ۴) آب‌وهوا
            self.weather_rules(cfg, fire)

            # ۵) تصادفی
            if random.random() < 0.5:
                self.auto_fire("random", "یه چیز کوچولو", random.choice(RANDOM_MESSAGES), fire)
        return fired

    def auto_fire(self, rtype: str, title: str, text: str, fire) -> None:
        reminder, _ = Reminder.objects.get_or_create(
            rtype=rtype, defaults={"title": title, "text": text, "repeat": "every_n", "repeat_days": 1}
        )
        if not reminder.is_active:
            return
        last = reminder.logs.order_by("-sent_at").first()
        if last and (timezone.now() - last.sent_at) < timedelta(hours=20):
            return
        fire(reminder)

    def weather_rules(self, cfg, fire) -> None:
        from social.api import fetch_weather

        eff = effective_daughter_location(cfg)
        data = fetch_weather(eff["lat"], eff["lng"], eff["timezone"])
        if not data.get("ok"):
            return
        icon, temp = data.get("icon"), data.get("temp")
        rtype = None
        if icon == "rain":
            rtype = "weather_rain"
        elif icon == "snow":
            rtype = "weather_snow"
        elif temp is not None and temp >= 30:
            rtype = "weather_hot"
        elif temp is not None and temp <= 5:
            rtype = "weather_cold"
        if rtype:
            self.auto_fire(rtype, "هوای امروزت", WEATHER_RULES[rtype], fire)
