#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# LoveOS — اجرای محیط توسعه (بک‌اند جنگو + فرانت‌اند Vite)
# استفاده: ./scripts/dev.sh
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

echo "💗 LoveOS — راه‌اندازی محیط توسعه"

# ---------------------------------------------------------------- بک‌اند ---
if [ ! -d "$BACKEND/.venv" ]; then
  echo "→ ساخت محیط مجازی پایتون..."
  python3 -m venv "$BACKEND/.venv"
  "$BACKEND/.venv/bin/pip" install --quiet --upgrade pip
  "$BACKEND/.venv/bin/pip" install --quiet -r "$BACKEND/requirements.txt"
fi

if [ ! -f "$BACKEND/.env" ]; then
  echo "→ ساخت فایل .env از روی نمونه..."
  cp "$BACKEND/.env.example" "$BACKEND/.env"
fi

echo "→ اعمال مهاجرت‌ها..."
(cd "$BACKEND" && .venv/bin/python manage.py migrate --noinput)

echo "→ داده‌های اولیه..."
(cd "$BACKEND" && .venv/bin/python manage.py seed_loveos)

# -------------------------------------------------------------- فرانت‌اند --
if [ ! -d "$FRONTEND/node_modules" ]; then
  echo "→ نصب پکیج‌های فرانت‌اند..."
  (cd "$FRONTEND" && npm install)
fi

# ----------------------------------------------------------- اجرای هر دو ---
cleanup() { kill 0 2>/dev/null || true; }
trap cleanup EXIT INT TERM

echo "→ اجرای بک‌اند روی :8000"
(cd "$BACKEND" && .venv/bin/python manage.py runserver 0.0.0.0:8000) &

sleep 2
echo "→ اجرای فرانت‌اند روی :5173"
(cd "$FRONTEND" && npm run dev -- --host 0.0.0.0) &

echo ""
echo "✅ آماده است:"
echo "   اپ دخترم : http://localhost:5173"
echo "   پنل بابا : http://localhost:8000/\$ADMIN_PATH/"
echo ""
wait
