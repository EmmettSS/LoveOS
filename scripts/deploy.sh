#!/usr/bin/env bash
# =============================================================================
#  LoveOS — production deployment
#
#  One script for every hosting target. The TARGET decides what it does:
#
#    ./scripts/deploy.sh build                Build the release artefacts only
#                                             (frontend/dist + backend/staticfiles)
#    ./scripts/deploy.sh vps                  Ubuntu/Debian VPS: Nginx + Gunicorn
#                                             + systemd + cron   (run as root)
#    ./scripts/deploy.sh cpanel               cPanel / Passenger: migrate,
#                                             collectstatic, restart Passenger
#    ./scripts/deploy.sh docker               Build & start the docker-compose
#                                             stack in deploy/docker
#    ./scripts/deploy.sh update               Pull + migrate + rebuild + restart
#                                             (auto-detects vps / cpanel / docker)
#    ./scripts/deploy.sh package              Create loveos-release.tar.gz for
#                                             hosts without git/node (cPanel)
#    ./scripts/deploy.sh backup               Dump the DB and media to backups/
#    ./scripts/deploy.sh verify               Smoke-test a running deployment
#
#  Configuration (environment variables, all optional):
#    APP_DIR      install directory              default: repository root
#    DOMAIN       public domain (vps/verify)     default: from ALLOWED_HOSTS
#    SERVICE      systemd service name (vps)     default: loveos
#    RUN_USER     system user for gunicorn (vps) default: www-data
#    GUNICORN_PORT internal port (vps)           default: 8001
#    WORKERS      gunicorn workers (vps)         default: 3
#    SKIP_FRONTEND=1  do not run npm (frontend/dist already uploaded)
#    SKIP_CERTBOT=1   do not request a Let's Encrypt certificate (vps)
#
#  The real secrets live in backend/.env — this script never writes them.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="${APP_DIR:-$ROOT}"
BACKEND="$APP_DIR/backend"
FRONTEND="$APP_DIR/frontend"
SERVICE="${SERVICE:-loveos}"
RUN_USER="${RUN_USER:-www-data}"
GUNICORN_PORT="${GUNICORN_PORT:-8001}"
WORKERS="${WORKERS:-3}"

say()  { printf '\n\033[1;35m💗 %s\033[0m\n' "$*"; }
step() { printf '\033[1;36m→ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✅ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m⚠  %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m❌ %s\033[0m\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "'$1' is required but not installed."; }

# Read a key from backend/.env (without exporting the whole file).
envget() { { grep -E "^$1=" "$BACKEND/.env" 2>/dev/null || true; } | head -1 | cut -d= -f2- | tr -d '\r' | sed 's/^ *//;s/ *$//'; }

# Python interpreter: cPanel virtualenv, backend/.venv, or system python.
find_python() {
  if [ -n "${PYTHON_BIN:-}" ]; then echo "$PYTHON_BIN"; return; fi
  if [ -x "$BACKEND/.venv/bin/python" ]; then echo "$BACKEND/.venv/bin/python"; return; fi
  if [ -n "${VIRTUAL_ENV:-}" ] && [ -x "$VIRTUAL_ENV/bin/python" ]; then echo "$VIRTUAL_ENV/bin/python"; return; fi
  echo "python3"
}

require_env() {
  [ -f "$BACKEND/.env" ] || die "backend/.env not found. Copy backend/.env.example and fill it in first."
  [ "$(envget DEBUG | tr '[:upper:]' '[:lower:]')" = "false" ] || warn "DEBUG is not False in backend/.env — never run production with DEBUG=True."
  case "$(envget DJANGO_SECRET_KEY)" in
    ""|replace-with*|dev-only*) die "DJANGO_SECRET_KEY in backend/.env is not a real secret." ;;
  esac
  [ -n "$(envget ALLOWED_HOSTS)" ] || die "ALLOWED_HOSTS is empty in backend/.env."
}

detect_domain() {
  if [ -n "${DOMAIN:-}" ]; then echo "$DOMAIN"; return; fi
  envget ALLOWED_HOSTS | cut -d, -f1 || true
}

# ------------------------------------------------------------------- build ---
build_frontend() {
  if [ "${SKIP_FRONTEND:-0}" = "1" ]; then
    [ -f "$FRONTEND/dist/index.html" ] || die "SKIP_FRONTEND=1 but frontend/dist/index.html is missing."
    step "Skipping frontend build (using existing frontend/dist)"
    return
  fi
  need npm
  step "Building frontend (npm ci && npm run build)"
  (cd "$FRONTEND" && npm ci --no-audit --no-fund && npm run build)
}

install_backend() {
  local py; py="$(find_python)"
  if [ "$py" = "python3" ] && [ ! -x "$BACKEND/.venv/bin/python" ]; then
    step "Creating virtualenv backend/.venv"
    python3 -m venv "$BACKEND/.venv"
    py="$BACKEND/.venv/bin/python"
  fi
  step "Installing backend requirements ($py)"
  "$py" -m pip install --quiet --upgrade pip
  "$py" -m pip install --quiet -r "$BACKEND/requirements.txt"
  if [ "$(envget DB_ENGINE)" = "mysql" ]; then
    "$py" -c 'import MySQLdb' 2>/dev/null || {
      step "Installing MySQL driver"
      "$py" -m pip install --quiet mysqlclient 2>/dev/null \
        || { warn "mysqlclient failed to compile, falling back to pymysql"; "$py" -m pip install --quiet pymysql; }
    }
  fi
}

