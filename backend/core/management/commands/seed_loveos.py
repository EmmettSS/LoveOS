"""
manage.py seed_loveos — پر کردن LoveOS با محتوای اولیه
همه‌ی این متن‌ها از پنل بابا قابل ویرایش‌اند؛ این فقط نقطه‌ی شروع است.
"""
from datetime import date, timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from accounts.models import UserConfig
from content.models import (
    Constellation,
    Countdown,
    Flower,
    FlowerMessage,
    FuturePlan,
    Letter,
    Memory,
    MoodMessage,
    QuizQuestion,
    QuizReward,
    TerminalCommand,
    TutorialChapter,
)
from core.models import Achievement, EasterEgg
from games.models import Puzzle
from health.models import CareReminder
from library.models import Book, Chapter, Page, Paragraph
from social.models import HugSettings

# ---------------------------------------------------------------- داده‌ها ---
ACHIEVEMENTS = [
    ("first_login", "اولین ورود", "اولین باری که در LoveOS رو باز کردی", "door", 1, "خوش اومدی دخترم. اینجا خونه‌ی توئه."),
    ("first_voice", "اولین ویس", "اولین صدای بابا رو گوش دادی", "mic", 1, "صدام همیشه اینجاست، هر وقت دلت خواست."),
    ("days_100", "۱۰۰ روز با بابا", "صد روز کنار هم", "calendar", 100, "صد روز گذشت و من هر روز بیشتر دوستت دارم."),
    ("quiz_perfect", "کوییز کامل", "همه‌ی جواب‌ها درست", "brain", 1, "تو منو از خودم بهتر می‌شناسی ❤"),
    ("all_letters", "همه نامه‌ها", "تمام نامه‌ها رو خوندی", "letter", 5, "هر کلمه‌شون رو با فکر تو نوشتم."),
    ("puzzle_player", "پازل‌باز", "اولین پازل رو حل کردی", "puzzle", 1, ""),
    ("puzzle_master", "استاد پازل", "ده پازل حل کردی", "puzzle", 10, "دست‌های کوچولوت خیلی بلدن!"),
    ("hug_bunny", "جوجه کوچولوی بغلی بابا", "ده بار بغل شدی", "hug", 10, ""),
    ("kind_daughter", "دختر مهربون بابا", "ده بار بابا رو بغل کردی", "hug", 10, ""),
    ("med_regular", "منظم", "سی روز داروهات رو سر وقت خوردی", "pill", 30, "به خودت خوب می‌رسی، بابا خیالش راحته."),
    ("self_care", "مراقب خودت", "شش ماه چرخه‌ات رو ثبت کردی", "heart", 6, ""),
    ("writer", "نویسنده", "ده فصل نوشتی", "pen", 10, ""),
    ("storyteller", "داستان‌سرا", "صد پاراگراف نوشتی", "book", 100, ""),
    ("secret_finder", "کاشف رازها", "پنج راز پیدا کردی", "key", 5, ""),
    ("secret_master", "استاد رازها", "ده راز پیدا کردی", "key", 10, ""),
    ("know_it_all", "همه‌چیزدان", "همه‌ی رازها رو پیدا کردی", "crown", 15, "هیچی از چشمت پنهون نمی‌مونه دخترم."),
]

EASTER_EGGS = [
    ("قلب پنهان لوگو", "click_logo_5", "پنج بار زدی رو لوگو؟ باشه، یه راز: هر خط کد این دنیا رو با فکر تو نوشتم. ❤"),
    ("بارون قلب", "type_love", "کلمه‌ی جادویی رو نوشتی… حالا بذار آسمون قلب بباره برات 💕"),
    ("کد قدیمی", "konami", "بالا بالا پایین پایین… تو حتی رمزهای قدیمی رو هم بلدی. دوستت دارم بازیگوش من."),
    ("حذف تنهایی", "terminal_rm", "حذف شد. حالا فقط ما هستیم. ❤"),
    ("ساندویچ", "terminal_sandwich", "ساندویچت آماده‌ست دخترم 🥪 با یه لایه‌ی اضافه عشق و دو تا بوس."),
    ("آسمون نیمه‌شب", "midnight", "بیداری دخترم؟ آسمون امشب فقط برای توئه ✨"),
    ("کیک تولد", "birthday", "تولدت مبارک دخترم 🎂 امسال قول می‌دم کنارت باشم."),
    ("قلب سالگرد", "anniversary", "امروز روز ماست. همون روزی که دنیام قشنگ شد 🎉"),
    ("خونه‌ی بابا", "map_zoom", "این‌جا خونه‌ی باباته. یه اتاق همیشه برای تو خالیه 🏠"),
    ("ستاره‌ی مرکزی", "star_double_click", "هر ستاره یه حرف از اسم توئه. کل آسمون اسم توئه."),
    ("گل مخصوص", "garden_5_water", "این گل رو انقدر آب دادی که شد گلِ خودت. اسمش رو گذاشتم «صبر دخترم» 🌷"),
    ("دلتنگی", "hug_3", "سه تا بغل پشت سر هم؟ بابا فهمید دلت تنگه. منم همین‌طور ❤"),
    ("جمله‌ی جادویی", "chat_love", "منم دوستت دارم، بیشتر از همه‌ی کلمه‌های دنیا."),
    ("آهنگ ما", "music_3_play", "سه بار پشت سر هم گوشش دادی… این آهنگ رو روزی انتخاب کردم که فهمیدم تو موندنی هستی."),
    ("کمک بابا", "lock_5_wrong", "اشکال نداره دخترم، بابا همیشه درو برات باز می‌کنه."),
]

