#!/usr/bin/env sh
# LoveOS container entrypoint: migrate, collect static, run the scheduler and Gunicorn.
set -e
cd /app/backend

if [ "$DB_ENGINE" = "mysql" ]; then
  echo "→ waiting for MySQL at ${DB_HOST:-db}:${DB_PORT:-3306}"
  for i in $(seq 1 60); do
    python - <<'PY' && break
import os, socket, sys
s = socket.socket(); s.settimeout(1)
try: s.connect((os.environ.get("DB_HOST","db"), int(os.environ.get("DB_PORT","3306")))); sys.exit(0)
except Exception: sys.exit(1)
PY
    sleep 1
  done
fi

python manage.py migrate --noinput
python manage.py collectstatic --noinput >/dev/null

# The scheduler (manage.py sweep) must run every minute.
( while true; do python manage.py sweep >> /app/backend/sweep.log 2>&1 || true; sleep 60; done ) &

exec gunicorn config.wsgi:application \
  --bind 0.0.0.0:8000 --workers "${WORKERS:-3}" --timeout 90 \
  --access-logfile - --error-logfile -
