# LoveOS — Technical & User Documentation

> A tiny romantic operating system in the browser.
> Built by Daddy, for his daughter, across a distance that is only a number.

**Version:** 2.0 · **Default language:** Persian (fa) · **Second language:** English (en)
**Persian version of this document:** [`DOCUMENTATION_FA.md`](./DOCUMENTATION_FA.md)

---

## Table of contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Installation & setup](#3-installation--setup)
4. [The LoveOS apps](#4-the-loveos-apps)
5. [Global search](#5-global-search)
6. [The Daddy Panel](#6-the-daddy-panel)
7. [Soroush bot integration](#7-soroush-bot-integration)
8. [API reference](#8-api-reference)
9. [Easter eggs & badges](#9-easter-eggs--badges)
10. [Deployment](#10-deployment)
11. [Maintenance, tests & troubleshooting](#11-maintenance-tests--troubleshooting)
12. [What changed in 2.0](#12-what-changed-in-20)
13. [The 3D quality tier](#13-the-3d-quality-tier)

---

## 1. Overview

### What LoveOS is

LoveOS is a **Progressive Web App disguised as a miniature operating system**. It boots, asks for a
passcode, shows a desktop with widgets and a dock, and hosts 30 small apps — each one a different way
of saying *I love you* across a long distance.

It is my gift, as a programmer father ("بابا" / Daddy), to my daughter ("دخترم" / my daughter). The
tone throughout is warm, playful and childlike, and every visible string speaks directly to her.
Version 2.0 adds five apps that are all about *being together*: call planning, a gift book, reading
together, a dream home and a language bridge — plus a global search layer across the whole system
(six new pieces in total).

### Design principles

| Principle | What it means in practice |
|---|---|
| **Nothing is hardcoded** | Every piece of content — messages, voices, letters, photos, quiz questions, terminal replies, easter-egg texts — lives in the Django admin and can be changed without touching code. |
| **Secret by construction** | The app lives on an unlisted domain reached by a QR code. `robots.txt` blocks everything, every response carries `X-Robots-Tag: noindex`, and the admin sits behind a secret path plus its own passcode gate. |
| **Mobile-first, desktop-nice** | Designed for a phone in her hand; on a wide screen apps become draggable floating windows. |
| **Two languages, zero hardcoded text** | All UI strings live in `frontend/public/locales/{fa,en}/translation.json`. Persian is the default and the layout is RTL. |
| **Offline-friendly** | A service worker precaches the shell, fonts and icons, so the OS opens even on a bad connection. |
| **One truth for location** | Every app that needs "where is she" (map, weather, clock, distance) reads from the same helper; her live device location always wins over the value stored in the panel. |
| **Gentle by default** | Sounds are synthesized (no copyrighted assets), animations respect `prefers-reduced-motion`, and the sensitive health app carries a medical disclaimer. |

### The user journey

```
QR code  →  secret domain
              │
              ▼
        ┌──────────┐   typing boot lines, soft melody, "سلام دخترم..."
        │   BOOT   │
        └────┬─────┘
             ▼
        ┌──────────┐   "Today marks N days of Daddy loving you."
        │   LOCK   │   passcode · security question · after 5 fails: "Ask Daddy"
        └────┬─────┘
             ▼
        ┌──────────┐   clock · next-meeting countdown · next call · both cities' weather
        │ DESKTOP  │   29 app icons · dock (with the search magnifier) · start menu
        └────┬─────┘   Ctrl/⌘ + K = global search
             ▼
          30 apps
```

### Repository layout

```
LoveOS/
├── backend/                     Django 5 + DRF
│   ├── config/                  settings, root urls, wsgi, asgi
│   ├── core/                    notifications, Soroush outbox, achievements,
│   │                            counters, easter eggs, global search, cache,
│   │                            effective location, the sweep command
│   ├── accounts/                UserConfig (single source of truth), device
│   │                            sessions, live location, unlock attempts
│   ├── content/                 voices, songs, memories, letters, countdowns,
│   │                            garden, constellations, cinema, quiz, plans,
│   │                            moods, vault, tutorial, terminal
│   ├── social/                  chat, hugs, notifications, reminders, weather, map
│   ├── health/                  cycle & care, medication, gentle reminders
│   ├── library/                 "Our Story" book (co-writing)
│   ├── games/                   heart puzzle
│   ├── calls/                   app 25 — Call Sync
│   ├── gifts/                   app 26 — Gift Book
│   ├── reading/                 app 27 — Read Together
│   ├── dreamhome/               app 28 — Dream Home
│   └── language/                app 29 — Language Bridge
├── frontend/                    React 19 + Vite 8 + TS + Tailwind
│   ├── src/os/                  boot, lock, desktop, window, dock, start menu,
│   │                            notification center, global search, day/night
│   ├── src/apps/                30 app files (one file per app)
│   ├── src/shared/              store (Zustand), api, ui, Icon, i18n, format,
│   │                            sound, geo, recorder, prefs, ErrorBoundary
│   ├── public/locales/          fa / en
│   └── vite.config.ts           /api proxy + PWA service worker
├── scripts/                     helper scripts (QR, backup, deploy)
├── DOCUMENTATION.md             this document (English)
├── DOCUMENTATION_FA.md          this document (Persian)
├── QUICKSTART_FA.md             quick start on my own machine
├── DEPLOY_CPANEL_FA.md          cPanel deployment guide
└── Soroush-Docs.md              Soroush Plus API reference
```

---

## 2. Architecture

### Stack

| Layer | What I used |
|---|---|
| Backend | Django 5.2 · Django REST Framework 3.18 · SQLite (dev) / MySQL (production) |
| Auth | Hand-rolled token on `DeviceSession` (no JWT), `@require_session` decorator |
| Panel | Django's own admin on a secret path + a passcode gate (`ADMIN_GATE_PASSCODE`) |
| Frontend | React 19 · TypeScript 6 · Vite 8 · Tailwind 3 · Framer Motion 13 |
| State | Zustand (`src/shared/store.ts`) |
| i18n | i18next + react-i18next (automatic RTL/LTR) |
| Map | MapLibre GL (with a light fallback when WebGL is unavailable) |
| Sound | Web Audio API (synthesis) + Howler (media files) |
| Recording | MediaRecorder + getUserMedia (`src/shared/recorder.ts`) |
| PWA | vite-plugin-pwa (Workbox) with `skipWaiting` and `clientsClaim` |

### Request flow

```
her phone ──► Vite (dev) / Nginx or Passenger (production)
                │
                ├─ /            → SPA files (React)
                ├─ /api/...     → Django + DRF  →  models  →  JSON
                ├─ /api/media/... → signed private media (voices, photos, PDFs, pronunciation audio)
                └─ /daddy-panel-9x7k/  → Django admin (me only)
```

Every request carries `Authorization: Token …`. When a session expires the API answers 401 and the
frontend raises the lock screen again (via the `loveos:locked` event).

### Authentication model

* `DeviceSession` — a 32-character token with an expiry (`SESSION_TTL_HOURS`, default 720 h = 30 days).
* `@require_session` — the decorator wrapping every private view.
* `UnlockAttempt` — each passcode attempt is stored; after `MAX_UNLOCK_ATTEMPTS` (5) the "Ask Daddy"
  button appears and a Soroush message reaches me immediately.
* A security question (`/api/auth/forgot`) and the help route (`/api/auth/help`) are the second and
  third ways back in.
* The vault (`/api/vault/unlock`) is a separate lock with a short timer
  (`VAULT_SESSION_MINUTES`, default 20 minutes).

### The phase machine

```
boot ──► lock ──► desktop
 ↑                  │
 └──── logout ──────┘
```

The phase lives in `useOS` and changes through `setPhase`. Moving out of the desktop closes every
window and menu.

### The window manager (2.0)

The window manager was rewritten in this version. Three simple but crucial rules:

1. **Geometry is decided once.** A window takes a cascade slot when it opens and keeps its position.
   No click or focus ever moves it — that is exactly what used to make windows jump out from under
   the finger so close/minimize looked broken.
2. **Stacking lives on the outer wrapper.** `z-index` sits on the wrapper, not on the animated box, so
   a window underneath can never cover the one in front.
3. **A fading window cannot be clicked.** With `useIsPresent`, once the exit animation is done the
   wrapper becomes `pointer-events: none` — so no "ghost" of a closed window stays on the desktop.

On mobile every app is a full-height sheet with a sticky header and body padding that clears the dock;
on desktop the same app becomes a draggable floating window. Each app remembers its size and position
and reopens exactly there next time.

### Effective location (2.0)

Previously each app treated location differently and some read the stale value stored in the panel.
Now there is a single helper:

```python
# core/services.py
effective_daughter_location(cfg)  →  {lat, lng, city, timezone, is_live, captured_at, accuracy, source}
```

Priority order:

1. **Her device's live location**, when it is fresh (younger than `location_ttl_minutes`) and I have not
   switched live tracking off in the panel.
2. Otherwise the **value stored in the panel** (home / default city).

The map, weather, distance, time difference and desktop widgets all read from this function. On top of
that, when her phone sends a fresh position and the move is meaningful (more than `location_sync_km`, or
the city/timezone changed), the **stored coordinates and city are synced automatically** so there is a
single truth — and I get a Soroush note about it.

### Day/night theming

`src/os/daynight.ts` understands three modes: `auto` (based on the clock and her city's sunrise/sunset),
`day` and `night`. The theme sets `data-theme` on the root and swaps every colour variable. The choice
is stored both in `localStorage` and on the server profile, so it survives a re-login.

---

## 3. Installation & setup

### Requirements

| Tool | Version |
|---|---|
| Python | 3.11 or newer |
| Node.js | 20 or newer |
| npm | ships with Node |

### Quick start

```bash
git clone https://github.com/EmmettSS/LoveOS.git
cd LoveOS

# ---- backend
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
.venv/bin/python manage.py migrate
.venv/bin/python manage.py seed_loveos      # passcode: 1234 · vault: 0000
.venv/bin/python manage.py runserver 0.0.0.0:8000

# ---- frontend (second terminal)
cd frontend
npm install
npm run dev     # http://localhost:5173
```

The Vite proxy forwards `/api`, `/static` and `/daddy-panel-9x7k` to `127.0.0.1:8000`, so both
terminals are needed. A step-by-step walkthrough is in [`QUICKSTART_FA.md`](./QUICKSTART_FA.md).

### Admin commands

```bash
.venv/bin/python manage.py makemigrations     # create new migrations
.venv/bin/python manage.py migrate            # apply them
.venv/bin/python manage.py check              # project health check
.venv/bin/python manage.py test               # 97 backend tests
.venv/bin/python manage.py sweep              # scheduled work (cron)
.venv/bin/python manage.py createsuperuser    # first-time panel user
```

### Environment variables

`backend/.env` (sample in `.env.example`):

| Key | Purpose |
|---|---|
| `DEBUG` | development mode |
| `DJANGO_SECRET_KEY` | Django secret key |
| `ALLOWED_HOSTS` | allowed domains |
| `CSRF_TRUSTED_ORIGINS` | trusted origins |
| `TIME_ZONE` | server timezone |
| `ADMIN_PATH` | secret admin path (default `daddy-panel-9x7k`) |
| `ADMIN_GATE_PASSCODE` | optional second gate for the panel |
| `DB_ENGINE` / `DB_NAME` / … | `sqlite` or `mysql` |
| `NOTIFY_PROVIDER` | `console` · `soroush` · `null` |
| `SOROUSH_API_BASE` / `SOROUSH_TOKEN` / `SOROUSH_DADDY_CHAT_ID` | Soroush bot wiring |
| `SOROUSH_TIMEOUT` | per-request Soroush timeout in seconds (default `8`) |
| `NOTIFY_ASYNC` | send notifications from a background thread so API calls never wait on Soroush (default `true`) |
| `SESSION_TTL_HOURS` | how long her device session lives |
| `VAULT_SESSION_MINUTES` | how long the vault stays open |
| `MAX_UNLOCK_ATTEMPTS` | wrong tries before "Ask Daddy" |
| `API_RATE_LIMIT` | request ceiling |
| `SERVE_FRONTEND` | when True, Django also serves the built frontend (cPanel) |

> ⚠️ Restart Django after editing `.env`; the environment file is read only at startup.

### Generating her QR code

```bash
.venv/bin/python ../scripts/make_qr.py https://love.example.com
```

---

## 4. The LoveOS apps

30 apps, 29 of them with a desktop icon (the "About" app opens from the start menu only).

### Emotional core

| App | Icon | What it does |
|---|---|---|
| **Map of Us** | 🗺 | Two pins (my home, her place) with distance, time difference, a "fly along the path" button and a live-location badge. |
| **Voice Vault** | 🎙 | Categorised archive of my voice notes, plus a "random voice" button. |
| **Our Music** | 🎵 | Songs with "why this song" and lyrics; she can upload songs too when I allow it. |
| **Memories** | 📸 | Shared memories; some stay locked until a chosen date (a future-memory secret). |
| **Whisper Letters** | ✉️ | Letters typeset in a Nastaliq hand. |
| **Countdown** | ⏳ | To the next meeting, her birthday, our anniversary. |
| **Weather** | ⛅ | Both cities side by side with a loving line based on the temperature gap. |
| **Heartbeat** | 💓 | "My heart beats for you" — a synthesized pulse on every tap. |
| **Our Garden** | 🌱 | Water the flowers; each watering opens one bloom. |
| **Star Sky** | ✨ | Her name drawn as a constellation plus wish stars. |
| **Chat with Daddy** | 💬 | Direct messages, short and affectionate. |
| **My Mood** | 🌈 | Log today's mood and receive a matching message from me. |
| **Our Quiz** | 🧠 | Quizzes I write about our memories, with rewards. |
| **Our Wishes** | 🎯 | Shared wish list with categories and a "done" tick. |
| **Our Cinema** | 🎬 | Watch list with "watched / want to watch". |
| **The Vault** | 🔐 | Private treasures behind a separate passcode. |
| **Hug** | 🫂 | Instant hugs, back and forth; every hug tells me on Soroush. |

### Care & everyday

| App | Icon | What it does |
|---|---|---|
| **Cycle & Care** | 🌸 | Period, symptoms and medication logging with gentle wording and clear medical boundaries. |
| **Our Library** | 📚 | "Our Story" written together, chapter by chapter, with comments on every paragraph. |
| **Heart Puzzle** | 🧩 | Picture puzzle in easy/medium/hard with a custom ending line. |
| **Settings** | ⚙️ | Language, theme, sound, font scale, live location and the PWA install guide. |
| **Tutorial** | 🎓 | "What an operating system is" lessons, all written by me in the panel. |
| **Terminal** | ⌨️ | Commands like `help`, `love`, `whoami` with playful answers. |
| **Badges** | 🏅 | 32 achievements unlocked by real activity. |
| **About LoveOS** | 💗 | The story of the project and my closing words. |

### Being together (new in 2.0)

| App | Icon | What it does |
|---|---|---|
| **Call Sync** | 📞 | We publish our weekly free windows; the system finds the overlap. We propose, approve, decline or reschedule calls, then log each call with duration, moods and a note. Voice notes can be recorded straight from the microphone. |
| **Gift Book** | 🎁 | Every gift is recorded: occasion, price (or price band), photo and "the reaction in that moment", plus yearly stats and a chart. |
| **Read Together** | 📖 | A shared shelf that also shows the Library app's books. Per chapter: notes with a star rating, treasured quotes and a conversation thread. Progress is tracked for both of us separately. |
| **Dream Home** | 🏡 | Our dream-home checklist with importance levels, a room layout you drag around on a map, and an inspiration gallery with comments. |
| **Language Bridge** | 💬 | Our four-language dictionary (Mazandarani, Turkish, Persian, English), flashcards with a day-streak counter, microphone pronunciation recording, and quizzes that only come from my panel. |

### System

| Part | What it does |
|---|---|
| **Boot** | Typing lines, the logo, a soft melody and my welcome message. |
| **Lock** | Passcode + security question + the "Ask Daddy" button. |
| **Desktop** | Clock, next-meeting countdown, next call, both cities' weather, today's message and app icons. |
| **Dock** | Start menu, open apps, search (magnifier), notifications, settings, logout. |
| **Notification centre** | Every notification for her, with an unread badge. |
| **Error boundary** | If one app breaks, the whole OS does not go white — that app shows a gentle "try again" and the rest keeps working. |

---

## 5. Global search

Global search is not a separate app; it is a layer over the whole system.

**Three ways to open it:**

* `Ctrl + K` or `⌘ + K` from anywhere in LoveOS
* the magnifier icon in the dock
* the "Global search" row at the top of the start menu

**The 21 sources it searches:** chat messages · letters · voices · memories · music · our story books ·
chapters · paragraphs · gifts · home features · home rooms · language words · shared reading books ·
chapter notes · quotes · quiz questions · wishes · achievements · call logs · call appointments ·
easter eggs.

**Implementation notes:**

* **Persian-tolerant matching:** Arabic `ي/ك`, diacritics and ZWNJ are normalised before comparison; if
  an exact match fails, a fuzzy match (similarity ≥ 0.62) is tried. So "كتاب يادگاري" still finds
  "کتاب یادگاری".
* **Filters:** by app/source, by date range (`from`/`to`) and by record kind.
* **Empty state:** instead of "nothing found" it offers real suggestions (last message, last memory,
  last book…).
* **Cache:** each query result is cached for 45 seconds (the cache key covers every input) so typing
  stays smooth; the panel has a "clear cache" action for me.
* **Optional logging:** when enabled in the panel, only the query text is written to `ActivityLog` —
  nothing else.
* **Secrets** are deliberately searchable by *title only*, never by their text.

---

## 6. The Daddy Panel

### Getting in

```
https://your-domain/daddy-panel-9x7k/
```

* The path comes from `ADMIN_PATH` and I change it in production.
* It has an optional second passcode gate (`ADMIN_GATE_PASSCODE`) enforced through the session.
* All activity is stored in `ActivityLog`, filterable in the panel.

### What I control

| Panel section | What I change |
|---|---|
| **UserConfig** | Names and nicknames, boot/lock messages, security question, default theme and language, font scale, boot/lock/desktop backgrounds, birthday and anniversary, both cities and coordinates, live-location settings (on/off, TTL, sync distance), and the "Global search" fieldset (disabling sources, query logging) |
| **LiveLocation** | Her current live position, accuracy, source and age — handy when I need to correct it by hand |
| **Calls** | Free windows, appointments, call logs and "call settings" (default duration, proposal/approval/rejection templates, notification and reminder switches) |
| **Gifts** | Occasions (with icons) and gift records with price band, photo and favourites |
| **Reading** | Books, chapters, notes, quotes and comments — all with inlines |
| **Dream Home** | Categories, features (photo preview, colour chips), room layout with inline ideas and the inspiration gallery with comments |
| **Language** | Categories, words/idioms with translations, quiz questions and both progress rows |
| **Content** | Voices, songs, memories, letters, countdowns, garden, constellations, cinema, quiz, wishes, moods, vault, tutorial, terminal commands |
| **Achievements & secrets** | 32 badges with thresholds and secret messages, 15 easter eggs with their trigger |
| **Health** | Medication, care reminders and mood messages |
| **Soroush** | The outbox (`SoroushOutbox`) with status, tries and errors, plus a retry action |
| **ActivityLog** | Everything that happened + the "clear app cache" action |

### Everyday recipes

| I want to… | I do this |
|---|---|
| add a new voice note | Content → Voices → Add → audio file + category + title |
| change today's desktop message | UserConfig → "today's message" |
| lock a memory until a date | Memories → "future memory" + unlock time → `sweep` (cron) opens it |
| remind her about medication | Medication & care reminders → time and text → `sweep` checks every 15 minutes |
| fix her stored location by hand | Location → city/coordinates |
| make search lighter | UserConfig → "Global search" → pick the sources that should stay quiet |
| see what she did today | ActivityLog (filter by app) |

---

## 7. Soroush bot integration

### Setup

```ini
NOTIFY_PROVIDER=soroush
SOROUSH_API_BASE=https://api.splus.ir
SOROUSH_TOKEN=bot-token
SOROUSH_DADDY_CHAT_ID=my-chat-id
SOROUSH_WEBHOOK_SECRET=some-random-string
SOROUSH_PARSE_MODE=HTML
```

* Every message is stored in `SoroushOutbox` first and **then** sent, so a broken token or a bad
  connection never loses anything. `manage.py sweep` retries the queue (up to `OUTBOX_MAX_RETRY`,
  default 5 attempts).
* Incoming webhook: `/api/soroush/webhook/<SOROUSH_WEBHOOK_SECRET>/` — that is how I can reply from
  Soroush and have the app react.
* **Nothing is ever pushed to her side through Soroush**; that channel is mine only. Her notifications
  are created inside the app (`OSNotification`).

### Events I receive

| Group | Events |
|---|---|
| Login & lock | `login` · `lock_help` · `forgot_ok` |
| Chat & hugs | `chat` · `hug` · `hug_seen` · `hug_miss` |
| Content | `voice_played` · `song_uploaded` · `letter_opened` · `memory_unlocked` · `mood` · `easter_egg` |
| Quiz & games | `quiz_perfect` · `puzzle` · `achievement` |
| Health | `med_added` · `med_taken` · `med_skipped` · `symptoms` · `period_start` · `period_end` · `cycle_anomaly` |
| Reminders | `reminder_sent` · `reminder_viewed` |
| Books & films | `book_new` · `book_chapter` · `book_comment` · `cinema_add` · `plan_add` · `plan_done` |
| **Calls** | `call_proposed` · `call_approved` · `call_rejected` · `call_rescheduled` · `call_logged` · `call_reminder` |
| **Gifts** | `gift_added` |
| **Reading together** | `reading_book` · `reading_note` · `reading_quote` · `reading_comment` |
| **Dream home** | `home_room` · `home_feature` · `home_idea` · `home_inspiration` · `home_comment` |
| **Language bridge** | `language_entry` · `language_quiz` · `language_practice` |
| **Location** | `location_change` |

---

## 8. API reference

Every private route needs `Authorization: Token <token>`. Responses are JSON.

### Shell & auth

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/boot` | public config + lock state (no secrets) |
| POST | `/api/auth/unlock` | open the lock with the passcode → session token |
| POST | `/api/auth/forgot` | answer the security question → unlock |
| POST | `/api/auth/help` | "Ask Daddy" → immediate Soroush message |
| POST | `/api/auth/logout` | end the session |
| GET | `/api/me` | full config once unlocked |
| GET/POST/PATCH | `/api/settings` | language, theme, sound, font scale |
| GET/POST | `/api/location` | read the effective location / report a fresh device position |
| GET | `/api/search` | global search (`q`, `app`, `kind`, `from`, `to`, `suggest`) |
| POST | `/api/vault/unlock` | open the vault |
| GET | `/healthz` | service health |

### Content

`/api/voices` (`…/random`, `…/<id>/played`) · `/api/songs` (`…/upload`, `…/<id>`, `…/<id>/played`) ·
`/api/memories` · `/api/letters` (`…/random`, `…/<id>/open`) · `/api/countdowns` · `/api/garden`
(`…/<id>/water`) · `/api/starmap` · `/api/cinema` (`…/<id>`) · `/api/quiz` (`…/submit`) · `/api/plans`
(`…/<id>`) · `/api/moods` (`…/set`) · `/api/vault` · `/api/tutorial` · `/api/terminal` (`…/sudo`) ·
`/api/egg` · `/api/achievements`

### Social

`/api/chat` · `/api/hug` (`…/send`, `…/<id>/open`) · `/api/notifications` (`…/read-all`, `…/<id>/read`) ·
`/api/reminders` (`…/<id>/mute`) · `/api/weather` · `/api/map`

### Health

`/api/cycle` (`…/start`, `…/end`, `…/symptoms`) · `/api/meds` (`…/today`, `…/act`, `…/report`) ·
`/api/care` (`…/<id>/toggle`)

### Library & games

`/api/books` (`…/<id>`, `…/<book_id>/chapters`) · `/api/chapters/<id>/publish` ·
`/api/pages/<page_id>/paragraphs` · `/api/pages/<page_id>/bookmark` · `/api/paragraphs/<id>` ·
`/api/paragraphs/<paragraph_id>/notes` · `/api/puzzles` (`…/<id>/start`, `…/<id>/complete`)

### Calls (`/api/calls`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/calls/overview` | everything the app needs in one request |
| GET/POST | `/api/calls/slots` | free windows + shared overlap |
| POST/DELETE | `/api/calls/slots/<id>` | remove a window |
| GET/POST | `/api/calls/appointments` | list / propose a call |
| POST | `/api/calls/appointments/<id>/respond` | approve, reject or propose an alternative |
| POST/DELETE | `/api/calls/appointments/<id>/cancel` | cancel |
| GET/POST | `/api/calls/logs` | call log (voice attachment via `multipart`) |
| PATCH/POST | `/api/calls/logs/<id>` | edit a log |
| GET | `/api/calls/stats` | month, six-month chart, record and average |
| GET | `/api/calls/next` | next call (for the desktop widget) |

### Gifts (`/api/gifts`)

`GET/POST /api/gifts` · `GET/PATCH/POST/DELETE /api/gifts/<id>` · `GET /api/gifts/occasions` ·
`GET /api/gifts/stats` — filters: `giver`, `receiver`, `occasion`, `year`, `band`, `q`.

### Read together (`/api/reading`)

`GET /api/reading/overview` · `GET/POST /api/reading/books` · `GET/PATCH/POST/DELETE /api/reading/books/<id>` ·
`POST /api/reading/books/<id>/chapters` · `POST /api/reading/books/<id>/progress` ·
`POST/GET /api/reading/chapters/<id>/notes` · `POST/GET /api/reading/chapters/<id>/quotes` ·
`POST /api/reading/chapters/<id>/comments` · `GET /api/reading/quotes` · `GET /api/reading/stats`.

To put a Library-app book on the shared shelf, send its `library_book` id with `POST /books`; if it is
already linked the same record comes back with `already: true`.

### Dream home (`/api/home`)

`GET /api/home/overview` · `GET/POST /api/home/features` · `PATCH/POST/DELETE /api/home/features/<id>` ·
`GET/POST /api/home/rooms` · `PATCH/POST/DELETE /api/home/rooms/<id>` ·
`POST/GET /api/home/rooms/<id>/ideas` · `GET/POST /api/home/inspirations` ·
`GET/POST/DELETE /api/home/inspirations/<id>` · `POST/GET /api/home/inspirations/<id>/comments` ·
`GET /api/home/categories` · `GET /api/home/stats` — room coordinates are percentages (0..100) and are
clamped server-side.

### Language bridge (`/api/language`)

`GET /api/language/overview` · `GET/POST /api/language/entries` ·
`GET/PATCH/POST/DELETE /api/language/entries/<id>` (pronunciation uploads use `pronunciation`) ·
`GET /api/language/categories` · `GET /api/language/flashcards` ·
`POST /api/language/practice` · `GET /api/language/quiz` · `POST /api/language/quiz/submit` ·
`GET /api/language/stats`.

### Outside `/api`

| Path | Purpose |
|---|---|
| `/` | LoveOS itself (SPA) |
| `/daddy-panel-9x7k/` | the Daddy Panel |
| `/api/media/<path>?sig=…` | short-lived signed private files |
| `/robots.txt` | keeps every crawler out |

---

## 9. Easter eggs & badges

### 15 easter eggs

| Egg | Trigger | What happens |
|---|---|---|
| Midnight sky | between 00:00 and 05:00 | the sky fills with hearts and stars |
| Anniversary heart | anniversary day | a floating heart on the desktop |
| Birthday cake | her birthday | a hidden cake icon |
| Magic sentence | typing "دوستت دارم" in chat | a rain of hearts |
| Old code | the Konami code on the desktop | a secret message |
| Sandwich | `sudo make sandwich` in the terminal | a playful reply |
| Delete loneliness | `rm -rf tanhayi` | a dedicated message |
| Heart rain | typing "love" anywhere | hearts across the screen |
| Daddy's help | five wrong passcodes | a help message from me |
| Hidden logo heart | five clicks on the logo | a hidden heart |
| Centre star | double-clicking a star | a special wish |
| Daddy's home | zooming far into the map | a home message |
| Our song | playing one song three times | an "our song" message |
| Missing you | three hugs in a row | a longing message |
| Special flower | watering one flower five times | a unique bloom |

### Badges (32)

*The original 16:* first login · first voice · 100 days with Daddy · perfect quiz · all letters ·
puzzle player · puzzle master · Daddy's cuddly chick · Daddy's kind girl · regular · self care ·
writer · storyteller · secret finder · secret master · know-it-all

*16 new in 2.0:* first call · ten calls · a hundred call hours · first gift · ten gifts · fifty gifts ·
first shared book · five books · ten books · a hundred notes · ten home features · fifty home features ·
first room · first word · a hundred words · language master

Every threshold is editable in the panel, as is each badge's secret message. When one unlocks, she gets
an in-app notification and I get a Soroush message.

---

## 10. Deployment

### One command

```bash
./scripts/deploy.sh
```

The script installs dependencies, collects static files, builds the frontend, applies migrations and
restarts the service. The full cPanel walkthrough is in [`DEPLOY_CPANEL_FA.md`](./DEPLOY_CPANEL_FA.md).

### Production checklist

- [ ] `DEBUG=False`
- [ ] a long random `DJANGO_SECRET_KEY`
- [ ] `ALLOWED_HOSTS` limited to my domain
- [ ] change `ADMIN_PATH` and set `ADMIN_GATE_PASSCODE`
- [ ] `SERVE_FRONTEND=True` on single-app hosting
- [ ] `NOTIFY_PROVIDER=soroush` with a real token
- [ ] `python manage.py check --deploy`
- [ ] `python manage.py migrate` then `collectstatic --noinput`
- [ ] `cd frontend && npm run build`
- [ ] a cron entry for `manage.py sweep` (every 15 minutes)
- [ ] daily backups of the database and `media/`

> Version 2.0 adds five migrations (`calls`, `gifts`, `reading`, `dreamhome`, `language`) plus
> `accounts.0003`. When upgrading, run `migrate` first.

### MySQL

Set `DB_ENGINE=mysql` in `.env` and fill the remaining `DB_*` keys. No code changes needed.

### Scheduled work (cron)

```cron
*/15 * * * * cd /home/USER/loveos/backend && .venv/bin/python manage.py sweep >> /home/USER/loveos-sweep.log 2>&1
```

`sweep` opens timed memories, releases future letters, sends medication and care reminders, delivers
pending notifications, **fires approved-call reminders** and flushes the Soroush queue.

---

## 11. Maintenance, tests & troubleshooting

### Routine

| Cadence | What I do |
|---|---|
| daily | glance at `ActivityLog` and the Soroush outbox |
| weekly | back up the database + `media/`, check disk space |
| monthly | `pip list --outdated` and `npm outdated`, review panel content |
| every update | `migrate` → `npm run build` → restart the service |

### Tests

```bash
# backend: 97 tests (models, APIs, search, location, panel, constellations, UI quality)
cd backend && .venv/bin/python manage.py test

# frontend: type-check, lint, build and 8 UI suites (214 checks)
cd frontend && npx tsc -b && npx oxlint src && npm run build && npm run test:ui
```

The backend tests lock in: call overlap detection, approve/reject/reschedule flows, a single-shot call
reminder, gift stats and price bands, reading progress and the shared shelf, room-coordinate clamping,
language flashcards/streak and the rule that quizzes only come from panel questions, Persian-tolerant
search, effective location (live vs. panel vs. stale) and the fact that every registered model renders
in the panel without errors.

### Frontend UI tests (no browser needed)

These tests run under **jsdom** so that checking the interface never requires opening a browser: each
`frontend/tests/*.tsx` file is bundled with esbuild and then executed as a Node program.

```bash
cd frontend
npm run test:ui            # both files
npm run test:ui window-manager-settings
```

| File | What it locks down |
|---|---|
| `tests/window-manager-settings.tsx` | Open/close/minimize, geometry staying put while clicking, correct z-order, no ghost of a closed window, reopening at the previous position, and language + theme actually being applied and stored |
| `tests/apps-render.tsx` | All five new apps booting against real backend responses (`tests/fixtures.json`), global search, desktop icons and the next-call widget |

The backend responses in `tests/fixtures.json` were captured from the live API, so if an endpoint
contract changes, these tests complain before the app does.

### Common problems

| Symptom | Likely cause | Fix |
|---|---|---|
| "app opens but the page is blank" | an old service-worker release | The service worker now updates itself (`skipWaiting`/`clientsClaim`); if you still see it, hard-refresh once and ship a fresh `npm run build` |
| close/minimize on a window does nothing | window geometry changing under the pointer | Since 2.0 geometry is frozen; if it recurs, check the console that `AppWindow` renders its `z-index` on the wrapper |
| letters/numbers look mirrored | the y-axis in the star map | Since 2.0 the y-axis is corrected and the letter direction is switchable (RTL/LTR) |
| location, clock or weather looks stale | the panel value is being used because the live fix is old | Turn on live location in her Settings, or update the panel value |
| `/api/settings` returns 405 | unsupported method | Since 2.0 it accepts `GET`/`POST`/`PATCH`/`PUT` |
| Soroush messages do not arrive | token or connectivity | Inspect `SoroushOutbox` (status, tries, error) then run `manage.py sweep` |
| white screen after an update | stale build files in the browser cache | fresh build + one hard refresh |
| the panel will not load | `ADMIN_PATH` or the gate | read the path from `.env` and enter the gate passcode if enabled |

### Useful queries

```bash
# what did she do today?
.venv/bin/python manage.py shell -c "
from core.models import ActivityLog
[print(a.created_at, a.title, a.detail) for a in ActivityLog.objects.all()[:20]]"

# which secrets has she found?
.venv/bin/python manage.py shell -c "
from core.models import EasterEggLog
[print(l.created_at, l.egg.title) for l in EasterEggLog.objects.all()]"

# her latest live position
.venv/bin/python manage.py shell -c "
from accounts.models import LiveLocation
l = LiveLocation.current()
print(l.city, l.lat, l.lng, l.age_minutes(), 'minutes ago') if l else print('not recorded')"

# force the Soroush queue
.venv/bin/python manage.py shell -c "
from core.soroush import flush_outbox; print(flush_outbox())"

# clear the search cache
.venv/bin/python manage.py shell -c "
from core.services import clear_app_cache; print(clear_app_cache())"
```

---

## 12. What changed in 2.0

### Bugs fixed

1. **Closed windows would not reopen.** The window manager was rewritten: geometry is chosen once and
   then frozen, stacking lives on the outer wrapper, and a fading window no longer captures clicks.
2. **Letters in the star map were mirrored.** The y-axis was inverted (an `M` used to look like a `W`)
   and letter order was fixed for RTL; there is now a toggle between right-to-left and left-to-right.
3. **Location was measured from the stale stored value.** Every app now reads the "effective location"
   whose first priority is her live device position, and the stored coordinates/city are synced
   automatically so all apps agree.
4. **Desktop apps "did not work".** The shared cause was a stale cached PWA shell and chunk loading:
   `skipWaiting`, `clientsClaim` and `cleanupOutdatedCaches` were enabled and a `vite:preloadError`
   handler now performs a clean reload. An error boundary was also added around every app so one
   failure can no longer blank the whole OS.
5. **The settings theme toggle had no effect.** The theme is now stored on the server and on the
   device, applied immediately, and works with `auto/day/night`.
6. **Changing language only flipped the text direction.** All the new apps and their locale keys are
   fully bilingual, and switching language now swaps the whole interface, not just the direction.
7. **`PATCH /api/settings` returned 405.** The view now accepts `GET`, `POST`, `PATCH` and `PUT`, and
   silently ignores invalid values instead of failing.
8. **The date range in global search was not precise.** The "from … to …" filter passed a raw `date`
   to datetime fields (which also produced naive-datetime warnings) and the fuzzy fallback ignored the
   range altogether, so out-of-range records could surface. Range boundaries are now timezone-aware,
   "to this date" includes the whole day, and both search paths (exact and fuzzy) honour the range.
9. **Denying microphone permission failed silently.** Call Sync and Language Bridge now show a clear
   line saying microphone access was refused and that the browser settings need to allow it.

### New in this version

* **Five new apps** (Call Sync, Gift Book, Read Together, Dream Home, Language Bridge) plus
  **global search** — six new pieces in total.
* **Five new model groups** across those apps + `LiveLocation` in `accounts` and two search-related
  settings keys on `UserConfig`.
* **21 search sources** with Persian-tolerant matching, app/date/kind filters and a 45-second cache.
* **16 new badges and 6 new tutorial chapters** for the new apps.
* **Call reminders** in `sweep`, with a configurable window (5–180 minutes).
* **In-app microphone recording** for call voice notes and word pronunciation — no manual uploads.
* **97 backend tests** plus 8 frontend suites (`npm run test:ui`, 214 checks) covering the window
  manager, settings (language/theme), global search, the rendering of every new app against real
  backend responses, and the 3D depth tiers.

---

---

## 13. The 3D quality tier

The 3D skin has four tiers. The governing principle: **quality must never be
paid for with "it stopped working."** When a device cannot afford it, the
system steps down by one tier itself and the app stays on its feet.

### Tiers

| Stored value | Persian label | What is enabled |
|---|---|---|
| `auto` | خودکار (auto) | Device probe + real frame measurement, then automatic choice |
| `lite` | مهتاب (moonlight) | "Painted" depth: shadow, bevel, surface gradient — no 3D `transform` |
| `balanced` | بلور (crystal) | CSS rotation, pointer tilt (desktop) and gyro tilt (Android), layered extrusion |
| `dream` | کهکشان (galaxy) | Everything in balanced, plus real WebGL: a `three.js` starfield and a MapLibre globe |

The Persian labels are poetic on purpose — a child reads this setting. The
**stored** value stays `lite|balanced|dream`, so engine logic and the backend
never couple to display language.

### Where things live

| File | Role |
|---|---|
| `frontend/src/shared/quality.ts` | Device probe, scoring, FPS watchdog, `attachPointerTilt` / `attachGyroTilt`, `canUseGlobe` |
| `frontend/src/shared/depth.tsx` | Shared toolkit: `useQualityTier`, `useMotionAllowed`, `Tilt`, `Extrude`, `Specular`, `AmbientDepth` |
| `frontend/src/styles/index.css` | CSS tokens: `--q3d`, `--rim-light`, `--ao-shadow`, `--well-face`, `--btn-edge`, `--light-x/y` |
| `frontend/src/three/useThreeScene.ts` | The only place in the project that creates a `WebGLRenderer` + live-scene cap + full disposal |
| `backend/content/models.py` | `Constellation.kind` (letter or shape) |
| `backend/accounts/models.py` | `UserConfig.ui_quality` |

### Why most of the work is in CSS, not JS

`--q3d` is `0` in lite and `1` in balanced/dream. 3D values **multiply** it:

```css
.os-stage-3d { perspective: calc(1200px * var(--q3d) + 100000px * (1 - var(--q3d))); }
.os-depth    { transform: rotateY(calc(var(--tilt-x, 0deg) * var(--q3d))); }
.os-sky-depth-far { transform: translateZ(calc(-90px * var(--q3d))); }
```

In lite the perspective becomes effectively infinite and the rotation zero —
**with no `if` branch in JavaScript** and no React re-render on theme change.
That keeps the bundle small and removes the whole class of "we forgot to gate
that app" bugs.

### Hard rules that must not be broken

1. **Text never tilts.** `Tilt` wraps visuals (the heart, a plant, a memory
   photo, a gift box), never a text container or a scroll region.
2. **`Tilt`/`Extrude` go inside a scroll region, never on the scroller.**
   Safari flattens `preserve-3d` when `overflow` is anything but `visible`,
   and the whole effect dies silently.
3. **Never two sources of `transform` on one element.** CSS animations win the
   cascade over inline `style`, so a framer animation or a tilt variable
   silently swallows the other. Each needs its own element.
4. **No `color-mix()`.** It needs Safari 16.2+ and our target phone runs
   iOS 15. Use `linear-gradient` and `rgba` instead.
5. **Do not turn `Extrude` back into cloning `children`.** If children carry a
   `<defs>` with an `id`, N copies mean N duplicate ids → invalid HTML, and
   every layer picks up the first gradient. `Extrude` takes a `path` instead
   and renders `defs` once, on the front face. The `depth-tiers` suite locks
   `id="hb"` to exactly one occurrence.
6. **Every `three.js` scene must be released.** `useThreeScene` enforces a
   project-wide cap of 2 live scenes (iOS Safari is strict and silently kills
   the oldest `context`), and on cleanup disposes geometry/material/texture
   individually and calls `forceContextLoss`.

### The FPS watchdog

In the galaxy tier a watchdog measures frames in 2.2-second windows. Two
consecutive readings below the threshold step the tier down, persist it in
`localStorage` (`loveos_quality_downgrade_v1`) so the next session does not
repeat the jank, and show one gentle, one-shot notice. It never downgrades
silently: a child would think the app is broken.

The watchdog pauses while the page is hidden — otherwise a background tab
would report low frames and quality would drop for no reason.

### Three real traps that have guards in the code

* **Measuring frames during boot** reads a falsely low number. The engine
  decides first on the static score, then defers the FPS pass to a browser idle
  moment (`requestIdleCallback`).
* **Gyro on iOS** needs a permission gesture; that is not justifiable for a
  decorative effect, so `attachGyroTilt` returns `null` there.
* **`pointermove` also fires during touch scroll.** Listening to it would tilt
  cards while scrolling (a seasick UI), so pointer tilt accepts
  `pointerType === 'mouse'` only.

### The map globe

`canUseGlobe(tier, report)` is a **pure** function in `shared/quality.ts` so it
can be tested without booting maplibre. Three conditions: `dream` only, never
on a **Mali**-family GPU (a known maplibre latitude-precision bug in globe
projection, issue #7419 — Tehran and Istanbul sit near the affected band), and
only real, non-software WebGL. The guard disables **the globe only**, not the
whole quality tier. `setProjection` is inside `try/catch` too, so a driver that
throws leaves the map working in flat mode rather than blank.

### Bundle and PWA

`three.js` (135KB gzip) sits behind `lazy()` in its own chunk and is excluded
from `precache` (`globIgnores` in `vite.config.ts`), served instead by a
`CacheFirst` runtime rule. So a lite-tier user never downloads it, yet the
first time someone really opens the 3D sky it caches and then works offline.

⚠️ If `frontend/src/three/StarmapSky.tsx` is ever renamed, the `globIgnores`
pattern and the `urlPattern` in `vite.config.ts` must change with it, or the
chunk silently re-enters the precache.

### Adding 3D to a new app

```tsx
import { Tilt, Extrude, useMotionAllowed, useQualityTier } from '../shared/depth'

const tier = useQualityTier()          // ⚠️ hooks go above any early return
const allowed = useMotionAllowed()     // ⚠️ call both unconditionally; `a() && b()`
const deep = tier !== 'lite' && allowed //    breaks the Rules of Hooks

// Wrap the visual element (never the text):
{deep ? <Tilt maxDeg={9}>{art}</Tilt> : art}
```

For a solid body use `Extrude` (a `path`, not `children`); for background
motion use `AmbientDepth`, which emits zero particles in lite and half as many
in balanced.

### Tests

`frontend/tests/depth-tiers.tsx` forces each tier with
`useOS.setState({ uiQuality })` (the engine vetoes to lite in the test
environment, so this is the only way to reach the deep branches) and asserts:
`id="hb"` uniqueness, text staying out of tilt containers, extrusion layer
counts per tier, graceful degradation with no WebGL, `kind` inference from
`letter` when the API omits it, ≥44px touch targets, and seven `canUseGlobe`
cases.

⚠️ This suite calls `process.exit` explicitly: the heartbeat `setTimeout`
chain and framer's endless animations keep Node's event loop alive, so without
it the test passes but the process hangs until the timeout.

<div align="center">

**LoveOS, version 2.0**

*Built by Daddy, for his daughter.*
*The distance is only a number. Our hearts are always in the same place.* ❤

</div>