migrate_and_static() {
  local py; py="$(find_python)"
  step "Applying migrations"
  (cd "$BACKEND" && "$py" manage.py migrate --noinput)
  step "Collecting static files"
  (cd "$BACKEND" && "$py" manage.py collectstatic --noinput --clear >/dev/null)
  step "Django deployment check"
  (cd "$BACKEND" && "$py" manage.py check --deploy) || warn "check --deploy reported warnings (see above)."
}

do_build() {
  say "LoveOS — building release artefacts"
  build_frontend
  install_backend
  local py; py="$(find_python)"
  (cd "$BACKEND" && "$py" manage.py collectstatic --noinput --clear >/dev/null)
  ok "frontend/dist and backend/staticfiles are ready."
}

# --------------------------------------------------------------------- vps ---
do_vps() {
  say "LoveOS — VPS deployment (Nginx + Gunicorn + systemd)"
  [ "$(id -u)" -eq 0 ] || die "Run as root: sudo ./scripts/deploy.sh vps"
  need nginx; need systemctl
  require_env
  local domain; domain="$(detect_domain)"
  [ -n "$domain" ] || die "Set DOMAIN=... or ALLOWED_HOSTS in backend/.env"

  build_frontend
  install_backend
  local py; py="$(find_python)"
  "$py" -m pip install --quiet gunicorn
  migrate_and_static

  step "Writing systemd unit /etc/systemd/system/${SERVICE}.service"
  sed -e "s|__APP_DIR__|$APP_DIR|g" -e "s|__USER__|$RUN_USER|g" \
      -e "s|__PORT__|$GUNICORN_PORT|g" -e "s|__WORKERS__|$WORKERS|g" \
      "$ROOT/deploy/vps/loveos.service" > "/etc/systemd/system/${SERVICE}.service"

  step "Writing Nginx site /etc/nginx/sites-available/${SERVICE}"
  sed -e "s|__APP_DIR__|$APP_DIR|g" -e "s|__DOMAIN__|$domain|g" \
      -e "s|__PORT__|$GUNICORN_PORT|g" -e "s|__ADMIN_PATH__|$(envget ADMIN_PATH)|g" \
      "$ROOT/deploy/vps/nginx.conf" > "/etc/nginx/sites-available/${SERVICE}"
  ln -sf "/etc/nginx/sites-available/${SERVICE}" "/etc/nginx/sites-enabled/${SERVICE}"

  step "Installing cron job (sweep every minute)"
  mkdir -p "$APP_DIR/logs"
  local cron_line="* * * * * cd $BACKEND && $py manage.py sweep >> $APP_DIR/logs/sweep.log 2>&1"
  ( crontab -u "$RUN_USER" -l 2>/dev/null | grep -v 'manage.py sweep' ; echo "$cron_line" ) | crontab -u "$RUN_USER" -

  step "Fixing ownership"
  chown -R "$RUN_USER:$RUN_USER" "$APP_DIR"
  chmod 600 "$BACKEND/.env"

  if [ "${SKIP_CERTBOT:-0}" != "1" ] && [ ! -f "/etc/letsencrypt/live/$domain/fullchain.pem" ]; then
    if command -v certbot >/dev/null 2>&1; then
      step "Requesting Let's Encrypt certificate for $domain"
      certbot certonly --nginx -d "$domain" --non-interactive --agree-tos --register-unsafely-without-email \
        || warn "certbot failed — install the certificate manually, then reload nginx."
    else
      warn "certbot not installed: apt install certbot python3-certbot-nginx, then re-run. (SKIP_CERTBOT=1 to silence)"
    fi
  fi

  nginx -t
  systemctl daemon-reload
  systemctl enable --now "$SERVICE"
  systemctl restart "$SERVICE"
  systemctl reload nginx

  ok "LoveOS is live."
  echo "   Her app     : https://$domain"
  echo "   Daddy Panel : https://$domain/$(envget ADMIN_PATH)/"
  echo "   Logs        : journalctl -u $SERVICE -f"
}

# ------------------------------------------------------------------ cpanel ---
do_cpanel() {
  say "LoveOS — cPanel / Passenger deployment"
  require_env
  [ "$(envget SERVE_FRONTEND | tr '[:upper:]' '[:lower:]')" = "true" ] \
    || die "cPanel needs SERVE_FRONTEND=True in backend/.env (Django serves the built frontend)."
  [ -f "$FRONTEND/dist/index.html" ] \
    || die "frontend/dist is missing. Build it on your own machine (npm run build) and upload it, or run: ./scripts/deploy.sh package"

  install_backend
  migrate_and_static

  step "Restarting Passenger (touch tmp/restart.txt)"
  mkdir -p "$APP_DIR/tmp" && touch "$APP_DIR/tmp/restart.txt"

  ok "Done. If the site does not update, press Restart in cPanel → Setup Python App."
  echo "   Cron (add in cPanel → Cron Jobs, every minute):"
  echo "   * * * * * $(find_python) $BACKEND/manage.py sweep >> $APP_DIR/logs/sweep.log 2>&1"
}

