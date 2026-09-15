"""تست‌های قرارداد و پایداری API پازل قلب."""
from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from PIL import Image

from accounts.models import DeviceSession
from games.models import Puzzle, PuzzleRecord


def image_file(name: str = "heart.jpg") -> SimpleUploadedFile:
    stream = BytesIO()
    Image.new("RGB", (32, 32), (255, 100, 160)).save(stream, format="JPEG")
    return SimpleUploadedFile(name, stream.getvalue(), content_type="image/jpeg")


class PuzzleApiTests(TestCase):
    def setUp(self):
        session = DeviceSession.issue(hours=1)
        self.auth = {"HTTP_AUTHORIZATION": f"Token {session.token}"}
        self.puzzle = Puzzle.objects.create(title="قلب ما", level=3, image=image_file())

    def test_invalid_upload_is_rejected_without_server_error(self):
        response = self.client.post(
            "/api/puzzles/upload",
            {"title": "خراب", "level": "oops", "image": SimpleUploadedFile("bad.jpg", b"not-an-image")},
            **self.auth,
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Puzzle.objects.count(), 1)

    def test_media_uses_short_lived_signed_delivery(self):
        response = self.client.get("/api/puzzles", **self.auth)
        self.assertEqual(response.status_code, 200)
        media_url = response.json()["items"][0]["image"]
        self.assertTrue(media_url.startswith("/api/media/puzzles/"))
        self.assertEqual(self.client.get(media_url).status_code, 200)
        self.assertEqual(self.client.get("/media/puzzles/" + self.puzzle.image.name.split("/", 1)[-1]).status_code, 404)

    def test_start_is_active_and_increments_record(self):
        response = self.client.post(f"/api/puzzles/{self.puzzle.id}/start", **self.auth)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["plays"], 1)
        self.assertEqual(PuzzleRecord.objects.get(puzzle=self.puzzle).plays, 1)

        self.puzzle.is_active = False
        self.puzzle.save(update_fields=["is_active", "updated_at"])
        self.assertEqual(self.client.post(f"/api/puzzles/{self.puzzle.id}/start", **self.auth).status_code, 404)

    def test_completion_clamps_untrusted_time_and_ignores_inactive_puzzles(self):
        response = self.client.post(
            f"/api/puzzles/{self.puzzle.id}/complete",
            {"seconds": "-999999"},
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["best_time"], 0)
        self.assertEqual(PuzzleRecord.objects.get(puzzle=self.puzzle).completions, 1)

        self.puzzle.is_active = False
        self.puzzle.save(update_fields=["is_active", "updated_at"])
        self.assertEqual(self.client.post(f"/api/puzzles/{self.puzzle.id}/complete", {"seconds": 1}, **self.auth).status_code, 404)
