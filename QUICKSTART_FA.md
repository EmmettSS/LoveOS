# 🚀 راه‌اندازی سریع LoveOS روی سیستم شخصی

> بابا جان، این راهنما برای این است که LoveOS را روی لپ‌تاپ/کامپیوتر خودت بالا بیاوری و
> قبل از بردنش روی هاست، همه‌چیز را امتحان کنی. در این حالت **دو تا ترمینال** باز است:
> یکی جنگو (API) و یکی Vite (فرانت‌اند) که **Hot Reload** دارد — یعنی هر تغییری بزنی
> فوراً می‌بینی.

---

## ۱) پیش‌نیازها

| ابزار | نسخه‌ی لازم | چطور مطمئن شوم؟ |
|---|---|---|
| Python | ۳٫۱۱ یا بالاتر | `python --version` |
| Node.js | ۲۰ یا بالاتر | `node --version` |
| npm | همراه Node می‌آید | `npm --version` |

اگر ندارید، از سایت رسمی نصب کنید: [python.org](https://www.python.org) و [nodejs.org](https://nodejs.org).

---

## ۲) کلون کردن پروژه

```bash
git clone https://github.com/EmmettSS/LoveOS.git
cd LoveOS
```

---

## ۳) ساخت محیط مجازی پایتون و نصب وابستگی‌ها

**لینوکس / مک:**

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

**ویندوز (PowerShell):**

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
python -m pip install --upgrade pip
.venv\Scripts\pip install -r requirements.txt
```

> 💡 از این به بعد هرجا `python` نوشته شده، در ویندوز داخل همان پوشه‌ی `backend` و با
> محیط فعال یا مسیر کامل `.venv\Scripts\python` اجرا می‌شود.

---

## ۴) ساخت فایل `.env`

```bash
cp .env.example .env        # لینوکس / مک
copy .env.example .env      # ویندوز
```

حالا `.env` را باز کن و این‌ها را حتماً چک کن (برای توسعه‌ی محلی همین مقادیر پیش‌فرض خوب است):

```ini
DEBUG=True
ALLOWED_HOSTS=*
SERVE_FRONTEND=False        # ← مهم: در توسعه باید False بماند
ADMIN_PATH=daddy-panel-9x7k
ADMIN_GATE_PASSCODE=
```

> ⚠️ **هر بار `.env` را تغییر دادی، سرور جنگو را ری‌استارت کن.** جنگو فایل `.env`
> را فقط هنگام شروع می‌خواند و بعد از تغییر خودش را به‌روز نمی‌کند.

---

## ۵) ساخت دیتابیس و داده‌های اولیه

```bash
# داخل پوشه‌ی backend
python manage.py migrate
python manage.py seed_loveos --passcode 1234 --vault 0000
python manage.py createsuperuser
```

**رمزهای پیش‌فرض:**

| کجا | مقدار پیش‌فرض |
|---|---|
| رمز ورود دخترم (قفل سیستم) | `1234` |
| رمز صندوقچه (vault) | `0000` |
| سوپرکاربر پنل | همانی که در `createsuperuser` می‌گذاری |

> 🔐 بعداً این رمزها را از خود پنل بابا عوض کن. این‌ها فقط برای شروع است.

---

## ۶) نصب پکیج‌های فرانت‌اند

```bash
cd ../frontend
npm install
```

---

## ۷) اجرای دو سرور در دو ترمینال

**ترمینال ۱ — بک‌اند جنگو (API):**

```bash
cd backend
python manage.py runserver 0.0.0.0:8000
```

**ترمینال ۲ — فرانت‌اند Vite:**

```bash
cd frontend
npm run dev -- --host 0.0.0.0
```

حالا این آدرس‌ها را باز کن:

| آدرس | چیست |
|---|---|
| `http://localhost:5173` | اپ دخترم (فرانت‌اند React با Hot Reload) |
| `http://localhost:8000/daddy-panel-9x7k/` | پنل بابا (دروازه‌ی رمز + ورود جنگو) |

> 💡 راه میان‌بر: اسکریپت `./scripts/dev.sh` در لینوکس/مک هر دو سرور را با هم بالا می‌آورد.

---

## ۸) تست روی گوشی

اگر می‌خواهی دخترم روی گوشی خودش تست کند (به‌جای `localhost`):

```bash
# بک‌اند
python manage.py runserver 0.0.0.0:8000
# فرانت‌اند
npm run dev -- --host 0.0.0.0
```

بعد در گوشی، آدرس آی‌پی کامپیوترت را وارد کن: `http://192.168.x.x:5173`
(کامپیوتر و گوشی باید روی یک شبکه‌ی Wi-Fi باشند). یادت باشد در همین حالت، Vite
درخواست‌های `/api` را خودش به پورت ۸۰۰۰ پروکسی می‌کند.

---

## ۹) جدول رفع اشکال

| مشکل | علت احتمالی | راه‌حل |
|---|---|---|
| صفحه‌ی سفید خالی | `SERVE_FRONTEND` اشتباهاً `True` است یا Vite اجرا نشده | `.env` را چک کن (باید `False` باشد)، Vite را در ترمینال ۲ اجرا کن |
| `Error: That port is already in use` | سرور قبلی هنوز باز است | ترمینال قبلی را ببند یا پورت را عوض کن |
| `ModuleNotFoundError` هنگام `migrate` | `requirements.txt` نصب نشده | `pip install -r requirements.txt` |
| تغییر `.env` اثر نکرد | جنگو `.env` را فقط در شروع می‌خواند | **سرور جنگو را ری‌استارت کن** |
| ارور `DisallowedHost` | `ALLOWED_HOSTS` آی‌پی گوشی را ندارد | در `.env` بگذار `ALLOWED_HOSTS=*` (فقط در توسعه) |
| فرانت‌اند بالا نمی‌آید و ارور node می‌دهد | `npm install` اجرا نشده | در پوشه‌ی `frontend` بزن `npm install` |

---

## ۱۰) جمع‌بندی

- توسعه = دو ترمینال، `SERVE_FRONTEND=False`، Hot Reload فعال.
- پروداکشن cPanel = یک ترمینال، `SERVE_FRONTEND=True` → برو سراغ `DEPLOY_CPANEL_FA.md`.

💗 بابا جان، همه‌ی دنیای کوچیک ما از همین دو تا ترمینال شروع می‌شود.
