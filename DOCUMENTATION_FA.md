# LoveOS — مستندات کامل

> یک سیستم‌عامل کوچک که توی مرورگر اجرا می‌شود. من آن را برای دخترم ساختم تا فاصله‌ی بینمان
> هر روز کمی کوتاه‌تر حس شود.
>
> این تنها مرجع کل پروژه است: چیست، چطور ساخته شده، چطور روی سیستم خودم اجرایش می‌کنم، چطور
> روی سرور می‌گذارمش و چطور زنده نگهش می‌دارم.
> نسخه‌ی انگلیسی این سند [`DOCUMENTATION.md`](./DOCUMENTATION.md) است.

---

## فهرست

1. [LoveOS چیست](#۱-loveos-چیست)
2. [معماری](#۲-معماری)
3. [ساختار پروژه](#۳-ساختار-پروژه)
    - [۳.۱ نشان](#۳۱-نشان)
4. [محیط توسعه](#۴-محیط-توسعه)
5. [پیکربندی (`backend/.env`)](#۵-پیکربندی-backendenv)
6. [اپ‌ها](#۶-اپها)
7. [پنل بابا](#۷-پنل-بابا)
8. [اتصال به بات سروش](#۸-اتصال-به-بات-سروش)
9. [مرجع API](#۹-مرجع-api)
10. [استقرار (دیپلوی)](#۱۰-استقرار-دیپلوی)
    - [۱۰.۱ قبل از هر استقراری](#۱۰۱-قبل-از-هر-استقراری)
    - [۱۰.۲ سرور مجازی (VPS) — اوبونتو/دبیان با Nginx و Gunicorn](#۱۰۲-سرور-مجازی-vps--اوبونتودبیان-با-nginx-و-gunicorn)
    - [۱۰.۳ هاست اشتراکی cPanel (Passenger)](#۱۰۳-هاست-اشتراکی-cpanel-passenger)
    - [۱۰.۴ Docker / docker compose](#۱۰۴-docker--docker-compose)
    - [۱۰.۵ DirectAdmin / Plesk و پنل‌های دیگر](#۱۰۵-directadmin--plesk-و-پنلهای-دیگر)
    - [۱۰.۶ PaaS (لیارا، Railway، Render، Fly.io و …)](#۱۰۶-paas-لیارا-railway-render-flyio-و-)
    - [۱۰.۷ میزبانی جدا: فرانت روی هاست استاتیک، بک‌اند جای دیگر](#۱۰۷-میزبانی-جدا-فرانت-روی-هاست-استاتیک-بکاند-جای-دیگر)
    - [۱۰.۸ بعد از بالا آمدن: وب‌هوک، کرون، QR](#۱۰۸-بعد-از-بالا-آمدن-وبهوک-کرون-qr)
    - [۱۰.۹ به‌روزرسانی یک استقرار موجود](#۱۰۹-بهروزرسانی-یک-استقرار-موجود)
11. [اسکریپت‌ها](#۱۱-اسکریپتها)
12. [تست‌ها](#۱۲-تستها)
13. [نگهداری، پشتیبان‌گیری و رفع اشکال](#۱۳-نگهداری-پشتیبانگیری-و-رفع-اشکال)
14. [مدل امنیتی](#۱۴-مدل-امنیتی)

---

## ۱. LoveOS چیست

LoveOS یک **Progressive Web App است که مثل یک سیستم‌عامل مینیاتوری رفتار می‌کند**. بوت می‌شود،
رمز می‌خواهد، یک دسکتاپ با ویجت و داک نشان می‌دهد و ۳۰ اپ کوچک را در پنجره باز می‌کند — هر کدام
یک راه متفاوت برای گفتنِ «دوستت دارم» از راه دور.

یک سیستم خصوصیِ تک‌کاربره است. دقیقاً یک «کاربر» دارد (دخترم) و یک مدیر (من). هر چیزی که او
می‌بیند — هر پیام، ویس، نامه، سؤال کوییز، جواب ترمینال — را من در پنل مدیریت می‌نویسم؛ هیچ‌چیز
هاردکد نشده.

اصولی که به آن‌ها پایبند ماندم:

| اصل | یعنی در عمل |
|---|---|
| **هیچ‌چیز هاردکد نیست** | همه‌ی محتوا در ادمین جنگو («پنل بابا») است. همه‌ی متن‌های رابط در `frontend/public/locales/{fa,en}/translation.json`. همه‌ی تنظیمات در `backend/.env`. |
| **مخفی از پایه** | اپ روی دامنه‌ای است که هیچ‌جا لیست نشده و با QR به آن می‌رسند. `robots.txt` همه‌چیز را می‌بندد، هر پاسخ هدر `X-Robots-Tag: noindex` دارد، و پنل پشت مسیر مخفی و یک رمز دوم است. |
| **اول موبایل، روی دسکتاپ هم خوب** | برای گوشیِ توی دستش طراحی شده؛ روی صفحه‌ی بزرگ همان اپ‌ها پنجره‌های شناور و قابل جابه‌جایی می‌شوند. |
| **دو زبان** | فارسی (راست‌به‌چپ) پیش‌فرض است؛ انگلیسی یک ضربه فاصله دارد. |
| **آفلاین هم کار می‌کند** | سرویس‌ورکر پوسته، فونت‌ها و آیکن‌ها را کش می‌کند تا با اینترنت بد هم باز شود. |
| **یک منبع حقیقت برای موقعیت** | هر اپی که «او کجاست» را لازم دارد از یک تابع می‌خواند؛ موقعیت زنده‌ی گوشی همیشه بر مقدار پنل غلبه دارد. |
| **ملایم به‌طور پیش‌فرض** | صداها سنتز می‌شوند (بدون فایل دارای کپی‌رایت)، انیمیشن‌ها `prefers-reduced-motion` را رعایت می‌کنند، و اپ سلامت سلب‌مسئولیت پزشکی دارد. |

### مسیر او

```
QR کد  →  دامنه‌ی مخفی
              │
              ▼
        ┌──────────┐   خط‌های بوت تایپ می‌شوند، یک ملودی ملایم، پیام خوش‌آمد من
        │   BOOT   │
        └────┬─────┘
             ▼
        ┌──────────┐   «امروز روزِ N‌ام دوست‌داشتنِ توسط باباست.»
        │   LOCK   │   رمز · سؤال امنیتی · بعد از ۵ اشتباه: «از بابا بپرس»
        └────┬─────┘
             ▼
        ┌──────────┐   ساعت · شمارش تا دیدار بعدی · تماس بعدی · هوای هر دو شهر
        │ DESKTOP  │   ۲۹ آیکن · داک · منوی استارت · Ctrl/⌘+K جستجوی سراسری
        └──────────┘
```

---

## ۲. معماری

### پشته‌ی فناوری

| لایه | فناوری | چرا |
|---|---|---|
| بک‌اند | Python 3.10+، **Django 5.2**، Django REST Framework | همه‌چیز آماده: ORM، پنل ادمین، مهاجرت، نشست. خودِ ادمین سیستم مدیریت محتوای من است. |
| پایگاه‌داده | **SQLite** در توسعه، **MySQL 8 (utf8mb4)** در پروداکشن | محلی بدون نصب؛ MySQL همان چیزی است که هاست‌های اشتراکی می‌دهند. |
| فرانت‌اند | **React 19**، TypeScript، **Vite 8**، Tailwind، Zustand، framer-motion، i18next، MapLibre GL، three.js، Howler | یک SPA سریع با مدیر پنجره‌ی واقعی، انیمیشن، نقشه و آسمان ستاره. |
| PWA | `vite-plugin-pwa` (Workbox) | روی گوشی‌اش نصب می‌شود؛ پوسته آفلاین کار می‌کند. |
| اعلان به من | **API بات سروش‌پلاس** | کانالی که اپ با آن با من حرف می‌زند. |
| زمان‌بند | `manage.py sweep` از cron (هر دقیقه) | نامه‌های زمان‌دار، خاطره‌های آینده، یادآور دارو، یادآور تماس، صف سروش. |

### مسیر درخواست

```
                       ┌────────────────────────────────────────────┐
  گوشی او ──HTTPS──►   │  پراکسی معکوس (Nginx / Passenger / Caddy)  │
                       └───────┬─────────────────────┬──────────────┘
                               │ /api, /panel        │ /, /assets (SPA ساخته‌شده)
                               ▼                     ▼
                        Django + DRF          frontend/dist (استاتیک)
                               │                     ▲
                               ▼                     │ (یا خودِ جنگو وقتی
                          MySQL / SQLite               SERVE_FRONTEND=True است)
                               │
                               ▼
                   SoroushOutbox ──► sweep ──► api.splus.ir ──► گوشی من
```

دو راه برای سرو کردن فرانت‌اند، با یک سوییچ در `.env`:

| `SERVE_FRONTEND` | چه کسی `frontend/dist` را می‌دهد | کجا |
|---|---|---|
| `False` (پیش‌فرض) | Nginx / Caddy / هاست استاتیک | VPS، داکر با پراکسی، میزبانی جدا |
| `True` | خودِ جنگو (`core/spa.py`) | cPanel/Passenger، PaaS تک‌پروسه، هر جا که فقط یک نقطه‌ی ورود هست |

### مدل احراز هویت

* **نشست او** — `POST /api/auth/unlock` با رمز، یک توکن ۳۲ کاراکتری (`DeviceSession`) برمی‌گرداند
  که `SESSION_TTL_HOURS` (پیش‌فرض ۷۲۰ ساعت = ۳۰ روز) زنده می‌ماند. هر مسیر خصوصی
  `Authorization: Token <token>` می‌خواهد و با `@require_session` پوشیده شده.
* **تلاش‌های ناموفق** — هر تلاش ذخیره می‌شود (`UnlockAttempt`)؛ بعد از `MAX_UNLOCK_ATTEMPTS`
  دکمه‌ی «از بابا بپرس» ظاهر می‌شود و بلافاصله پیام سروش می‌گیرم.
* **راه‌های دوم ورود** — سؤال امنیتی (`/api/auth/forgot`) و مسیر کمک (`/api/auth/help`).
* **صندوقچه** — رمز جداگانه با تایمر کوتاه (`VAULT_SESSION_MINUTES`، پیش‌فرض ۲۰ دقیقه).
* **من** — لاگین ادمین جنگو، پشت یک URL مخفی (`ADMIN_PATH`) و یک دروازه‌ی رمز اختیاری
  (`ADMIN_GATE_PASSCODE`، توسط `core.middleware.AdminGateMiddleware`).

### رسانه‌ی خصوصی

فایل‌های آپلودی (ویس، آهنگ، عکس) **هرگز** از یک URL عمومی `/media/` سرو نمی‌شوند. API لینک‌های
امضاشده‌ی کوتاه‌عمر می‌دهد (`/api/media/<path>?sig=…`، در `core/media.py`) و کانفیگ‌های پراکسی
عمداً هیچ alias برای `/media/` ندارند.

### موقعیت مؤثر

`core.services.effective_daughter_location(cfg)` تنها منبع حقیقت برای «او کجاست» است:

1. موقعیت زنده‌ی گوشی، اگر تازه‌تر از `location_ttl_minutes` باشد و ردیابی زنده روشن باشد.
2. وگرنه شهر/مختصات ذخیره‌شده در پنل.

نقشه، هوا، فاصله، اختلاف ساعت و ویجت‌های دسکتاپ همه از همین می‌خوانند. وقتی جابه‌جایی معنادار
تشخیص داده شود (بیش از `location_sync_km` یا تغییر شهر/منطقه‌ی زمانی) مقدار پنل خودکار همگام می‌شود
و من یک پیام سروش می‌گیرم.

### مدیر پنجره

سه قانون که پنجره‌ها را هم روی گوشی و هم روی دسکتاپ درست می‌کند:

1. **هندسه یک بار تعیین می‌شود** — پنجره موقع باز شدن یک جای آبشاری می‌گیرد و با کلیک یا فوکوس
   هرگز جابه‌جا نمی‌شود.
2. **ترتیب لایه‌ها روی wrapper بیرونی است** — `z-index` روی wrapper، نه روی جعبه‌ی انیمیت‌شونده.
3. **پنجره‌ی در حال محو شدن کلیک نمی‌گیرد** — `pointer-events: none` از شروع انیمیشن خروج.

روی گوشی هر اپ یک شیتِ تمام‌قد است؛ روی دسکتاپ پنجره‌ای قابل درگ و تغییر اندازه که جا و اندازه‌اش
را یادش می‌ماند.

---

## ۳. ساختار پروژه

```
LoveOS/
├── backend/                      Django 5 + DRF
│   ├── config/                   settings.py (از .env می‌خواند)، urls.py، wsgi.py
│   ├── core/                     نشست، اعلان، صف سروش، نشان‌ها، تخم‌مرغ‌های شانسی،
│   │                             جستجوی سراسری، رسانه‌ی امضاشده، سرو SPA، دروازه‌ی ادمین،
│   │                             دستورهای مدیریتی (seed_loveos، sweep)
│   ├── accounts/                 UserConfig (تنها پروفایل)، نشست دستگاه، موقعیت زنده، تلاش‌های ورود
│   ├── content/                  ویس، آهنگ، خاطره، نامه، شمارش، باغچه، صورت فلکی، سینما،
│   │                             کوییز، آرزو، حال دل، صندوقچه، آموزش
│   ├── social/                   چت، بغل، اعلان، یادآور، هوا، نقشه، ترمینال
│   ├── health/                   چرخه و مراقبت، دارو، یادآورهای مهربان
│   ├── library/                  کتاب «قصه‌ی ما» (هم‌نویسی)
│   ├── games/                    پازل قلب
│   ├── calls/  gifts/  reading/  dreamhome/  language/     پنج اپ «با هم بودن»
│   ├── media/                    آپلودها (فقط دو عکس اولیه در گیت هستند)
│   ├── templates/admin_gate.html دروازه‌ی رمز پنل
│   ├── requirements.txt
│   └── .env.example              همه‌ی کلیدهای پیکربندی، با توضیح
├── frontend/                     React 19 + Vite 8 + TypeScript + Tailwind
│   ├── src/os/                   Boot، Lock، Desktop، Window، Dock، StartMenu،
│   │                             NotificationCenter، GlobalSearch، EggOverlay، appRegistry
│   ├── src/apps/                 ۳۰ اپ، هر کدام یک فایل
│   ├── src/shared/               api، store، i18n، ui، sound، geo، recorder، prefs، …
│   ├── public/locales/{fa,en}/   همه‌ی متن‌های رابط
│   ├── tests/                    تست‌های رابط بدون مرورگر (jsdom) + run.mjs
│   └── vite.config.ts            پراکسی توسعه + PWA
├── deploy/
│   ├── vps/                      قالب‌های nginx.conf و loveos.service
│   └── docker/                   Dockerfile، docker-compose.yml، Caddyfile، entrypoint.sh
├── scripts/
│   ├── dev.sh                    همه‌چیز برای سیستم خودم (run، setup، test، check، reset، clean)
│   ├── deploy.sh                 همه‌چیز برای سرور (build، vps، cpanel، docker، update، package، backup، verify)
│   └── qr.py                     ساخت QR دامنه‌ی مخفی (بدون وابستگی)
├── docs/soroush-api-reference.md مرجع API بات سروش‌پلاس که با آن کار می‌کنم
├── docs/branding/                نشان: بسته‌ی نهایی + generate-logo.mjs (بند ۳.۱)
├── passenger_wsgi.py             نقطه‌ی ورود cPanel / Passenger
├── DOCUMENTATION.md              نسخه‌ی انگلیسی این سند
├── DOCUMENTATION_FA.md           همین فایل
└── README.md
```

### ۳.۱ نشان

نشان، همان **گردنبندِ نقره‌ی هدیه** است: قلبِ بازی که خطِ پایین‌راستش، همان‌طور که پایین می‌آید،
دو حلقه‌ی ∞ را **روی بدنه‌ی خودش** می‌سازد (دو محلِ چسبیدنِ نزدیک و یک تقاطعِ اریب در کمرِ ∞) و بعد
تا نوکِ پایینِ قلب ادامه می‌دهد. یعنی ∞ جزئی از بدنه‌ی خطِ سمتِ راست است، نه شکلی جدا داخلِ قلب؛ و
هر لُب یک‌بار خط را قطع می‌کند — دقیقاً مثل مرجع.

| کجا | چه چیزی |
|---|---|
| `frontend/public/favicon.svg` و `frontend/public/icons/*` | فاوآیکون، PWA (`app-192`، `app-512`، `maskable-512`)، apple-touch |
| `frontend/index.html` | اسپلشِ روشن‌شدن — همان مسیرها، اول کشیده می‌شوند بعد نبض می‌گیرند، با نگین‌های الماس |
| `frontend/src/shared/loveosMark.ts` | هندسه‌ی تولیدشده (`HEART_PATH`، `INF_PATH`، `MARK_SPARKLES`) |
| `frontend/src/shared/Icon.tsx` → `LoveOSLogo` | همه‌ی کاربردهای داخلِ اپ: اسپلش، صفحه‌ی قفل، «درباره»، دکمه‌ی منو در داک، سرِ منوی اپ‌ها |
| `backend/templates/admin_gate.html` | دروازه‌ی رمزِ پنل بابا — همان نشان به‌صورت inline (و یک فاوآیکونِ data-URI)، بدون درخواستِ اضافه |
| `docs/branding/` | بسته‌ی نهایی، چهار طرحِ اولیه‌ی مرحله‌ی انتخاب، و تولیدکننده |

همه‌ی این‌ها از یک فایل می‌آیند، پس نشان بین اسپلش، فاوآیکون و اپ هیچ‌وقت فرق نمی‌کند:

```bash
node docs/branding/generate-logo.mjs        # فقط SVG
npm i -D @resvg/resvg-js                    # اختیاری، برای آیکن‌های PNG
node docs/branding/generate-logo.mjs
```

تولیدکننده فقط بلوکِ `<svg class="ls-mark">` را در `frontend/index.html` و محتوای بینِ نشانه‌های
`{# LOVEOS-LOGO #}` / `{# LOVEOS-FAVICON #}` در `admin_gate.html` را عوض می‌کند؛ پس CSS و
کی‌فریم‌های اسپلش و بقیه‌ی قالبِ دروازه دست‌نخورده و قابل‌ویرایش دستی می‌مانند. تستِ
`backend/core/tests.py` هم چک می‌کند که دروازه واقعاً نشان را رندر می‌کند. عکسِ مرجع (`Logo-idea.jpg` در ریشه)
**هیچ‌جا** در رابط کاربری استفاده نشده؛ رابط فقط وکتور است.

---

## ۴. محیط توسعه

### پیش‌نیازها

| ابزار | نسخه |
|---|---|
| Python | ۳٫۱۰ یا بالاتر |
| Node.js | ۲۰ یا بالاتر (من ۲۲ دارم) |
| npm | همراه Node |
| git | هر نسخه‌ی جدید |

محلی به هیچ سرور دیتابیسی نیاز نیست — SQLite خودکار استفاده می‌شود.

### راهِ یک‌دستوری

```bash
git clone https://github.com/EmmettSS/LoveOS.git
cd LoveOS
./scripts/dev.sh
```

این دستور `backend/.venv` را می‌سازد، پکیج‌ها را نصب می‌کند، `backend/.env` را با پیش‌فرض‌های
توسعه می‌نویسد، مهاجرت می‌کند، محتوای نمونه می‌ریزد، پکیج‌های npm را نصب می‌کند و هر دو سرور را
بالا می‌آورد:

| چی | کجا |
|---|---|
| اپ دخترم | http://localhost:5173 |
| پنل بابا | http://localhost:8000/daddy-panel-9x7k/ |
| رمز / صندوقچه | `1234` / `0000` |

`Ctrl+C` هر دو را می‌بندد. زیردستورهای دیگر: `setup`، `test`، `test:be`، `test:fe`، `check`،
`reset`، `clean` — بخش [۱۱](#۱۱-اسکریپتها).

### راهِ دستی

```bash
# بک‌اند
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env               # بعد برای کار محلی DEBUG=True کن
.venv/bin/python manage.py migrate
.venv/bin/python manage.py seed_loveos          # --passcode 1234 --vault 0000
.venv/bin/python manage.py createsuperuser      # لاگین پنل من
.venv/bin/python manage.py runserver 0.0.0.0:8000

# فرانت‌اند (ترمینال دوم)
cd frontend
npm install
npm run dev                         # http://localhost:5173
```

سرور توسعه‌ی Vite مسیرهای `/api`، `/static`، `/healthz` و `/daddy-panel-9x7k` را به
`127.0.0.1:8000` پراکسی می‌کند، پس هر دو پروسه لازم‌اند. اگر `ADMIN_PATH` را در `.env` عوض کنم،
در `frontend/vite.config.ts` (بخش `server.proxy`) هم عوضش می‌کنم.

### دستورهای مدیریتی مفید

```bash
.venv/bin/python manage.py seed_loveos        # محتوای نمونه، چندبار اجرا هم بی‌خطر است
.venv/bin/python manage.py sweep              # زمان‌بند را یک بار دستی اجرا کن
.venv/bin/python manage.py makemigrations     # بعد از تغییر مدل‌ها
.venv/bin/python manage.py check --deploy     # آمادگی پروداکشن
.venv/bin/python manage.py shell              # سرک کشیدن به داده‌ها
```

---

## ۵. پیکربندی (`backend/.env`)

همه‌چیز در شروع پروسه از `backend/.env` خوانده می‌شود (`python-dotenv`). **بعد از ویرایش، جنگو را
ری‌استارت کن.** نمونه‌ی کامل `backend/.env.example` است.

### هسته

| کلید | پیش‌فرض | معنی |
|---|---|---|
| `DEBUG` | در کد `True`، در نمونه `False` | در پروداکشن هرگز `True` نباشد. |
| `DJANGO_SECRET_KEY` | کلید dev | تولید: `python -c "from django.core.management.utils import get_random_secret_key as g; print(g())"` |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1,[::1]` | دامنه‌ها با کاما. |
| `CSRF_TRUSTED_ORIGINS` | `https://*.e2b.app` | originهایی که اجازه‌ی POST به پنل دارند، مثل `https://love.example.com`. |
| `TIME_ZONE` | `Asia/Tehran` | منطقه‌ی زمانی سرور. |
| `CORS_ALLOW_ALL` / `CORS_ALLOWED_ORIGINS` | خاموش / خالی | فقط برای میزبانی جدا (۱۰.۷). |

### پنل

| کلید | پیش‌فرض | معنی |
|---|---|---|
| `ADMIN_PATH` | `daddy-panel-9x7k` | مسیر مخفی پنل — در پروداکشن عوضش کن. بدون اسلش. |
| `ADMIN_GATE_PASSCODE` | خالی (خاموش) | رمز اضافه که قبل از صفحه‌ی لاگین جنگو پرسیده می‌شود. |

### پایگاه‌داده

| کلید | معنی |
|---|---|
| `DB_ENGINE` | `sqlite` یا `mysql` |
| `DB_NAME` | نام فایل SQLite، یا نام دیتابیس MySQL |
| `DB_USER`، `DB_PASSWORD`، `DB_HOST`، `DB_PORT` | فقط MySQL |

اتصال MySQL روی `utf8mb4` اجبار می‌شود — اما **خودِ دیتابیس هم باید با `utf8mb4_unicode_ci` ساخته
شده باشد** وگرنه متن فارسی و ایموجی `????` می‌شوند.

### سروش (اعلان به من)

| کلید | معنی |
|---|---|
| `NOTIFY_PROVIDER` | `console` (فقط لاگ، توسعه) · `soroush` (واقعی) · `null` (خاموش) |
| `SOROUSH_API_BASE` | `https://api.splus.ir` |
| `SOROUSH_TOKEN` | توکن بات |
| `SOROUSH_DADDY_CHAT_ID` | chat id من |
| `SOROUSH_WEBHOOK_SECRET` | رشته‌ی تصادفی که بخشی از URL وب‌هوک می‌شود |
| `SOROUSH_PARSE_MODE` | `HTML` |
| `SOROUSH_TIMEOUT` | تایم‌اوت هر درخواست به ثانیه (پیش‌فرض ۸) |
| `NOTIFY_ASYNC` | ارسال در نخ پس‌زمینه تا هیچ درخواست API منتظر نماند (پیش‌فرض true) |
| `OUTBOX_MAX_RETRY` | تعداد تلاش مجدد هر پیام صف (پیش‌فرض ۵) |

### نشست‌ها و محدودیت‌ها

| کلید | پیش‌فرض | معنی |
|---|---|---|
| `SESSION_TTL_HOURS` | `720` | عمر لاگین او |
| `VAULT_SESSION_MINUTES` | `20` | مدت باز ماندن صندوقچه |
| `MAX_UNLOCK_ATTEMPTS` | `5` | تلاش اشتباه تا «از بابا بپرس» |
| `API_RATE_LIMIT` | `300/min` | محدودیت نرخ DRF |

### سرو کردن

| کلید | پیش‌فرض | معنی |
|---|---|---|
| `SERVE_FRONTEND` | `False` | `True` = خودِ جنگو `frontend/dist` و `/static/` را سرو می‌کند |
| `FRONTEND_DIST` | `../frontend/dist` | مسیر مطلق فرانت ساخته‌شده اگر جای دیگری است |
| `SECURE_SSL_REDIRECT` | `True` وقتی `DEBUG=False` | فقط پشت پراکسی‌ای که خودش به HTTPS ریدایرکت می‌کند `False` کن |

---

## ۶. اپ‌ها

۳۰ اپ؛ ۲۹ تا آیکن روی دسکتاپ دارند («درباره» از منوی استارت باز می‌شود). او می‌تواند آیکن‌ها را با
درگ‌اند‌دراپ مرتب کند.

### هسته‌ی احساسی

| اپ | چه می‌کند |
|---|---|
| **نقشه‌ی ما** | دو پین (خانه‌ی من، جای او) با فاصله، اختلاف ساعت، دکمه‌ی «پرواز روی مسیر» و نشان موقعیت زنده. |
| **صندوق صدا** | آرشیو دسته‌بندی‌شده‌ی ویس‌های من، به‌علاوه دکمه‌ی «یک صدای تصادفی». |
| **موسیقی ما** | آهنگ‌ها با «چرا این آهنگ» و متن؛ وقتی اجازه بدهم او هم آپلود می‌کند. |
| **خاطره‌ها** | خاطرات مشترک؛ بعضی تا تاریخی مشخص قفل می‌مانند (خاطره‌های آینده). |
| **نامه‌های نجوا** | نامه‌ها با خط نستعلیق؛ بعضی فقط در یک تاریخ باز می‌شوند. |
| **شمارش معکوس** | تا دیدار بعدی، تولدش، سالگردمان. |
| **آب‌وهوا** | هر دو شهر کنار هم با یک جمله‌ی عاشقانه بر اساس اختلاف دما. |
| **ضربان قلب** | «قلبم برای تو می‌زند» — یک نبض سنتزشده با هر لمس. |
| **باغچه‌ی ما** | گل‌ها را آب بده؛ هر آبیاری یک شکوفه باز می‌کند. |
| **آسمان ستاره‌ها** | اسمش با صورت‌های فلکی (حروف در یک خط، ❤ و ♾ در خط دوم و بزرگ‌تر) روی یک آسمان سینماییِ canvas: چشمک ستاره‌ها، شهاب، راه شیری، هلال ماه، پارالاکس موس. روی گوشی «سینمای تمام‌صفحه» می‌شود: آسمان ۹۰ درجه می‌چرخد تا گوشی را افقی بگیرد (اگر مرورگر خودش افقی باشد نمی‌چرخد) و با ✕ شناور بسته می‌شود. |
| **چت با بابا** | پیام مستقیم، کوتاه و مهربان. |
| **حال دلم** | حال امروز را ثبت کند و پیامی متناسب از من بگیرد. |
| **کوییز ما** | کوییزهایی که درباره‌ی خاطراتمان می‌نویسم، با جایزه. |
| **آرزوهای ما** | لیست آرزوهای مشترک با دسته‌بندی و تیک «انجام شد». |
| **سینمای ما** | لیست تماشا با «دیده‌ایم / می‌خواهیم ببینیم». |
| **صندوقچه** | گنج‌های خصوصی پشت یک رمز جدا. |
| **بغل** | بغل‌های فوری، رفت و برگشتی؛ هر بغل در سروش به من خبر می‌دهد. |

### مراقبت و روزمره

| اپ | چه می‌کند |
|---|---|
| **چرخه و مراقبت** | ثبت پریود، علائم و دارو با لحن ملایم و مرزهای پزشکی روشن. |
| **کتابخونه‌ی ما** | «قصه‌ی ما» که با هم فصل‌به‌فصل می‌نویسیم، با نظر روی هر پاراگراف؛ خروجی PDF. |
| **پازل قلب** | پازل تصویری آسان/متوسط/سخت با جمله‌ی پایانی دلخواه. |
| **تنظیمات** | زبان، تم (خودکار/روز/شب)، صدا، اندازه‌ی فونت، موقعیت زنده، راهنمای نصب PWA. |
| **آموزش** | درس‌های «سیستم‌عامل چیست»، که من در پنل می‌نویسم. |
| **ترمینال** | `help`، `love`، `whoami`، `sudo make sandwich` … با جواب‌های بامزه‌ای که من تعریف می‌کنم. |
| **نشان‌ها** | ۳۲ دستاورد که با فعالیت واقعی باز می‌شوند. |
| **درباره‌ی LoveOS** | داستان پروژه و حرف آخر من. |

### با هم بودن

| اپ | چه می‌کند |
|---|---|
| **هماهنگ‌کننده‌ی تماس** | هر دو پنجره‌های خالی هفتگی‌مان را ثبت می‌کنیم؛ سیستم هم‌پوشانی را پیدا می‌کند. پیشنهاد، تأیید، رد یا جابه‌جایی تماس، بعد ثبت هر تماس با مدت، حال و یادداشت. |
| **دفتر هدیه‌ها** | هر هدیه: مناسبت، بازه‌ی قیمت، عکس و «واکنش آن لحظه»، به‌علاوه آمار سالانه. |
| **کتاب‌خوانی مشترک** | یک قفسه‌ی مشترک. برای هر فصل: یادداشت با ستاره، نقل‌قول و رشته‌ی گفتگو. پیشرفت هر دو جدا. |
| **خونه‌ی رویایی** | چک‌لیست با درجه‌ی اهمیت، چیدمان اتاق‌ها با درگ، گالری الهام با نظر. |
| **پل زبان** | لغت‌نامه‌ی چهارزبانه‌مان (مازندرانی، ترکی، فارسی، انگلیسی)، فلش‌کارت با زنجیره‌ی روزانه، ضبط تلفظ، کوییز از پنل من. |

### قطعات سیستم

| بخش | چه می‌کند |
|---|---|
| **جستجوی سراسری** (`Ctrl/⌘+K`) | ۲۱ منبع را با تطبیق فارسی‌فهم می‌گردد (`ي/ك`، اعراب، نیم‌فاصله نرمال می‌شوند؛ تطبیق فازی)، فیلتر اپ/تاریخ/نوع، کش ۴۵ ثانیه. |
| **مرکز اعلان** | همه‌ی اعلان‌های داخل اپ برای او، با نشان خوانده‌نشده. |
| **تخم‌مرغ‌های شانسی** | ۱۵ راز (آسمان نیمه‌شب، کد کونامی، `rm -rf tanhayi`، پنج کلیک روی لوگو، …). |
| **مرز خطا** | اگر یک اپ بشکند، فقط همان پنجره یک «دوباره امتحان کن» ملایم نشان می‌دهد. |

---

## ۷. پنل بابا

```
https://<domain>/<ADMIN_PATH>/
```

ادمین استاندارد جنگو، فارسی، با تاریخ جلالی. اگر `ADMIN_GATE_PASSCODE` ست شده باشد اول یک صفحه‌ی
رمز ساده می‌بینم، بعد لاگین معمولی.

| بخش | آن‌جا چه عوض می‌کنم |
|---|---|
| **UserConfig** | اسم‌ها و لقب‌ها، پیام‌های بوت/قفل، سؤال امنیتی، تم و زبان پیش‌فرض، اندازه‌ی فونت، پس‌زمینه‌ها، تولد و سالگرد، دو شهر و مختصات، تنظیمات موقعیت زنده، تنظیمات جستجو، پیام امروز دسکتاپ. |
| **LiveLocation** | آخرین موقعیت زنده‌اش، دقت، سن — برای اصلاح دستی. |
| **Content** | ویس، آهنگ، خاطره، نامه، شمارش، باغچه، صورت فلکی، سینما، کوییز، آرزو، حال دل، صندوقچه، آموزش، دستورهای ترمینال. |
| **Social** | چت، بغل، یادآورها، اعلان‌ها. |
| **Health** | داروها، یادآورهای مراقبتی، پیام‌های حال دل. |
| **Library / Games** | کتاب‌ها، فصل‌ها، پاراگراف‌ها، پازل‌ها. |
| **Calls / Gifts / Reading / Dream Home / Language** | هر چیزی که پنج اپ «با هم» نشان می‌دهند. |
| **نشان‌ها و رازها** | ۳۲ نشان با آستانه و پیام مخفی، ۱۵ تخم‌مرغ شانسی. |
| **SoroushOutbox** | هر پیام به من با وضعیت، تعداد تلاش، خطا و اکشن «دوباره بفرست». |
| **ActivityLog** | هر چه اتفاق افتاده، قابل فیلتر، به‌علاوه «پاک کردن کش اپ». |

دستورالعمل‌های روزمره:

| می‌خواهم… | این کار را می‌کنم |
|---|---|
| یک ویس اضافه کنم | Content → Voices → Add → فایل + دسته + عنوان |
| خاطره‌ای را تا تاریخی قفل کنم | Memories → «خاطره‌ی آینده» + زمان باز شدن؛ `sweep` بازش می‌کند |
| دارو یادآوری کنم | Health → Medication → زمان‌ها؛ `sweep` می‌فرستد |
| پیام امروز دسکتاپ را عوض کنم | UserConfig → پیام امروز |
| ببینم امروز چه کرده | ActivityLog، فیلتر بر اساس اپ |

---

## ۸. اتصال به بات سروش

سروش‌پلاس تنها کانال از اپ **به من** است. هرگز چیزی از این راه به او push نمی‌شود؛ اعلان‌های او
داخل خودِ اپ‌اند.

```ini
NOTIFY_PROVIDER=soroush
SOROUSH_TOKEN=<توکن بات>
SOROUSH_DADDY_CHAT_ID=<chat id من>
SOROUSH_WEBHOOK_SECRET=<رشته‌ی تصادفی>
```

* هر پیام اول در `SoroushOutbox` نوشته می‌شود و **بعد** ارسال (`core/soroush.py`)، پس توکن خراب
  هیچ‌چیز را گم نمی‌کند؛ `sweep` صف را دوباره تلاش می‌کند.
* وب‌هوک ورودی: `POST /api/soroush/webhook/<SOROUSH_WEBHOOK_SECRET>/` — یک بار بعد از بالا آمدن
  ثبتش کن (۱۰.۸).
* رویدادهایی که می‌گیرم: ورود، کمک قفل، چت، بغل، پخش ویس، آپلود آهنگ، باز شدن نامه، باز شدن
  خاطره، حال دل، تخم‌مرغ شانسی، کوییز کامل، پازل، نشان، مصرف/رد دارو، علائم، شروع/پایان پریود،
  یادآورها، کتاب/فصل/نظر، سینما، آرزوها، همه‌ی رویدادهای تماس، هدیه‌ها، یادداشت/نقل‌قول/نظر
  کتاب‌خوانی، تغییرات خونه‌ی رویایی، ورودی/کوییز زبان، تغییر موقعیت.

مرجع API بات که با آن کار می‌کنم در [`docs/soroush-api-reference.md`](./docs/soroush-api-reference.md) است.

---

## ۹. مرجع API

همه‌ی مسیرهای خصوصی `Authorization: Token <token>` می‌خواهند؛ پاسخ‌ها JSON هستند.

### پوسته و احراز هویت

| متد | مسیر | کار |
|---|---|---|
| GET | `/api/boot` | تنظیمات عمومی بوت/قفل (بدون راز) |
| POST | `/api/auth/unlock` | `{passcode}` → `{token, …}` |
| POST | `/api/auth/forgot` | جواب سؤال امنیتی |
| POST | `/api/auth/help` | «از بابا بپرس» → پیام فوری سروش |
| POST | `/api/auth/logout` | پایان نشست |
| GET | `/api/me` | پروفایل کامل بعد از باز شدن قفل |
| GET/POST/PATCH | `/api/settings` | زبان، تم، صدا، اندازه‌ی فونت |
| GET/POST | `/api/location` | موقعیت مؤثر / گزارش موقعیت تازه‌ی دستگاه |
| GET | `/api/search` | `q`، `app`، `kind`، `from`، `to`، `suggest` |
| POST | `/api/vault/unlock` | باز کردن صندوقچه |
| GET | `/healthz` | زنده بودن (`ok` برمی‌گرداند) |

### محتوا
`/api/voices` (`/random`، `/<id>/played`) · `/api/songs` (`/upload`، `/<id>`، `/<id>/played`) ·
`/api/memories` (`/<id>`) · `/api/letters` (`/random`، `/<id>/open`) · `/api/countdowns` (`/<id>`) ·
`/api/garden` (`/reset`، `/<id>/water`) · `/api/starmap` · `/api/cinema` (`/<id>`) · `/api/quiz`
(`/submit`) · `/api/plans` (`/<id>`) · `/api/moods` (`/set`) · `/api/vault` · `/api/tutorial`

### اجتماعی
`/api/chat` · `/api/hug` (`/send`، `/<id>/open`) · `/api/notifications` (`/read-all`، `/<id>/read`) ·
`/api/reminders` (`/<id>/mute`) · `/api/terminal` (`/sudo`) · `/api/egg` · `/api/achievements` ·
`/api/weather` · `/api/map`

### سلامت
`/api/cycle` (`/start`، `/end`، `/symptoms`) · `/api/meds` (`/today`، `/act`، `/report`) ·
`/api/care` (`/<id>/toggle`)

### کتابخانه و بازی
`/api/books` (`/<id>`، `/<id>/chapters`) · `/api/chapters/<id>/publish` ·
`/api/pages/<id>/paragraphs` · `/api/pages/<id>/bookmark` · `/api/paragraphs/<id>` (`/notes`) ·
`/api/puzzles` (`/upload`، `/<id>/start`، `/<id>/complete`، `/<id>`)

### تماس `/api/calls`
`overview` · `slots` (`/<id>`) · `appointments` (`/<id>/respond`، `/<id>/cancel`) · `logs` (`/<id>`) ·
`stats` · `next`

### هدیه‌ها `/api/gifts`
`GET/POST /` · `GET/PATCH/DELETE /<id>` · `occasions` · `stats` — فیلترها `giver`، `receiver`،
`occasion`، `year`، `band`، `q`

### کتاب‌خوانی مشترک `/api/reading`
`overview` · `books` (`/<id>`، `/<id>/chapters`، `/<id>/progress`) · `chapters/<id>/notes|quotes|comments` ·
`quotes` · `stats`

### خونه‌ی رویایی `/api/home`
`overview` · `features` (`/<id>`) · `rooms` (`/<id>`، `/<id>/ideas`) · `inspirations` (`/<id>`،
`/<id>/comments`) · `categories` · `stats` — مختصات اتاق درصد است و سمت سرور محدود می‌شود

### پل زبان `/api/language`
`overview` · `entries` (`/<id>`) · `categories` · `flashcards` · `practice` · `quiz` (`/submit`) · `stats`

### خارج از `/api`
| مسیر | کار |
|---|---|
| `/` | خودِ SPA (از پراکسی یا `SERVE_FRONTEND`) |
| `/<ADMIN_PATH>/` | پنل بابا |
| `/api/media/<path>?sig=…` | فایل‌های خصوصی امضاشده‌ی کوتاه‌عمر |
| `/api/soroush/webhook/<secret>/` | آپدیت‌های ورودی سروش |
| `/robots.txt` | `Disallow: /` |

---

## ۱۰. استقرار (دیپلوی)

### ۱۰.۱ قبل از هر استقراری

این قدم‌ها برای همه‌ی هاست‌ها یکی‌اند. اول این‌ها را انجام بده.

**۱. تصمیم بگیر چه کسی فرانت‌اند را سرو می‌کند** (جدول بخش ۲). قاعده‌ی سرانگشتی:

* Nginx/Caddy دست خودم است → `SERVE_FRONTEND=False`، پراکسی `frontend/dist` را می‌دهد.
* فقط یک پروسه‌ی پایتون دارم (cPanel، PaaS) → `SERVE_FRONTEND=True`.

**۲. فرانت‌اند را build کن.** روی هر سیستمی با Node 20+:

```bash
cd frontend && npm ci && npm run build      # → frontend/dist/
```

`./scripts/deploy.sh build` همین کار را می‌کند و `collectstatic` هم می‌زند.

**۳. `backend/.env` پروداکشن را بنویس.** از `.env.example` شروع کن و حداقل این‌ها را عوض کن:

```ini
DEBUG=False
DJANGO_SECRET_KEY=<۵۰+ کاراکتر تصادفی>
ALLOWED_HOSTS=love.example.com
CSRF_TRUSTED_ORIGINS=https://love.example.com
ADMIN_PATH=<چیزی که کسی حدس نزند>
ADMIN_GATE_PASSCODE=<یک رمز قوی>
DB_ENGINE=mysql            # یا sqlite برای یک VPS خیلی کوچک
DB_NAME=… DB_USER=… DB_PASSWORD=… DB_HOST=127.0.0.1 DB_PORT=3306
NOTIFY_PROVIDER=soroush
SOROUSH_TOKEN=… SOROUSH_DADDY_CHAT_ID=… SOROUSH_WEBHOOK_SECRET=<تصادفی>
SERVE_FRONTEND=False       # روی cPanel / هاست تک‌پروسه True
```

`scripts/deploy.sh` با کلید placeholder یا `ALLOWED_HOSTS` خالی اجرا نمی‌شود.

**۴. MySQL باید utf8mb4 باشد.** دیتابیس را این‌طور بساز (یا collation را در phpMyAdmin →
Operations تنظیم کن):

```sql
CREATE DATABASE loveos CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'loveos'@'localhost' IDENTIFIED BY '<password>';
GRANT ALL PRIVILEGES ON loveos.* TO 'loveos'@'localhost';
```

**۵. HTTPS اجباری است**، نه اختیاری: با `DEBUG=False` جنگو به HTTPS ریدایرکت می‌کند، سرویس‌ورکر
فقط روی HTTPS ثبت می‌شود، و سروش فقط وب‌هوک HTTPS قبول می‌کند.

**۶. پروژه را هرگز داخل ریشه‌ی عمومی وب نگذار** (`public_html`، `/var/www/html`). فایل `.env` با
همه‌ی رازها کنار کد است.

**چک‌لیست پروداکشن**

- [ ] `DEBUG=False`، `DJANGO_SECRET_KEY` واقعی، `ALLOWED_HOSTS` / `CSRF_TRUSTED_ORIGINS` درست
- [ ] `ADMIN_PATH` عوض شده و `ADMIN_GATE_PASSCODE` ست شده
- [ ] دیتابیس MySQL با `utf8mb4_unicode_ci` ساخته شده
- [ ] `frontend/dist` ساخته شده
- [ ] `migrate`، `collectstatic`، `createsuperuser`، `seed_loveos --passcode … --vault …`
- [ ] گواهی HTTPS
- [ ] کرون `manage.py sweep` هر دقیقه
- [ ] وب‌هوک سروش ثبت شده
- [ ] `./scripts/deploy.sh verify` سبز است
- [ ] پشتیبان‌گیری زمان‌بندی شده (`./scripts/deploy.sh backup`)

---

### ۱۰.۲ سرور مجازی (VPS) — اوبونتو/دبیان با Nginx و Gunicorn

پیشنهاد من: یک VPS کوچک (۱ هسته / ۱ گیگ کافی است)، اوبونتو ۲۲.۰۴/۲۴.۰۴ یا دبیان ۱۲.

**قدم ۱ — پکیج‌های سیستم**

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-dev build-essential pkg-config \
                    default-libmysqlclient-dev mysql-server nginx git curl \
                    certbot python3-certbot-nginx
# Node 22 (فقط برای build فرانت روی سرور لازم است)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
```

**قدم ۲ — MySQL**

```bash
sudo mysql_secure_installation
sudo mysql -e "CREATE DATABASE loveos CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'loveos'@'localhost' IDENTIFIED BY 'STRONG-PASSWORD';
GRANT ALL PRIVILEGES ON loveos.* TO 'loveos'@'localhost'; FLUSH PRIVILEGES;"
```

**قدم ۳ — کد و پیکربندی**

```bash
sudo mkdir -p /srv/loveos && sudo chown $USER /srv/loveos
git clone https://github.com/EmmettSS/LoveOS.git /srv/loveos
cd /srv/loveos
cp backend/.env.example backend/.env
nano backend/.env            # همه‌چیز از ۱۰.۱ را پر کن (SERVE_FRONTEND=False)
```

خط `mysqlclient` را در `backend/requirements.txt` از کامنت درآور، یا بگذار اسکریپت دیپلوی نصبش کند.

**قدم ۴ — DNS.** رکورد `A` دامنه را به IP سرور بزن و صبر کن تا `dig +short love.example.com`
همان را برگرداند (certbot به این نیاز دارد).

**قدم ۵ — اسکریپت دیپلوی را اجرا کن**

```bash
sudo DOMAIN=love.example.com ./scripts/deploy.sh vps
```

به ترتیب چه می‌کند:

1. `npm ci && npm run build` (اگر `dist/` را آپلود کرده‌ای با `SKIP_FRONTEND=1` رد کن).
2. `backend/.venv` را می‌سازد، پکیج‌ها + `gunicorn` + `mysqlclient` را نصب می‌کند.
3. `migrate`، `collectstatic`، `check --deploy`.
4. قالب `deploy/vps/loveos.service` → `/etc/systemd/system/loveos.service`
   (Gunicorn روی `127.0.0.1:8001`، ۳ ورکر، `backend/.env` را می‌خواند).
5. قالب `deploy/vps/nginx.conf` → `/etc/nginx/sites-available/loveos` و فعالش می‌کند:
   `frontend/dist` به‌عنوان root با fallback برای SPA، مسیرهای `/api/`، `/<ADMIN_PATH>/`، `/healthz`،
   `/robots.txt` به Gunicorn، `/static/` با alias، `sw.js` بدون کش، **بدون alias برای `/media/`**.
6. خط کرون `* * * * * … manage.py sweep` را برای کاربر سرویس نصب می‌کند.
7. با certbot گواهی Let's Encrypt می‌گیرد (`SKIP_CERTBOT=1` برای رد کردن).
8. `chown` به `www-data`، `chmod 600 backend/.env`، `nginx -t`، فعال‌سازی و استارت همه‌چیز.

**قدم ۶ — اولین کاربر ادمین و محتوا**

```bash
cd /srv/loveos/backend
sudo -u www-data .venv/bin/python manage.py createsuperuser
sudo -u www-data .venv/bin/python manage.py seed_loveos --passcode 2468 --vault 1357
```

**قدم ۷ — بررسی**

```bash
./scripts/deploy.sh verify         # /healthz، /api/boot، /، /robots.txt، پنل، 401 روی /api/me
journalctl -u loveos -f            # لاگ Gunicorn
tail -f /srv/loveos/logs/sweep.log # زمان‌بند
```

بعد برو سراغ ۱۰.۸ (وب‌هوک، QR).

**معادل دستی** (اگر روزی بدون اسکریپت لازم شد): دو قالب در `deploy/vps/` جای‌نگهدارهای
`__APP_DIR__`، `__DOMAIN__`، `__PORT__`، `__USER__`، `__WORKERS__`، `__ADMIN_PATH__` دارند —
با `sed` جایگزین و سر جایشان کپی کن.

**فایروال**: `sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable`.

---

### ۱۰.۳ هاست اشتراکی cPanel (Passenger)

روی cPanel هیچ Nginx‌ای دست من نیست؛ همه‌ی درخواست‌ها از Phusion Passenger به **یک** اپ WSGI
(`passenger_wsgi.py`) می‌رسند. پس جنگو فرانت‌اند را هم سرو می‌کند: `SERVE_FRONTEND=True`.
هاست‌های اشتراکی معمولاً Node ندارند، پس فرانت روی سیستم خودم build و آپلود می‌شود.

**قدم ۱ — build و بسته‌بندی روی سیستم خودم**

```bash
./scripts/deploy.sh package        # → loveos-release.tar.gz
```

آرشیو شامل `backend/` (بدون `.venv`، `.env`، sqlite، staticfiles، آپلودها)، `frontend/dist/`،
`passenger_wsgi.py`، `scripts/` و `deploy/` است.

**قدم ۲ — دیتابیس.** cPanel → **MySQL® Databases**: دیتابیس `USER_loveos`، کاربر `USER_loveos`،
کاربر را با ALL PRIVILEGES اضافه کن. بعد phpMyAdmin → دیتابیس → **Operations** → Collation
`utf8mb4_unicode_ci` → Go.

**قدم ۳ — آپلود.** File Manager → پوشه‌ی `/home/USER/loveos/` بساز (**بیرون** `public_html`)،
`loveos-release.tar.gz` را آن‌جا آپلود و extract کن.

**قدم ۴ — اپ پایتون.** cPanel → **Setup Python App** → Create Application:

| فیلد | مقدار |
|---|---|
| Python version | ۳٫۱۰ یا بالاتر |
| Application root | `loveos` |
| Application URL | دامنه / ساب‌دامنه |
| Application startup file | `passenger_wsgi.py` |
| Application Entry point | `application` |

بعد از ساخت، cPanel خطی مثل
`source /home/USER/virtualenv/loveos/3.10/bin/activate && cd /home/USER/loveos` نشان می‌دهد —
**هر دستور ترمینال پایین با همین خط شروع می‌شود.**

**قدم ۵ — `.env`.** فایل `/home/USER/loveos/backend/.env` را با مقادیر پروداکشن ۱۰.۱ بساز به‌علاوه:

```ini
SERVE_FRONTEND=True
FRONTEND_DIST=/home/USER/loveos/frontend/dist
DB_ENGINE=mysql
DB_NAME=USER_loveos
DB_USER=USER_loveos
DB_HOST=localhost
```

**قدم ۶ — نصب و مهاجرت** (cPanel → Terminal، یا SSH):

```bash
source /home/USER/virtualenv/loveos/3.10/bin/activate && cd /home/USER/loveos
SKIP_FRONTEND=1 ./scripts/deploy.sh cpanel
python backend/manage.py createsuperuser
python backend/manage.py seed_loveos --passcode 2468 --vault 1357
```

هدف `cpanel` پکیج‌ها و درایور MySQL را نصب می‌کند (اگر `mysqlclient` کامپایل نشد به `pymysql`
برمی‌گردد — در آن صورت این دو خط را به `backend/config/__init__.py` اضافه کن:
`import pymysql` / `pymysql.install_as_MySQLdb()`)، `migrate` + `collectstatic` می‌زند، و
`tmp/restart.txt` را touch می‌کند.

**قدم ۷ — ری‌استارت.** Setup Python App → **Restart**. Passenger تغییرات `.env` یا کد را خودش
نمی‌بیند؛ بعد از هر تغییر ری‌استارت کن (`touch /home/USER/loveos/tmp/restart.txt` همین کار را می‌کند).

**قدم ۸ — SSL.** cPanel → **SSL/TLS Status** → Run AutoSSL برای دامنه.

**قدم ۹ — کرون.** cPanel → **Cron Jobs**، هر دقیقه، با مسیر کامل:

```
* * * * * /home/USER/virtualenv/loveos/3.10/bin/python /home/USER/loveos/backend/manage.py sweep >> /home/USER/loveos/logs/sweep.log 2>&1
```

(اول `/home/USER/loveos/logs/` را بساز).

**قدم ۱۰** — ۱۰.۸ (وب‌هوک، QR) و `BASE_URL=https://domain ./scripts/deploy.sh verify`.

**هاست بدون ترمینال**: پکیج‌ها را روی سیستمی با همان نسخه‌ی پایتون و معماری نصب کن،
`site-packages` را داخل virtualenv سی‌پنل آپلود کن، و `migrate` را از طریق یک view موقت جنگو اجرا
کن — یا صادقانه، هاستی با SSH بگیر.

---

### ۱۰.۴ Docker / docker compose

`deploy/docker/` یک `Dockerfile` دو مرحله‌ای دارد (Node فرانت را build می‌کند، پایتون Gunicorn را
با `SERVE_FRONTEND=True` اجرا می‌کند)، یک `docker-compose.yml` با **web + MySQL 8 + Caddy**
(HTTPS خودکار)، و یک `entrypoint.sh` که منتظر MySQL می‌ماند، مهاجرت می‌کند، استاتیک جمع می‌کند،
حلقه‌ی `sweep` را اجرا می‌کند و Gunicorn را بالا می‌آورد.

```bash
cp backend/.env.example backend/.env       # مقادیر پروداکشن، DB_ENGINE=mysql، DB_HOST=db
echo "CADDY_DOMAIN=love.example.com" > deploy/docker/.env
./scripts/deploy.sh docker                  # docker compose build && up -d && migrate
docker compose -f deploy/docker/docker-compose.yml exec web python manage.py createsuperuser
```

نکته‌ها:

* روی کانتینر `SECURE_SSL_REDIRECT=False` ست شده چون Caddy خودش TLS را تمام و HTTP→HTTPS را
  ریدایرکت می‌کند.
* آپلودها در volume به نام `media` هستند؛ پشتیبان:
  `docker run --rm -v docker_media:/m -v $PWD:/b alpine tar czf /b/media.tar.gz /m`.
* اگر از قبل پراکسی معکوس داری، سرویس `caddy` را حذف کن و پراکسی را به `127.0.0.1:8000` بزن.
* پورت‌های ۸۰/۴۴۳ روی هاست باید آزاد باشند.

---

### ۱۰.۵ DirectAdmin / Plesk و پنل‌های دیگر

هر دو پنل اپ‌های پایتون را مثل cPanel با Passenger اجرا می‌کنند، پس **بخش ۱۰.۳ عیناً صدق می‌کند**
با این تفاوت‌ها:

| | DirectAdmin | Plesk |
|---|---|---|
| کجا | *Setup Python App* (CloudLinux) یا *Python Selector* | *Websites & Domains → Python* |
| فایل شروع / نقطه‌ی ورود | `passenger_wsgi.py` / `application` | Application startup file برابر `passenger_wsgi.py`، entry برابر `application` |
| ریشه‌ی اپ | بیرون `public_html`، مثل `/home/USER/loveos` | بیرون `httpdocs`، مثل `/var/www/vhosts/DOMAIN/loveos` |
| کرون | *Cron Jobs* در پنل | *Scheduled Tasks* |
| SSL | *SSL Certificates* → Let's Encrypt | *SSL/TLS Certificates* → Let's Encrypt |

Plesk یک جعبه‌ی «Additional nginx directives» هم دارد: اگر بلوک‌های `location` از
`deploy/vps/nginx.conf` را آن‌جا بچسبانم می‌توانم `SERVE_FRONTEND=False` بگذارم و nginx خودش
`dist/` را بدهد؛ روی هاست اشتراکی ساده `SERVE_FRONTEND=True` می‌ماند.

---

### ۱۰.۶ PaaS (لیارا، Railway، Render، Fly.io و …)

یک PaaS یک پروسه و یک دیتابیس مدیریت‌شده می‌دهد؛ جنگو همه‌چیز را سرو می‌کند.

* **Build**: `cd frontend && npm ci && npm run build && cd ../backend && pip install -r requirements.txt gunicorn mysqlclient && python manage.py collectstatic --noinput`
  (یا فقط پلتفرم را به `deploy/docker/Dockerfile` اشاره بده، که اکثرشان قبول می‌کنند).
* **Start**: `cd backend && python manage.py migrate --noinput && gunicorn config.wsgi:application --bind 0.0.0.0:$PORT --workers 2`
* **محیط**: همه‌ی کلیدهای ۱۰.۱ به‌عنوان env var پلتفرم، به‌علاوه `SERVE_FRONTEND=True`،
  `FRONTEND_DIST=/app/frontend/dist` (با مسیر پلتفرم تنظیم کن) و `SECURE_SSL_REDIRECT=False`
  (لبه‌ی پلتفرم خودش HTTPS می‌کند).
* **دیتابیس**: MySQL مدیریت‌شده با utf8mb4 (یا PostgreSQL بعد از اضافه کردن `psycopg` — چیزی که من
  تحویل نمی‌دهم؛ مسیرهای تست‌شده MySQL/SQLite هستند).
* **رسانه**: فایل‌سیستم PaaS موقتی است. یک دیسک دائمی روی `backend/media` mount کن (Fly volumes،
  Railway volumes، دیسک لیارا) — وگرنه هر دیپلوی ویس‌هایش را پاک می‌کند.
* **زمان‌بند**: یک سرویس cron/worker که هر دقیقه `python manage.py sweep` بزند — یا کانتینر
  `deploy/docker` را اجرا کن که entrypointش خودش `sweep` را حلقه می‌کند.

---

### ۱۰.۷ میزبانی جدا: فرانت روی هاست استاتیک، بک‌اند جای دیگر

فرانت روی Netlify/Vercel/Cloudflare Pages/GitHub Pages و بک‌اند روی VPS یا cPanel.

1. **بک‌اند** طبق ۱۰.۲/۱۰.۳ با `SERVE_FRONTEND=False` و:
   ```ini
   CORS_ALLOWED_ORIGINS=https://app.example.com
   CSRF_TRUSTED_ORIGINS=https://app.example.com,https://api.example.com
   ```
2. **فرانت**: اپ URLهای نسبی `/api/...` صدا می‌زند. یا هاست استاتیک `/api/*` و `/<ADMIN_PATH>/*`
   را به بک‌اند پراکسی کند (Netlify `_redirects`:
   `/api/*  https://api.example.com/api/:splat  200`)، یا rewrite معادل روی هاست تنظیم کنی.
   پراکسی راه ساده‌تر و امن‌تر برای کوکی‌هاست.
3. **SPA fallback**: هر مسیر ناشناخته باید `index.html` بدهد
   (Netlify: `/*  /index.html  200`؛ Vercel: `rewrites` در `vercel.json`).
4. `sw.js` و `index.html` باید با `Cache-Control: no-cache` سرو شوند.

من فقط به دلیل رسانه‌ی خصوصی هم این را توصیه نمی‌کنم: دو origin یعنی دو جا برای درست کردن
هدرهای امنیتی. یک origin ساده‌تر و امن‌تر است.

---

### ۱۰.۸ بعد از بالا آمدن: وب‌هوک، کرون، QR

**وب‌هوک سروش** — یک بار، از هر سیستمی:

```bash
curl "https://api.splus.ir/bot<TOKEN>/setWebhook?url=https://love.example.com/api/soroush/webhook/<SOROUSH_WEBHOOK_SECRET>/"
curl "https://api.splus.ir/bot<TOKEN>/getWebhookInfo"      # url باید بدون خطا برگردد
```

**سلامت کرون** — بعد از یک دقیقه `logs/sweep.log` باید خطی مثل
`sweep ok: memories=0 letters=0 meds=0 care=0 reminders=0 calls=0 outbox=0` داشته باشد.
بدون کرون، **نامه‌های زمان‌دار هرگز باز نمی‌شوند** و یادآور دارو هرگز نمی‌رود.

**QR او**

```bash
python3 scripts/qr.py https://love.example.com --out loveos-qr.svg
```

چاپش کن، بده دستش. هیچ وابستگی لازم نیست — رمزگذار QR داخل خودِ اسکریپت پیاده شده.

**تست دود**

```bash
DOMAIN=love.example.com ./scripts/deploy.sh verify
```

---

### ۱۰.۹ به‌روزرسانی یک استقرار موجود

```bash
./scripts/deploy.sh update
```

Pull می‌کند (`git pull --ff-only` وقتی پوشه یک ریپوی گیت است)، بعد نوع هاست را تشخیص می‌دهد:
داکر → rebuild و up؛ cPanel → هدف `cpanel`؛ سرویس systemd → build فرانت، migrate،
collectstatic، ری‌استارت. وقتی آپدیت مهاجرت دارد همیشه اول `./scripts/deploy.sh backup` بزن.

ترتیب دستی، اگر لازم شد: `git pull` → `npm run build` → `pip install -r requirements.txt` →
`migrate` → `collectstatic` → ری‌استارت Gunicorn / Passenger.

---

## ۱۱. اسکریپت‌ها

### `scripts/dev.sh` — سیستم خودم

| دستور | کار |
|---|---|
| `./scripts/dev.sh` / `run` | راه‌اندازی اگر لازم بود، بعد بک‌اند روی :8000 و فرانت روی :5173 |
| `setup` | venv، پکیج‌ها، `.env` با پیش‌فرض dev، migrate، seed، `npm ci` |
| `test` | تست‌های بک‌اند + بررسی‌های فرانت (پایین) |
| `test:be` | `manage.py check` + `manage.py test` (۸۹ تست) |
| `test:fe` | `tsc -b` + `oxlint src` + `npm run build` + `npm run test:ui` |
| `check` | `manage.py check`، `makemigrations --check`، `tsc`، `oxlint` — بررسی سریع قبل از کامیت |
| `reset` | فایل SQLite را پاک کن، migrate، دوباره seed |
| `clean` | حذف `.venv`، `node_modules`، `dist`، `staticfiles`، کش‌ها |

متغیرهای محیطی: `BACKEND_PORT`، `FRONTEND_PORT`، `PYTHON_BIN`.

### `scripts/deploy.sh` — سرورها

| هدف | کار |
|---|---|
| `build` | `npm ci && npm run build`، نصب پکیج‌ها، `collectstatic` |
| `vps` | راه‌اندازی کامل اوبونتو/دبیان: systemd + Nginx + cron + certbot (با root) |
| `cpanel` | پکیج‌ها، درایور MySQL، migrate، collectstatic، ری‌استارت Passenger |
| `docker` | `docker compose build && up -d && migrate` در `deploy/docker` |
| `update` | pull + rebuild + migrate + restart، با تشخیص خودکار نوع هاست |
| `package` | `loveos-release.tar.gz` برای هاست بدون git/node |
| `backup` | دامپ DB (mysqldump یا کپی sqlite) + `media.tar.gz` + کپی `.env` در `backups/<timestamp>/` |
| `verify` | تست HTTP یک استقرار زنده |

متغیرهای محیطی: `APP_DIR`، `DOMAIN`، `SERVICE`، `RUN_USER`، `GUNICORN_PORT`، `WORKERS`،
`SKIP_FRONTEND=1`، `SKIP_CERTBOT=1`، `BASE_URL` (verify)، `PYTHON_BIN`.

### `scripts/qr.py`

`python3 scripts/qr.py <url> [--out file.svg]` — سازنده‌ی QR بدون وابستگی (حالت byte، سطح
خطای M، نسخه‌های ۱ تا ۱۰).

---

## ۱۲. تست‌ها

```bash
./scripts/dev.sh test          # همه‌چیز
```

### بک‌اند — ۸۹ تست (`manage.py test`)

`tests.py` هر اپ: چرخه‌ی نشست و انقضا، پنهان ماندن رازها در boot، محدودیت تلاش ورود، رفت‌وبرگشت
تنظیمات، موقعیت مؤثر (زنده / پنل / کهنه)، جستجوی فارسی‌فهم، endpointهای محتوا، بغل و چت، جریان
دارو و چرخه، هم‌نویسی کتابخانه، شروع/پایان پازل، هم‌پوشانی تماس و تأیید/رد/جابه‌جایی، یادآور
تک‌باره‌ی تماس، آمار هدیه و بازه‌ی قیمت، پیشرفت خواندن و قفسه‌ی مشترک، محدود شدن مختصات اتاق،
فلش‌کارت/زنجیره‌ی زبان و کوییز فقط از پنل، و «همه‌ی مدل‌های ثبت‌شده در ادمین رندر می‌شوند».

### فرانت‌اند — بررسی نوع، لینت، build، تست رابط

```bash
cd frontend
npx tsc -b && npx oxlint src && npm run build
npm run test:ui                     # همه‌ی سوئیت‌ها
npm run test:ui window-manager-settings   # یک سوئیت
```

تست‌های رابط زیر **jsdom** با esbuild اجرا می‌شوند — بدون مرورگر (`frontend/tests/run.mjs`):

| سوئیت | چه چیزی را قفل می‌کند |
|---|---|
| `boot-sequence` | بوت در StrictMode، پایان خودکار، رد شدن با کلیک، بوت انگلیسی |
| `window-manager-settings` | باز/بسته/مینیمایز، هندسه‌ی ثابت، ترتیب لایه، موقعیت باز شدن دوباره، ماندگاری زبان و تم |
| `apps-render` | همه‌ی اپ‌های «با هم» با fixture واقعی API (`tests/fixtures.json`)، جستجوی سراسری، آیکن‌های دسکتاپ، ویجت تماس بعدی |
| `puzzle-win` | جشن برد حتی بدون پاسخ سرور |
| `pdf-book` | خروجی PDF کتاب کتابخانه |
| `desktop-drag` | مرتب‌سازی آیکن با درگ‌اند‌دراپ |
| `viewport-fit` | پوسته‌ی تمام‌قد بدون اسکرول داخلی در بوت/قفل/دسکتاپ |
| `starmap-sky` | آسمان لبه‌به‌لبه با ۸ صورت فلکی واقعی، زدن → پیام، «کل اسم رو روشن کن»، و اینکه کپشنِ بالای آسمان دیگر برنمی‌گردد |
| `starmap-broken-stars` | ردیف‌های خرابِ `stars` هیچ‌وقت آسمان را خالی یا خراب نمی‌کنند |
| `boot-timeout` | بک‌اندی که هیچ‌وقت جواب نمی‌دهد، آخرش به صفحه‌ی گرمِ «دوباره تلاش» با راهنمای کشِ PWA می‌رسد، نه صفحه‌ی خالی |
| `error-boundary-wrapper` | نگهبانِ خطا پیامِ گرم را نشان می‌دهد، تمیز ریمونت می‌کند و هیچ div واسطی اضافه نمی‌کند |
| `starmap-mobile` | ریاضی چیدمان دو ردیفی (نمادها ۱.۳×، بدون هم‌پوشانی، آینه‌ی راست‌به‌چپ)، گوشی عمودی → portal تمام‌صفحه‌ی چرخیده بالای داک، افقی → بدون چرخش اضافه، ✕ پنجره را می‌بندد، پنجره‌ی دیگر روی آسمان لایه را کنار می‌زند |

`tests/fixtures.json` از API زنده گرفته شده؛ اگر قرارداد یک endpoint عوض شود، این‌ها قبل از او
می‌شکنند.

---

## ۱۳. نگهداری، پشتیبان‌گیری و رفع اشکال

### روتین

| دوره | چه می‌کنم |
|---|---|
| روزانه | نگاهی به `ActivityLog` و `SoroushOutbox` در پنل |
| هفتگی | `./scripts/deploy.sh backup`؛ فضای دیسک |
| ماهانه | `pip list --outdated`، `npm outdated`؛ مرور محتوا |
| هر آپدیت | backup → `./scripts/deploy.sh update` → `verify` |

### پشتیبان‌گیری

`./scripts/deploy.sh backup` پوشه‌ی `backups/<timestamp>/` می‌سازد با `db.sql.gz` (یا
`db.sqlite3`)، `media.tar.gz` و `env.backup`. آن پوشه را از سرور خارج کن. بازیابی: دامپ را import
کن، `media.tar.gz` را در `backend/` باز کن، `.env` را برگردان، ری‌استارت.

### مشکلات رایج

| علامت | علت | راه‌حل |
|---|---|---|
| فارسی به شکل `????` | دیتابیس utf8mb4 نیست | DB را با `utf8mb4_unicode_ci` بساز (۱۰.۱) |
| `DisallowedHost` / 400 | `ALLOWED_HOSTS` | دامنه را اضافه کن، ری‌استارت |
| لاگین پنل CSRF failed می‌دهد | `CSRF_TRUSTED_ORIGINS` | `https://domain` را اضافه کن، ری‌استارت |
| حلقه‌ی ریدایرکت بی‌نهایت | `SECURE_SSL_REDIRECT` پشت پراکسی‌ای که خودش TLS دارد | `SECURE_SSL_REDIRECT=False`، مطمئن شو پراکسی `X-Forwarded-Proto` می‌فرستد |
| صفحه بعد از آپدیت خالی است | سرویس‌ورکر قدیمی | یک بار hard refresh؛ `sw.js` باید با `no-cache` سرو شود |
| «فرانت‌اند هنوز build نشده است» (501) | `SERVE_FRONTEND=True` ولی `dist/` نیست | `frontend/dist` را build/آپلود کن، `FRONTEND_DIST` را چک کن |
| پیام سروش نمی‌رسد | توکن / اتصال | پنل → SoroushOutbox (وضعیت، خطا) → `manage.py sweep` |
| نامه‌های زمان‌دار باز نمی‌شوند | کرون نیست | خط کرون `sweep` را نصب کن |
| آپلود بالای ~۱۰ مگ شکست می‌خورد | محدودیت بدنه‌ی پراکسی | `client_max_body_size 80M` (در قالب Nginx هست) |
| `mysqlclient` کامپایل نمی‌شود | هدرها نیستند | `apt install default-libmysqlclient-dev build-essential` یا `pymysql` |
| موقعیت، هوا یا ساعت کهنه است | موقعیت زنده قدیمی است و مقدار پنل استفاده می‌شود | موقعیت زنده را در تنظیماتش روشن کن یا پنل را به‌روز کن |
| URL پنل 404 | `ADMIN_PATH` | از `.env` بخوانش؛ آن‌جا بدون اسلش اول و آخر |

### تکه‌کدهای shell به‌دردبخور

```bash
# امروز چه کرده؟
manage.py shell -c "from core.models import ActivityLog; [print(a.created_at, a.title, a.detail) for a in ActivityLog.objects.all()[:20]]"
# آخرین موقعیت زنده‌اش
manage.py shell -c "from accounts.models import LiveLocation; l=LiveLocation.current(); print(l and (l.city, l.lat, l.lng, l.age_minutes()))"
# صف سروش را همین حالا خالی کن
manage.py shell -c "from core.soroush import flush_outbox; print(flush_outbox())"
# رمزش را عوض کن
manage.py shell -c "from accounts.models import UserConfig; c=UserConfig.get_solo(); c.set_passcode('2468'); c.save()"
```

---

## ۱۴. مدل امنیتی

* **کشف شدن**: دامنه‌ی لیست‌نشده، `robots.txt` با بستن همه‌چیز، `X-Robots-Tag: noindex` روی هر
  پاسخ، `X-Frame-Options: DENY`.
* **سمت او**: رمز → توکن مبهم؛ محدودیت تلاش؛ رمز جداگانه‌ی صندوقچه با عمر کوتاه؛ محدودیت نرخ
  DRF (`API_RATE_LIMIT`).
* **سمت من**: مسیر مخفی ادمین، دروازه‌ی رمز اختیاری قبل از صفحه‌ی لاگین، احراز هویت جنگو،
  `ActivityLog` از همه‌چیز.
* **انتقال**: HSTS (یک سال، preload) و کوکی‌های secure هر وقت `DEBUG=False`.
* **فایل‌ها**: آپلودها بیرون از هر URL عمومی؛ فقط لینک‌های امضاشده و منقضی‌شونده‌ی `/api/media`.
* **رازها**: فقط در `backend/.env` (`chmod 600`)، هرگز در گیت، هرگز در باندل فرانت.
* **پشتیبان‌ها**: همه‌چیز را دارند — با آن پوشه مثل `.env` رفتار کن.

---

*فاصله فقط یه عدده. قلبمون همیشه یکیه.* ❤
