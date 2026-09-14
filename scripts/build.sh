#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# LoveOS — ساخت نسخه‌ی پروداکشن
# فرانت‌اند در frontend/dist و فایل‌های استاتیک جنگو در backend/staticfiles
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "💗 LoveOS — ساخت نسخه‌ی نهایی"

echo "→ build فرانت‌اند..."
(cd "$ROOT/frontend" && npm ci && npm run build)

echo "→ جمع‌آوری استاتیک جنگو..."
(cd "$ROOT/backend" && .venv/bin/python manage.py collectstatic --noinput)

echo "→ بررسی سلامت پروژه..."
(cd "$ROOT/backend" && .venv/bin/python manage.py check --deploy || true)

echo ""
echo "✅ آماده‌ی انتشار:"
echo "   frontend/dist          → روی Nginx سرو شود"
echo "   backend/staticfiles    → /static/"
echo "   backend/media          → /media/"
