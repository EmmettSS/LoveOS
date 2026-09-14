# 🌐 دیپلوی LoveOS روی هاست cPanel

> بابا جان، این راهنما قدم‌به‌قدم تو را از سیستم شخصی به هاست cPanel می‌برد.
> اگر اولین بار است، **به‌ترتیب** قدم‌ها را جلو برو و هیچ قدمی را جا ننداز.

---

## چرا در توسعه دو ترمینال بود ولی اینجا یکی؟

در سیستم شخصی (طبق `QUICKSTART_FA.md`) دو تا سرور جدا داریم:

- **جنگو** روی `:8000` — فقط API را جواب می‌دهد.
- **Vite** روی `:5173` — فایل‌های React را می‌دهد و Hot Reload دارد.

این معماری برای **nginx** ساخته شده بود: nginx فایل‌های build شده را سرو می‌کرد و فقط
`/api/` و پنل را به جنگو می‌سپرد.

اما در **cPanel هیچ nginxی در اختیار تو نیست**. همه‌ی درخواست‌ها از **Phusion Passenger**
رد می‌شوند و به **یک** اپ WSGI (همان `passenger_wsgi.py`) می‌رسند. پس در پروداکشن:

- جنگو باید **هم** API را جواب بدهد، **هم** اپ React ساخته‌شده (`frontend/dist`) را سرو کند،
  **هم** فایل‌های `static` و `media` را.
- Vite در پروداکشن اصلاً اجرا نمی‌شود؛ فقط یک بار `npm run build` می‌گیریم و خروجی را آپلود می‌کنیم.

این دقیقاً کاری است که سوییچ `SERVE_FRONTEND=True` انجام می‌دهد. جدول مقایسه:

| | `SERVE_FRONTEND=False` (توسعه) | `SERVE_FRONTEND=True` (cPanel) |
|---|---|---|
| جنگو | فقط API | API + اپ React + static + media |
| Vite | جدا اجرا می‌شود، Hot Reload دارد | اجرا نمی‌شود |
| تعداد ترمینال/پروسه | دو تا | یکی |

---

## قدم ۱ — ساخت build فرانت‌اند روی سیستم شخصی

⚠️ این کار را **روی سیستم شخصی خودت** انجام بده، نه روی هاست. هاست cPanel معمولاً
Node و فضای لازم برای build را ندارد.

```bash
cd LoveOS/frontend
npm install
npm run build
```

خروجی در `frontend/dist/` ساخته می‌شود. همین پوشه را در قدم ۳ آپلود می‌کنی.

---

## قدم ۲ — ساخت دیتابیس MySQL

1. در cPanel باز کن: **MySQL® Databases**.
2. یک دیتابیس بساز، مثلاً `USERNAME_loveos`.
3. یک کاربر بساز، مثلاً `USERNAME_loveos` و یک رمز قوی به آن بده.
4. کاربر را به دیتابیس اضافه کن و **ALL PRIVILEGES** بده.
5. حالا برو **phpMyAdmin** → دیتابیست را انتخاب کن → تب **Operations**.
6. در بخش **Collation** مقدار را بگذار: **`utf8mb4_unicode_ci`** و «Go» را بزن.

> 💥 اگر collation را `utf8mb4_unicode_ci` نگذاری، متن‌های فارسی (و ایموجی‌ها) در پنل
> بابا به صورت `????` نمایش داده می‌شوند.

---

## قدم ۳ — آپلود پروژه بیرون از `public_html`

در **File Manager** پوشه‌ای بساز: `/home/USERNAME/loveos/`

> 🔒 **خیلی مهم:** پروژه باید **بیرون** از `public_html` باشد. اگر داخل `public_html`
> بگذاری، فایل `.env` (که همه‌ی رمزها در آن است) از اینترنت قابل دانلود می‌شود!

پوشه‌ی `loveos` را از سیستم شخصی فشرده کن (`zip` یا `tar.gz`) و در cPanel بالا ببر و
باز کن. دقت کن چه چیزی باید برود و چه چیزی نباید:

| آپلود شود ✅ | آپلود نشود ❌ |
|---|---|
| `backend/` (کلش) | `backend/.venv/` (محیط مجازی) |
| `frontend/dist/` (خروجی build) | `frontend/node_modules/` |
| `passenger_wsgi.py` (در ریشه) | `frontend/src/` (سورس لازم نیست) |
| `scripts/` (برای `qr.py`) | `loveos.sqlite3` (دیتابیس dev) |
| `requirements.txt` (داخل backend) | `.git/` |
| — | `__pycache__/` |

---

## قدم ۴ — ساخت Python App در cPanel

1. در cPanel باز کن: **Setup Python App**.
2. روی **Create Application** بزن:
   - **Python version:** آخرین نسخه‌ی موجود (۳٫۱۱ یا بالاتر).
   - **Application root:** `loveos` (یعنی `/home/USERNAME/loveos/`).
   - **Application URL:** دامنه‌ی خودت را انتخاب کن.
   - **Application startup file:** `passenger_wsgi.py`
   - **Application Entry point:** `application`
3. روی Create بزن.

