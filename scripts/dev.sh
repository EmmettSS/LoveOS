#!/usr/bin/env bash
# =============================================================================
#  LoveOS — development environment
#
#  One script for everything I do on my own machine:
#
#    ./scripts/dev.sh              set up (if needed) and run backend + frontend
#    ./scripts/dev.sh setup        only install dependencies, migrate and seed
#    ./scripts/dev.sh test         run the full test suite (backend + frontend)
#    ./scripts/dev.sh test:be      backend tests only  (Django, 89 tests)
#    ./scripts/dev.sh test:fe      frontend checks only (tsc + oxlint + build + UI tests)
#    ./scripts/dev.sh check        quick health check (django check + tsc + oxlint)
#    ./scripts/dev.sh reset        delete the local SQLite DB and re-seed
#    ./scripts/dev.sh clean        remove .venv, node_modules, dist and caches
#
#  Backend:  http://localhost:8000   (API + Daddy Panel at /$ADMIN_PATH/)
#  Frontend: http://localhost:5173   (Vite dev server; proxies /api to :8000)
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
PY="$BACKEND/.venv/bin/python"
PIP="$BACKEND/.venv/bin/pip"

BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
PYTHON_BIN="${PYTHON_BIN:-python3}"

# ------------------------------------------------------------------ helpers --
say()  { printf '\n\033[1;35m💗 %s\033[0m\n' "$*"; }
step() { printf '\033[1;36m→ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✅ %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m❌ %s\033[0m\n' "$*" >&2; exit 1; }

need() { command -v "$1" >/dev/null 2>&1 || die "'$1' is required but not installed."; }

# ---------------------------------------------------------------- pre-flight --
preflight() {
  need "$PYTHON_BIN"
  need node
  need npm
  local pyv nodev
  pyv="$("$PYTHON_BIN" -c 'import sys; print(f"{sys.version_info[0]}.{sys.version_info[1]}")')"
  nodev="$(node -p 'process.versions.node.split(".")[0]')"
  "$PYTHON_BIN" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' \
    || die "Python 3.10+ is required (found $pyv)."
  [ "$nodev" -ge 20 ] || die "Node.js 20+ is required (found $nodev)."
}

# -------------------------------------------------------------------- setup --
setup_backend() {
  if [ ! -x "$PY" ]; then
    step "Creating Python virtualenv (backend/.venv)"
    "$PYTHON_BIN" -m venv "$BACKEND/.venv"
    "$PIP" install --quiet --upgrade pip
  fi
  step "Installing backend requirements"
  "$PIP" install --quiet -r "$BACKEND/requirements.txt"

  if [ ! -f "$BACKEND/.env" ]; then
    step "Creating backend/.env from .env.example (development defaults)"
    cp "$BACKEND/.env.example" "$BACKEND/.env"
    # Local development: debug on, sqlite, notifications to console only.
    sed -i.bak \
      -e 's/^DEBUG=.*/DEBUG=True/' \
      -e 's/^ALLOWED_HOSTS=.*/ALLOWED_HOSTS=localhost,127.0.0.1,[::1]/' \
      -e 's/^NOTIFY_PROVIDER=.*/NOTIFY_PROVIDER=console/' \
      "$BACKEND/.env" && rm -f "$BACKEND/.env.bak"
  fi

  step "Applying migrations"
  (cd "$BACKEND" && "$PY" manage.py migrate --noinput)

  step "Seeding demo content (passcode 1234 · vault 0000)"
  (cd "$BACKEND" && "$PY" manage.py seed_loveos)
}

setup_frontend() {
  if [ ! -d "$FRONTEND/node_modules" ]; then
    step "Installing frontend packages (npm ci)"
    (cd "$FRONTEND" && npm ci --no-audit --no-fund)
  fi
}

do_setup() {
  say "LoveOS — setting up the development environment"
  preflight
  setup_backend
  setup_frontend
  ok "Setup complete."
}

# --------------------------------------------------------------------- run ---
do_run() {
  do_setup
  say "Starting LoveOS in development mode"

  local admin_path
  admin_path="$(grep -E '^ADMIN_PATH=' "$BACKEND/.env" | cut -d= -f2- | tr -d '[:space:]/')"
  admin_path="${admin_path:-daddy-panel-9x7k}"

  cleanup() { echo; step "Shutting down"; kill 0 2>/dev/null || true; }
  trap cleanup EXIT INT TERM

  step "Backend  → http://localhost:${BACKEND_PORT}"
  (cd "$BACKEND" && "$PY" manage.py runserver "0.0.0.0:${BACKEND_PORT}") &
  sleep 2

  step "Frontend → http://localhost:${FRONTEND_PORT}"
  (cd "$FRONTEND" && npm run dev -- --host 0.0.0.0 --port "$FRONTEND_PORT") &

  cat <<EOF

  ┌─────────────────────────────────────────────────────────┐
  │  Her app      : http://localhost:${FRONTEND_PORT}                    │
  │  Daddy Panel  : http://localhost:${BACKEND_PORT}/${admin_path}/   │
  │  Passcode     : 1234      Vault: 0000                   │
  │  Stop         : Ctrl+C                                  │
  └─────────────────────────────────────────────────────────┘
EOF
  wait
}

# -------------------------------------------------------------------- tests --
test_backend() {
  say "Backend tests"
  [ -x "$PY" ] || setup_backend
  (cd "$BACKEND" && "$PY" manage.py check && "$PY" manage.py test --noinput)
}

test_frontend() {
  say "Frontend checks"
  setup_frontend
  (cd "$FRONTEND" \
    && step "TypeScript"  && npx tsc -b \
    && step "Lint (oxlint)" && npx oxlint src \
    && step "Production build" && npm run build \
    && step "UI tests (jsdom)" && npm run test:ui)
}

do_check() {
  say "Quick health check"
  [ -x "$PY" ] || setup_backend
  setup_frontend
  (cd "$BACKEND" && "$PY" manage.py check)
  (cd "$BACKEND" && "$PY" manage.py makemigrations --check --dry-run)
  (cd "$FRONTEND" && npx tsc -b && npx oxlint src)
  ok "Everything looks healthy."
}

# -------------------------------------------------------------- reset/clean --
do_reset() {
  say "Resetting the local database"
  local db
  db="$(grep -E '^DB_NAME=' "$BACKEND/.env" 2>/dev/null | cut -d= -f2- | tr -d '[:space:]')"
  db="${db:-loveos.sqlite3}"
  rm -f "$BACKEND/$db"
  (cd "$BACKEND" && "$PY" manage.py migrate --noinput && "$PY" manage.py seed_loveos)
  ok "Fresh database seeded."
}

do_clean() {
  say "Cleaning generated files"
  rm -rf "$BACKEND/.venv" "$BACKEND/staticfiles" \
         "$FRONTEND/node_modules" "$FRONTEND/dist" "$FRONTEND/tests/.build"
  find "$ROOT" -type d -name __pycache__ -prune -exec rm -rf {} + 2>/dev/null || true
  ok "Clean."
}

# -------------------------------------------------------------------- main ---
case "${1:-run}" in
  run)      do_run ;;
  setup)    do_setup ;;
  test)     test_backend; test_frontend; ok "All tests passed." ;;
  test:be)  test_backend ;;
  test:fe)  test_frontend ;;
  check)    do_check ;;
  reset)    do_reset ;;
  clean)    do_clean ;;
  -h|--help|help) sed -n '2,20p' "$0" ;;
  *) die "Unknown command: $1 (try: run, setup, test, test:be, test:fe, check, reset, clean)" ;;
esac
