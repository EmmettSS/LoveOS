"""
تست‌های هماهنگ‌کننده‌ی تماس.

این تست‌ها سه چیز را تضمین می‌کنند:
  ۱) بازه‌های آزاد دو طرف درست به «بازه‌ی مشترک» تبدیل می‌شوند.
  ۲) هر رویداد (پیشنهاد، تأیید، رد، جایگزین، ثبت تماس) نوتیف و پیام سروش می‌سازد.
  ۳) یادآوری پیش از تماس از طریق cron (sweep) دقیقاً یک بار فرستاده می‌شود.
"""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from accounts.models import DeviceSession, UserConfig
from calls.models import CallAppointment, CallFreeSlot, CallLog
from core.models import OSNotification, SoroushOutbox


class CallSyncTests(TestCase):
    def setUp(self):
        UserConfig.get_solo()
        self.session = DeviceSession.issue(hours=1)
        self.auth = {"HTTP_AUTHORIZATION": f"Token {self.session.token}"}

    # -------------------------------------------------------- بازه‌های آزاد
    def test_overlap_detects_shared_windows(self):
        CallFreeSlot.objects.create(owner="daddy", weekday=0, start_time="20:00", end_time="22:00")
        res = self.client.post(
            "/api/calls/slots",
            {"owner": "daughter", "weekday": 0, "start": "21:00", "end": "23:00"},
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(res.status_code, 200)
        overlap = res.json()["overlap"]
        self.assertEqual(len(overlap), 1, "باید یک بازه‌ی مشترک پیدا شود")
        self.assertEqual(overlap[0]["start"], "21:00")
        self.assertEqual(overlap[0]["end"], "22:00")
        self.assertEqual(overlap[0]["minutes"], 60)

    def test_invalid_slot_is_rejected(self):
        res = self.client.post(
            "/api/calls/slots",
            {"owner": "daddy", "weekday": 1, "start": "22:00", "end": "21:00"},
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(res.status_code, 400)
        self.assertFalse(CallFreeSlot.objects.exists())

    # ----------------------------------------------------------- هماهنگی
    def test_propose_notifies_both_sides(self):
        res = self.client.post(
            "/api/calls/appointments",
            {"proposer": "daughter", "date": str(timezone.localdate() + timedelta(days=1)), "time": "21:00"},
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(OSNotification.objects.filter(kind="call").exists(), "نوتیف داخل اپ ساخته نشد")
        self.assertTrue(SoroushOutbox.objects.filter(event="call_proposed").exists(), "پیام سروش برای بابا ساخته نشد")

    def test_reschedule_creates_alternative_and_marks_original(self):
        appt = CallAppointment.objects.create(
            proposer="daughter", proposee="daddy", date=timezone.localdate() + timedelta(days=1), time="20:00"
        )
        res = self.client.post(
            f"/api/calls/appointments/{appt.id}/respond",
            {"action": "reschedule", "date": str(timezone.localdate() + timedelta(days=3)), "time": "19:00"},
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(res.status_code, 200)
        appt.refresh_from_db()
        self.assertEqual(appt.status, "rescheduled")
        alternative = CallAppointment.objects.get(alternative_of=appt)
        self.assertEqual(alternative.proposer, "daddy")
        self.assertEqual(str(alternative.time), "19:00:00")

    def test_timezone_conversion_is_attached_to_appointment(self):
        """ساعت تماس باید به وقت محلی هر دو طرف هم برگردد."""
        res = self.client.post(
            "/api/calls/appointments",
            {"proposer": "daughter", "date": str(timezone.localdate() + timedelta(days=2)), "time": "21:00"},
            content_type="application/json",
            **self.auth,
        )
        sides = res.json()["item"]["sides_time"]
        self.assertIn("daddy", sides)
        self.assertIn("daughter", sides)
        self.assertIn("time", sides["daddy"])

    # ------------------------------------------------------------ آمار
    def test_log_updates_stats_and_achievement_counter(self):
        res = self.client.post(
            "/api/calls/logs",
            {"duration_minutes": 195, "topic": "فیلم با هم", "daughter_mood": "happy"},
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(res.status_code, 200)
        stats = self.client.get("/api/calls/stats", **self.auth).json()
        self.assertEqual(stats["month_count"], 1)
        self.assertEqual(stats["month_minutes"], 195)
        self.assertEqual(stats["average_minutes"], 195)
        self.assertIn("3 ساعت و 15 دقیقه", stats["record_title"])
        self.assertEqual(len(stats["months"]), 6, "نمودار شش ماه گذشته باید کامل باشد")

    def test_overview_returns_next_call(self):
        soon = timezone.localtime() + timedelta(minutes=45)
        CallAppointment.objects.create(
            proposer="daddy", proposee="daughter", date=soon.date(), time=soon.time(), status="approved"
        )
        data = self.client.get("/api/calls/overview", **self.auth).json()
        self.assertIsNotNone(data["next"])
        self.assertEqual(data["next"]["status"], "approved")
        self.assertIn("stats", data)
        self.assertIn("overlap", data)

    # -------------------------------------------------------- یادآوری cron
    def test_sweep_sends_reminder_only_once(self):
        from django.core.management import call_command

        soon = timezone.localtime() + timedelta(minutes=10)
        appt = CallAppointment.objects.create(
            proposer="daddy", proposee="daughter", date=soon.date(), time=soon.time(),
            status="approved", duration_minutes=30,
        )
        call_command("sweep")
        appt.refresh_from_db()
        self.assertTrue(appt.reminder_sent)
        self.assertTrue(SoroushOutbox.objects.filter(event="call_reminder").exists())

        SoroushOutbox.objects.all().delete()
        appt.reminder_sent = False
        appt.date = soon.date() + timedelta(days=2)
        appt.save(update_fields=["reminder_sent", "date"])
        call_command("sweep")
        self.assertFalse(SoroushOutbox.objects.filter(event="call_reminder").exists(), "یادآوری زودهنگام نباید برود")
