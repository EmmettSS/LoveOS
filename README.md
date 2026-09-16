# LoveOS

> یه سیستم‌عامل کوچولوی عاشقانه توی مرورگر — ساخته‌ی بابا، برای دخترش.
> A tiny romantic operating system in the browser — built by Daddy, for his daughter.

![version](https://img.shields.io/badge/version-2.0-ec4899) ![backend](https://img.shields.io/badge/backend-Django%205%20%2B%20DRF-0C4B33) ![frontend](https://img.shields.io/badge/frontend-React%2019%20%2B%20Vite%208-61DAFB)

۳۰ اپ کوچک، یک دسکتاپ، یک پنل که همه‌چیزش از آن‌جا عوض می‌شود: پیام‌ها، ویس‌ها، نامه‌ها،
کوییزها، هدیه‌ها، کتاب‌ها، کلمه‌های زبان و حتی رازها.

## مستندات

| فایل | چیست |
|---|---|
| [`DOCUMENTATION_FA.md`](./DOCUMENTATION_FA.md) | مستندات کامل فارسی (معماری، اپ‌ها، پنل، API، استقرار) |
| [`DOCUMENTATION.md`](./DOCUMENTATION.md) | همان مستند به انگلیسی |
| [`QUICKSTART_FA.md`](./QUICKSTART_FA.md) | راه‌اندازی سریع روی سیستم خودم |
| [`DEPLOY_CPANEL_FA.md`](./DEPLOY_CPANEL_FA.md) | استقرار روی هاست سی‌پنل |
| [`Soroush-Docs.md`](./Soroush-Docs.md) | مرجع API سروش‌پلاس |

## راه‌اندازی در یک نگاه

```bash
# بک‌اند
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env && .venv/bin/python manage.py migrate
.venv/bin/python manage.py seed_loveos        # رمز ورود: 1234 · صندوقچه: 0000
.venv/bin/python manage.py runserver 0.0.0.0:8000

# فرانت‌اند (ترمینال دوم)
cd frontend && npm install && npm run dev     # http://localhost:5173
```

## اپ‌ها

* **احساسی:** نقشه‌ی ما · صندوق صدا · موسیقی ما · خاطره‌ها · نامه‌های نجوا · شمارش معکوس ·
  آب‌وهوا · ضربان قلب · باغچه‌ی ما · آسمان ستاره‌ها · چت · حال دلم · کوییز · آرزوها · سینما ·
  صندوقچه · بغل
* **مراقبت:** چرخه و مراقبت · کتابخونه‌ی ما · پازل قلب · تنظیمات · آموزش · ترمینال · نشان‌ها
* **با هم بودن (تازه‌ی ۲.۰):** هماهنگ‌کننده‌ی تماس · دفتر هدیه‌ها · کتاب‌خوانی مشترک ·
  خونه‌ی رویایی · پل زبان · جستجوی سراسری (Ctrl/⌘ + K)

## تست

```bash
cd backend && .venv/bin/python manage.py test          # ۷۲ تست
cd frontend && npx tsc -b && npx oxlint src && npm run build && npm run test:ui
```

---

*فاصله فقط یه عدده. قلبمون همیشه یکیه.* ❤
