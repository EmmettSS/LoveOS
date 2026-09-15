"""
reading.api — اندپوینت‌های کتاب‌خوانی مشترک

  GET    /api/reading/overview            قفسه + کتاب کتابخانه + آمار کوتاه
  GET    /api/reading/books               لیست کتاب‌ها (با فیلتر قفسه)
  POST   /api/reading/books               افزودن کتاب (بابا از پنل، دخترم از خود اپ)
  GET    /api/reading/books/<pk>          جزئیات کامل یک کتاب (فصل‌ها، یادداشت‌ها، نقل‌قول‌ها)
  PATCH  /api/reading/books/<pk>          ویرایش کتاب / تغییر قفسه
  DELETE /api/reading/books/<pk>          حذف
  POST   /api/reading/books/<pk>/chapters افزودن فصل
  POST   /api/reading/chapters/<pk>/notes یادداشت + امتیاز + «خوندم»
  POST   /api/reading/chapters/<pk>/quotes نقل‌قول
  POST   /api/reading/chapters/<pk>/comments پیام در گفتگوی فصل
  POST   /api/reading/books/<pk>/progress پیشرفت دستی
  GET    /api/reading/quotes              گالری نقل‌قول‌ها
  GET    /api/reading/stats               پیشرفت هر دو نفر
"""
from __future__ import annotations

from django.db.models import Q
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from accounts.models import UserConfig
from core.auth import require_session
from core.services import bump, log_activity, push_notification
from core.soroush import notify_daddy
from core.utils import bounded_int, file_url, validate_upload
from library.models import Book as LibraryBook
from reading.models import (
    OWNER,
    STATUS,
    ChapterComment,
    ReadingBook,
    ReadingChapter,
    ReadingNote,
    ReadingProgress,
    ReadingQuote,
)

OWNER_LABEL = dict(OWNER)
STATUS_LABEL = dict(STATUS)


def _label(owner: str) -> str:
    cfg = UserConfig.get_solo()
    return (cfg.daddy_name or "بابا") if owner == "daddy" else (cfg.daughter_nickname or cfg.daughter_name or "دخترم")


def _owner_from(data: dict, default: str = "daughter") -> str:
    value = str(data.get("owner") or default)
    return value if value in OWNER_LABEL else default


def _book_json(b: ReadingBook, full: bool = False) -> dict:
    data = {
        "id": b.id,
        "title": b.title,
        "author": b.author,
        "cover": file_url(b.cover),
        "status": b.status,
        "status_label": STATUS_LABEL.get(b.status, b.status),
        "summary": b.summary,
        "why_this_book": b.why_this_book,
        "pdf": file_url(b.pdf),
        "link": b.link,
        "is_physical": b.is_physical,
        "chapters_count": b.chapters_count,
        "added_by": b.added_by,
        "added_by_label": _label(b.added_by),
        "started_on": b.started_on.isoformat() if b.started_on else None,
        "finished_on": b.finished_on.isoformat() if b.finished_on else None,
        "library_book": b.library_book_id,
        "source": "library" if b.library_book_id else "reading",
        "progress": {
            "daddy": b.percent_for_daddy,
            "daughter": b.percent_for_daughter,
        },
        "notes_count": b.notes.count(),
        "quotes_count": b.quotes.count(),
    }
    if full:
        data["chapters"] = [_chapter_json(c, full=True) for c in b.chapters.all()]
    return data


def _chapter_json(c: ReadingChapter, full: bool = False) -> dict:
    data = {
        "id": c.id,
        "book": c.book_id,
        "order": c.order,
        "title": c.title,
        "label": c.label,
        "text": c.text,
        "page_from": c.page_from,
        "page_to": c.page_to,
        "notes_count": c.notes.count(),
        "comments_count": c.comments.count(),
        "read_by": {
            "daddy": c.notes.filter(owner="daddy", is_finished=True).exists(),
            "daughter": c.notes.filter(owner="daughter", is_finished=True).exists(),
        },
    }
    if full:
        data["notes"] = [_note_json(n) for n in c.notes.all()]
        data["comments"] = [_comment_json(m) for m in c.comments.all()]
        data["quotes"] = [_quote_json(q) for q in c.quotes.all()]
    return data


