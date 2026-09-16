"""
LoveOS — Django settings
تنظیمات اصلی پروژه. همه‌ی مقادیر حساس از فایل .env خوانده می‌شوند.
Nothing is hard-coded: every secret/config value comes from environment variables.
"""
from pathlib import Path
import os

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def env(key: str, default: str = "") -> str:
    return os.environ.get(key, default)


def env_bool(key: str, default: bool = False) -> bool:
    return env(key, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def env_list(key: str, default: str = "") -> list[str]:
    raw = env(key, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


# ---------------------------------------------------------------- core -------
SECRET_KEY = env(
    "DJANGO_SECRET_KEY",
    "dev-only-loveos-key-change-this-before-production-9f3a7c2e1d",
)
DEBUG = env_bool("DEBUG", True)
ALLOWED_HOSTS = env_list("ALLOWED_HOSTS", "localhost,127.0.0.1,[::1]") or ["localhost", "127.0.0.1", "[::1]"]
CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS", "https://*.e2b.app")

# مسیر مخفی پنل بابا / secret admin path (no trailing slash in .env)
ADMIN_PATH = env("ADMIN_PATH", "daddy-panel-9x7k").strip("/")
# رمز عبور دوم پنل (gate قبل از صفحه‌ی لاگین جنگو)
ADMIN_GATE_PASSCODE = env("ADMIN_GATE_PASSCODE", "")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    # LoveOS apps
    "core",
    "accounts",
    "content",
    "social",
    "health",
    "library",
    "games",
    # ---- شش اپ تازه‌ی LoveOS
    "calls",
    "gifts",
    "reading",
    "dreamhome",
    "language",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    # دروازه‌ی پنل باید قبل از CSRF اجرا شود تا فرم ساده‌ی رمز رد نشود
    "core.middleware.AdminGateMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "core.middleware.NoIndexMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# ------------------------------------------------------------ database ------
# DB_ENGINE=sqlite (dev) | mysql (production)
if env("DB_ENGINE", "sqlite") == "mysql":
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.mysql",
            "NAME": env("DB_NAME", "loveos"),
            "USER": env("DB_USER", "loveos"),
            "PASSWORD": env("DB_PASSWORD", ""),
            "HOST": env("DB_HOST", "127.0.0.1"),
            "PORT": env("DB_PORT", "3306"),
            "OPTIONS": {
                "charset": "utf8mb4",
                "init_command": "SET sql_mode='STRICT_TRANS_TABLES'",
            },
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / env("DB_NAME", "loveos.sqlite3"),
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
]

# -------------------------------------------------------------- i18n --------
LANGUAGE_CODE = "fa"
TIME_ZONE = env("TIME_ZONE", "Asia/Tehran")
USE_I18N = True
USE_TZ = True

# ------------------------------------------------------------- static -------
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# تست‌ها در پوشه‌ی رسانه‌ی موقت اجرا شوند، نه در ریپازیتوری.
# دلیلش در core/test_runner.py توضیح داده شده: جنگو دیتابیسِ تست را
# برمی‌گرداند ولی فایل‌سیستم را نه، و آپلودِ تست‌ها ریپو را کثیف می‌کرد.
# روی پروداکشن هیچ اثری ندارد (فقط هنگامِ manage.py test فعال است).
TEST_RUNNER = "core.test_runner.IsolatedMediaTestRunner"

# سرو کردن فرانت‌اند و static توسط جنگو (برای هاست‌های تک‌ورودی مثل cPanel/Passenger)
# media خصوصی فقط با URL امضاشده‌ی /api/media تحویل می‌شود.
SERVE_FRONTEND = env_bool("SERVE_FRONTEND", False)
FRONTEND_DIST = env("FRONTEND_DIST", str(BASE_DIR.parent / "frontend" / "dist"))

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
DATA_UPLOAD_MAX_MEMORY_SIZE = 80 * 1024 * 1024  # 80MB uploads (voices/songs)
FILE_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024

# --------------------------------------------------------------- DRF --------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.AnonRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {"anon": env("API_RATE_LIMIT", "300/min")},
    "UNAUTHENTICATED_USER": None,
}

# Production is same-origin; broad credentialed CORS would expose the private API.
# Enable it explicitly only when a separate trusted frontend origin is required.
CORS_ALLOW_ALL_ORIGINS = env_bool("CORS_ALLOW_ALL", False)
CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS")
CORS_ALLOW_CREDENTIALS = bool(CORS_ALLOWED_ORIGINS) or CORS_ALLOW_ALL_ORIGINS

# ------------------------------------------------------------ security ------
if not DEBUG:
    SECURE_SSL_REDIRECT = env_bool("SECURE_SSL_REDIRECT", True)
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 60 * 60 * 24 * 365
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
X_FRAME_OPTIONS = "DENY"

# ------------------------------------------------------- LoveOS settings ----
LOVEOS = {
    # نشست دخترم / daughter unlock session
    "SESSION_TTL_HOURS": int(env("SESSION_TTL_HOURS", "720")),
    "VAULT_SESSION_MINUTES": int(env("VAULT_SESSION_MINUTES", "20")),
    "MAX_UNLOCK_ATTEMPTS": int(env("MAX_UNLOCK_ATTEMPTS", "5")),
    # سروش‌پلاس / Soroush Plus bot API
    "SOROUSH_API_BASE": env("SOROUSH_API_BASE", "https://api.splus.ir"),
    "SOROUSH_TOKEN": env("SOROUSH_TOKEN", ""),
    "SOROUSH_DADDY_CHAT_ID": env("SOROUSH_DADDY_CHAT_ID", ""),
    "SOROUSH_WEBHOOK_SECRET": env("SOROUSH_WEBHOOK_SECRET", "loveos-hook"),
    "SOROUSH_PARSE_MODE": env("SOROUSH_PARSE_MODE", "HTML"),
    # console = فقط لاگ (حالت توسعه) | soroush = ارسال واقعی
    "NOTIFY_PROVIDER": env("NOTIFY_PROVIDER", "console"),
    "OUTBOX_MAX_RETRY": int(env("OUTBOX_MAX_RETRY", "5")),
    # ارسال اعلان در نخ پس‌زمینه تا هیچ درخواست API منتظر سروش نماند
    "NOTIFY_ASYNC": env_bool("NOTIFY_ASYNC", True),
    # تایم‌اوت هر درخواست سروش (ثانیه)
    "SOROUSH_TIMEOUT": int(env("SOROUSH_TIMEOUT", "8")),
}