بعد از ساخت، cPanel یک فرمان شبیه این نشانت می‌دهد:

```bash
source /home/USERNAME/virtualenv/loveos/3.11/bin/activate && cd /home/USERNAME/loveos
```

✍️ **این خط را کپی کن و یک جایی یادداشت کن.** در تمام قدم‌های بعد (Terminal) اول باید
همین خط را اجرا کنی تا در محیط مجازی درست و پوشه‌ی درست باشی.

---

## قدم ۵ — نصب وابستگی‌ها

از **Terminal** (یا SSH) در cPanel:

```bash
source /home/USERNAME/virtualenv/loveos/3.11/bin/activate && cd /home/USERNAME/loveos
pip install -r backend/requirements.txt
pip install mysqlclient
```

**اگر `mysqlclient` کامپایل نشد** (ارور مربوط به `mysql_config` یا `gcc`):

```bash
pip install pymysql
```

بعد فایل `backend/config/__init__.py` را بساز (یا ویرایش کن) و این دو خط را در آن بگذار:

```python
import pymysql

pymysql.install_as_MySQLdb()
```

**اگر هاستت اصلاً Terminal ندارد:** همین دو پکیج (`-r requirements.txt` و `mysqlclient`)
را روی سیستم شخصی با معماری مشابه نصب و `pip freeze` کن، بعد فایل‌ها را دستی در پوشه‌ی
site-packages محیط مجازی cPanel آپلود کن — یا از یک هاست با Terminal استفاده کن.

---

## قدم ۶ — ساخت فایل `.env` کامل

در پوشه‌ی `/home/USERNAME/loveos/backend/` فایل `.env` بساز و این‌ها را در آن بگذار:

```ini
DEBUG=False
DJANGO_SECRET_KEY=<کلید تصادفی بلند>
ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com
CSRF_TRUSTED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
TIME_ZONE=Asia/Tehran

ADMIN_PATH=daddy-panel-9x7k
ADMIN_GATE_PASSCODE=<یک رمز دوم قوی برای دروازه>

DB_ENGINE=mysql
DB_NAME=USERNAME_loveos
DB_USER=USERNAME_loveos
DB_PASSWORD=<رمز دیتابیس>
DB_HOST=127.0.0.1
DB_PORT=3306

NOTIFY_PROVIDER=soroush
SOROUSH_API_BASE=https://api.splus.ir
SOROUSH_TOKEN=<توکن بات سروش>
SOROUSH_DADDY_CHAT_ID=<chat_id خودت>
SOROUSH_WEBHOOK_SECRET=loveos-hook
SOROUSH_PARSE_MODE=HTML

SESSION_TTL_HOURS=720
VAULT_SESSION_MINUTES=20
MAX_UNLOCK_ATTEMPTS=5
API_RATE_LIMIT=300/min

# سرو کردن فرانت‌اند توسط جنگو — حتماً True باشد
SERVE_FRONTEND=True
# FRONTEND_DIST=/home/USERNAME/loveos/frontend/dist
```

**تولید `SECRET_KEY` تصادفی:**