def _note_json(n: ReadingNote) -> dict:
    return {
        "id": n.id,
        "owner": n.owner,
        "owner_label": _label(n.owner),
        "book": n.book_id,
        "chapter": n.chapter_id,
        "chapter_label": n.chapter.label,
        "text": n.text,
        "rating": n.rating,
        "is_finished": n.is_finished,
        "page_hint": n.page_hint,
        "created_at": n.created_at.isoformat(),
    }


def _quote_json(q: ReadingQuote) -> dict:
    return {
        "id": q.id,
        "owner": q.owner,
        "owner_label": _label(q.owner),
        "book": q.book_id,
        "book_title": q.book.title,
        "chapter": q.chapter_id,
        "chapter_label": q.chapter.label if q.chapter else "",
        "text": q.text,
        "comment": q.comment,
        "created_at": q.created_at.isoformat(),
    }


def _comment_json(m: ChapterComment) -> dict:
    return {
        "id": m.id,
        "owner": m.owner,
        "owner_label": _label(m.owner),
        "chapter": m.chapter_id,
        "text": m.text,
        "reply_to": m.reply_to_id,
        "created_at": m.created_at.isoformat(),
    }


# --------------------------------------------------------------- قفسه‌ها ---
def _library_shelf_items() -> list[dict]:
    """کتاب‌های اپ کتابخانه هم در همین قفسه دیده می‌شوند (قفسه‌ی مشترک)."""
    items: list[dict] = []
    for book in LibraryBook.objects.all()[:50]:
        entry = ReadingBook.objects.filter(library_book=book).first()
        items.append(
            {
                "id": f"lib-{book.id}",
                "library_book": book.id,
                "title": book.title,
                "author": book.subtitle or "",
                "cover": None,
                "source": "library",
                "chapters_count": book.chapters.count(),
                "status": entry.status if entry else "reading",
                "status_label": STATUS_LABEL.get(entry.status, "کتاب داستان ما") if entry else "کتاب داستان ما",
                "progress": {
                    "daddy": entry.percent_for_daddy if entry else 0,
                    "daughter": entry.percent_for_daughter if entry else 0,
                },
                "in_reading": bool(entry),
            }
        )
    return items


@api_view(["GET"])
@require_session
def overview(request):
    books = list(ReadingBook.objects.filter(is_active=True))
    shelf = {key: [] for key, _ in STATUS}
    for b in books:
        shelf.setdefault(b.status, []).append(_book_json(b))

    quotes = list(ReadingQuote.objects.select_related("book", "chapter").all()[:6])
    return Response(
        {
            "shelf": shelf,
            "counts": {
                "reading": len(shelf.get("reading", [])),
                "finished": len(shelf.get("finished", [])),
                "want": len(shelf.get("want", [])),
            },
            "library": _library_shelf_items(),
            "recent_quotes": [_quote_json(q) for q in quotes],
            "stats": _stats_payload(),
        }
    )


