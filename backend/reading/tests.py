"""تست‌های کتاب‌خوانی مشترک: قفسه، یادداشت، پیشرفت، نقل‌قول و گفتگوی فصل."""
from django.test import TestCase

from accounts.models import DeviceSession, UserConfig
from core.models import OSNotification
from library.models import Book as LibraryBook
from reading.models import ChapterComment, ReadingBook, ReadingQuote


class ReadTogetherTests(TestCase):
    def setUp(self):
        UserConfig.get_solo()
        self.session = DeviceSession.issue(hours=1)
        self.auth = {"HTTP_AUTHORIZATION": f"Token {self.session.token}"}

    def _book_with_chapters(self, chapters=3) -> ReadingBook:
        book = ReadingBook.objects.create(title="کتاب تست", added_by="daddy", status="reading")
        for i in range(1, chapters + 1):
            from reading.models import ReadingChapter

            ReadingChapter.objects.create(book=book, order=i, title=f"فصل {i}")
        book.total_chapters = chapters
        book.save()
        return book

    def test_daughter_can_add_book_and_notifies(self):
        res = self.client.post(
            "/api/reading/books",
            {"title": "ملت عشق", "author": "الیف شافاک", "added_by": "daughter", "total_chapters": 2},
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(OSNotification.objects.filter(kind="book").exists())
        self.assertEqual(res.json()["item"]["progress"]["daughter"], 0)

    def test_progress_percent_follows_notes(self):
        book = self._book_with_chapters(4)
        chapter_ids = list(book.chapters.values_list("id", flat=True))
        for cid in chapter_ids[:2]:
            self.client.post(
                f"/api/reading/chapters/{cid}/notes",
                {"owner": "daughter", "text": "خوندم", "is_finished": True, "rating": 5},
                content_type="application/json",
                **self.auth,
            )
        data = self.client.get(f"/api/reading/books/{book.id}", **self.auth).json()
        self.assertEqual(data["item"]["progress"]["daughter"], 50)
        self.assertEqual(data["item"]["progress"]["daddy"], 0)

    def test_book_marked_finished_when_both_reach_hundred(self):
        book = self._book_with_chapters(2)
        for cid in book.chapters.values_list("id", flat=True):
            for owner in ("daddy", "daughter"):
                self.client.post(
                    f"/api/reading/chapters/{cid}/notes",
                    {"owner": owner, "text": "تموم شد", "is_finished": True},
                    content_type="application/json",
                    **self.auth,
                )
        book.refresh_from_db()
        self.assertEqual(book.status, "finished")
        self.assertIsNotNone(book.finished_on)

    def test_quote_and_chapter_conversation(self):
        book = self._book_with_chapters(1)
        chapter = book.chapters.first()
        res = self.client.post(
            f"/api/reading/chapters/{chapter.id}/quotes",
            {"owner": "daughter", "text": "عشق، تنها پلی است که از آن می‌توان به دلِ دیگری رفت."},
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(res.status_code, 200)
        gallery = self.client.get("/api/reading/quotes", **self.auth).json()
        self.assertEqual(len(gallery["items"]), 1)

        self.client.post(
            f"/api/reading/chapters/{chapter.id}/comments",
            {"owner": "daddy", "text": "این فصل رو دوست داشتم"},
            content_type="application/json",
            **self.auth,
        )
        self.assertTrue(ChapterComment.objects.exists())
        note = self.client.post(
            f"/api/reading/chapters/{chapter.id}/notes",
            {"owner": "daughter", "text": "قشنگ بود", "is_finished": True, "rating": 4},
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(note.json()["item"]["rating"], 4)
        self.assertTrue(ReadingQuote.objects.exists())

    def test_shelf_shows_library_books_too(self):
        """قفسه‌ی مشترک: کتاب‌های اپ کتابخانه هم دیده می‌شوند."""
        LibraryBook.objects.create(title="داستان ما", subtitle="نوشته‌ی بابا و دخترش")
        self._book_with_chapters(2)
        data = self.client.get("/api/reading/overview", **self.auth).json()
        self.assertTrue(any(item["source"] == "library" for item in data["library"]))
        self.assertEqual(data["counts"]["reading"], 1)

    def test_library_book_can_join_the_shelf(self):
        """قفسه‌ی مشترک: کتاب کتابخانه با یک درخواست به قفسه‌ی کتاب‌خوانی وصل می‌شود."""
        lib = LibraryBook.objects.create(title="داستان ما")
        res = self.client.post(
            "/api/reading/books",
            {"title": lib.title, "library_book": lib.id, "status": "reading", "total_chapters": 3},
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(res.status_code, 200)
        book_id = res.json()["item"]["id"]
        shelf = self.client.get("/api/reading/overview", **self.auth).json()
        linked = [item for item in shelf["library"] if item["library_book"] == lib.id][0]
        self.assertTrue(linked["in_reading"])
        # درخواست دوم نباید نسخه‌ی تکراری بسازد
        again = self.client.post(
            "/api/reading/books",
            {"title": lib.title, "library_book": lib.id},
            content_type="application/json",
            **self.auth,
        )
        self.assertTrue(again.json()["already"])
        self.assertEqual(ReadingBook.objects.count(), 1)
        self.assertEqual(ReadingBook.objects.get().id, book_id)

    def test_chapter_creation_appends_order(self):
        book = self._book_with_chapters(2)
        res = self.client.post(
            f"/api/reading/books/{book.id}/chapters",
            {"title": "فصل سوم"},
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["item"]["order"], 3)

    def test_book_without_chapters_gets_auto_chapters(self):
        # فرم اپ فقط «تعداد فصل» می‌دهد؛ فصل‌های خالی خودکار ساخته می‌شوند تا
        # یادداشت/نقل‌قول/گفتگو از همان اول ممکن باشد.
        res = self.client.post(
            "/api/reading/books",
            {"title": "کتاب بی‌فصل", "added_by": "daughter", "total_chapters": 3},
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(res.status_code, 200)
        book = ReadingBook.objects.get(title="کتاب بی‌فصل")
        self.assertEqual(book.chapters.count(), 3)
        self.assertEqual(list(book.chapters.order_by("order").values_list("order", flat=True)), [1, 2, 3])