FLOWER_MESSAGES = [
    "مثل همین گل، هر روز قشنگ‌تر می‌شی 🌸",
    "بابا بهت افتخار می‌کنه دخترم.",
    "یادت باشه نفس عمیق بکشی ❤",
    "یه روز این باغچه رو با هم واقعی می‌کنیم.",
    "تو بهترین اتفاق زندگی منی.",
    "خسته که شدی، همین‌جا بشین کنار گل‌ها.",
]

TERMINAL_EXTRAS = [
    ("kiss", "یه بوسه پرواز کرد سمتت ❤", "یه بوس کوچولو"),
    ("hug", "بغل مجازی فعال شد 🤗", "یه بغل"),
    ("date", "امروز یه روز دیگه‌ست که عاشقتم.", "تاریخ امروز"),
]

TUTORIAL = [
    ("os", "سیستم‌عامل یعنی چی؟", "سیستم‌عامل مثل خونه‌ست؛ اتاق‌های مختلف داره و هر اتاق یه کاری می‌کنه. LoveOS خونه‌ی کوچیک ماست که بابا برات ساخته."),
    ("apps", "اپ‌ها چی هستن؟", "هر آیکن روی دسکتاپ یه اپه. روش بزنی باز می‌شه، دکمه‌ی بستن بالاش هست. همین!"),
    ("desktop", "دسکتاپ و داک", "پایین صفحه داک هست: اپ‌های باز، زنگوله‌ی اعلان‌ها و تنظیمات. بالا هم ساعت و آب‌وهوای جفتمونه."),
    ("terminal", "ترمینال چیه؟", "ترمینال یه جاییه که به‌جای کلیک، دستور می‌نویسی. بنویس help تا لیست کارهایی که بلده رو ببینی."),
    ("map", "نقشه‌ی ما", "روی نقشه دو تا نقطه هست: خونه‌ی بابا و خونه‌ی تو. دکمه‌ی «پرواز روی مسیر» رو بزن."),
    ("chat", "چطور به بابا پیام بدم؟", "اپ چت رو باز کن و بنویس. پیامت مستقیم می‌رسه دست بابا و جوابش همین‌جا میاد."),
    ("pwa", "نصب روی گوشی", "توی مرورگر، منو رو باز کن و بزن «Add to Home screen». بعدش LoveOS مثل یه اپ واقعی روی گوشیت میاد."),
    ("voice", "صندوق صدا", "همه‌ی ویس‌های بابا اینجاست، دسته‌بندی شده. دکمه‌ی «یه ویس تصادفی» هم داره."),
    ("cycle", "چرخه و مراقبت", "اینجا پریود، علائم و قرص‌هات رو ثبت می‌کنی. سر وقت بهت یادآوری می‌کنم قرصت رو بخوری."),
    ("library", "کتابخونه‌ی ما", "کتاب «داستان ما» رو با هم می‌نویسیم. تو هم می‌تونی فصل جدید بنویسی."),
]

MOODS = [
    ("happy", "خوشحالی‌ات دنیای منو روشن می‌کنه دخترم ☀"),
    ("missing", "منم دلم تنگه… چشم‌هات رو ببند، بابا بغلت کرده."),
    ("tired", "بشین یه نفس بکش. کارها منتظر می‌مونن، تو مهم‌تری."),
    ("sad", "غصه نخور دخترم. هر چی هست می‌گذره، من همین‌جام."),
    ("excited", "چه خبره! بگو ببینم چی شده 😍"),
    ("sleepy", "برو بخواب دخترم، فردا هم بابا هست."),
]

