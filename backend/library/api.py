"""API کتابخانه — کتاب، فصل، صفحه، پاراگراف، حاشیه‌نویسی، نشانک."""
from rest_framework.decorators import api_view
from rest_framework.response import Response

from core.auth import require_session
from core.services import bump, log_activity, push_notification
from core.soroush import notify_daddy
from library.models import Book, Bookmark, Chapter, MarginNote, Page, Paragraph


def url_of(f):
    try:
        return f.url if f else None
    except ValueError:
        return None


def paragraph_json(p: Paragraph) -> dict:
    return {
        "id": p.id,
        "order": p.order,
        "text": p.text,
        "author": p.author,
        "audio": url_of(p.audio),
        "is_draft": p.is_draft,
        "notes": [
            {"id": n.id, "author": n.author, "text": n.text, "color": n.color}
            for n in p.notes.filter(approved=True)
        ],
    }


def page_json(pg: Page) -> dict:
    return {
        "id": pg.id,
        "order": pg.order,
        "image": url_of(pg.image),
        "audio": url_of(pg.audio),
        "paragraphs": [paragraph_json(p) for p in pg.paragraphs.all()],
    }


@api_view(["GET", "POST"])
@require_session
def books(request):
    if request.method == "POST":
        book = Book.objects.create(
            title=request.data.get("title", "کتاب تازه"),
            subtitle=request.data.get("subtitle", ""),
            created_by="daughter",
        )
        notify_daddy("book_new", f"دخترت یه کتاب جدید ساخت 📖 «{book.title}»")
        return Response({"ok": True, "id": book.id})
    return Response(
        {
            "items": [
                {
                    "id": b.id,
                    "title": b.title,
                    "subtitle": b.subtitle,
                    "cover": url_of(b.cover),
                    "description": b.description,
                    "chapters": b.chapters.filter(is_published=True).count(),
                    "allow_daughter_edit": b.allow_daughter_edit,
                }
                for b in Book.objects.filter(is_active=True)
            ]
        }
    )


@api_view(["GET"])
@require_session
def book_detail(request, pk: int):
    book = Book.objects.filter(pk=pk, is_active=True).first()
    if not book:
        return Response({"ok": False}, status=404)
    chapters = []
    for ch in book.chapters.all():
        if not ch.is_published and ch.author != "daughter":
            continue
        chapters.append(
            {
                "id": ch.id,
                "title": ch.title,
                "order": ch.order,
                "author": ch.author,
                "is_published": ch.is_published,
                "pages": [page_json(p) for p in ch.pages.all()],
            }
        )
    return Response(
        {
            "id": book.id,
            "title": book.title,
            "subtitle": book.subtitle,
            "cover": url_of(book.cover),
            "allow_daughter_edit": book.allow_daughter_edit,
            "chapters": chapters,
            "bookmarks": [
                {"id": b.id, "page": b.page_id, "label": b.label}
                for b in Bookmark.objects.filter(page__chapter__book=book)
            ],
        }
    )


@api_view(["POST"])
@require_session
def chapter_create(request, book_id: int):
    book = Book.objects.filter(pk=book_id).first()
    if not book or not book.allow_daughter_edit:
        return Response({"ok": False}, status=403)
    order = book.chapters.count() + 1
    ch = Chapter.objects.create(
        book=book, title=request.data.get("title", f"فصل {order}"), order=order, author="daughter"
    )
    Page.objects.create(chapter=ch, order=1)
    return Response({"ok": True, "id": ch.id})


@api_view(["POST"])
@require_session
def paragraph_create(request, page_id: int):
    page = Page.objects.filter(pk=page_id).first()
    if not page:
        return Response({"ok": False}, status=404)
    p = Paragraph.objects.create(
        page=page,
        order=page.paragraphs.count() + 1,
        text=request.data.get("text", ""),
        author="daughter",
        is_draft=bool(request.data.get("is_draft", False)),
    )
    if not p.is_draft:
        bump("paragraphs_written")
    return Response({"ok": True, "item": paragraph_json(p)})


@api_view(["PATCH", "DELETE"])
@require_session
def paragraph_item(request, pk: int):
    p = Paragraph.objects.filter(pk=pk, author="daughter").first()
    if not p:
        return Response({"ok": False, "message": "این پاراگراف رو بابا نوشته"}, status=403)
    if request.method == "DELETE":
        p.delete()
        return Response({"ok": True})
    if "text" in request.data:
        p.text = request.data["text"]
    if "is_draft" in request.data:
        p.is_draft = bool(request.data["is_draft"])
    p.save()
    return Response({"ok": True, "item": paragraph_json(p)})


@api_view(["POST"])
@require_session
def chapter_publish(request, pk: int):
    ch = Chapter.objects.filter(pk=pk, author="daughter").first()
    if not ch:
        return Response({"ok": False}, status=403)
    ch.is_published = True
    ch.save(update_fields=["is_published"])
    bump("chapters_written")
    notify_daddy("book_chapter", f"دخترت یه فصل جدید نوشت 📖 «{ch.title}»")
    log_activity("انتشار فصل", "library", ch.title)
    return Response({"ok": True})


@api_view(["POST"])
@require_session
def note_create(request, paragraph_id: int):
    p = Paragraph.objects.filter(pk=paragraph_id).first()
    if not p:
        return Response({"ok": False}, status=404)
    note = MarginNote.objects.create(
        paragraph=p, author="daughter", text=request.data.get("text", ""), color=request.data.get("color", "#f472b6")
    )
    notify_daddy("book_comment", f"دخترت روی کتاب یادداشت گذاشت ✍️ «{note.text[:40]}»")
    return Response({"ok": True, "id": note.id})


@api_view(["POST"])
@require_session
def bookmark_toggle(request, page_id: int):
    existing = Bookmark.objects.filter(page_id=page_id).first()
    if existing:
        existing.delete()
        return Response({"ok": True, "bookmarked": False})
    Bookmark.objects.create(page_id=page_id, label=request.data.get("label", ""))
    return Response({"ok": True, "bookmarked": True})
