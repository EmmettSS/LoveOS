"""
manage.py seed_loveos — پر کردن LoveOS با محتوای اولیه
همه‌ی این متن‌ها از پنل بابا قابل ویرایش‌اند؛ این فقط نقطه‌ی شروع است.
"""
from datetime import date, time, timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import connection
from django.db.utils import OperationalError
from django.utils import timezone

from accounts.models import UserConfig
from calls.models import CallAppointment, CallFreeSlot, CallLog, CallSettings
from dreamhome.models import (
    DreamHomeCategory,
    DreamHomeFeature,
    DreamHomeRoom,
    DreamHomeRoomIdea,
)
from gifts.models import Gift, GiftOccasion
from language.models import (
    LanguageCategory,
    LanguageEntry,
    LanguageProgress,
    LanguageQuiz,
)
from reading.models import (
    ChapterComment,
    ReadingBook,
    ReadingChapter,
    ReadingNote,
    ReadingQuote,
)
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
# مختصات نسبی (۰ تا ۱) ستاره‌های دو صورت فلکی تازه؛ مسیر از نقطه‌ی اول شروع و
# با برگشت به همان نقطه بسته می‌شود تا خط فاصله‌ای در شکل نیفتد.
HEART_STARS = [
    [0.5, 0.761], [0.544, 0.877], [0.758, 1.0], [1.0, 0.865], [1.0, 0.579],
    [0.758, 0.315], [0.544, 0.098], [0.5, 0.0], [0.456, 0.098], [0.242, 0.315],
    [0.0, 0.579], [0.0, 0.865], [0.242, 1.0], [0.456, 0.877], [0.5, 0.761],
]
INFINITY_STARS = [
    [1.0, 0.5], [0.962, 0.677], [0.854, 0.75], [0.691, 0.677], [0.5, 0.5],
    [0.309, 0.323], [0.146, 0.25], [0.038, 0.323], [0.0, 0.5], [0.038, 0.677],
    [0.146, 0.75], [0.309, 0.677], [0.5, 0.5], [0.691, 0.323], [0.854, 0.25],
    [0.962, 0.323], [1.0, 0.5],
]

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
    # ------------------------------------------------ شش اپ تازه
    ("first_call", "اولین تماس", "اولین تماس هماهنگ‌شده‌مون", "call", 1, "شروع یه عادت قشنگ: هر هفته صدای هم رو بشنویم."),
    ("calls_10", "ده تماس", "ده تماس با بابا", "call", 10, "ده بار شنیدم که چقدر دوستم داری."),
    ("hours_100", "صد ساعت تماس", "صد ساعت حرف زدیم", "call", 6000, "صد ساعت صدا، صد سال خاطره."),
    ("first_gift", "اولین هدیه", "اولین هدیه‌ای که در دفتر ثبت شد", "gift", 1, "هر هدیه یه تیکه از قلبمه."),
    ("gifts_10", "ده هدیه", "ده هدیه در دفتر", "gift", 10, "ده بهانه برای دیدن لبخندت."),
    ("gifts_50", "پنجاه هدیه", "پنجاه هدیه در دفتر", "gift", 50, "دفترمون پر از هدیه شد و هنوز کمه!"),
    ("first_book", "اولین کتاب مشترک", "اولین کتابی که با هم خوندیم", "reading", 1, "با هم خوندن، یعنی با هم زندگی کردن."),
    ("books_5", "پنج کتاب", "پنج کتاب با هم خوندیم", "reading", 5, "پنج دنیای تازه که با هم دیدیم."),
    ("books_10", "ده کتاب", "ده کتاب با هم خوندیم", "reading", 10, "یه کتابخونه‌ی کوچیک از خاطره‌ها ساختیم."),
    ("notes_100", "صد یادداشت", "صد یادداشت حاشیه‌ی فصل‌ها", "reading", 100, "صد جا اسمت رو کنار جمله‌های قشنگ نوشتی."),
    ("home_features_10", "ده ویژگی خانه", "ده ویژگی برای خونه‌ی رویایی", "dreamhome", 10, "خونه‌مون داره شکل می‌گیره."),
    ("home_features_50", "پنجاه ویژگی خانه", "پنجاه ویژگی برای خونه‌ی رویایی", "dreamhome", 50, "خیلی چیزها می‌خوایم… ولی مهم‌ترینش هم بودنه."),
    ("first_room", "اولین اتاق", "اولین اتاق نقشه‌ی خونه‌مون", "dreamhome", 1, "اولین اتاق! بگو کجاش بنشینیم."),
    ("first_word", "اولین کلمه", "اولین کلمه‌ی زبان همدیگه رو یاد گرفتیم", "language", 1, "زبان همدیگه رو یاد گرفتن، یعنی دل همدیگه رو خوندن."),
    ("words_100", "صد کلمه", "صد کلمه از زبان همدیگه", "language", 100, "حالا دیگه با زبان خودت حرف می‌زنم."),
    ("language_master", "استاد زبان", "چهل بار تمرین زبان", "language", 40, "استاد شدی دخترم!"),
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
    ("call", "هماهنگ‌کننده‌ی تماس", "اینجا وقت‌هایی که هر دومون آزادیم رو می‌ذاریم و سیستم بازه‌های مشترک رو پیدا می‌کنه. هر تماسی که زدیم رو هم با مدت و حال‌وهوا ثبت می‌کنیم."),
    ("gifts", "دفتر هدیه‌ها", "هر هدیه‌ای که رد و بدل می‌شه اینجا ثبت می‌شه: کِی، برای کی، و واکنشِ همون لحظه. آخر سال می‌شه یه آلبوم قشنگ ازش ساخت."),
    ("reading", "کتاب‌خوانی مشترک", "کتاب‌هایی که با هم می‌خونیم اینجا قفسه دارن؛ حتی کتاب‌های اپ کتابخونه هم همین قفسه دیده می‌شن. هر فصل که خوندی، یادداشت بذار و ستاره بده."),
    ("dreamhome", "خونه‌ی رویایی", "آرزوهای خونه‌مون رو می‌نویسیم، اتاق‌ها رو روی نقشه می‌چینیم و عکس‌های قشنگ رو توی گالری نگه می‌داریم."),
    ("language", "پل زبان", "کلمه‌ها و اصطلاح‌های مازندرانی، ترکی، فارسی و انگلیسی رو با هم یاد می‌گیریم. با فلش‌کارت تمرین کن، تلفظت رو ضبط کن و کوییز بده."),
    ("search", "جستجوی سراسری", "با Ctrl+K (یا آیکن ذره‌بین توی داک) یه کادر باز می‌شه که توی همه‌ی LoveOS می‌گرده: پیام‌ها، نامه‌ها، خاطره‌ها، هدیه‌ها، کتاب‌ها و کلمه‌ها."),
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
        self._ensure_schema_ready()
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

        # ❤ و ♾ — دو صورت فلکی تازه، بعد از حروف اسم
        specials = [
            ("❤", "❤ — قلبی که فقط برای تو می‌تپه؛ همیشه کنار اسم تو می‌درخشه.", HEART_STARS),
            ("♾", "♾ — عشق ما مثل این علامت؛ نه اول داره، نه آخر.", INFINITY_STARS),
        ]
        for j, (letter, msg, stars) in enumerate(specials):
            Constellation.objects.get_or_create(
                order=len(letters) + j,
                defaults={"letter": letter, "message": msg, "stars": stars},
            )

        for text, hour, minute in CARE_DEFAULTS:
            CareReminder.objects.get_or_create(text=text, defaults={"hour": hour, "minute": minute})

        for title, category in PLANS:
            FuturePlan.objects.get_or_create(title=title, defaults={"category": category})

        # ======================= شش اپ تازه =======================
        self.seed_call_sync(cfg)
        self.seed_gifts()
        self.seed_reading()
        self.seed_dream_home()
        self.seed_language()

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
    def _ensure_schema_ready() -> None:
        """نگهبانِ طرحِ دیتابیس: اگر ستونِ یتیمِ ``kind`` (یادگارِ مهاجرتِ
        برگردانده‌شده‌ی ۱۶ سپتامبر) هنوز روی جدولِ آسمان هست، به‌جای
        tracebackِ گنگِ IntegrityError راهِ درست را بگو: اول migrate."""
        try:
            with connection.cursor() as cursor:
                cols = {
                    f.name
                    for f in connection.introspection.get_table_description(
                        cursor, Constellation._meta.db_table
                    )
                }
        except OperationalError:
            raise CommandError(
                "جدول‌های LoveOS ساخته نشده‌اند؛ اول این را اجرا کن: python manage.py migrate"
            )
        if "kind" in cols:
            raise CommandError(
                "دیتابیس قدیمی است (ستونِ یتیمِ kind از مهاجرتِ برگردانده‌شده هنوز هست). "
                "اول این را اجرا کن تا خودکار ترمیم شود: python manage.py migrate"
            )

    # ------------------------------------------- اپ ۱: هماهنگ‌کننده تماس ---
    def seed_call_sync(self, cfg) -> None:
        CallSettings.get_solo()
        slots = [
            ("daddy", 0, "21:00", "22:30", "بعد از کار"),
            ("daddy", 3, "20:30", "22:00", ""),
            ("daddy", 5, "10:00", "13:00", "صبح روز تعطیل"),
            ("daughter", 0, "20:00", "21:30", "بعد از کلاس"),
            ("daughter", 2, "19:30", "21:00", ""),
            ("daughter", 5, "11:00", "14:00", "آخر هفته"),
        ]
        for owner, weekday, start, end, note in slots:
            CallFreeSlot.objects.get_or_create(
                owner=owner, weekday=weekday, start_time=start, end_time=end,
                defaults={"note": note},
            )

        if not CallAppointment.objects.exists():
            today = timezone.localdate()
            CallAppointment.objects.create(
                proposer="daughter", proposee="daddy",
                date=today + timedelta(days=2), time=time(21, 0), duration_minutes=45,
                topic="حرف زدن درباره‌ی سفر", status="approved",
            )
            CallAppointment.objects.create(
                proposer="daddy", proposee="daughter",
                date=today + timedelta(days=5), time=time(20, 30), duration_minutes=30,
                topic="دیدن عکس‌های قدیمی", status="pending",
            )

        if not CallLog.objects.exists():
            today = timezone.localdate()
            samples = [
                (today - timedelta(days=3), 32, "کار و روزمرگی", "happy", "happy", "خیلی خندیدیم"),
                (today - timedelta(days=10), 192, "تماشای فیلم با هم (اسکایپ)", "happy", "happy", "سه ساعت و دوازده دقیقه شد!"),
                (today - timedelta(days=17), 68, "دلتنگ", "missing", "missing", "دلم نمی‌خواست قطع کنیم"),
                (today - timedelta(days=24), 21, "سریع سلام", "normal", "happy", ""),
            ]
            for day, minutes, topic, dm, dd, note in samples:
                CallLog.objects.create(
                    happened_on=day, duration_minutes=minutes, topic=topic,
                    daddy_mood=dm, daughter_mood=dd, note=note, recorded_by="daddy",
                    kind="video" if minutes > 30 else "voice",
                )

    # ----------------------------------------------- اپ ۲: دفتر هدیه‌ها ---
    def seed_gifts(self) -> None:
        occasions = [
            ("تولد", "🎂", 1), ("سالگرد", "💞", 2), ("بدون مناسبت", "🎁", 3),
            ("دلتنگی", "💌", 4), ("موفقیت", "🌟", 5), ("عید", "🌷", 6),
        ]
        made: dict[str, GiftOccasion] = {}
        for name, icon, order in occasions:
            obj, _ = GiftOccasion.objects.get_or_create(name=name, defaults={"icon": icon, "order": order})
            made[name] = obj

        if Gift.objects.exists():
            return

        today = timezone.localdate()
        gifts = [
            ("زنجیر طلا با اسم تو", today - timedelta(days=420), "تولد", "daddy", "daughter", 4800, "زنجیر نازک با حرف اول اسمت", "گفتم تا آخر عمر می‌بندمش", True),
            ("پلی‌استیشن", today - timedelta(days=300), "بدون مناسبت", "daddy", "daughter", 12000, "چون نمره‌هایت عالی بود", "باورش نمی‌شد!", False),
            ("کتاب «ملت عشق»", today - timedelta(days=210), "بدون مناسبت", "daughter", "daddy", 320, "برای اینکه با هم بخونیمش", "خوندیم و کلی حرف زدیم", False),
            ("عطر", today - timedelta(days=150), "موفقیت", "daughter", "daddy", 900, "برای قبولی‌ات در دانشگاه", "بابا گفت بوش یادته می‌ندازه", False),
            ("شال دست‌باف", today - timedelta(days=90), "دلتنگی", "daughter", "daddy", None, "خودم بافتم، رنگش مثل آسمون شب", "بابا گفت شب‌ها می‌بندمش", True),
            ("دستبند سنگ فیروزه", today - timedelta(days=35), "بدون مناسبت", "daddy", "daughter", 1500, "سنگش از نیشابوره", "هر روز می‌بندمش", False),
        ]
        for name, day, occasion, giver, receiver, price, desc, reaction, favorite in gifts:
            Gift.objects.get_or_create(
                name=name,
                defaults={
                    "given_on": day, "occasion": made.get(occasion), "giver": giver, "receiver": receiver,
                    "price": price, "description": desc, "reaction": reaction,
                    "is_favorite": favorite, "recorded_by": giver,
                },
            )

    # ------------------------------------------- اپ ۳: کتاب‌خوانی مشترک ---
    def seed_reading(self) -> None:
        if ReadingBook.objects.exists():
            return

        book = ReadingBook.objects.create(
            title="ملت عشق",
            author="الیف شافاک",
            status="reading",
            summary="داستان عشق و شمس و مولانا؛ کتابی که با هم می‌خونیم و حاشیه می‌نویسیم.",
            why_this_book="چون هر دومون عاشق جمله‌های قشنگیم",
            added_by="daddy",
            is_physical=True,
            total_chapters=4,
            started_on=timezone.localdate() - timedelta(days=30),
        )
        chapters = [
            ("فصل اول: خاک", "یه روز معمولی بود که مسافر رسید…"),
            ("فصل دوم: آب", "شمس گفت: هر حرفی که می‌زنی، اگه از دلت نیاد، به دل نمی‌نشینه."),
            ("فصل سوم: آتش", "عشق، تنها پلی است که از آن می‌توان به دلِ دیگری رفت."),
            ("فصل چهارم: باد", "و بعد… هر دو فهمیدیم که باید با هم بریم."),
        ]
        made_chapters: list[ReadingChapter] = []
        for i, (title, text) in enumerate(chapters, start=1):
            made_chapters.append(ReadingChapter.objects.create(book=book, order=i, title=title, text=text))

        ReadingNote.objects.create(
            owner="daddy", book=book, chapter=made_chapters[1], is_finished=True, rating=5,
            text="این جمله رو دو بار خوندم: دلت باید حرف بزنه، نه زبونت.",
        )
        ReadingNote.objects.create(
            owner="daughter", book=book, chapter=made_chapters[1], is_finished=True, rating=4,
            text="مرسی که این کتاب رو انتخاب کردی بابا؛ قشنگ بود ❤",
        )
        ReadingQuote.objects.create(
            owner="daughter", book=book, chapter=made_chapters[2],
            text="عشق، تنها پلی است که از آن می‌توان به دلِ دیگری رفت.",
            comment="این جمله رو گذاشتم پشت گوشی بابا",
        )
        ChapterComment.objects.create(
            owner="daddy", chapter=made_chapters[1], text="فصل دوم رو بخون، بعداً می‌خوام درباره‌ش حرف بزنیم.",
        )
        ChapterComment.objects.create(
            owner="daughter", chapter=made_chapters[1], text="خوندم بابا! نظرم رو نوشتم ❤",
        )

        FromLibrary = ReadingBook.objects.create(
            title="ماهی سیاه کوچولو",
            author="صمد بهرنگی",
            status="finished",
            added_by="daughter",
            summary="یه کتاب کوچیک ولی پر از حرف، از قفسه‌ی کتابخونه‌ی ما.",
            finished_on=timezone.localdate() - timedelta(days=12),
            total_chapters=1,
        )
        small = ReadingChapter.objects.create(book=FromLibrary, order=1, title="تمام کتاب")
        for owner in ("daddy", "daughter"):
            ReadingNote.objects.create(owner=owner, book=FromLibrary, chapter=small, is_finished=True, rating=5, text="تمام شد!")
            from reading.models import ReadingProgress

            ReadingProgress.objects.update_or_create(
                owner=owner, book=FromLibrary, defaults={"current_chapter": 1, "percent": 100}
            )

    # ------------------------------------------ اپ ۴: خانه‌ی رویایی -------
    def seed_dream_home(self) -> None:
        categories = [
            ("مکان", "📍", "شهر، محله، نزدیک دریا یا کوه", 1),
            ("اندازه", "📐", "کوچک و دنج یا بزرگ", 2),
            ("اتاق‌ها", "🚪", "اتاق خواب، کار، کتابخانه", 3),
            ("حیاط", "🌳", "باغچه، درخت، استخر", 4),
            ("دکور", "🖼", "رنگ دیوار، فرش، تابلو", 5),
            ("آشپزخانه", "🍳", "جزیره‌ی آشپزخانه، پنجره‌ی بزرگ", 6),
        ]
        made: dict[str, DreamHomeCategory] = {}
        for name, icon, detail, order in categories:
            obj, _ = DreamHomeCategory.objects.get_or_create(name=name, defaults={"icon": icon, "detail": detail, "order": order})
            made[name] = obj

        for title, category, importance, desc, by, value in [
            ("حیاط بزرگ با درخت انار", "حیاط", "must", "که تابستون‌ها زیرش بشینیم و بشمریم ستاره‌ها رو", "daughter", 2),
            ("پنجره‌ی بزرگ رو به دریا", "دکور", "luxury", "صبح‌ها نور بیاد روی فرش", "daddy", 3),
            ("یه اتاق کوچیک برای کتاب‌ها", "اتاق‌ها", "must", "با یک صندلی نرم و چراغ مطالعه", "daddy", 1),
            ("آشپزخانه‌ی جزیره‌ای", "آشپزخانه", "nice", "که هر دومون همزمان بتونیم آشپزی کنیم", "daughter", 4),
            ("یک گربه‌ی پشمالو", "مکان", "must", "بغل‌ت بخوابه و براتون خرخر کنه", "daughter", 5),
            ("یک تخت آویز توی بالکن", "دکور", "nice", "برای ظهرهای تابستون", "daughter", 6),
        ]:
            DreamHomeFeature.objects.get_or_create(
                title=title,
                defaults={
                    "category": made.get(category), "importance": importance, "description": desc,
                    "added_by": by, "order": value,
                },
            )

        if DreamHomeRoom.objects.exists():
            return

        rooms = [
            ("نشیمن", 6, 8, 34, 26, "#f9a8d4", "🛋", "کاناپه‌ی بزرگ خاکستری + پتوی پشمی"),
            ("آشپزخانه", 42, 8, 26, 24, "#fcd34d", "🍳", "جزیره‌ی چوبی با دو صندلی"),
            ("اتاق من", 70, 8, 24, 26, "#c4b5fd", "🛏", "دیوار صورتی کم‌رنگ و چراغ رشته‌ای"),
            ("کتابخانه", 8, 38, 30, 24, "#86efac", "📚", "قفسه تا سقف، صندلی نرم"),
            ("بالکن", 68, 40, 26, 22, "#93c5fd", "🪴", "تخت آویز و کلی گلدون"),
        ]
        for name, x, y, w_, h, color, icon, desc in rooms:
            room = DreamHomeRoom.objects.create(
                name=name, x=x, y=y, w=w_, h=h, color=color, icon=icon, description=desc, added_by="daughter"
            )
            DreamHomeRoomIdea.objects.create(room=room, kind="idea", text=desc, added_by="daughter")
            if color == "#f9a8d4":
                DreamHomeRoomIdea.objects.create(room=room, kind="color", text="رنگ اصلی: صورتی خاکی", color_value="#f9a8d4", added_by="daughter")
                DreamHomeRoomIdea.objects.create(room=room, kind="furniture", text="کاناپه‌ی بی‌گوشه", added_by="daddy")

    # ---------------------------------------------- اپ ۵: پل زبان --------
    def seed_language(self) -> None:
        categories = [
            ("روزمره", "🌤", "سلام، خداحافظ، ممنون", 1),
            ("عاشقانه", "💗", "دوستت دارم، دلم برات تنگ شده", 2),
            ("بامزه", "😄", "اصطلاحات خنده‌دار", 3),
            ("خانوادگی", "👨‍👧", "نسبت‌ها و اسم‌های فامیلی", 4),
            ("غذا و آشپزی", "🍲", "اسم غذاها و خوراکی‌ها", 5),
            ("احساسات", "🌧", "دلتنگی، خوشحالی، دلخوری", 6),
        ]
        made: dict[str, LanguageCategory] = {}
        for name, icon, detail, order in categories:
            obj, _ = LanguageCategory.objects.get_or_create(name=name, defaults={"icon": icon, "detail": detail, "order": order})
            made[name] = obj

        words = [
            ("word", "خِدِ حَق", "mzn", {"fa": "سلام", "tr": "Merhaba"}, "", "", "خِدِ حَق باباجان!", "روزمره", "daddy"),
            ("word", "خِدافِز", "mzn", {"fa": "خداحافظ", "tr": "Hoşça kal"}, "", "", "", "روزمره", "daddy"),
            ("word", "دِلِسِه", "mzn", {"fa": "دلِ من", "tr": "kalbim"}, "", "", "دِلِسِه، اینجا خیلی خلوته.", "عاشقانه", "daddy"),
            ("word", "توکِلا", "mzn", {"fa": "یک لحظه صبر کن", "tr": "bir saniye"}, "", "", "", "روزمره", "daddy"),
            ("word", "Merhaba", "tr", {"fa": "سلام", "mzn": "خِدِ حَق"}, "", "", "Merhaba babacığım!", "روزمره", "daughter"),
            ("word", "Seni seviyorum", "tr", {"fa": "دوستت دارم", "mzn": "تو ره دِل داشتنه"}, "", "", "", "عاشقانه", "daughter"),
            ("word", "Özledim", "tr", {"fa": "دلم برات تنگ شده", "mzn": "دل تنگی دارمه"}, "", "", "Seni çok özledim", "احساسات", "daughter"),
            ("word", "Yemek", "tr", {"fa": "غذا", "mzn": "شِمه"}, "", "", "", "غذا و آشپزی", "daughter"),
            ("word", "Anne", "tr", {"fa": "مادر", "mzn": "مار"}, "", "", "", "خانوادگی", "daughter"),
            ("idiom", "دِلِس درمِ از", "mzn", {"fa": "دلم درد گرفت"}, "دلِ من درد گرفت", "یعنی خیلی ناراحت شدم / دلم شکست", "وقتی خیلی دلخور میشی می‌گن", "احساسات", "daddy"),
            ("idiom", "آب زیر کاه", "fa", {"mzn": "او زیرِ کاه", "tr": "sinsi"}, "", "کسی که کارهایش را پنهانی انجام می‌دهد", "", "بامزه", "daddy"),
            ("idiom", "Kedi gibi bakmak", "tr", {"fa": "مثل گربه نگاه کردن", "mzn": "گربه‌واری چش‌بازی"}, "نگاهِ گربه‌ای", "با چشمانی مهربان و دلبرانه نگاه کردن", "به بابا که نگاه می‌کنی، همین‌طوری", "بامزه", "daughter"),
        ]
        for kind, text, lang, translations, literal, real, example, category, by in words:
            LanguageEntry.objects.get_or_create(
                text=text, language=lang,
                defaults={
                    "kind": kind, "translations": translations, "literal_meaning": literal,
                    "real_meaning": real, "example": example, "category": made.get(category), "added_by": by,
                },
            )

        quizzes = [
            ("«Merhaba» یعنی چی؟", ["سلام", "خداحافظ", "ممنون"], "سلام", "دقیقاً! این اولین کلمه‌ی ترکی تو بود.", "روزمره"),
            ("در مازندرانی به «سلام» چی می‌گن؟", ["خِدِ حَق", "دِلِسِه", "توکِلا"], "خِدِ حَق", "آفرین دخترم! 🌸", "روزمره"),
            ("«Özledim» یعنی…", ["دلم برات تنگ شده", "دوستت دارم", "بخواب"], "دلم برات تنگ شده", "منم همین‌طوری ❤", "احساسات"),
            ("«آب زیر کاه» یعنی چه‌جور آدمی؟", ["پنهان‌کار", "مهربان", "خجالتی"], "پنهان‌کار", "بامزه‌ست، نه؟", "بامزه"),
            ("«Yemek» یعنی…", ["غذا", "آب", "نان"], "غذا", "بریم آشپزی کنیم 🍲", "غذا و آشپزی"),
            ("در مازندرانی «مار» یعنی…", ["مادر", "ماه", "مار"], "مادر", "درسته دخترم!", "خانوادگی"),
        ]
        for i, (q, options, answer, feedback, category) in enumerate(quizzes, start=1):
            LanguageQuiz.objects.get_or_create(
                question=q,
                defaults={"options": options, "answer": answer, "fun_feedback": feedback,
                          "category": made.get(category), "order": i},
            )

        LanguageProgress.get_for("daddy")
        LanguageProgress.get_for("daughter")

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
