# LoveOS — Complete Documentation

> A tiny operating system that runs in the browser. I built it for my daughter, so that
> the distance between us feels a little shorter every day.
>
> This is the single reference for the whole project: what it is, how it is built, how I run it
> on my own machine, how I put it on a server, and how I keep it alive.
> The Persian version of this document is [`DOCUMENTATION_FA.md`](./DOCUMENTATION_FA.md).

---

## Table of contents

1. [What LoveOS is](#1-what-loveos-is)
2. [Architecture](#2-architecture)
3. [Project layout](#3-project-layout)
4. [Development environment](#4-development-environment)
5. [Configuration (`backend/.env`)](#5-configuration-backendenv)
6. [The apps](#6-the-apps)
7. [The Daddy Panel](#7-the-daddy-panel)
8. [Soroush bot integration](#8-soroush-bot-integration)
9. [API reference](#9-api-reference)
10. [Deployment](#10-deployment)
    - [10.1 Before any deployment](#101-before-any-deployment)
    - [10.2 VPS — Ubuntu/Debian with Nginx + Gunicorn](#102-vps--ubuntudebian-with-nginx--gunicorn)
    - [10.3 cPanel shared hosting (Passenger)](#103-cpanel-shared-hosting-passenger)
    - [10.4 Docker / docker compose](#104-docker--docker-compose)
    - [10.5 DirectAdmin / Plesk and other panels](#105-directadmin--plesk-and-other-panels)
    - [10.6 PaaS (Railway, Render, Fly.io, Liara, …)](#106-paas-railway-render-flyio-liara-)
    - [10.7 Split hosting: frontend on a static host, backend elsewhere](#107-split-hosting-frontend-on-a-static-host-backend-elsewhere)
    - [10.8 After going live: webhook, cron, QR](#108-after-going-live-webhook-cron-qr)
    - [10.9 Updating a running deployment](#109-updating-a-running-deployment)
11. [Scripts](#11-scripts)
12. [Tests](#12-tests)
13. [Maintenance, backups and troubleshooting](#13-maintenance-backups-and-troubleshooting)
14. [Security model](#14-security-model)

---

## 1. What LoveOS is

LoveOS is a **Progressive Web App that behaves like a miniature operating system**. It boots, asks
for a passcode, shows a desktop with widgets and a dock, and opens 30 small apps in windows — each
one a different way of saying *I love you* across a long distance.

It is a private, single-user system. There is exactly one "user" (my daughter) and one
administrator (me). Everything she sees — every message, voice note, letter, quiz question,
terminal reply — I write in an admin panel; nothing is hard-coded.

The principles I held myself to:

| Principle | What it means in practice |
|---|---|
| **Nothing is hard-coded** | All content lives in the Django admin (the "Daddy Panel"). All UI strings live in `frontend/public/locales/{fa,en}/translation.json`. All configuration lives in `backend/.env`. |
| **Secret by construction** | The app lives on an unlisted domain reached by a QR code. `robots.txt` blocks everything, every response carries `X-Robots-Tag: noindex`, and the panel sits behind a secret path plus its own passcode gate. |
| **Mobile-first, desktop-nice** | Designed for a phone in her hand; on a wide screen the same apps become draggable floating windows. |
| **Two languages** | Persian (RTL) is the default; English is one tap away. |
| **Offline-friendly** | A service worker precaches the shell, fonts and icons, so the OS opens even on a bad connection. |
| **One truth for location** | Every app that needs "where is she" reads the same helper; her live device location always beats the value stored in the panel. |
| **Gentle by default** | Sounds are synthesized (no copyrighted assets), animations respect `prefers-reduced-motion`, and the health app carries a medical disclaimer. |

### Her journey

```
QR code  →  secret domain
              │
              ▼
        ┌──────────┐   typing boot lines, a soft melody, my welcome message
        │   BOOT   │
        └────┬─────┘
             ▼
        ┌──────────┐   "Today marks N days of Daddy loving you."
        │   LOCK   │   passcode · security question · after 5 fails: "Ask Daddy"
        └────┬─────┘
             ▼
        ┌──────────┐   clock · next-meeting countdown · next call · both cities' weather
        │ DESKTOP  │   29 app icons · dock · start menu · Ctrl/⌘+K global search
        └──────────┘
```

---

## 2. Architecture

### Stack

| Layer | Technology | Why |
|---|---|---|
| Backend | Python 3.10+, **Django 5.2**, Django REST Framework | Batteries included: ORM, admin panel, migrations, sessions. The admin *is* my content management system. |
| Database | **SQLite** in development, **MySQL 8 (utf8mb4)** in production | Zero-setup locally; MySQL is what shared hosts offer. |
| Frontend | **React 19**, TypeScript, **Vite 8**, Tailwind CSS, Zustand, framer-motion, i18next, MapLibre GL, three.js, Howler | A fast SPA with a real window manager, animations, maps and a star sky. |
| PWA | `vite-plugin-pwa` (Workbox) | Installable on her phone; shell works offline. |
| Notifications to me | **Soroush Plus bot API** | The channel through which the app talks to me. |
| Scheduler | `manage.py sweep` from cron (every minute) | Timed letters, future memories, medication reminders, call reminders, Soroush queue. |

### Request flow

```
                       ┌────────────────────────────────────────────┐
  her phone ──HTTPS──► │  reverse proxy (Nginx / Passenger / Caddy) │
                       └───────┬─────────────────────┬──────────────┘
                               │ /api, /panel        │ /, /assets (built SPA)
                               ▼                     ▼
                        Django + DRF          frontend/dist (static)
                               │                     ▲
                               ▼                     │ (or Django serves it
                          MySQL / SQLite               when SERVE_FRONTEND=True)
                               │
                               ▼
                   SoroushOutbox ──► sweep ──► api.splus.ir ──► my phone
```

Two ways to serve the frontend, chosen with one switch in `.env`:

| `SERVE_FRONTEND` | Who serves `frontend/dist` | Use it on |
|---|---|---|
| `False` (default) | Nginx / Caddy / a static host | VPS, Docker with a proxy, split hosting |
| `True` | Django itself (`core/spa.py`) | cPanel/Passenger, PaaS with a single process, anywhere with only one entry point |

### Authentication model

* **Her session** — `POST /api/auth/unlock` with the passcode returns a 32-character token
  (`DeviceSession`) that lives `SESSION_TTL_HOURS` (default 720 h = 30 days). Every private
  route requires `Authorization: Token <token>` and is wrapped by `@require_session`.
* **Failed attempts** — each attempt is stored (`UnlockAttempt`); after `MAX_UNLOCK_ATTEMPTS`
  the "Ask Daddy" button appears and I get a Soroush message immediately.
* **Second ways in** — the security question (`/api/auth/forgot`) and the help route
  (`/api/auth/help`).
* **The vault** — a separate passcode with a short timer (`VAULT_SESSION_MINUTES`, default 20).
* **Me** — Django admin login, behind a secret URL (`ADMIN_PATH`) and an optional extra passcode
  gate (`ADMIN_GATE_PASSCODE`, enforced by `core.middleware.AdminGateMiddleware`).

### Private media

Uploaded files (voices, songs, photos) are **never** served from a public `/media/` URL. The API
returns short-lived signed URLs (`/api/media/<path>?sig=…`, `core/media.py`) and the reverse-proxy
configs deliberately contain no `/media/` alias.

### Effective location

`core.services.effective_daughter_location(cfg)` is the single source of truth for "where is she":

1. Her device's live position, if it is fresher than `location_ttl_minutes` and live tracking is on.
2. Otherwise the city/coordinates stored in the panel.

Map, weather, distance, time difference and desktop widgets all read this. When a meaningful move
is detected (> `location_sync_km` or a city/timezone change) the panel value is synced
automatically and I get a Soroush note.

### The window manager

Three rules that make windows feel right on both phone and desktop:

1. **Geometry is decided once** — a window takes a cascade slot on open and never moves because of a
   click or focus.
2. **Stacking lives on the outer wrapper** — `z-index` on the wrapper, not the animated box.
3. **A fading window cannot be clicked** — `pointer-events: none` once the exit animation starts.

On a phone every app is a full-height sheet; on desktop it is a draggable, resizable window that
remembers its size and position.

---

## 3. Project layout

```
LoveOS/
├── backend/                      Django 5 + DRF
│   ├── config/                   settings.py (reads .env), urls.py, wsgi.py
│   ├── core/                     sessions, notifications, Soroush outbox, achievements,
│   │                             easter eggs, global search, signed media, SPA serving,
│   │                             admin gate, management commands (seed_loveos, sweep)
│   ├── accounts/                 UserConfig (the one profile), device sessions,
│   │                             live location, unlock attempts
│   ├── content/                  voices, songs, memories, letters, countdowns, garden,
│   │                             constellations, cinema, quiz, plans, moods, vault, tutorial
│   ├── social/                   chat, hugs, notifications, reminders, weather, map, terminal
│   ├── health/                   cycle & care, medication, gentle reminders
│   ├── library/                  "Our Story" book (co-writing)
│   ├── games/                    heart puzzle
│   ├── calls/  gifts/  reading/  dreamhome/  language/     the five "being together" apps
│   ├── media/                    uploads (only two seed images are tracked in git)
│   ├── templates/admin_gate.html the panel passcode gate
│   ├── requirements.txt
│   └── .env.example              every configuration key, documented
├── frontend/                     React 19 + Vite 8 + TypeScript + Tailwind
│   ├── src/os/                   Boot, Lock, Desktop, Window, Dock, StartMenu,
│   │                             NotificationCenter, GlobalSearch, EggOverlay, appRegistry
│   ├── src/apps/                 30 apps, one file each
│   ├── src/shared/               api, store, i18n, ui, sound, geo, recorder, prefs, …
│   ├── public/locales/{fa,en}/   every UI string
│   ├── tests/                    browser-less UI tests (jsdom) + run.mjs
│   └── vite.config.ts            dev proxy + PWA
├── deploy/
│   ├── vps/                      nginx.conf + loveos.service templates
│   └── docker/                   Dockerfile, docker-compose.yml, Caddyfile, entrypoint.sh
├── scripts/
│   ├── dev.sh                    everything for my machine (run, setup, test, check, reset, clean)
│   ├── deploy.sh                 everything for servers (build, vps, cpanel, docker, update, package, backup, verify)
│   └── qr.py                     generates the QR code of the secret domain (no dependencies)
├── docs/soroush-api-reference.md the Soroush Plus bot API reference I work from
├── passenger_wsgi.py             entry point for cPanel / Passenger
├── DOCUMENTATION.md              this file
├── DOCUMENTATION_FA.md           the same in Persian
└── README.md
```

---

## 4. Development environment

### Requirements

| Tool | Version |
|---|---|
| Python | 3.10 or newer |
| Node.js | 20 or newer (I use 22) |
| npm | ships with Node |
| git | any recent version |

No database server is needed locally — SQLite is used automatically.

### The one-command way

```bash
git clone https://github.com/EmmettSS/LoveOS.git
cd LoveOS
./scripts/dev.sh
```

That creates `backend/.venv`, installs requirements, writes `backend/.env` with development
defaults, migrates, seeds demo content, installs npm packages and starts both servers:

| What | Where |
|---|---|
| Her app | http://localhost:5173 |
| Daddy Panel | http://localhost:8000/daddy-panel-9x7k/ |
| Passcode / vault | `1234` / `0000` |

`Ctrl+C` stops both. Other sub-commands: `setup`, `test`, `test:be`, `test:fe`, `check`, `reset`,
`clean` — see [§11](#11-scripts).

### The manual way

```bash
# backend
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env               # then set DEBUG=True for local work
.venv/bin/python manage.py migrate
.venv/bin/python manage.py seed_loveos          # --passcode 1234 --vault 0000
.venv/bin/python manage.py createsuperuser      # my panel login
.venv/bin/python manage.py runserver 0.0.0.0:8000

# frontend (second terminal)
cd frontend
npm install
npm run dev                         # http://localhost:5173
```

The Vite dev server proxies `/api`, `/static`, `/healthz` and `/daddy-panel-9x7k` to
`127.0.0.1:8000`, so both processes are needed. If I change `ADMIN_PATH` in `.env` I also change it
in `frontend/vite.config.ts` (`server.proxy`).

### Useful management commands

```bash
.venv/bin/python manage.py seed_loveos        # demo content, idempotent
.venv/bin/python manage.py sweep              # run the scheduler once, by hand
.venv/bin/python manage.py makemigrations     # after changing models
.venv/bin/python manage.py check --deploy     # production readiness
.venv/bin/python manage.py shell              # poke at the data
```

---

## 5. Configuration (`backend/.env`)

Everything is read from `backend/.env` at process start (`python-dotenv`). **Restart Django after
editing it.** The full sample is `backend/.env.example`.

### Core

| Key | Default | Meaning |
|---|---|---|
| `DEBUG` | `True` in code, `False` in the sample | Never `True` in production. |
| `DJANGO_SECRET_KEY` | dev key | Generate: `python -c "from django.core.management.utils import get_random_secret_key as g; print(g())"` |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1,[::1]` | Comma-separated domains. |
| `CSRF_TRUSTED_ORIGINS` | `https://*.e2b.app` | Origins allowed to post to the panel, e.g. `https://love.example.com`. |
| `TIME_ZONE` | `Asia/Tehran` | Server timezone. |
| `CORS_ALLOW_ALL` / `CORS_ALLOWED_ORIGINS` | off / empty | Only needed for split hosting (§10.7). |

### Panel

| Key | Default | Meaning |
|---|---|---|
| `ADMIN_PATH` | `daddy-panel-9x7k` | Secret path of the panel — change it in production. No slashes. |
| `ADMIN_GATE_PASSCODE` | empty (off) | Extra passcode asked before the Django login page. |

### Database

| Key | Meaning |
|---|---|
| `DB_ENGINE` | `sqlite` or `mysql` |
| `DB_NAME` | SQLite file name, or MySQL database name |
| `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT` | MySQL only |

The MySQL connection forces `utf8mb4` — the **database itself must also be created with
`utf8mb4_unicode_ci`** or Persian text and emoji become `????`.

### Soroush (notifications to me)

| Key | Meaning |
|---|---|
| `NOTIFY_PROVIDER` | `console` (log only, dev) · `soroush` (real) · `null` (silent) |
| `SOROUSH_API_BASE` | `https://api.splus.ir` |
| `SOROUSH_TOKEN` | bot token |
| `SOROUSH_DADDY_CHAT_ID` | my chat id |
| `SOROUSH_WEBHOOK_SECRET` | random string that becomes part of the webhook URL |
| `SOROUSH_PARSE_MODE` | `HTML` |
| `SOROUSH_TIMEOUT` | per-request timeout in seconds (default 8) |
| `NOTIFY_ASYNC` | send from a background thread so API calls never wait (default true) |
| `OUTBOX_MAX_RETRY` | retries per queued message (default 5) |

### Sessions and limits

| Key | Default | Meaning |
|---|---|---|
| `SESSION_TTL_HOURS` | `720` | how long her login lives |
| `VAULT_SESSION_MINUTES` | `20` | how long the vault stays open |
| `MAX_UNLOCK_ATTEMPTS` | `5` | wrong tries before "Ask Daddy" |
| `API_RATE_LIMIT` | `300/min` | DRF throttle |

### Serving

| Key | Default | Meaning |
|---|---|---|
| `SERVE_FRONTEND` | `False` | `True` = Django serves `frontend/dist` and `/static/` itself |
| `FRONTEND_DIST` | `../frontend/dist` | absolute path to the built frontend if it lives elsewhere |
| `SECURE_SSL_REDIRECT` | `True` when `DEBUG=False` | set `False` only behind a proxy that already redirects to HTTPS |

---

## 6. The apps

30 apps; 29 have a desktop icon (About opens from the start menu). She can reorder icons by drag
and drop.

### Emotional core

| App | What it does |
|---|---|
| **Map of Us** | A real 3D globe (spinnable, starfield + atmosphere halo) whose resting frame is **all of Iran, from the Caspian Sea to the Persian Gulf**; two heart pins, a glowing arc thread, distance & time difference and a live-location badge. The "fly along the path" button plays a ~20-second, non-skippable cinematic sequence: cinema bars plus a pull-back to the full globe with meteors and an atmosphere-halo bloom, a dive to Daddy's home with an orbit and a meaningful pause, lift-off with a whoosh, a slow flight along the arc with a spark heart leaving a trail of fading hearts, a live kilometre counter and a light comet crawling the thread, a four-wave landing celebration with the final message, then a soft return to the same Iran frame. The thread pulses in sync with a heartbeat (light and sound together) and short bilingual captions run across the map. The sequence caps at zoom 11.6 so secret ⑨ can never be consumed by accident; the framing maths and the whole timeline live in `mapOfUsCinema.ts` and are covered by a jsdom test. |
| **Voice Vault** | Categorised archive of my voice notes, plus a "random voice" button. |
| **Our Music** | Songs with "why this song" and lyrics; she can upload songs too when I allow it. |
| **Memories** | Shared memories; some stay locked until a chosen date (future memories). |
| **Whisper Letters** | Letters typeset in a Nastaliq hand; some open only on a date. |
| **Countdown** | To the next meeting, her birthday, our anniversary. |
| **Weather** | Both cities side by side with a loving line based on the temperature gap. |
| **Heartbeat** | "My heart beats for you" — a synthesized pulse on every tap. |
| **Our Garden** | Water the flowers; each watering opens one bloom. |
| **Star Sky** | Her name written in constellations (letters on one line, ❤ and ♾ on a second, larger line) over a cinematic canvas sky: twinkling stars, shooting stars, Milky Way, crescent moon, mouse parallax. On phones it becomes a full-screen "cinema": the sky rotates 90° so she holds the phone sideways (no rotation if the browser is already landscape); a floating ✕ closes it. |
| **Chat with Daddy** | Direct messages, short and affectionate. |
| **My Mood** | Log today's mood and receive a matching message from me. |
| **Our Quiz** | Quizzes I write about our memories, with rewards. |
| **Our Wishes** | Shared wish list with categories and a "done" tick. |
| **Our Cinema** | Watch list with "watched / want to watch". |
| **The Vault** | Private treasures behind a separate passcode. |
| **Hug** | Instant hugs, back and forth; every hug tells me on Soroush. |

### Care & everyday

| App | What it does |
|---|---|
| **Cycle & Care** | Period, symptoms and medication logging with gentle wording and clear medical boundaries. |
| **Our Library** | "Our Story" written together, chapter by chapter, with comments on every paragraph; exportable as a PDF. |
| **Heart Puzzle** | Picture puzzle in easy/medium/hard with a custom ending line. |
| **Settings** | Language, theme (auto/day/night), sound, font scale, live location, PWA install guide. |
| **Tutorial** | "What an operating system is" lessons, written by me in the panel. |
| **Terminal** | `help`, `love`, `whoami`, `sudo make sandwich` … with playful answers I define. |
| **Badges** | 32 achievements unlocked by real activity. |
| **About LoveOS** | The story of the project and my closing words. |

### Being together

| App | What it does |
|---|---|
| **Call Sync** | We publish our weekly free windows; the system finds the overlap. Propose, approve, decline or reschedule calls, then log each call with duration, moods and a note. |
| **Gift Book** | Every gift: occasion, price band, photo and "the reaction in that moment", plus yearly stats. |
| **Read Together** | A shared shelf. Per chapter: notes with a star rating, quotes and a conversation thread. Progress tracked for both of us. |
| **Dream Home** | Checklist with importance levels, a room layout (tap = edit, press-and-hold or grab the selected room = move), an inspiration gallery with comments. |
| **Language Bridge** | Our four-language dictionary (Mazandarani, Turkish, Persian, English), flashcards with a streak, pronunciation recording, quizzes from my panel. |

### System pieces

| Part | What it does |
|---|---|
| **Global search** (`Ctrl/⌘+K`) | Searches 21 sources with Persian-tolerant matching (`ي/ك`, diacritics, ZWNJ normalised; fuzzy fallback), filters by app/date/kind, cached 45 s. |
| **Notification centre** | Every in-app notification for her, with an unread badge. |
| **Easter eggs** | 15 secrets (midnight sky, Konami code, `rm -rf tanhayi`, five clicks on the logo, …). |
| **Error boundary** | If one app breaks, only that window shows a gentle "try again". |

---

## 7. The Daddy Panel

```
https://<domain>/<ADMIN_PATH>/
```

Standard Django admin, in Persian, with Jalali dates. If `ADMIN_GATE_PASSCODE` is set I first see a
plain passcode page, then the normal login.

| Section | What I change there |
|---|---|
| **UserConfig** | Names and nicknames, boot/lock messages, security question, default theme and language, font scale, backgrounds, birthday and anniversary, both cities and coordinates, live-location settings, global-search settings, today's desktop message. |
| **LiveLocation** | Her latest live position, accuracy, age — for manual correction. |
| **Content** | Voices, songs, memories, letters, countdowns, garden, constellations, cinema, quiz, wishes, moods, vault, tutorial, terminal commands. |
| **Social** | Chat, hugs, reminders, notifications. |
| **Health** | Medications, care reminders, mood messages. |
| **Library / Games** | Books, chapters, paragraphs, puzzles. |
| **Calls / Gifts / Reading / Dream Home / Language** | Everything the five "together" apps show. |
| **Achievements & secrets** | 32 badges with thresholds and secret messages, 15 easter eggs. |
| **SoroushOutbox** | Every message to me with status, tries, error, and a retry action. |
| **ActivityLog** | Everything that happened, filterable, plus "clear app cache". |

Everyday recipes:

| I want to… | I do this |
|---|---|
| add a voice note | Content → Voices → Add → file + category + title |
| lock a memory until a date | Memories → "future memory" + unlock time; `sweep` opens it |
| remind her about medication | Health → Medication → times; `sweep` sends it |
| change today's desktop message | UserConfig → today's message |
| see what she did today | ActivityLog, filter by app |

---

## 8. Soroush bot integration

Soroush Plus is the only channel from the app **to me**. Nothing is ever pushed to her through it;
her notifications live inside the app.

```ini
NOTIFY_PROVIDER=soroush
SOROUSH_TOKEN=<bot token>
SOROUSH_DADDY_CHAT_ID=<my chat id>
SOROUSH_WEBHOOK_SECRET=<random string>
```

* Every message is written to `SoroushOutbox` first and **then** sent (`core/soroush.py`), so a
  broken token never loses anything; `sweep` retries the queue.
* Incoming webhook: `POST /api/soroush/webhook/<SOROUSH_WEBHOOK_SECRET>/` — register it once
  after going live (§10.8).
* Events I receive: login, lock help, chat, hugs, voice played, song uploaded, letter opened,
  memory unlocked, mood, easter egg, quiz perfect, puzzle, achievement, medication taken/skipped,
  symptoms, period start/end, reminders, book/chapter/comment, cinema, wishes, every call event,
  gifts, reading notes/quotes/comments, dream-home changes, language entries/quizzes, location
  changes.

The bot API reference I work from is in [`docs/soroush-api-reference.md`](./docs/soroush-api-reference.md).

---

## 9. API reference

All private routes require `Authorization: Token <token>`; responses are JSON.

### Shell & auth

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/boot` | public boot/lock config (no secrets) |
| POST | `/api/auth/unlock` | `{passcode}` → `{token, …}` |
| POST | `/api/auth/forgot` | answer the security question |
| POST | `/api/auth/help` | "Ask Daddy" → immediate Soroush message |
| POST | `/api/auth/logout` | end the session |
| GET | `/api/me` | full profile once unlocked |
| GET/POST/PATCH | `/api/settings` | language, theme, sound, font scale |
| GET/POST | `/api/location` | effective location / report a fresh device position |
| GET | `/api/search` | `q`, `app`, `kind`, `from`, `to`, `suggest` |
| POST | `/api/vault/unlock` | open the vault |
| GET | `/healthz` | liveness (returns `ok`) |

### Content
`/api/voices` (`/random`, `/<id>/played`) · `/api/songs` (`/upload`, `/<id>`, `/<id>/played`) ·
`/api/memories` (`/<id>`) · `/api/letters` (`/random`, `/<id>/open`) · `/api/countdowns` (`/<id>`) ·
`/api/garden` (`/reset`, `/<id>/water`) · `/api/starmap` · `/api/cinema` (`/<id>`) · `/api/quiz`
(`/submit`) · `/api/plans` (`/<id>`) · `/api/moods` (`/set`) · `/api/vault` · `/api/tutorial`

### Social
`/api/chat` · `/api/hug` (`/send`, `/<id>/open`) · `/api/notifications` (`/read-all`, `/<id>/read`) ·
`/api/reminders` (`/<id>/mute`) · `/api/terminal` (`/sudo`) · `/api/egg` · `/api/achievements` ·
`/api/weather` · `/api/map`

### Health
`/api/cycle` (`/start`, `/end`, `/symptoms`) · `/api/meds` (`/today`, `/act`, `/report`) ·
`/api/care` (`/<id>/toggle`)

### Library & games
`/api/books` (`/<id>`, `/<id>/chapters`) · `/api/chapters/<id>/publish` ·
`/api/pages/<id>/paragraphs` · `/api/pages/<id>/bookmark` · `/api/paragraphs/<id>` (`/notes`) ·
`/api/puzzles` (`/upload`, `/<id>/start`, `/<id>/complete`, `/<id>`)

### Calls `/api/calls`
`overview` · `slots` (`/<id>`) · `appointments` (`/<id>/respond`, `/<id>/cancel`) · `logs` (`/<id>`) ·
`stats` · `next`

### Gifts `/api/gifts`
`GET/POST /` · `GET/PATCH/DELETE /<id>` · `occasions` · `stats` — filters `giver`, `receiver`,
`occasion`, `year`, `band`, `q`

### Read together `/api/reading`
`overview` · `books` (`/<id>`, `/<id>/chapters`, `/<id>/progress`) · `chapters/<id>/notes|quotes|comments` ·
`quotes` · `stats`

### Dream home `/api/home`
`overview` · `features` (`/<id>`) · `rooms` (`/<id>`, `/<id>/ideas`) · `inspirations` (`/<id>`,
`/<id>/comments`) · `categories` · `stats` — room coordinates are percentages, clamped server-side

### Language bridge `/api/language`
`overview` · `entries` (`/<id>`) · `categories` · `flashcards` · `practice` · `quiz` (`/submit`) · `stats`

### Outside `/api`
| Path | Purpose |
|---|---|
| `/` | the SPA (via proxy or `SERVE_FRONTEND`) |
| `/<ADMIN_PATH>/` | the Daddy Panel |
| `/api/media/<path>?sig=…` | signed, short-lived private files |
| `/api/soroush/webhook/<secret>/` | incoming Soroush updates |
| `/robots.txt` | `Disallow: /` |

---

## 10. Deployment

### 10.1 Before any deployment

These steps are the same for every host. Do them first.

**1. Decide who serves the frontend** (see the table in §2). Rule of thumb:

* I control Nginx/Caddy → `SERVE_FRONTEND=False`, the proxy serves `frontend/dist`.
* I only get one Python process (cPanel, PaaS) → `SERVE_FRONTEND=True`.

**2. Build the frontend.** On any machine with Node 20+:

```bash
cd frontend && npm ci && npm run build      # → frontend/dist/
```

`./scripts/deploy.sh build` does the same and also runs `collectstatic`.

**3. Write `backend/.env` for production.** Start from `.env.example` and change at least:

```ini
DEBUG=False
DJANGO_SECRET_KEY=<50+ random characters>
ALLOWED_HOSTS=love.example.com
CSRF_TRUSTED_ORIGINS=https://love.example.com
ADMIN_PATH=<something-nobody-guesses>
ADMIN_GATE_PASSCODE=<a strong passcode>
DB_ENGINE=mysql            # or sqlite for a very small VPS
DB_NAME=… DB_USER=… DB_PASSWORD=… DB_HOST=127.0.0.1 DB_PORT=3306
NOTIFY_PROVIDER=soroush
SOROUSH_TOKEN=… SOROUSH_DADDY_CHAT_ID=… SOROUSH_WEBHOOK_SECRET=<random>
SERVE_FRONTEND=False       # True on cPanel / single-process hosts
```

`scripts/deploy.sh` refuses to run with a placeholder secret key or an empty `ALLOWED_HOSTS`.

**4. MySQL must be utf8mb4.** Create the database like this (or set the collation in
phpMyAdmin → Operations):

```sql
CREATE DATABASE loveos CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'loveos'@'localhost' IDENTIFIED BY '<password>';
GRANT ALL PRIVILEGES ON loveos.* TO 'loveos'@'localhost';
```

**5. HTTPS is mandatory**, not optional: with `DEBUG=False` Django redirects to HTTPS, service
workers only register on HTTPS, and Soroush only accepts HTTPS webhooks.

**6. Never place the project inside a public web root** (`public_html`, `/var/www/html`). The
`.env` with every secret lives next to the code.

**Production checklist**

- [ ] `DEBUG=False`, real `DJANGO_SECRET_KEY`, correct `ALLOWED_HOSTS` / `CSRF_TRUSTED_ORIGINS`
- [ ] `ADMIN_PATH` changed and `ADMIN_GATE_PASSCODE` set
- [ ] MySQL database created with `utf8mb4_unicode_ci`
- [ ] `frontend/dist` built
- [ ] `migrate`, `collectstatic`, `createsuperuser`, `seed_loveos --passcode … --vault …`
- [ ] HTTPS certificate
- [ ] cron for `manage.py sweep` every minute
- [ ] Soroush webhook registered
- [ ] `./scripts/deploy.sh verify` is green
- [ ] backups scheduled (`./scripts/deploy.sh backup`)

---

### 10.2 VPS — Ubuntu/Debian with Nginx + Gunicorn

The setup I recommend: a small VPS (1 vCPU / 1 GB is plenty), Ubuntu 22.04/24.04 or Debian 12.

**Step 1 — system packages**

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-dev build-essential pkg-config \
                    default-libmysqlclient-dev mysql-server nginx git curl \
                    certbot python3-certbot-nginx
# Node 22 (only needed to build the frontend on the server)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
```

**Step 2 — MySQL**

```bash
sudo mysql_secure_installation
sudo mysql -e "CREATE DATABASE loveos CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'loveos'@'localhost' IDENTIFIED BY 'STRONG-PASSWORD';
GRANT ALL PRIVILEGES ON loveos.* TO 'loveos'@'localhost'; FLUSH PRIVILEGES;"
```

**Step 3 — code and configuration**

```bash
sudo mkdir -p /srv/loveos && sudo chown $USER /srv/loveos
git clone https://github.com/EmmettSS/LoveOS.git /srv/loveos
cd /srv/loveos
cp backend/.env.example backend/.env
nano backend/.env            # fill in everything from §10.1 (SERVE_FRONTEND=False)
```

Uncomment `mysqlclient` in `backend/requirements.txt` or let the deploy script install it.

**Step 4 — DNS.** Point an `A` record of the domain to the server's IP and wait until
`dig +short love.example.com` returns it (certbot needs this).

**Step 5 — run the deploy script**

```bash
sudo DOMAIN=love.example.com ./scripts/deploy.sh vps
```

What it does, in order:

1. `npm ci && npm run build` (skip with `SKIP_FRONTEND=1` if `dist/` was uploaded).
2. Creates `backend/.venv`, installs requirements + `gunicorn` + `mysqlclient`.
3. `migrate`, `collectstatic`, `check --deploy`.
4. Renders `deploy/vps/loveos.service` → `/etc/systemd/system/loveos.service`
   (Gunicorn on `127.0.0.1:8001`, 3 workers, reads `backend/.env`).
5. Renders `deploy/vps/nginx.conf` → `/etc/nginx/sites-available/loveos` and enables it:
   `frontend/dist` as root with SPA fallback, `/api/`, `/<ADMIN_PATH>/`, `/healthz`, `/robots.txt`
   proxied to Gunicorn, `/static/` aliased, `sw.js` uncached, **no `/media/` alias**.
6. Installs the cron line `* * * * * … manage.py sweep` for the service user.
7. Requests a Let's Encrypt certificate with certbot (`SKIP_CERTBOT=1` to skip).
8. `chown` to `www-data`, `chmod 600 backend/.env`, `nginx -t`, enables and starts everything.

**Step 6 — first admin user and content**

```bash
cd /srv/loveos/backend
sudo -u www-data .venv/bin/python manage.py createsuperuser
sudo -u www-data .venv/bin/python manage.py seed_loveos --passcode 2468 --vault 1357
```

**Step 7 — verify**

```bash
./scripts/deploy.sh verify         # /healthz, /api/boot, /, /robots.txt, panel, 401 on /api/me
journalctl -u loveos -f            # Gunicorn logs
tail -f /srv/loveos/logs/sweep.log # scheduler
```

Then do §10.8 (webhook, QR).

**Manual equivalents** (if I ever need to do it without the script): the two templates in
`deploy/vps/` have `__APP_DIR__`, `__DOMAIN__`, `__PORT__`, `__USER__`, `__WORKERS__`,
`__ADMIN_PATH__` placeholders — replace them with `sed` and copy them into place.

**Firewall**: `sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable`.

---

### 10.3 cPanel shared hosting (Passenger)

On cPanel there is no Nginx I control; every request goes through Phusion Passenger to **one**
WSGI app (`passenger_wsgi.py`). So Django serves the frontend too: `SERVE_FRONTEND=True`.
Shared hosts usually have no Node, so the frontend is built on my machine and uploaded.

**Step 1 — build and package on my machine**

```bash
./scripts/deploy.sh package        # → loveos-release.tar.gz
```

The archive contains `backend/` (without `.venv`, `.env`, sqlite, staticfiles, uploads),
`frontend/dist/`, `passenger_wsgi.py`, `scripts/` and `deploy/`.

**Step 2 — database.** cPanel → **MySQL® Databases**: create database `USER_loveos`, user
`USER_loveos`, add the user with ALL PRIVILEGES. Then phpMyAdmin → the database → **Operations**
→ Collation `utf8mb4_unicode_ci` → Go.

**Step 3 — upload.** File Manager → create `/home/USER/loveos/` (**outside** `public_html`),
upload `loveos-release.tar.gz` there and extract it.

**Step 4 — Python app.** cPanel → **Setup Python App** → Create Application:

| Field | Value |
|---|---|
| Python version | 3.10 or newer |
| Application root | `loveos` |
| Application URL | the domain / subdomain |
| Application startup file | `passenger_wsgi.py` |
| Application Entry point | `application` |

After creating, cPanel shows a line like
`source /home/USER/virtualenv/loveos/3.10/bin/activate && cd /home/USER/loveos` —
**every terminal command below starts with that line.**

**Step 5 — `.env`.** Create `/home/USER/loveos/backend/.env` with the production values from
§10.1 plus:

```ini
SERVE_FRONTEND=True
FRONTEND_DIST=/home/USER/loveos/frontend/dist
DB_ENGINE=mysql
DB_NAME=USER_loveos
DB_USER=USER_loveos
DB_HOST=localhost
```

**Step 6 — install and migrate** (cPanel → Terminal, or SSH):

```bash
source /home/USER/virtualenv/loveos/3.10/bin/activate && cd /home/USER/loveos
SKIP_FRONTEND=1 ./scripts/deploy.sh cpanel
python backend/manage.py createsuperuser
python backend/manage.py seed_loveos --passcode 2468 --vault 1357
```

The `cpanel` target installs requirements and the MySQL driver (falls back to `pymysql` when
`mysqlclient` cannot compile — in that case add these two lines to `backend/config/__init__.py`:
`import pymysql` / `pymysql.install_as_MySQLdb()`), runs `migrate` + `collectstatic`, and touches
`tmp/restart.txt`.

**Step 7 — restart.** Setup Python App → **Restart**. Passenger does not pick up changes to
`.env` or code by itself; restart after every change (`touch /home/USER/loveos/tmp/restart.txt`
does the same).

**Step 8 — SSL.** cPanel → **SSL/TLS Status** → Run AutoSSL for the domain.

**Step 9 — cron.** cPanel → **Cron Jobs**, every minute, full paths:

```
* * * * * /home/USER/virtualenv/loveos/3.10/bin/python /home/USER/loveos/backend/manage.py sweep >> /home/USER/loveos/logs/sweep.log 2>&1
```

(create `/home/USER/loveos/logs/` first).

**Step 10** — §10.8 (webhook, QR) and `BASE_URL=https://domain ./scripts/deploy.sh verify`.

**Hosts without a terminal**: install the requirements on a machine with the same Python
version and architecture, upload `site-packages` into the cPanel virtualenv, and run `migrate`
through a temporary Django management view — or, honestly, choose a host with SSH.

---

### 10.4 Docker / docker compose

`deploy/docker/` contains a two-stage `Dockerfile` (Node builds the frontend, Python runs
Gunicorn with `SERVE_FRONTEND=True`), a `docker-compose.yml` with **web + MySQL 8 + Caddy**
(automatic HTTPS), and an `entrypoint.sh` that waits for MySQL, migrates, collects static files,
runs the `sweep` loop and starts Gunicorn.

```bash
cp backend/.env.example backend/.env       # production values, DB_ENGINE=mysql, DB_HOST=db
echo "CADDY_DOMAIN=love.example.com" > deploy/docker/.env
./scripts/deploy.sh docker                  # docker compose build && up -d && migrate
docker compose -f deploy/docker/docker-compose.yml exec web python manage.py createsuperuser
```

Notes:

* `SECURE_SSL_REDIRECT=False` is set on the container because Caddy terminates TLS and already
  redirects HTTP→HTTPS.
* Uploads live in the `media` volume; back it up with `docker run --rm -v docker_media:/m -v $PWD:/b alpine tar czf /b/media.tar.gz /m`.
* If I already have a reverse proxy, delete the `caddy` service and point the proxy at
  `127.0.0.1:8000`.
* Ports 80/443 must be free on the host.

---

### 10.5 DirectAdmin / Plesk and other panels

Both panels run Python apps through Passenger just like cPanel, so **§10.3 applies verbatim**
with these differences:

| | DirectAdmin | Plesk |
|---|---|---|
| Where | *Setup Python App* (CloudLinux) or *Python Selector* | *Websites & Domains → Python* |
| Startup file / entry | `passenger_wsgi.py` / `application` | Application startup file `passenger_wsgi.py`, entry `application` |
| App root | outside `public_html`, e.g. `/home/USER/loveos` | outside `httpdocs`, e.g. `/var/www/vhosts/DOMAIN/loveos` |
| Cron | *Cron Jobs* in the panel | *Scheduled Tasks* |
| SSL | *SSL Certificates* → Let's Encrypt | *SSL/TLS Certificates* → Let's Encrypt |

Plesk additionally has an "Additional nginx directives" box: if I paste the `location` blocks from
`deploy/vps/nginx.conf` there, I can set `SERVE_FRONTEND=False` and let nginx serve `dist/`; on
plain shared hosting I keep `SERVE_FRONTEND=True`.

---

### 10.6 PaaS (Railway, Render, Fly.io, Liara, …)

A PaaS gives one process and a managed database; Django serves everything.

* **Build**: `cd frontend && npm ci && npm run build && cd ../backend && pip install -r requirements.txt gunicorn mysqlclient && python manage.py collectstatic --noinput`
  (or simply point the platform at `deploy/docker/Dockerfile`, which most of them accept).
* **Start**: `cd backend && python manage.py migrate --noinput && gunicorn config.wsgi:application --bind 0.0.0.0:$PORT --workers 2`
* **Environment**: every key from §10.1 as platform env vars, plus `SERVE_FRONTEND=True`,
  `FRONTEND_DIST=/app/frontend/dist` (adjust to the platform's path) and
  `SECURE_SSL_REDIRECT=False` (the platform's edge already does HTTPS).
* **Database**: a managed MySQL with utf8mb4 (or PostgreSQL after adding `psycopg` — not what I
  ship, MySQL/SQLite are the tested paths).
* **Media**: PaaS filesystems are ephemeral. Mount a persistent volume at `backend/media` (Fly
  volumes, Railway volumes, Liara disks) — otherwise every deploy erases her voice notes.
* **Scheduler**: a cron/worker service that runs `python manage.py sweep` every minute — or run
  the container from `deploy/docker`, whose entrypoint already loops `sweep`.

---

### 10.7 Split hosting: frontend on a static host, backend elsewhere

Frontend on Netlify/Vercel/Cloudflare Pages/GitHub Pages and backend on a VPS or cPanel.

1. **Backend** as in 10.2/10.3 with `SERVE_FRONTEND=False` and:
   ```ini
   CORS_ALLOWED_ORIGINS=https://app.example.com
   CSRF_TRUSTED_ORIGINS=https://app.example.com,https://api.example.com
   ```
2. **Frontend**: the app calls relative `/api/...` URLs. Either the static host proxies `/api/*`
   and `/<ADMIN_PATH>/*` to the backend (Netlify `_redirects`:
   `/api/*  https://api.example.com/api/:splat  200`), or I build with an absolute API base by
   setting `server.proxy`-equivalent rewrites on the host. Proxying is the simpler, cookie-safe
   choice.
3. **SPA fallback**: every unknown path must serve `index.html`
   (Netlify: `/*  /index.html  200`; Vercel: `rewrites` in `vercel.json`).
4. `sw.js` and `index.html` must be served with `Cache-Control: no-cache`.

I do not recommend this for the private-media reason alone: two origins mean two places to get
security headers right. One origin is simpler and safer.

---

### 10.8 After going live: webhook, cron, QR

**Soroush webhook** — once, from any machine:

```bash
curl "https://api.splus.ir/bot<TOKEN>/setWebhook?url=https://love.example.com/api/soroush/webhook/<SOROUSH_WEBHOOK_SECRET>/"
curl "https://api.splus.ir/bot<TOKEN>/getWebhookInfo"      # url must be echoed back without errors
```

**Cron sanity** — after one minute `logs/sweep.log` should show lines like
`sweep ok: memories=0 letters=0 meds=0 care=0 reminders=0 calls=0 outbox=0`.
Without cron, **timed letters never open** and medication reminders never fire.

**Her QR code**

```bash
python3 scripts/qr.py https://love.example.com --out loveos-qr.svg
```

Print it, hand it over. No dependencies needed — the QR encoder is implemented in the script.

**Smoke test**

```bash
DOMAIN=love.example.com ./scripts/deploy.sh verify
```

---

### 10.9 Updating a running deployment

```bash
./scripts/deploy.sh update
```

Pulls (`git pull --ff-only` when the checkout is a git repo), then detects the host type:
docker → rebuild & up; cPanel → `cpanel` target; systemd service present → rebuild frontend,
migrate, collectstatic, restart. Always run `./scripts/deploy.sh backup` first when the update
contains migrations.

Manual order, if I ever need it: `git pull` → `npm run build` → `pip install -r requirements.txt`
→ `migrate` → `collectstatic` → restart Gunicorn / Passenger.

---

## 11. Scripts

### `scripts/dev.sh` — my machine

| Command | Does |
|---|---|
| `./scripts/dev.sh` / `run` | setup if needed, then backend on :8000 and frontend on :5173 |
| `setup` | venv, requirements, `.env` with dev defaults, migrate, seed, `npm ci` |
| `test` | backend tests + frontend checks (below) |
| `test:be` | `manage.py check` + `manage.py test` (83 tests) |
| `test:fe` | `tsc -b` + `oxlint src` + `npm run build` + `npm run test:ui` |
| `check` | `manage.py check`, `makemigrations --check`, `tsc`, `oxlint` — fast pre-commit check |
| `reset` | delete the SQLite file, migrate, seed again |
| `clean` | remove `.venv`, `node_modules`, `dist`, `staticfiles`, caches |

Environment overrides: `BACKEND_PORT`, `FRONTEND_PORT`, `PYTHON_BIN`.

### `scripts/deploy.sh` — servers

| Target | Does |
|---|---|
| `build` | `npm ci && npm run build`, install requirements, `collectstatic` |
| `vps` | full Ubuntu/Debian setup: systemd + Nginx + cron + certbot (root) |
| `cpanel` | requirements, MySQL driver, migrate, collectstatic, Passenger restart |
| `docker` | `docker compose build && up -d && migrate` in `deploy/docker` |
| `update` | pull + rebuild + migrate + restart, auto-detecting the host type |
| `package` | `loveos-release.tar.gz` for hosts without git/node |
| `backup` | DB dump (mysqldump or sqlite copy) + `media.tar.gz` + `.env` copy into `backups/<timestamp>/` |
| `verify` | HTTP smoke test of a live deployment |

Environment overrides: `APP_DIR`, `DOMAIN`, `SERVICE`, `RUN_USER`, `GUNICORN_PORT`, `WORKERS`,
`SKIP_FRONTEND=1`, `SKIP_CERTBOT=1`, `BASE_URL` (verify), `PYTHON_BIN`.

### `scripts/qr.py`

`python3 scripts/qr.py <url> [--out file.svg]` — dependency-free QR generator (byte mode, EC
level M, versions 1–10).

---

## 12. Tests

```bash
./scripts/dev.sh test          # everything
```

### Backend — 83 tests (`manage.py test`)

Per app `tests.py`: session lifecycle and expiry, boot endpoint hiding secrets, unlock attempt
limit, settings round-trip, effective location (live vs. panel vs. stale), Persian-tolerant search,
content endpoints, hugs and chat, medication and cycle flows, library co-writing, puzzle
start/complete, call overlap and approve/reject/reschedule, single-shot call reminders, gift stats
and price bands, reading progress and the shared shelf, room-coordinate clamping, language
flashcards/streak and panel-only quizzes, and "every registered admin model renders".

### Frontend — type check, lint, build, UI tests

```bash
cd frontend
npx tsc -b && npx oxlint src && npm run build
npm run test:ui                     # all suites
npm run test:ui window-manager-settings   # one suite
```

The UI tests run under **jsdom** with esbuild — no browser needed (`frontend/tests/run.mjs`):

| Suite | Locks down |
|---|---|
| `boot-sequence` | boot in StrictMode, auto-finish, skip on tap, English boot |
| `window-manager-settings` | open/close/minimize, stable geometry, z-order, reopen position, language + theme persisted |
| `apps-render` | all "together" apps render against real API fixtures (`tests/fixtures.json`), global search, desktop icons, next-call widget |
| `puzzle-win` | win celebration even without a server response |
| `pdf-book` | PDF export of the library book |
| `desktop-drag` | icon reordering by drag and drop |
| `viewport-fit` | full-height shell without inner scroll on boot/lock/desktop |
| `starmap-sky` | star sky renders edge-to-edge with the real 8 constellations, tap → message, "light the whole name" |
| `starmap-broken-stars` | corrupt `stars` rows never blank or crash the sky |
| `starmap-mobile` | two-row layout math (symbols 1.3×, no overlap, RTL mirror), phone portrait → rotated full-screen portal above the dock, landscape → no extra rotation, ✕ closes the window, other windows on top hide the overlay |

`tests/fixtures.json` was captured from the live API; if an endpoint contract changes, these
fail before she notices.

---

## 13. Maintenance, backups and troubleshooting

### Routine

| Cadence | What I do |
|---|---|
| daily | glance at `ActivityLog` and `SoroushOutbox` in the panel |
| weekly | `./scripts/deploy.sh backup`; check disk space |
| monthly | `pip list --outdated`, `npm outdated`; review content |
| every update | backup → `./scripts/deploy.sh update` → `verify` |

### Backups

`./scripts/deploy.sh backup` writes `backups/<timestamp>/` with `db.sql.gz` (or `db.sqlite3`),
`media.tar.gz` and `env.backup`. Copy that folder off the server. Restore: import the dump, extract
`media.tar.gz` into `backend/`, restore `.env`, restart.

### Common problems

| Symptom | Cause | Fix |
|---|---|---|
| Persian text shows as `????` | database not utf8mb4 | recreate the DB with `utf8mb4_unicode_ci` (§10.1) |
| `DisallowedHost` / 400 | `ALLOWED_HOSTS` | add the domain, restart |
| panel login says CSRF failed | `CSRF_TRUSTED_ORIGINS` | add `https://domain`, restart |
| infinite redirect loop | `SECURE_SSL_REDIRECT` behind a proxy that already terminates TLS | set `SECURE_SSL_REDIRECT=False`, make sure the proxy sends `X-Forwarded-Proto` |
| page blank after an update | old service worker | hard refresh once; `sw.js` must be served with `no-cache` |
| "فرانت‌اند هنوز build نشده است" (501) | `SERVE_FRONTEND=True` but `dist/` missing | build/upload `frontend/dist`, check `FRONTEND_DIST` |
| Soroush messages do not arrive | token / connectivity | panel → SoroushOutbox (status, error) → `manage.py sweep` |
| timed letters never open | no cron | install the `sweep` cron line |
| uploads fail > ~10 MB | proxy body limit | `client_max_body_size 80M` (already in the Nginx template) |
| `mysqlclient` will not compile | missing headers | `apt install default-libmysqlclient-dev build-essential` or use `pymysql` |
| location, weather or clock look stale | live fix is old, panel value used | enable live location in her Settings or update the panel |
| panel URL 404 | `ADMIN_PATH` | read it from `.env`; no leading/trailing slash there |

### Handy shell snippets

```bash
# what did she do today?
manage.py shell -c "from core.models import ActivityLog; [print(a.created_at, a.title, a.detail) for a in ActivityLog.objects.all()[:20]]"
# her latest live position
manage.py shell -c "from accounts.models import LiveLocation; l=LiveLocation.current(); print(l and (l.city, l.lat, l.lng, l.age_minutes()))"
# flush the Soroush queue now
manage.py shell -c "from core.soroush import flush_outbox; print(flush_outbox())"
# change her passcode
manage.py shell -c "from accounts.models import UserConfig; c=UserConfig.get_solo(); c.set_passcode('2468'); c.save()"
```

---

## 14. Security model

* **Discovery**: unlisted domain, `robots.txt` disallow-all, `X-Robots-Tag: noindex` on every
  response, `X-Frame-Options: DENY`.
* **Her side**: passcode → opaque token; attempt limit; separate vault passcode with a short TTL;
  DRF throttling (`API_RATE_LIMIT`).
* **My side**: secret admin path, optional passcode gate before the login page, Django auth,
  `ActivityLog` of everything.
* **Transport**: HSTS (1 year, preload) and secure cookies whenever `DEBUG=False`.
* **Files**: uploads are outside any public URL; only signed, expiring `/api/media` links.
* **Secrets**: only in `backend/.env` (`chmod 600`), never in git, never in the frontend bundle.
* **Backups**: contain everything — treat the folder like the `.env`.

---

*Distance is just a number. Our hearts are always one.* ❤