@api_view(["GET", "POST"])
@require_session
def books(request):
    if request.method == "GET":
        qs = ReadingBook.objects.filter(is_active=True)
        status = request.GET.get("status")
        if status in STATUS_LABEL:
            qs = qs.filter(status=status)
        text = (request.GET.get("q") or "").strip()
        if text:
            qs = qs.filter(Q(title__icontains=text) | Q(author__icontains=text) | Q(summary__icontains=text))
        return Response({"items": [_book_json(b) for b in qs[:100]]})

    data = request.data if isinstance(request.data, dict) else {}
    title = str(data.get("title") or "").strip()
    if not title:
        return Response({"ok": False, "message": "اسم کتاب را بنویس"}, status=400)

    library_book = None
    if data.get("library_book"):
        library_book = LibraryBook.objects.filter(pk=data["library_book"]).first()
        # اگر این کتابِ کتابخانه قبلاً روی قفسه نشسته، دوباره نساز
        existing = ReadingBook.objects.filter(library_book=library_book, is_active=True).first() if library_book else None
        if existing:
            return Response({"ok": True, "item": _book_json(existing, full=True), "already": True})

    book = ReadingBook(
        library_book=library_book,
        title=title[:200],
        author=str(data.get("author") or "")[:160],
        status=data.get("status") if data.get("status") in STATUS_LABEL else "want",
        summary=str(data.get("summary") or ""),
        why_this_book=str(data.get("why_this_book") or "")[:255],
        link=str(data.get("link") or ""),
        is_physical=bool(data.get("is_physical")),
        added_by=_owner_from(data, "daughter"),
    )
    upload_pdf = request.FILES.get("pdf")
    cover = request.FILES.get("cover")
    upload_error = validate_upload(upload_pdf, "document") or validate_upload(cover, "image")
    if upload_error:
        return Response({"ok": False, "message": upload_error}, status=400)
    if upload_pdf:
        book.pdf = upload_pdf
    if cover:
        book.cover = cover
    book.total_chapters = bounded_int(data.get("total_chapters"), default=0, minimum=0, maximum=2000)
    book.save()

    # فصل‌های سریع: «3» یا «فصل‌ها را خودم می‌نویسم»
    raw_chapters = data.get("chapters") or []
    if isinstance(raw_chapters, list):
        for i, item in enumerate(raw_chapters[:200], start=1):
            title_c = str(item.get("title") if isinstance(item, dict) else item or "").strip()
            ReadingChapter.objects.create(book=book, order=i, title=title_c[:200])
    if book.total_chapters == 0:
        book.total_chapters = book.chapters.count()
        book.save(update_fields=["total_chapters", "updated_at"])

    if book.added_by == "daughter":
        push_notification(
            "book",
            f"{_label('daughter')} یه کتاب جدید گذاشت روی قفسه 📚",
            book.title,
            icon="reading",
            action_app="reading",
        )
        notify_daddy("reading_book", f"📚 {_label('daughter')} کتاب جدید اضافه کرد: {book.title}")
    else:
        push_notification("book", "یه کتاب جدید روی قفسه‌ی ما نشست 📚", book.title, icon="reading", action_app="reading")
        notify_daddy("reading_book", f"📚 کتاب جدید اضافه شد: {book.title}")

    bump("reading_books")
    log_activity("افزودن کتاب مشترک", "reading", book.title[:60])
    return Response({"ok": True, "item": _book_json(book, full=True)})


@api_view(["GET", "PATCH", "POST", "DELETE"])
@require_session
def book_item(request, pk: int):
    book = ReadingBook.objects.filter(pk=pk).first()
    if not book:
        return Response({"ok": False, "message": "این کتاب پیدا نشد"}, status=404)
    if request.method == "GET":
        return Response({"item": _book_json(book, full=True)})
    if request.method == "DELETE":
        title = book.title
        book.is_active = False
        book.save(update_fields=["is_active", "updated_at"])
        log_activity("حذف کتاب مشترک", "reading", title[:60])
        return Response({"ok": True})

    data = request.data if isinstance(request.data, dict) else {}
    for field, limit in (("title", 200), ("author", 160), ("why_this_book", 255), ("link", 500)):
        if field in data:
            setattr(book, field, str(data[field])[:limit])
    for field in ("summary",):
        if field in data:
            setattr(book, field, str(data[field]))
    if data.get("status") in STATUS_LABEL:
        book.status = data["status"]
        if book.status == "finished" and not book.finished_on:
            book.finished_on = timezone.localdate()
        if book.status == "reading" and not book.started_on:
            book.started_on = timezone.localdate()
    if "is_physical" in data:
        book.is_physical = bool(data["is_physical"])
    if "library_book" in data:
        # اتصال/جداکردن این کتاب از کتابِ اپ کتابخانه (قفسه‌ی مشترک)
        book.library_book = LibraryBook.objects.filter(pk=data["library_book"]).first() if data["library_book"] else None
    cover = request.FILES.get("cover")
    pdf = request.FILES.get("pdf")
    upload_error = validate_upload(pdf, "document") or validate_upload(cover, "image")
    if upload_error:
        return Response({"ok": False, "message": upload_error}, status=400)
    if cover:
        book.cover = cover
    if pdf:
        book.pdf = pdf
    book.save()
    log_activity("ویرایش کتاب مشترک", "reading", book.title[:60])
    return Response({"ok": True, "item": _book_json(book, full=True)})