# ------------------------------------------------------------------ docker ---
do_docker() {
  say "LoveOS — Docker deployment"
  need docker
  require_env
  local compose="docker compose"
  docker compose version >/dev/null 2>&1 || { need docker-compose; compose="docker-compose"; }
  (cd "$ROOT/deploy/docker" && $compose build && $compose up -d && $compose exec -T web python manage.py migrate --noinput)
  ok "Containers are up. Logs: cd deploy/docker && $compose logs -f"
}

# ----------------------------------------------------------------- package ---
do_package() {
  say "LoveOS — creating release package"
  build_frontend
  local out="$ROOT/loveos-release.tar.gz"
  step "Packing backend/, frontend/dist/, passenger_wsgi.py, scripts/, deploy/"
  tar -czf "$out" -C "$ROOT" \
    --exclude='backend/.venv' --exclude='backend/.env' --exclude='backend/*.sqlite3' \
    --exclude='backend/staticfiles' --exclude='backend/media/*' --exclude='__pycache__' \
    backend frontend/dist passenger_wsgi.py scripts deploy
  ok "$out"
  echo "   Upload and extract it OUTSIDE public_html, then create backend/.env and run: ./scripts/deploy.sh cpanel"
}

# ------------------------------------------------------------------ update ---
do_update() {
  say "LoveOS — updating an existing deployment"
  if command -v git >/dev/null 2>&1 && [ -d "$APP_DIR/.git" ]; then
    step "git pull --ff-only"
    (cd "$APP_DIR" && git pull --ff-only)
  fi
  if [ -f "$ROOT/deploy/docker/.deployed" ]; then do_docker; return; fi
  if [ -f "$APP_DIR/passenger_wsgi.py" ] && [ -d "$HOME/virtualenv" ]; then do_cpanel; return; fi
  if systemctl list-units --type=service 2>/dev/null | grep -q "$SERVICE"; then
    build_frontend; install_backend; migrate_and_static
    systemctl restart "$SERVICE"; ok "Service restarted."; return
  fi
  do_build
  warn "Could not detect the hosting type; artefacts were rebuilt. Restart your app server manually."
}

# ------------------------------------------------------------------ backup ---
do_backup() {
  say "LoveOS — backup"
  local stamp dir; stamp="$(date +%Y%m%d-%H%M%S)"; dir="$APP_DIR/backups/$stamp"
  mkdir -p "$dir"
  if [ "$(envget DB_ENGINE)" = "mysql" ]; then
    need mysqldump
    step "Dumping MySQL database $(envget DB_NAME)"
    MYSQL_PWD="$(envget DB_PASSWORD)" mysqldump -h "${DB_HOST:-$(envget DB_HOST)}" -u "$(envget DB_USER)" \
      --single-transaction --default-character-set=utf8mb4 "$(envget DB_NAME)" | gzip > "$dir/db.sql.gz"
  else
    local db; db="$(envget DB_NAME)"; db="${db:-loveos.sqlite3}"
    step "Copying SQLite database $db"
    cp "$BACKEND/$db" "$dir/db.sqlite3"
  fi
  step "Archiving media/"
  tar -czf "$dir/media.tar.gz" -C "$BACKEND" media
  cp "$BACKEND/.env" "$dir/env.backup" && chmod 600 "$dir/env.backup"
  ok "Backup written to $dir"
}

# ------------------------------------------------------------------ verify ---
do_verify() {
  say "LoveOS — smoke test"
  need curl
  local domain base; domain="$(detect_domain)"; base="${BASE_URL:-https://$domain}"
  local admin; admin="$(envget ADMIN_PATH)"; admin="${admin:-daddy-panel-9x7k}"
  local fail=0
  check() {
    local code; code="$(curl -sk -o /dev/null -w '%{http_code}' "$base$1")"
    if [[ "|$2|" == *"|$code|"* ]]; then ok "$1 → $code"; else warn "$1 → $code (expected $2)"; fail=1; fi
  }
  check "/healthz" 200
  check "/api/boot" 200
  check "/" 200
  check "/robots.txt" 200
  check "/$admin/" "200|302"
  check "/api/me" 401
  [ "$fail" -eq 0 ] && ok "Deployment looks healthy." || die "Some checks failed."
}

# -------------------------------------------------------------------- main ---
case "${1:-}" in
  build)   do_build ;;
  vps)     do_vps ;;
  cpanel)  do_cpanel ;;
  docker)  do_docker; touch "$ROOT/deploy/docker/.deployed" ;;
  update)  do_update ;;
  package) do_package ;;
  backup)  do_backup ;;
  verify)  do_verify ;;
  -h|--help|help|"") sed -n '2,33p' "$0" ;;
  *) die "Unknown target: $1" ;;
esac
