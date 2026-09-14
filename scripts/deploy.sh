#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# LoveOS — استقرار روی سرور (Ubuntu + Nginx + Gunicorn + MySQL)
# استفاده: sudo ./scripts/deploy.sh
# پیش‌فرض مسیر نصب: /srv/loveos
# ---------------------------------------------------------------------------
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/loveos}"
DOMAIN="${DOMAIN:-loveos.example.com}"
SERVICE="loveos"

echo "💗 LoveOS — استقرار روی $DOMAIN"

cd "$APP_DIR"

# ------------------------------------------------------------- کد و نصب ---
git pull --ff-only || true
[ -d backend/.venv ] || python3 -m venv backend/.venv
backend/.venv/bin/pip install --quiet --upgrade pip
backend/.venv/bin/pip install --quiet -r backend/requirements.txt gunicorn

(cd frontend && npm ci && npm run build)

(cd backend && .venv/bin/python manage.py migrate --noinput)
(cd backend && .venv/bin/python manage.py collectstatic --noinput)

# ------------------------------------------------------- سرویس Gunicorn ---
cat >/etc/systemd/system/${SERVICE}.service <<EOF
[Unit]
Description=LoveOS backend
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=${APP_DIR}/backend
EnvironmentFile=${APP_DIR}/backend/.env
ExecStart=${APP_DIR}/backend/.venv/bin/gunicorn config.wsgi:application \\
    --bind 127.0.0.1:8001 --workers 3 --timeout 60
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# ------------------------------------------------------------- کرون جاب ---
CRON_LINE="* * * * * cd ${APP_DIR}/backend && .venv/bin/python manage.py sweep >/dev/null 2>&1"
( crontab -l 2>/dev/null | grep -v "manage.py sweep" ; echo "$CRON_LINE" ) | crontab -

# ----------------------------------------------------------------- Nginx --
cat >/etc/nginx/sites-available/${SERVICE} <<EOF
server {
    listen 80;
    server_name ${DOMAIN};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${DOMAIN};

    ssl_certificate     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;

    # این دنیای کوچک نباید ایندکس شود
    add_header X-Robots-Tag "noindex, nofollow, noarchive" always;
    client_max_body_size 60M;

    # فرانت‌اند (PWA)
    root ${APP_DIR}/frontend/dist;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/            { proxy_pass http://127.0.0.1:8001; include proxy_params; }
    location /daddy-panel-9x7k/ { proxy_pass http://127.0.0.1:8001; include proxy_params; }
    location /healthz         { proxy_pass http://127.0.0.1:8001; include proxy_params; }
    location /robots.txt      { proxy_pass http://127.0.0.1:8001; include proxy_params; }

    location /static/ { alias ${APP_DIR}/backend/staticfiles/; expires 30d; }
    location /media/  { alias ${APP_DIR}/backend/media/;       expires 7d; }

    # سرویس‌ورکر نباید کش شود
    location = /sw.js { add_header Cache-Control "no-cache"; try_files \$uri =404; }
}
EOF

ln -sf /etc/nginx/sites-available/${SERVICE} /etc/nginx/sites-enabled/${SERVICE}
nginx -t

systemctl daemon-reload
systemctl enable --now ${SERVICE}
systemctl restart ${SERVICE}
systemctl reload nginx

echo ""
echo "✅ LoveOS بالا اومد."
echo "   اپ دخترم : https://${DOMAIN}"
echo "   پنل بابا : https://${DOMAIN}/daddy-panel-9x7k/"
echo ""
echo "یادت نره وب‌هوک سروش رو ست کنی:"
echo "  curl \"https://api.splus.ir/bot<TOKEN>/setWebhook?url=https://${DOMAIN}/api/soroush/webhook/<SECRET>/\""
