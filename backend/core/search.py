"""
core.search — جستجوی سراسری LoveOS

یک جستجو، همه‌ی اپ‌ها. هیچ مدل تازه‌ای برای ایندکس ساخته نمی‌شود؛ مستقیم روی
دیتابیس همان مدل‌ها می‌گردیم و نتیجه را گروه‌بندی‌شده برمی‌گردانیم:

    پیام‌ها (۳) • کتاب‌ها (۲) • هدیه‌ها (۱) …

نکته‌های طراحی:
  • «فازی» است نه دقیق: «بابا» هم «بابایی» را پیدا می‌کند (نرمال‌سازی حروف فارسی
    + تطبیق نسبی با difflib وقتی جستجوی مستقیم چیزی برنگرداند).
  • کنترل منابع از پنل بابا: اگر چیزی را از جستجو بخواهد پنهان کند، در
    UserConfig.search_disabled_sources می‌گذارد و آن منبع جستجو نمی‌شود.
  • اگر بابا بخواهد، عبارت‌های پرجستجو در ActivityLog ثبت می‌شود (بدون محتوای حساس).
  • ایستر اگ‌ها فقط با «نام» جستجو می‌شوند؛ محتوایشان هرگز در نتایج نمی‌آید.
"""
from __future__ import annotations

import difflib
import re
from dataclasses import dataclass, field
from typing import Callable, Iterable

from django.db.models import Q
from django.utils import timezone

# ------------------------------------------------------------- نرمال‌سازی ---
_AR_MAP = {
    "ي": "ی", "ك": "ک", "أ": "ا", "إ": "ا", "آ": "ا", "ة": "ه", "ؤ": "و", "ئ": "ی",
    "‌": " ", "\u200c": " ", "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
    "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
}
_DIACRITICS = re.compile(r"[\u064B-\u0652\u0670]")


def normalize(text: str) -> str:
    """حروف عربی/فارسی و اعراب را یک‌دست می‌کند تا جستجو واقعاً «فارسی‌فهم» باشد."""
    if not text:
        return ""
    out = str(text)
    out = _DIACRITICS.sub("", out)
    for src, dst in _AR_MAP.items():
        out = out.replace(src, dst)
    out = re.sub(r"\s+", " ", out)
    return out.strip().lower()


def _score(query: str, haystack: str) -> float:
    """امتیاز شباهت (۰ تا ۱) برای مرتب‌سازی نتایج و تطبیق فازی."""
    q, h = normalize(query), normalize(haystack)
    if not q or not h:
        return 0.0
    if q == h:
        return 1.0
    if h.startswith(q):
        return 0.95
    if q in h:
        return 0.85
    # تطبیق کلمه‌به‌کلمه (مثلاً «بابا» در «بابایی»)
    for word in h.split():
        if word.startswith(q) or q in word:
            return 0.7
    return difflib.SequenceMatcher(None, q, h).ratio() * 0.65