@api_view(["POST"])
@require_session
def chapter_create(request, pk: int):
    book = ReadingBook.objects.filter(pk=pk).first()
    if not book:
        return Response({"ok": False}, status=404)
    data = request.data if isinstance(request.data, dict) else {}
    order = data.get("order")
    default_order = book.chapters.order_by("-order").first().order + 1 if book.chapters.exists() else 1
    order = bounded_int(order, default=default_order, minimum=1, maximum=2000)
    chapter, _ = ReadingChapter.objects.get_or_create(
        book=book,
        order=order,
        defaults={"title": str(data.get("title") or "")[:200], "text": str(data.get("text") or "")},
    )
    if not book.total_chapters:
        book.total_chapters = book.chapters.count()
        book.save(update_fields=["total_chapters", "updated_at"])
    log_activity("افزودن فصل", "reading", f"{book.title} — {chapter.label}")
    return Response({"ok": True, "item": _chapter_json(chapter, full=True)})


# ------------------------------------------------------------ یادداشت‌ها ---
def _owner_for_chapter(chapter: ReadingChapter, owner: str) -> ReadingProgress:
    progress, _ = ReadingProgress.objects.get_or_create(owner=owner, book=chapter.book, defaults={"current_chapter": 1})
    return progress


@api_view(["POST", "GET"])
@require_session
def notes(request, pk: int):
    chapter = ReadingChapter.objects.select_related("book").filter(pk=pk).first()
    if not chapter:
        return Response({"ok": False}, status=404)

    if request.method == "GET":
        return Response({"items": [_note_json(n) for n in chapter.notes.all()]})

    data = request.data if isinstance(request.data, dict) else {}
    owner = _owner_from(data, "daughter")
    text = str(data.get("text") or "").strip()
    is_finished = bool(data.get("is_finished"))
    rating = bounded_int(data.get("rating") or 0, default=0, minimum=0, maximum=5)

    if not text and not is_finished:
        return Response({"ok": False, "message": "یه یادداشت بنویس یا «خوندم» را بزن"}, status=400)

    note = ReadingNote.objects.create(
        owner=owner,
        book=chapter.book,
        chapter=chapter,
        text=text,
        rating=rating,
        is_finished=is_finished,
        page_hint=str(data.get("page_hint") or "")[:20],
    )

    if is_finished:
        progress = _owner_for_chapter(chapter, owner)
        progress.current_chapter = max(progress.current_chapter, chapter.order)
        progress.updated_note = text[:200]
        progress.save()
        if progress.percent >= 100:
            chapter.book.refresh_status()

    bump("reading_notes")
    push_notification(
        "book",
        f"{_label(owner)} در «{chapter.book.title}» یه یادداشت گذاشت 📖",
        f"{chapter.label}: {text[:120] or 'خوندم ✅'}",
        icon="reading",
        action_app="reading",
    )
    notify_daddy(
        "reading_note",
        f"📖 {_label(owner)} در {chapter.label} کتاب «{chapter.book.title}» یادداشت گذاشت: {text[:120] or 'خوندم ✅'}",
    )
    log_activity("یادداشت فصل", "reading", f"{chapter.book.title} — {chapter.label}")
    return Response({"ok": True, "item": _note_json(note), "progress": {"daddy": chapter.book.percent_for_daddy, "daughter": chapter.book.percent_for_daughter}})