QUIZ = [
    ("رنگ مورد علاقه‌ی بابا چیه؟", "آبی", "سبز", "همون رنگی که تو دوست داری", "قرمز", "c", "جواب همیشه تویی."),
    ("بابا اول چی به تو گفت؟", "سلام", "خوبی؟", "اسمت قشنگه", "سلام دخترم", "d", ""),
    ("کدوم آهنگ، آهنگ ماست؟", "اولین آهنگی که با هم گوش دادیم", "جدیدترین آهنگ", "هر آهنگ عاشقانه", "هیچکدوم", "a", ""),
    ("بابا کِی بیشتر دلتنگ می‌شه؟", "صبح‌ها", "شب‌ها", "همیشه", "وقت غذا", "c", "همیشه یعنی همیشه."),
    ("اگه بابا یه آرزو داشت، چی بود؟", "پول", "سفر", "کنار تو بودن", "خواب", "c", ""),
]

CONSTELLATIONS = [
    ("م", "اولین حرف اسمت، اولین حرف قلب من."),
    ("ر", "رویاهامون اینجا نوشته شده."),
    ("ی", "یادت همیشه با منه."),
    ("م", "مهربونیت ستاره‌ی راهنمای منه."),
]

CARE_DEFAULTS = [
    ("آب بخور 💧", 11, 0),
    ("یه کم استراحت کن 🌿", 15, 0),
    ("قرصت رو بخور 💊", 21, 0),
    ("چکاپ دوره‌ای یادت نره 🩺", 10, 30),
]

PLANS = [
    ("اولین سفر دو نفره", "travel"),
    ("خونه‌ی مشترک با یه بالکن پر از گل", "home"),
    ("یاد گرفتن یه ساز با هم", "wish"),
    ("پختن اولین شام با هم", "wish"),
]

FUTURE_MEMORIES = [
    "روز عقد ما",
    "روز عروسی ما",
    "اولین خونه‌ی مشترک",
    "اولین سفرمون",
    "اولین سالگرد",
    "۱۰۰۰ روز با هم",
]


