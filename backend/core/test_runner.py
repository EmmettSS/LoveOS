"""
test_runner.py — اجراکننده‌ی تست با MEDIA_ROOT موقت

مشکلِ واقعی که این حلش می‌کند
------------------------------
جنگو هنگامِ تست **دیتابیس** را برمی‌گرداند ولی **فایل‌سیستم** را نه.
تست‌های پازل (``games/tests.py``) یک ``Puzzle`` با عکسِ آپلودشده می‌سازند و
چون ``MEDIA_ROOT`` همان ``backend/media`` است، هر بار اجرای تست چند عکسِ
``heart_xxxxxx.jpg`` داخلِ ریپازیتوری جا می‌ماند. نتیجه: ``git status`` کثیف
می‌شود و خطرِ کامیت‌شدنِ فایلِ زباله وجود دارد.

راه‌حل
------
برای کلِ اجرای تست، ``MEDIA_ROOT`` به یک پوشه‌ی موقت منتقل می‌شود و در پایان
پاک می‌شود. ``core/media.py`` مسیر را **هنگامِ فراخوانی** از
``settings.MEDIA_ROOT`` می‌خواند (نه در زمانِ import)، پس امضای URL و سروِ
رسانه در تست دقیقاً همان پوشه‌ی موقت را می‌بیند و چیزی نمی‌شکند.

چرا ``run_tests`` بازنویسی نشده
-------------------------------
چون ``DiscoverRunner.run_tests`` خودِ جنگو ``teardown_test_environment()`` را
داخل یک ``try/finally`` صدا می‌زند؛ یعنی تضمینِ پاک‌سازی حتی در برابر استثنای
پیش‌بینی‌نشده همین‌جا وجود دارد. بازنویسی‌اش فقط ``serialized_aliases``،
``run_checks`` و زمان‌سنج را از دست می‌داد و ریسکِ بی‌دلیل می‌ساخت. پس فقط دو
هوکِ کوچک پوشش داده شده‌اند.

این فایل **هیچ** اثری روی پروداکشن ندارد: فقط وقتی فعال است که
``manage.py test`` اجرا شود.
"""
from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

from django.conf import settings
from django.test.runner import DiscoverRunner


class IsolatedMediaTestRunner(DiscoverRunner):
    """تست‌ها در پوشه‌ی رسانه‌ی موقت اجرا می‌شوند، نه در ریپازیتوری."""

    def setup_test_environment(self, **kwargs) -> None:
        super().setup_test_environment(**kwargs)
        self._tmp_media = Path(tempfile.mkdtemp(prefix="loveos-test-media-"))
        self._real_media = settings.MEDIA_ROOT
        settings.MEDIA_ROOT = str(self._tmp_media)

    def teardown_test_environment(self, **kwargs) -> None:
        # ترتیب مهم است: اول MEDIA_ROOT را به مقدارِ واقعی برگردان، بعد پوشه‌ی
        # موقت را پاک کن. ``getattr`` با پیش‌فرض هم برای این است که اگر setup
        # نیمه‌کاره مانده بود، teardown خودش موجب خطای تازه نشود.
        tmp = getattr(self, "_tmp_media", None)
        settings.MEDIA_ROOT = getattr(self, "_real_media", settings.MEDIA_ROOT)
        if tmp is not None:
            shutil.rmtree(tmp, ignore_errors=True)
            self._tmp_media = None
        super().teardown_test_environment(**kwargs)