def _snippet(text: str, query: str, size: int = 140) -> str:
    """تکه‌ی مرتبط متن را دور عبارت پیدا شده می‌برد تا کارت نتیجه خوانا باشد."""
    text = (text or "").strip().replace("\n", " ")
    if len(text) <= size:
        return text
    idx = normalize(text).find(normalize(query))
    if idx < 0:
        return text[:size] + "…"
    start = max(0, idx - size // 3)
    return ("…" if start else "") + text[start : start + size].strip() + "…"


# ----------------------------------------------------------------- منابع ---
@dataclass
class SearchHit:
    source: str
    source_label: str
    icon: str
    color: str
    app: str
    title: str
    snippet: str
    date: str | None
    score: float
    payload: dict = field(default_factory=dict)

    def as_dict(self) -> dict:
        return {
            "source": self.source,
            "source_label": self.source_label,
            "icon": self.icon,
            "color": self.color,
            "app": self.app,
            "title": self.title,
            "snippet": self.snippet,
            "date": self.date,
            "payload": self.payload,
        }


@dataclass
class Source:
    """یک منبع جستجو: مدل، فیلدهای متنی، و نحوه‌ی ساخت کارت نتیجه."""

    key: str
    label: str
    icon: str
    color: str
    app: str
    model: object
    text_fields: tuple[str, ...]
    build: Callable[[object, str], SearchHit]
    date_field: str = "created_at"
    limit: int = 25


def _hit(source: Source, obj, title: str, body: str, query: str, date_value=None, **payload) -> SearchHit:
    score = max(_score(query, title), _score(query, body) * 0.9, 0.05)
    return SearchHit(
        source=source.key,
        source_label=source.label,
        icon=source.icon,
        color=source.color,
        app=source.app,
        title=title,
        snippet=_snippet(body, query),
        date=(date_value.isoformat() if hasattr(date_value, "isoformat") else date_value),
        score=score,
        payload=payload,
    )


def _sources() -> list[Source]:
    """فهرست همه‌ی منابع. هر کدام فقط چند خط نگاشت است."""
    from calls.models import CallAppointment, CallLog
    from content.models import FuturePlan, Letter, Memory, QuizQuestion, Song, Voice
    from core.models import Achievement, EasterEgg
    from gifts.models import Gift
    from language.models import LanguageEntry
    from library.models import Book, Chapter, Paragraph
    from reading.models import ReadingBook, ReadingNote, ReadingQuote
    from social.models import ChatMessage

    out: list[Source] = []

    # ------------------------------------------------------------- پیام‌ها ---
    def build_chat(m: ChatMessage, q: str) -> SearchHit:
        who = "بابا" if m.sender == "daddy" else "دخترم"
        return _hit(chat_src, m, f"{who}: {m.text[:60]}", m.text, q, m.created_at, chat_id=m.id, sender=m.sender)

    chat_src = Source(
        key="chat", label="پیام‌ها", icon="chat", color="#f0abfc", app="chat",
        model=ChatMessage, text_fields=("text",), build=build_chat, date_field="created_at",
    )
    out.append(chat_src)

    # --------------------------------------------------------- نامه‌ها ------
    def build_letter(x: Letter, q: str) -> SearchHit:
        return _hit(letter_src, x, x.title, x.body, q, x.created_at, letter_id=x.id)

    letter_src = Source(
        key="letters", label="نامه‌های نجوا", icon="whisper", color="#fda4af", app="whisper",
        model=Letter, text_fields=("title", "body"), build=build_letter,
    )
    out.append(letter_src)

    # -------------------------------------------------------- ویس‌ها -------
    def build_voice(x: Voice, q: str) -> SearchHit:
        return _hit(voice_src, x, x.title, x.note or x.get_category_display(), q, x.created_at, voice_id=x.id)

    voice_src = Source(
        key="voices", label="ویس‌های بابا", icon="voice", color="#f9a8d4", app="voice",
        model=Voice, text_fields=("title", "note"), build=build_voice,
    )
    out.append(voice_src)

    # ------------------------------------------------------ خاطره‌ها ------
    def build_memory(x: Memory, q: str) -> SearchHit:
        return _hit(
            memory_src, x, x.title, f"{x.text} {x.place}".strip(), q,
            x.happened_on or x.created_at, memory_id=x.id,
        )

    memory_src = Source(
        key="memories", label="خاطره‌ها", icon="memories", color="#fcd34d", app="memories",
        model=Memory, text_fields=("title", "text", "place"), build=build_memory, date_field="happened_on",
    )
    out.append(memory_src)

    # ------------------------------------------------------- آهنگ‌ها -----
    def build_song(x: Song, q: str) -> SearchHit:
        body = " ".join(p for p in [x.artist, x.why_this_song, x.lyrics] if p)
        return _hit(song_src, x, x.title, body, q, x.created_at, song_id=x.id)

    song_src = Source(
        key="music", label="موسیقی ما", icon="music", color="#c4b5fd", app="music",
        model=Song, text_fields=("title", "artist", "why_this_song", "lyrics"), build=build_song,
    )
    out.append(song_src)

    # ------------------------------------------------------ کتابخانه -----
    def build_book(x: Book, q: str) -> SearchHit:
        return _hit(book_src, x, x.title, x.subtitle or "", q, x.created_at, book_id=x.id, open="library")

    book_src = Source(
        key="library", label="کتابخانه", icon="library", color="#fca5a5", app="library",
        model=Book, text_fields=("title", "subtitle"), build=build_book,
    )
    out.append(book_src)

    def build_chapter(x: Chapter, q: str) -> SearchHit:
        return _hit(
            chapter_src, x, f"{x.book.title} — {x.title}", x.title, q, x.created_at,
            book_id=x.book_id, chapter_id=x.id, open="library",
        )

    chapter_src = Source(
        key="chapters", label="فصل‌های کتاب", icon="book", color="#fca5a5", app="library",
        model=Chapter, text_fields=("title",), build=build_chapter,
    )
    out.append(chapter_src)

    def build_paragraph(x: Paragraph, q: str) -> SearchHit:
        return _hit(
            paragraph_src, x, f"خطی از «{x.page.chapter.book.title}»", x.text, q, x.created_at,
            book_id=x.page.chapter.book_id, chapter_id=x.page.chapter_id, paragraph_id=x.id, open="library",
        )

    paragraph_src = Source(
        key="paragraphs", label="خط‌های کتاب", icon="pen", color="#fca5a5", app="library",
        model=Paragraph, text_fields=("text",), build=build_paragraph,
    )
    out.append(paragraph_src)

    # -------------------------------------------------- هدیه‌ها و خانه ---
    def build_gift(x: Gift, q: str) -> SearchHit:
        body = " ".join(p for p in [x.description, x.reaction] if p)
        return _hit(gift_src, x, x.name, body, q, x.given_on, gift_id=x.id, open="gifts")

    gift_src = Source(
        key="gifts", label="هدیه‌ها", icon="gift", color="#fcd34d", app="gifts",
        model=Gift, text_fields=("name", "description", "reaction"), build=build_gift, date_field="given_on",
    )
    out.append(gift_src)

    from dreamhome.models import DreamHomeFeature, DreamHomeRoom

    def build_home_feature(x: DreamHomeFeature, q: str) -> SearchHit:
        return _hit(
            home_src, x, x.title, x.description, q, x.created_at,
            feature_id=x.id, section="features", open="dreamhome",
        )

    home_src = Source(
        key="home_features", label="خانه‌ی رویایی", icon="dreamhome", color="#86efac", app="dreamhome",
        model=DreamHomeFeature, text_fields=("title", "description"), build=build_home_feature,
    )
    out.append(home_src)

    def build_home_room(x: DreamHomeRoom, q: str) -> SearchHit:
        return _hit(
            room_src, x, f"اتاق: {x.name}", x.description, q, x.created_at,
            room_id=x.id, section="rooms", open="dreamhome",
        )

    room_src = Source(
        key="home_rooms", label="اتاق‌های خانه", icon="dreamhome", color="#86efac", app="dreamhome",
        model=DreamHomeRoom, text_fields=("name", "description"), build=build_home_room,
    )
    out.append(room_src)

    # -------------------------------------------------- زبان و کتاب‌خوانی --
    def build_language(x: LanguageEntry, q: str) -> SearchHit:
        body = " ".join(
            p
            for p in [x.translation_labels, x.literal_meaning, x.real_meaning, x.example]
            if p
        )
        return _hit(language_src, x, x.text, body, q, x.created_at, entry_id=x.id, open="language")

    language_src = Source(
        key="language", label="کلمات و اصطلاحات", icon="language", color="#93c5fd", app="language",
        model=LanguageEntry,
        text_fields=("text", "literal_meaning", "real_meaning", "example"),
        build=build_language,
    )
    out.append(language_src)

    def build_reading_book(x: ReadingBook, q: str) -> SearchHit:
        return _hit(
            reading_src, x, x.title, f"{x.author} {x.summary}".strip(), q, x.created_at,
            book_id=x.id, open="reading",
        )

    reading_src = Source(
        key="reading_books", label="کتاب‌های مشترک", icon="reading", color="#5eead4", app="reading",
        model=ReadingBook, text_fields=("title", "author", "summary"), build=build_reading_book,
    )
    out.append(reading_src)

    def build_reading_note(x: ReadingNote, q: str) -> SearchHit:
        return _hit(
            reading_note_src, x, f"یادداشت فصل: {x.chapter.label}", x.text, q, x.created_at,
            book_id=x.book_id, chapter_id=x.chapter_id, note_id=x.id, open="reading",
        )

    reading_note_src = Source(
        key="reading_notes", label="یادداشت‌های کتاب‌خوانی", icon="reading", color="#5eead4", app="reading",
        model=ReadingNote, text_fields=("text",), build=build_reading_note,
    )
    out.append(reading_note_src)

    def build_quote(x: ReadingQuote, q: str) -> SearchHit:
        return _hit(
            reading_quote_src, x, f"نقل‌قول از «{x.book.title}»", f"{x.text} {x.comment}".strip(), q,
            x.created_at, book_id=x.book_id, quote_id=x.id, open="reading",
        )

    reading_quote_src = Source(
        key="reading_quotes", label="نقل‌قول‌ها", icon="quote", color="#5eead4", app="reading",
        model=ReadingQuote, text_fields=("text", "comment"), build=build_quote,
    )
    out.append(reading_quote_src)

    # ------------------------------------------------ کوییز و بوکت‌لیست ---
    def build_quiz(x: QuizQuestion, q: str) -> SearchHit:
        return _hit(quiz_src, x, x.question, x.explanation, q, x.created_at, question_id=x.id, open="quiz")

    quiz_src = Source(
        key="quiz", label="سؤال‌های کوییز", icon="quiz", color="#67e8f9", app="quiz",
        model=QuizQuestion, text_fields=("question", "explanation"), build=build_quiz,
    )
    out.append(quiz_src)

    def build_plan(x: FuturePlan, q: str) -> SearchHit:
        return _hit(plan_src, x, x.title, x.note or "", q, x.created_at, plan_id=x.id, open="plans")

    plan_src = Source(
        key="plans", label="آرزوهای ما", icon="plans", color="#5eead4", app="plans",
        model=FuturePlan, text_fields=("title", "note"), build=build_plan,
    )
    out.append(plan_src)

    def build_achievement(x: Achievement, q: str) -> SearchHit:
        unlocked = x.unlocks.exists()
        return _hit(
            ach_src, x, x.title, x.description, q, x.created_at,
            achievement_id=x.id, unlocked=unlocked, open="achievements",
        )

    ach_src = Source(
        key="achievements", label="دستاوردها", icon="achievements", color="#fcd34d", app="achievements",
        model=Achievement, text_fields=("title", "description", "code"), build=build_achievement,
    )
    out.append(ach_src)

    # ------------------------------------------------------ دفتر تماس‌ها ---
    def build_call_log(x: CallLog, q: str) -> SearchHit:
        body = " ".join(p for p in [x.topic, x.note, x.get_kind_display()] if p)
        return _hit(call_log_src, x, x.topic or x.get_kind_display(), body, q, x.happened_on, log_id=x.id, open="call")

    call_log_src = Source(
        key="call_logs", label="تماس‌های ما", icon="call", color="#7dd3fc", app="call",
        model=CallLog, text_fields=("topic", "note"), build=build_call_log, date_field="happened_on",
    )
    out.append(call_log_src)

    def build_call_appointment(x: CallAppointment, q: str) -> SearchHit:
        body = " ".join(p for p in [x.topic, x.message, x.answer_note] if p)
        return _hit(
            call_plan_src, x, f"{x.date} • {x.time:%H:%M}" + (f" • {x.topic}" if x.topic else ""),
            body or x.get_status_display(), q, x.date, appointment_id=x.id, open="call",
        )

    call_plan_src = Source(
        key="call_plans", label="قرارهای تماس", icon="calendar", color="#93c5fd", app="call",
        model=CallAppointment, text_fields=("topic", "message", "answer_note"), build=build_call_appointment,
        date_field="date",
    )
    out.append(call_plan_src)

    # ------------------------------------------------- ایستر اگ (فقط نام) --
    def build_egg(x: EasterEgg, q: str) -> SearchHit:
        # عمداً فقط عنوان؛ متن راز هرگز در نتایج جستجو نمی‌آید
        return _hit(
            egg_src, x, f"راز: {x.title}", "یه راز مخفی توی LoveOS…", q, x.created_at,
            egg_id=x.id, open="terminal",
        )

    egg_src = Source(
        key="easter_eggs", label="رازها", icon="star", color="#fcd34d", app="about",
        model=EasterEgg, text_fields=("title",), build=build_egg,
    )
    out.append(egg_src)

    return out


# ------------------------------------------------------------------ اجرا ---
def _date_range_q(source: Source, date_from, date_to) -> Q:
    """
    شرط بازه‌ی تاریخ برای یک منبع.

    چرا این‌جا حساب‌وکتاب لازم است؟ چون بعضی منابع روی تاریخِ روز ذخیره می‌شوند
    (مثل تاریخ هدیه یا تاریخ تماس) و بعضی روی زمان دقیق (مثل زمان پیام). اگر
    همان `date` خام به یک DateTimeField داده شود، هم Django هشدار «naive datetime»
    می‌دهد و هم فیلتر «تا این تاریخ» ساعت ۰۰:۰۰ همان روز را می‌گیرد و همه‌ی
    رکوردهای بعدازظهر آن روز از نتیجه بیرون می‌افتند. پس:

      • فیلد تاریخ  → همان تاریخ، و بازه بسته است.
      • فیلد زمان   → ابتدای روز محلی تا ابتدای روز بعد (نیم‌باز)، با timezone.
    """
    if not source.date_field or not (date_from or date_to):
        return Q()

    from datetime import datetime, time, timedelta

    field = None
    try:
        field = source.model._meta.get_field(source.date_field)
    except Exception:  # noqa: BLE001 — فیلد محاسبه‌شده یا خاص
        field = None
    is_datetime = field is not None and field.get_internal_type() == "DateTimeField"

    def _as_datetime(day):
        naive = datetime.combine(day, time.min)
        return timezone.make_aware(naive) if timezone.is_naive(naive) else naive

    condition = Q()
    if date_from:
        condition &= Q(**{f"{source.date_field}__gte": _as_datetime(date_from) if is_datetime else date_from})
    if date_to:
        if is_datetime:
            # «تا آخر همان روز» شامل می‌شود، نه فقط نیمه‌شب آن
            condition &= Q(**{f"{source.date_field}__lt": _as_datetime(date_to + timedelta(days=1))})
        else:
            condition &= Q(**{f"{source.date_field}__lte": date_to})
    return condition


def run_search(
    query: str,
    *,
    disabled: Iterable[str] = (),
    only: str | None = None,
    date_from=None,
    date_to=None,
    kind: str | None = None,
    limit_per_source: int = 12,
) -> dict:
    """
    جستجوی سراسری.

    خروجی: {groups: [...], total, sources: [...], query} — گروه‌بندی‌شده بر اساس اپ.
    """
    disabled_set = {str(x) for x in (disabled or [])}
    results: list[SearchHit] = []
    all_sources = [s for s in _sources() if s.key not in disabled_set]
    if only:
        all_sources = [s for s in all_sources if s.key == only or s.app == only]

    for source in all_sources:
        if not query.strip():
            continue
        model = source.model
        qs = model.objects.all()
        # فیلتر حذف‌شده‌ها (اگر مدل فیلد فعال دارد)
        if hasattr(model, "is_active"):
            qs = qs.filter(is_active=True)

        condition = Q()
        for field_name in source.text_fields:
            condition |= Q(**{f"{field_name}__icontains": query})
        # نسخه‌ی نرمال‌شده هم امتحان می‌شود (ی/ك عربی، اعراب، نیم‌فاصله)
        plain = normalize(query)
        if plain and plain != query:
            for field_name in source.text_fields:
                condition |= Q(**{f"{field_name}__icontains": plain})

        date_q = _date_range_q(source, date_from, date_to)

        try:
            rows = list(qs.filter(condition, date_q)[: source.limit])
        except Exception:  # noqa: BLE001 — یک منبع خراب نباید کل جستجو را بخواباند
            rows = []

        # اگر تطبیق مستقیم چیزی نداد، فازی روی چند ردیف آخر امتحان می‌شود
        # (بازه‌ی تاریخ این‌جا هم رعایت می‌شود، وگرنه فیلتر تاریخ بی‌اثر می‌شد)
        if not rows:
            try:
                candidates = list(qs.filter(date_q).order_by(f"-{source.date_field}")[:200])
            except Exception:  # noqa: BLE001 — فیلد تاریخ ممکن است قابل مرتب‌سازی نباشد
                try:
                    candidates = list(qs.filter(date_q)[:200])
                except Exception:  # noqa: BLE001
                    candidates = []
            for obj in candidates:
                haystack = " ".join(str(getattr(obj, f, "") or "") for f in source.text_fields)
                if _score(query, haystack) >= 0.62:
                    rows.append(obj)

        for obj in rows[:limit_per_source]:
            try:
                hit = source.build(obj, query)
            except Exception:  # noqa: BLE001
                continue
            results.append(hit)

    # گروه‌بندی بر اساس منبع، مرتب‌شده با امتیاز
    results.sort(key=lambda h: (-h.score, h.date or ""))
    groups: dict[str, dict] = {}
    for hit in results:
        group = groups.setdefault(
            hit.source,
            {"source": hit.source, "label": hit.source_label, "icon": hit.icon, "color": hit.color, "app": hit.app, "items": []},
        )
        if len(group["items"]) < limit_per_source:
            group["items"].append(hit.as_dict())

    ordered = sorted(groups.values(), key=lambda g: -len(g["items"]))
    return {
        "query": query,
        "total": len(results),
        "groups": ordered,
        "sources": [
            {"key": s.key, "label": s.label, "icon": s.icon, "color": s.color, "app": s.app}
            for s in _sources()
            if s.key not in disabled_set
        ],
    }


def smart_suggestions() -> list[dict]:
    """پیشنهادهای حالت خالی: آخرین چیزها، نه پیام «چیزی پیدا نشد»."""
    from content.models import Letter, Memory, Song
    from reading.models import ReadingBook
    from social.models import ChatMessage

    items: list[dict] = []
    last_chat = ChatMessage.objects.order_by("-created_at").first()
    if last_chat:
        items.append(
            {
                "key": "last_chat",
                "label": "آخرین پیام‌های بابا",
                "icon": "chat",
                "color": "#f0abfc",
                "app": "chat",
                "query": (last_chat.text or "")[:24],
            }
        )
    last_memory = Memory.objects.order_by("-created_at").first()
    if last_memory:
        items.append(
            {
                "key": "last_memory",
                "label": "آخرین خاطره",
                "icon": "memories",
                "color": "#fcd34d",
                "app": "memories",
                "query": last_memory.title[:24],
            }
        )
    last_song = Song.objects.filter(is_active=True).order_by("-created_at").first()
    if last_song:
        items.append(
            {
                "key": "last_song",
                "label": "آخرین آهنگ اضافه‌شده",
                "icon": "music",
                "color": "#c4b5fd",
                "app": "music",
                "query": last_song.title[:24],
            }
        )
    last_book = ReadingBook.objects.filter(is_active=True).order_by("-created_at").first()
    if last_book:
        items.append(
            {
                "key": "last_book",
                "label": "آخرین کتاب",
                "icon": "reading",
                "color": "#5eead4",
                "app": "reading",
                "query": last_book.title[:24],
            }
        )
    last_letter = Letter.objects.filter(is_active=True).order_by("-created_at").first()
    if last_letter:
        items.append(
            {
                "key": "last_letter",
                "label": "آخرین نامه",
                "icon": "whisper",
                "color": "#fda4af",
                "app": "whisper",
                "query": last_letter.title[:24],
            }
        )
    return items


def log_query(query: str) -> None:
    """عبارت‌های پرجستجو (اگر بابا فعال کرده باشد) — بدون هیچ محتوای حساسی."""
    from accounts.models import UserConfig
    from core.services import log_activity

    cfg = UserConfig.get_solo()
    if not getattr(cfg, "search_log_enabled", False):
        return
    text = (query or "").strip()[:80]
    if len(text) < 2:
        return
    log_activity("جستجو", "search", text, at=timezone.now().isoformat())