class Command(BaseCommand):
    help = "پر کردن LoveOS با محتوای اولیه (idempotent)"

    def add_arguments(self, parser):
        parser.add_argument("--passcode", default="1234", help="رمز ورود دخترم")
        parser.add_argument("--vault", default="0000", help="رمز صندوقچه")

    def handle(self, *args, **opts):
        cfg = UserConfig.get_solo()
        if not cfg.passcode_hash:
            cfg.set_passcode(opts["passcode"])
            cfg.set_vault_passcode(opts["vault"])
            cfg.set_security_answer("مریم")
        cfg.daughter_name = cfg.daughter_name or "مریم"
        cfg.relationship_start = cfg.relationship_start or (date.today() - timedelta(days=365))
        cfg.anniversary = cfg.anniversary or cfg.relationship_start
        cfg.daughter_birthday = cfg.daughter_birthday or date(2000, 5, 12)
        cfg.next_meeting = cfg.next_meeting or (timezone.now() + timedelta(days=45))
        cfg.today_message = cfg.today_message or "امروزم مثل هر روز، دوستت دارم دخترم ❤"
        cfg.about_text = cfg.about_text or (
            "LoveOS یه سیستم‌عامل کوچیکه که بابا با دست‌های خودش برای دخترش ساخته.\n"
            "هر آیکنش یه تیکه از دل منه. هر صداش، صدای منه.\n"
            "این‌جا فاصله معنی نداره."
        )
        cfg.save()

        for code, title, desc, icon, threshold, secret in ACHIEVEMENTS:
            Achievement.objects.get_or_create(
                code=code,
                defaults={"title": title, "description": desc, "icon": icon,
                          "threshold": threshold, "secret_message": secret},
            )

        for title, trigger, message in EASTER_EGGS:
            EasterEgg.objects.get_or_create(trigger_type=trigger, defaults={"title": title, "message": message})

        HugSettings.get_solo()

        for text in FLOWER_MESSAGES:
            FlowerMessage.objects.get_or_create(text=text)
        for name, emoji, color in [
            ("گل صبر", "🌷", "#f9a8d4"), ("گل خنده", "🌻", "#fde68a"),
            ("گل آرامش", "🌸", "#e9d5ff"), ("گل دلتنگی", "🌼", "#bfdbfe"),
        ]:
            Flower.objects.get_or_create(name=name, defaults={"emoji": emoji, "color": color})

        for cmd, output, help_text in TERMINAL_EXTRAS:
            TerminalCommand.objects.get_or_create(command=cmd, defaults={"output": output, "help_text": help_text})

        for i, (key, title, body) in enumerate(TUTORIAL, start=1):
            TutorialChapter.objects.get_or_create(key=key, defaults={"title": title, "body": body, "order": i})

        for mood, message in MOODS:
            MoodMessage.objects.get_or_create(mood=mood, defaults={"message": message})

        for i, (q, a, b, c, d, correct, exp) in enumerate(QUIZ, start=1):
            QuizQuestion.objects.get_or_create(
                question=q,
                defaults={"option_a": a, "option_b": b, "option_c": c, "option_d": d,
                          "correct": correct, "explanation": exp, "order": i},
            )
        QuizReward.objects.get_or_create(pk=1)

        # M A R Y A M — شش صورت فلکی
        letters = ["M", "A", "R", "Y", "A", "M"]
        msgs = [
            "M — مریمِ من، اولین و آخرین حرف قلبم.",
            "A — آرامشی که با تو اومد.",
            "R — رویاهایی که با هم می‌سازیم.",
            "Y — یادت که همیشه با منه.",
            "A — امیدی که تو بهم دادی.",
            "M — موندنی‌ترین اتفاق زندگی من.",
        ]
        for i, (letter, msg) in enumerate(zip(letters, msgs)):
            Constellation.objects.get_or_create(
                order=i,
                defaults={"letter": letter, "message": msg, "stars": self.letter_stars(letter, i)},
            )

        for text, hour, minute in CARE_DEFAULTS:
            CareReminder.objects.get_or_create(text=text, defaults={"hour": hour, "minute": minute})

        for title, category in PLANS:
            FuturePlan.objects.get_or_create(title=title, defaults={"category": category})

        for title in FUTURE_MEMORIES:
            Memory.objects.get_or_create(
                title=title,
                defaults={"is_future": True, "locked_text": "این خاطره هنوز نوشته نشده...",
                          "unlock_at": timezone.now() + timedelta(days=365)},
            )

        Letter.objects.get_or_create(
            title="اولین نامه",
            defaults={"body": "دخترم،\nاگه این رو می‌خونی یعنی در این دنیای کوچیک باز شده.\n"
                              "من هر شب قبل خواب یه بار اسمت رو می‌گم و بعد می‌خوابم.\n"
                              "هر جای دنیا که باشی، یه تیکه از قلب من همون‌جاست.\n\nبابا"},
        )
        Countdown.objects.get_or_create(
            title="تا دیدار بعدی", defaults={"target": cfg.next_meeting, "icon": "plane"}
        )

        # کتاب پیش‌فرض
        book, _ = Book.objects.get_or_create(title="داستان ما", defaults={"subtitle": "نوشته‌ی بابا و دخترش"})
        if not book.chapters.exists():
            ch = Chapter.objects.create(book=book, title="فصل اول: روزی که پیدات کردم", order=1, is_published=True)
            pg = Page.objects.create(chapter=ch, order=1)
            Paragraph.objects.create(
                page=pg, order=1, author="daddy",
                text="یه روز معمولی بود. از اون روزهایی که فکر می‌کنی هیچ اتفاقی نمی‌افته. "
                     "بعد تو اومدی و همه‌چیز رنگ گرفت.",
            )
            Paragraph.objects.create(
                page=pg, order=2, author="daddy",
                text="از اون روز به بعد هر صبح یه دلیل داشتم برای بیدار شدن: این‌که شاید امروز صدات رو بشنوم.",
            )

        for level, title in [(3, "پازل آسان"), (4, "پازل متوسط"), (5, "پازل سخت")]:
            Puzzle.objects.get_or_create(
                level=level,
                defaults={"title": title, "end_message": "حلش کردی دخترم ❤ می‌دونستم می‌تونی."},
            )

        self.stdout.write(self.style.SUCCESS(
            f"✅ LoveOS آماده شد. رمز ورود: {opts['passcode']} | رمز صندوقچه: {opts['vault']}"
        ))

    @staticmethod
    def letter_stars(letter: str, index: int) -> list:
        """مختصات ساده‌ی ستاره‌ها برای هر حرف (نسبی، ۰ تا ۱)."""
        shapes = {
            "M": [[0, 0], [0, 1], [0.5, 0.5], [1, 1], [1, 0]],
            "A": [[0, 0], [0.25, 1], [0.75, 1], [1, 0], [0.2, 0.45], [0.8, 0.45]],
            "R": [[0, 0], [0, 1], [0.8, 1], [0.8, 0.55], [0, 0.5], [0.9, 0]],
            "Y": [[0, 1], [0.5, 0.5], [1, 1], [0.5, 0]],
        }
        return shapes.get(letter, [[0, 0], [1, 1]])