@api_view(["POST", "GET"])
@require_session
def quotes(request, pk: int | None = None):
    if pk is None:
        items = ReadingQuote.objects.select_related("book", "chapter").all()[:200]
        return Response({"items": [_quote_json(q) for q in items]})

    chapter = ReadingChapter.objects.select_related("book").filter(pk=pk).first()
    if not chapter:
        return Response({"ok": False}, status=404)
    data = request.data if isinstance(request.data, dict) else {}
    text = str(data.get("text") or "").strip()
    if not text:
        return Response({"ok": False, "message": "متن نقل‌قول را بنویس"}, status=400)
    quote = ReadingQuote.objects.create(
        owner=_owner_from(data, "daughter"),
        book=chapter.book,
        chapter=chapter,
        text=text,
        comment=str(data.get("comment") or "")[:255],
    )
    push_notification(
        "book",
        f"یه نقل‌قول قشنگ از «{chapter.book.title}» ✨",
        text[:140],
        icon="quote",
        action_app="reading",
    )
    notify_daddy("reading_quote", f"✨ نقل‌قول جدید از «{chapter.book.title}»: {text[:120]}")
    log_activity("نقل‌قول کتاب", "reading", text[:60])
    return Response({"ok": True, "item": _quote_json(quote)})


@api_view(["POST"])
@require_session
def comments(request, pk: int):
    chapter = ReadingChapter.objects.select_related("book").filter(pk=pk).first()
    if not chapter:
        return Response({"ok": False}, status=404)
    data = request.data if isinstance(request.data, dict) else {}
    text = str(data.get("text") or "").strip()
    if not text:
        return Response({"ok": False, "message": "پیامت را بنویس"}, status=400)
    owner = _owner_from(data, "daughter")
    reply_to = ChapterComment.objects.filter(pk=data.get("reply_to")).first() if data.get("reply_to") else None
    message = ChapterComment.objects.create(owner=owner, chapter=chapter, text=text, reply_to=reply_to)
    push_notification(
        "book",
        f"گفتگوی فصل — {_label(owner)}",
        f"{chapter.book.title} / {chapter.label}: {text[:120]}",
        icon="chat",
        action_app="reading",
    )
    notify_daddy("reading_comment", f"💬 {_label(owner)} در گفتگوی «{chapter.book.title}» نوشت: {text[:120]}")
    return Response({"ok": True, "item": _comment_json(message)})


@api_view(["POST"])
@require_session
def progress_set(request, pk: int):
    book = ReadingBook.objects.filter(pk=pk).first()
    if not book:
        return Response({"ok": False}, status=404)
    data = request.data if isinstance(request.data, dict) else {}
    owner = _owner_from(data, "daughter")
    row, _ = ReadingProgress.objects.get_or_create(owner=owner, book=book)
    chapter = data.get("current_chapter")
    try:
        if chapter:
            row.current_chapter = max(1, int(chapter))
    except (TypeError, ValueError):
        pass
    if "percent" in data:
        try:
            row.percent = max(0, min(100, int(data["percent"])))
        except (TypeError, ValueError):
            pass
    row.save()
    book.refresh_status()
    return Response({"ok": True, "progress": {"daddy": book.percent_for_daddy, "daughter": book.percent_for_daughter}})


# -------------------------------------------------------------------- آمار --
def _stats_payload() -> dict:
    books = list(ReadingBook.objects.filter(is_active=True))
    finished_both = [
        b for b in books if b.percent_for_daddy >= 100 and b.percent_for_daughter >= 100
    ]
    return {
        "books_total": len(books),
        "reading": sum(1 for b in books if b.status == "reading"),
        "finished": sum(1 for b in books if b.status == "finished"),
        "want": sum(1 for b in books if b.status == "want"),
        "notes_total": ReadingNote.objects.count(),
        "quotes_total": ReadingQuote.objects.count(),
        "comments_total": ChapterComment.objects.count(),
        "both_finished": [_book_json(b) for b in finished_both][:10],
        "progress_rows": [
            {
                "book": _book_json(b)["title"],
                "book_id": b.id,
                "daddy": b.percent_for_daddy,
                "daughter": b.percent_for_daughter,
            }
            for b in books[:20]
        ],
    }


@api_view(["GET"])
@require_session
def stats(request):
    return Response(_stats_payload())
