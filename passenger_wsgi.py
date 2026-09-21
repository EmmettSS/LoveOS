"""
passenger_wsgi.py — نقطه‌ی ورود LoveOS برای cPanel / Phusion Passenger

روی هاست cPanel نرم‌افزار Passenger به دنبال همین فایل می‌گردد و متغیر
`application` را از آن می‌خواند. این فایل مسیر backend/ را به ابتدای
sys.path اضافه می‌کند تا پکیج‌ها (config، core، …) پیدا شوند، ماژول
تنظیمات را روی config.settings می‌گذارد و اپ WSGI جنگو را برمی‌گرداند.

هیچ تنظیمی اینجا هاردکد نشده است؛ همه‌چیز از backend/.env خوانده می‌شود.

cPanel looks for this file and imports `application` from it. We prepend the
backend/ directory to sys.path, point Django at config.settings, and return
get_wsgi_application(). Nothing is hard-coded here — all settings come from
backend/.env.
"""
import os
import sys

# ریشه‌ی ریپو (همان جایی که این فایل قرار دارد) و پوشه‌ی backend/
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(BASE_DIR, "backend")

# پکیج‌های جنگو داخل backend/ هستند
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

from django.core.wsgi import get_wsgi_application  # noqa: E402

application = get_wsgi_application()