```bash
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

---

## قدم ۷ — آماده‌سازی دیتابیس و فایل‌ها

```bash
source /home/USERNAME/virtualenv/loveos/3.11/bin/activate && cd /home/USERNAME/loveos
cd backend
python manage.py migrate
python manage.py seed_loveos --passcode 1234 --vault 0000
python manage.py collectstatic --noinput
python manage.py createsuperuser
```

---

## قدم ۸ — ری‌استارت و یک نکته‌ی حیاتی

در **Setup Python App** دکمه‌ی **Restart** را بزن.

> ⚠️ **Passenger تغییرات را خودکار نمی‌بیند.** هر بار که `.env`، کد یا تنظیمات را عوض
> کردی باید Restart بزنی. اگر به Terminal دسترسی داری، معادلش این است:
>
> ```bash
> touch /home/USERNAME/loveos/tmp/restart.txt
> ```
>
> (یعنی پوشه‌ی `tmp` را بساز و فایل `restart.txt` را لمس کن تا Passenger ریلود شود.)

---

## قدم ۹ — فعال‌سازی SSL (اجباری است)

در cPanel برو **SSL/TLS Status** و برای دامنه‌ات **AutoSSL** را فعال کن.

چرا اجباری؟

1. وقتی `DEBUG=False` است، جنگو ریدایرکت **HTTPS** دارد؛ بدون SSL سایت کار نمی‌کند.
2. اپ دخترم یک **PWA** است — سرویس‌ورکرها فقط روی HTTPS کار می‌کنند.
3. وب‌هوک سروش هم فقط روی آدرس HTTPS و معتبر جواب می‌گیرد.

---

## قدم ۱۰ — ست کردن وب‌هوک سروش

```bash
curl "https://api.splus.ir/bot<TOKEN>/setWebhook?url=https://yourdomain.com/api/soroush/webhook/loveos-hook/"
curl "https://api.splus.ir/bot<TOKEN>/getWebhookInfo"
```

در پاسخ `getWebhookInfo` باید `url` درست و بدون خطا دیده شود.

---

## قدم ۱۱ — کرون هر دقیقه برای `sweep`

باز کن: **Cron Jobs** در cPanel و این خط را اضافه کن (دقت کن مسیر پایتون venv را **کامل** بنویسی):

```
* * * * * /home/USERNAME/virtualenv/loveos/3.11/bin/python /home/USERNAME/loveos/backend/manage.py sweep >> /home/USERNAME/loveos/logs/sweep.log 2>&1
```

> 💥 **بدون این کرون، نامه‌های زمان‌دار هرگز باز نمی‌شوند** و خاطره‌های آینده و
> یادآوری‌های دارو هم کار نمی‌کنند. موتور زمان‌بندی LoveOS همین `sweep` است که باید
> هر دقیقه اجرا شود.

---

## قدم ۱۲ — ساخت QR دامنه‌ی مخفی

روی سیستم شخصی (یا هاستی که پایتون ۳ دارد):

```bash
python3 scripts/qr.py https://yourdomain.com --out loveos-qr.svg
```

این فایل SVG را چاپ کن و به دخترم بده؛ اسکن کند مستقیم وارد دنیای ما می‌شود. 💗

---

## ✅ چک‌لیست نهایی

- [ ] دیتابیس MySQL با collation `utf8mb4_unicode_ci` ساخته شده
- [ ] پروژه در `/home/USERNAME/loveos/` (بیرون `public_html`) است
- [ ] `frontend/dist` ساخته و آپلود شده
- [ ] Python App با startup file `passenger_wsgi.py` و entry point `application` ساخته شده
- [ ] `pip install -r requirements.txt` و `pip install mysqlclient` (یا `pymysql`) انجام شده
- [ ] `.env` با `SERVE_FRONTEND=True` و `DEBUG=False` ساخته شده
- [ ] `migrate` + `seed_loveos` + `collectstatic` + `createsuperuser` اجرا شده
- [ ] Restart زده شده
- [ ] AutoSSL فعال و قفل سبز دیده می‌شود
- [ ] وب‌هوک سروش ست شده و `getWebhookInfo` سالم است
- [ ] Cron هر دقیقه برای `sweep` فعال است
- [ ] QR ساخته و پرینت شده
- [ ] `https://yourdomain.com` باز شد و اپ دخترم دیده شد
- [ ] `https://yourdomain.com/daddy-panel-9x7k/` دروازه‌ی رمز را نشان داد

---

## 🛠 جدول رفع اشکال

| مشکل | علت احتمالی | راه‌حل |
|---|---|---|
| صفحه‌ی سفید خالی | `SERVE_FRONTEND` تنظیم نشده / `False` است | در `.env` بگذار `SERVE_FRONTEND=True` و Restart کن |
| متن‌ها به شکل `????` نمایش داده می‌شوند | collation دیتابیس درست نیست | از phpMyAdmin → Operations مقدار `utf8mb4_unicode_ci` بگذار |
| تغییر `.env` اثر نکرد | Passenger ری‌استارت نشده | Restart بزن یا `touch tmp/restart.txt` |
| `DisallowedHost` | دامنه در `ALLOWED_HOSTS` نیست | دامنه (با و بدون www) را در `.env` اضافه کن |
| `CSRF verification failed` در پنل | `CSRF_TRUSTED_ORIGINS` دامنه را ندارد | `CSRF_TRUSTED_ORIGINS=https://yourdomain.com` بگذار |
| خطای ۵۰۰ بعد از آپلود | وابستگی‌ها نصب نشده یا `pymysql` لازم است | قدم ۵ را دوباره چک کن |
| نامه‌های زمان‌دار باز نمی‌شوند | کرون `sweep` فعال نیست | قدم ۱۱ را چک کن و مسیر پایتون را درست بگذار |
| وب‌هوک سروش جواب نمی‌دهد | HTTPS فعال نیست یا secret غلط است | قدم ۹ و ۱۰ را چک کن |

---

## 🔄 به‌روزرسانی در آینده

هر بار که کد یا محتوا را عوض کردی:

1. روی سیستم شخصی: `cd frontend && npm run build`.
2. فایل‌های تغییرکرده + پوشه‌ی جدید `frontend/dist` را آپلود کن (جاگزین).
3. اگر مدل‌های جنگو تغییر کرده: `python manage.py migrate`.
4. اگر فایل‌های استاتیک جنگو (پنل ادمین) عوض شده: `python manage.py collectstatic --noinput`.
5. در پایان حتماً **Restart** بزن.

---

## 💾 بکاپ

**دیتابیس MySQL:**

```bash
mysqldump -u USERNAME_loveos -p USERNAME_loveos > backup_$(date +%F).sql
```

**فایل‌های رسانه (ویس‌ها، آهنگ‌ها، عکس‌های دخترم):**

```bash
tar -czf media_backup_$(date +%F).tar.gz /home/USERNAME/loveos/backend/media
```

> 💗 این دو دستور را به‌صورت دوره‌ای اجرا کن و فایل‌های بکاپ را جای امنی نگه دار؛
> رسانه‌های این دنیای کوچیک غیرقابل‌جایگزین‌اند.
