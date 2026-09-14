"""تست‌های پل زبان: دیکشنری، فلش‌کارت، streak و کوییز."""
from django.test import TestCase

from accounts.models import DeviceSession, UserConfig
from core.models import OSNotification, SoroushOutbox
from language.models import LanguageCategory, LanguageEntry, LanguageProgress, LanguageQuiz


class LanguageBridgeTests(TestCase):
    def setUp(self):
        UserConfig.get_solo()
        self.session = DeviceSession.issue(hours=1)
        self.auth = {"HTTP_AUTHORIZATION": f"Token {self.session.token}"}
        self.category, _ = LanguageCategory.objects.get_or_create(name="روزمره", defaults={"icon": "🌤"})

    def test_add_word_notifies_other_side(self):
        res = self.client.post(
            "/api/language/entries",
            {
                "kind": "word",
                "text": "خِدِ حَق",
                "language": "mzn",
                "translations": {"fa": "سلام", "tr": "Merhaba"},
                "category": self.category.id,
                "added_by": "daddy",
            },
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(OSNotification.objects.filter(kind="language").exists())
        self.assertTrue(SoroushOutbox.objects.filter(event="language_entry").exists())
        self.assertIn("سلام", res.json()["item"]["translation_labels"])

    def test_idiom_keeps_literal_and_real_meaning(self):
        self.client.post(
            "/api/language/entries",
            {
                "kind": "idiom",
                "text": "دِلِس درمِ از",
                "language": "mzn",
                "literal_meaning": "دلِ من درد گرفت",
                "real_meaning": "خیلی ناراحت شدم",
                "example": "وقتی دلخوری می‌گن",
            },
            content_type="application/json",
            **self.auth,
        )
        entry = LanguageEntry.objects.get()
        self.assertEqual(entry.kind, "idiom")
        self.assertEqual(entry.real_meaning, "خیلی ناراحت شدم")

    def test_flashcards_and_learned_count(self):
        for i in range(5):
            LanguageEntry.objects.create(
                text=f"کلمه {i}", language="mzn", translations={"tr": f"kelime {i}"}, category=self.category
            )
        cards = self.client.get("/api/language/flashcards?target=tr&count=3", **self.auth).json()
        self.assertEqual(len(cards["items"]), 3)
        self.assertEqual(cards["items"][0]["answer"][:6], "kelime")

        ids = [c["id"] for c in cards["items"]]
        res = self.client.post(
            "/api/language/practice",
            {"owner": "daughter", "mode": "flash", "learned_ids": ids, "correct": 3, "total": 3},
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["progress"]["learned_count"], 3)
        self.assertEqual(res.json()["progress"]["streak"], 1)

    def test_streak_grows_only_on_new_days(self):
        progress = LanguageProgress.get_for("daughter")
        progress.mark_learned(1)
        self.assertEqual(progress.streak, 1)
        progress.mark_learned(2)  # همان روز
        self.assertEqual(progress.streak, 1, "دو تمرین در یک روز streak را دو برابر نمی‌کند")
        self.assertEqual(progress.learned_count, 2)

    def test_quiz_is_admin_managed_and_scores(self):
        q = LanguageQuiz.objects.create(
            question="«Merhaba» یعنی چی؟", options=["سلام", "خداحافظ"], answer="سلام", fun_feedback="آفرین!"
        )
        listing = self.client.get("/api/language/quiz?count=5", **self.auth).json()
        self.assertEqual(len(listing["items"]), 1)
        self.assertIn("سلام", listing["items"][0]["options"])

        res = self.client.post(
            "/api/language/quiz/submit",
            {"owner": "daughter", "answers": [{"id": q.id, "answer": "سلام"}]},
            content_type="application/json",
            **self.auth,
        )
        body = res.json()
        self.assertEqual(body["correct"], 1)
        self.assertEqual(body["total"], 1)
        self.assertTrue(body["details"][0]["correct"])
        self.assertTrue(SoroushOutbox.objects.filter(event="language_quiz").exists())

    def test_stats_splits_words_and_idioms(self):
        LanguageEntry.objects.create(text="سلام", kind="word")
        LanguageEntry.objects.create(text="آب زیر کاه", kind="idiom")
        stats = self.client.get("/api/language/stats", **self.auth).json()
        self.assertEqual(stats["words"], 1)
        self.assertEqual(stats["idioms"], 1)
        self.assertEqual(len(stats["progress"]), 2)
