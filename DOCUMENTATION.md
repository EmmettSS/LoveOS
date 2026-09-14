# LoveOS — Technical & User Documentation

> A tiny romantic operating system in the browser.
> Built by Daddy, for his daughter, across a distance that is only a number.

**Version:** 1.0 · **Default language:** Persian (fa) · **Second language:** English (en)
**Persian version of this document:** [`DOCUMENTATION_FA.md`](./DOCUMENTATION_FA.md)

---

## Table of contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Installation & setup](#3-installation--setup)
4. [The 27 apps](#4-the-27-apps)
5. [The Daddy Panel](#5-the-daddy-panel)
6. [Soroush bot integration](#6-soroush-bot-integration)
7. [API reference](#7-api-reference)
8. [Easter eggs](#8-easter-eggs)
9. [Deployment](#9-deployment)
10. [Maintenance & troubleshooting](#10-maintenance--troubleshooting)

---

## 1. Overview

### What LoveOS is

LoveOS is a **Progressive Web App disguised as a miniature operating system**. It boots, asks for a
passcode, shows a desktop with widgets and a dock, and hosts 27 small apps — each one a different way
of saying *I love you* across a long distance.

It was written as a gift from a programmer father ("بابا" / Daddy) to his fiancée/daughter
("دخترم" / my daughter). The tone throughout is warm, playful and childlike. Every visible string is
addressed to her.

### Design principles

| Principle | What it means in practice |
|---|---|
| **Nothing is hardcoded** | Every piece of content — messages, voices, letters, photos, quiz questions, terminal replies, easter-egg texts — lives in the Django admin and can be changed without touching code. |
| **Secret by construction** | The app lives on an unlisted domain reached by a QR code. `robots.txt` blocks everything, every response carries `X-Robots-Tag: noindex`, and the admin sits behind a secret path plus its own passcode gate. |
| **Mobile-first, desktop-nice** | Designed for a phone in her hand; on a wide screen apps become draggable floating windows. |
| **Two languages, zero hardcoded text** | All UI strings live in `frontend/public/locales/{fa,en}/translation.json`. Persian is the default and the layout is RTL. |
| **Offline-friendly** | A service worker precaches the shell, fonts and icons, so the OS opens even on a bad connection. |
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
        ┌──────────┐   clock · countdown · both cities' weather · today's message
        │ DESKTOP  │   24 app icons · dock · start menu · notification center
        └────┬─────┘
             ▼
          27 apps
```

### Repository layout

```
LoveOS/
├── backend/                 Django 5 + DRF
│   ├── config/              settings, root urls
│   ├── core/                notifications, outbox, achievements, counters,
│   │                        easter eggs, Soroush client, sweep command
│   ├── accounts/            UserConfig (the single source of truth), sessions
│   ├── content/             voices, songs, memories, letters, countdowns,
│   │                        garden, constellations, cinema, quiz, plans,
│   │                        moods, vault, tutorial, terminal commands
│   ├── social/              chat, hugs, gentle reminders
│   ├── health/              cycle, symptoms, medications, self-care
│   ├── library/             books, chapters, pages, paragraphs, notes
│   ├── games/               heart puzzle
│   ├── templates/           admin gate page
│   └── media/               uploaded files
├── frontend/                React 19 + Vite + TypeScript
│   ├── public/
│   │   ├── locales/         fa + en translation files
│   │   ├── fonts/           self-hosted woff2 (no CDN)
│   │   ├── icons/           logo + PWA icons
│   │   └── backgrounds/     boot / lock / desktop wallpapers
│   └── src/
│       ├── os/              Boot, Lock, Desktop, Dock, StartMenu,
│       │                    NotificationCenter, Window, EggOverlay
│       ├── apps/            the 25 app components
│       ├── shared/          api, store, i18n, format, sound, Icon, ui
│       ├── App.tsx          phase machine + global easter-egg listeners
│       └── main.tsx
├── scripts/                 dev.sh · build.sh · deploy.sh · qr.py
├── DOCUMENTATION.md         this file
└── DOCUMENTATION_FA.md      Persian version
```

---

## 2. Architecture

### Stack

**Backend**

| Piece | Choice | Why |
|---|---|---|
| Framework | Django 5.2 | Free admin panel — which *is* the Daddy Panel. |
| API | Django REST Framework | Simple function-based views, one file per domain. |
| Database | SQLite (dev) / MySQL (prod) | Switched by `DB_ENGINE`; MySQL uses `utf8mb4`. |
| Auth | Custom token sessions | There is only one user; Django's user system is reserved for the admin. |
| Scheduling | `manage.py sweep` via cron | One command per minute; Celery optional if Redis exists. |
| Notifications | Soroush Plus bot | Telegram-compatible API at `api.splus.ir`. |

**Frontend**

| Piece | Choice |
|---|---|
| Framework | React 19 + TypeScript + Vite 8 |
| Styling | Tailwind CSS 3 with CSS custom properties for day/night |
| Animation | Framer Motion (+ GSAP available) |
| State | Zustand (`useOS`) |
| i18n | i18next + react-i18next |
| Maps | MapLibre GL + OpenStreetMap raster tiles (no API key) |
| Audio | Web Audio API (synthesized) + `<audio>` for uploaded media |
| Dates | jalaali-js for the Persian calendar |
| PWA | vite-plugin-pwa (Workbox, autoUpdate) |

> **Note on 3D:** `@react-three/fiber` requires React `>=19 <19.3`, which conflicted with the pinned
> React version, so it was dropped. The starmap is rendered with animated SVG instead — lighter,
> sharper, and it works on old phones.

### Request flow

```
  Browser (PWA)
      │  relative URLs only: /api/..., /media/...
      ▼
  Nginx  ──/api/──►  Gunicorn ──► Django
      │              /daddy-panel-9x7k/
      ├──/static/──► collected static
      ├──/media/───► uploads
      └── /  ──────► frontend/dist (SPA fallback)
```

In development, Vite proxies `/api`, `/media`, `/static`, `/healthz` and the admin path to
`127.0.0.1:8000`, so the browser only ever talks to one origin.

### Authentication model

There is exactly **one** daughter and **one** Daddy, so there is no user table for the app itself.

1. `POST /api/auth/unlock {passcode}` → verifies against the salted hash in `UserConfig`.
2. On success a `DeviceSession` row is created and a random token returned.
3. The frontend stores it in `localStorage` under `loveos_token` and sends
   `Authorization: Token <token>` on every request.
4. Sessions expire after `SESSION_TTL_HOURS` (default 30 days).
5. Any `401` clears the token and drops the UI back to the lock screen.
6. The Vault has a **second** passcode that unlocks only for `VAULT_SESSION_MINUTES` (default 20).

Failed attempts are recorded in `UnlockAttempt`. After `MAX_UNLOCK_ATTEMPTS` (5) the lock screen
reveals an "Ask Daddy for help" button which pings Daddy over Soroush — and quietly triggers an
easter egg.

### The phase machine

`useOS.phase` is `boot | lock | desktop`. `App.tsx` renders one of the three and installs the global
keyboard listeners (Konami code, typing "دوستت دارم"). Windows are objects in `useOS.windows` with a
z-index; on mobile they render as full-screen sheets, on desktop as draggable cards.

### Day/night theming

`useNightMode()` returns night between 18:00 and 06:00 (or follows the manual override from
Settings) and writes `data-theme="night"` on `<html>`. All colours are CSS variables
(`--os-bg`, `--os-card`, `--os-accent`, …), so the whole OS switches palette in one step.

---

## 3. Installation & setup

### Requirements

- Python 3.11+
- Node.js 20+
- MySQL 8 (production only — development uses SQLite)

### Quick start

```bash
git clone <repo> LoveOS && cd LoveOS
./scripts/dev.sh
```

`dev.sh` creates the virtualenv, installs everything, copies `.env`, migrates, seeds and runs both
servers. When it finishes:

- **Her app:** http://localhost:5173
- **Daddy Panel:** http://localhost:8000/daddy-panel-9x7k/

### Manual setup

```bash
# ---- backend
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env            # then edit it
.venv/bin/python manage.py migrate
.venv/bin/python manage.py seed_loveos --passcode 1234 --vault 0000
.venv/bin/python manage.py createsuperuser
.venv/bin/python manage.py runserver 0.0.0.0:8000

# ---- frontend (second terminal)
cd frontend
npm install
npm run dev -- --host 0.0.0.0
```

### Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `DEBUG` | `True` | Turn **off** in production. |
| `DJANGO_SECRET_KEY` | — | Long random string. Mandatory in production. |
| `ALLOWED_HOSTS` | `*` | Comma-separated hostnames. |
| `CSRF_TRUSTED_ORIGINS` | `https://*.e2b.app` | Needed for the admin over HTTPS. |
| `TIME_ZONE` | `Asia/Tehran` | Server timezone. |
| `ADMIN_PATH` | `daddy-panel-9x7k` | Secret admin prefix (no leading slash). |
| `ADMIN_GATE_PASSCODE` | *(empty)* | Second passcode before Django's login. Empty = gate off. |
| `DB_ENGINE` | `sqlite` | `sqlite` or `mysql`. |
| `DB_NAME` / `DB_USER` / `DB_PASSWORD` / `DB_HOST` / `DB_PORT` | — | MySQL connection. |
| `NOTIFY_PROVIDER` | `console` | `console` (log only) or `soroush` (send for real). |
| `SOROUSH_API_BASE` | `https://api.splus.ir` | Bot API root. |
| `SOROUSH_TOKEN` | — | Token from `splus.ir/botfather`. |
| `SOROUSH_DADDY_CHAT_ID` | — | Daddy's chat id. |
| `SOROUSH_WEBHOOK_SECRET` | `loveos-hook` | Secret segment of the webhook URL. |
| `SOROUSH_PARSE_MODE` | `HTML` | `HTML`, `MarkdownV2` or `Markdown`. |
| `SESSION_TTL_HOURS` | `720` | How long she stays unlocked (30 days). |
| `VAULT_SESSION_MINUTES` | `20` | Vault auto-relock. |
| `MAX_UNLOCK_ATTEMPTS` | `5` | Failures before the help button appears. |
| `API_RATE_LIMIT` | `300/min` | Throttle. |

### Seeding

`manage.py seed_loveos` is **idempotent** — it only fills what is missing. It creates the config row,
the passcodes, the 6 "M-A-R-Y-A-M" constellations, 4 flowers, the quiz, wish list, mood messages,
tutorial chapters, terminal commands, 16 achievements, 15 easter eggs and 3 puzzles.

```bash
.venv/bin/python manage.py seed_loveos --passcode 1234 --vault 0000
```

### Generating her QR code

```bash
python3 scripts/qr.py https://your-secret-domain.com --out loveos-qr.svg
```

`scripts/qr.py` implements QR encoding from scratch (byte mode, error-correction level M,
versions 1–10) with **no external dependency**. It prints the code to the terminal and optionally
writes an SVG in LoveOS colours, ready to print and slip into a card.

---

## 4. The 27 apps

Twenty-four have desktop icons. **Gentle Reminders** deliberately has none (it lives only in the
Notification Center), and **Notification Center** and **About** are shell surfaces rather than icons.

### Emotional core

**1 · Map of Us** — `map`
Two heart pins on an OpenStreetMap canvas, a dashed arc between them, live local time and a day/night
badge for each city, the great-circle distance in kilometres, and a "fly the route" button that
animates from his city to hers and back. Closes with Daddy's line: *"Distance is just a number.
Our heart is one."*

**2 · Voice Vault** — `voice`
His voice notes, filed by how she feels: mornings, nights, when you miss me, when you're happy, when
you're sad, when you can't sleep. A "random voice note" button pulls one at random. Every playback
notifies Daddy. Upload is **Daddy-only**.

**3 · Our Music** — `music`
The main song sits on top with a "why this song?" note from him, plus lyrics and cover art. Below it
the playlist, a sleep timer (10/20/30/45 minutes, then everything fades out), and — because she asked —
**she can upload her own songs too**. Her uploads are labelled "by me", she can delete only her own,
and Daddy is notified and sees the uploader in the admin. He can switch her upload right off with
`allow_daughter_music_upload`.

**4 · Memories** — `memories`
A vertical timeline of photos, text, place and an optional voice note. Future memories appear as
`؟؟؟` with a lock and a "opens on …" date — the `sweep` command unlocks them and tells her. A
slideshow mode cross-fades through the photos.

**5 · Whisper Letters** — `whisper`
Paper envelopes on a shelf. Tapping one unfolds it with a 3D flip, paper rustle and Nastaliq
typography. Time-locked letters stay sealed until their date. "A random letter for today" picks one.
Opening a letter tells Daddy.

**6 · Countdown** — `countdown`
Live countdowns to the next meeting, birthdays, anniversaries — days/hours/minutes, refreshing every
minute, each with its own icon and a celebration message when it reaches zero.

**7 · Weather of Us** — `weather`
Both cities side by side with animated skies (drifting sun, falling rain, snow), temperature,
humidity, wind, sunrise and sunset. When the two temperatures are close it says *"Our weather is the
same today — it's like we're side by side."* Data from Open-Meteo (no API key).

**8 · Heartbeat** — `heartbeat`
A large pulsing heart with a synthesized lub-dub and a matching short vibration on every beat. Hold
your finger on it and the rate climbs from 72 to ~122 BPM; let go and it calms down.

**9 · Our Garden** — `garden`
Four flowers grown from SVG — stem, leaves, petals — in five stages. Watering makes the plant grow,
plays a bloom chime and shows a random message Daddy wrote.

**10 · Star Sky** — `starmap`
Her name spelled out as constellations on a deep-navy sky with twinkling star dust. Tap a letter and
its stars light gold while Daddy's line for that letter appears; "light up the whole name" turns them
all on at once.

**11 · Terminal of Love** — `terminal`
A playful shell: `help`, `whoami`, `ls /heart`, `cd /us`, `love --status`, `heartbeat --live`,
`distance --km`, `music --list`, `play voice --random`, `memory --random`, `future --countdown`,
`clear`, `exit`. `sudo kiss` asks for a fake password and then rains kisses; `sudo hug --force`
creates a real hug with vibration. Some commands open other apps. Custom commands and their outputs
are editable in the admin. Arrow keys walk the history.

**12 · Chat with Daddy** — `chat`
Her messages go straight to his Soroush; his replies arrive through the webhook and appear as bubbles
marked "via Soroush". Polls every 6 seconds.

**13 · My Mood** — `mood`
Six moods as big emoji buttons. Picking one notifies Daddy and returns the message *and voice note*
he recorded for exactly that mood.

**14 · Our Quiz** — `quiz`
"How well do you know Daddy?" — one question at a time with a progress bar, then a score, per-question
review with explanations, and a secret reward message for a perfect score.

**15 · Future Plans** — `plans`
A shared wish list in four categories (travel, work, wish, home). She can add and tick items; ticking
one tells Daddy. She can delete only her own.

**16 · Our Cinema** — `cinema`
Films and series to watch together: status (not watched / watching / watched), a 5-star rating, a
watch link and posters.

**17 · The Vault** — `vault`
A second passcode guards photos, voices, videos and notes that are just for her. The session
auto-relocks after 20 minutes.

**18 · Hug Me** — `hug`
Two directions, **both with vibration**:
- *Her → him:* the big heart button sends a hug, vibrates her phone, plays a heartbeat, washes the
  screen in a warm colour and pings his Soroush instantly.
- *Him → her:* his hug waits as a card; opening it vibrates with the pattern set in the admin
  (default `200 / 100×3 / 200`), plays the heartbeat sound and glows warm. He is told she felt it.

Counters for both directions are shown. Three hugs in a row triggers an easter egg and a "she really
misses you" nudge to Daddy.

**19 · Heart Puzzle** — `puzzle`
A photo sliced into 3×3, 4×4 or 5×5 tiles; swap two tiles to sort them. Timer, move counter, personal
best and a limited number of hints (a brief peek at the full picture). Finishing shows Daddy's message
and voice, and tells him her time.

**20 · Badges** — `achievements`
Sixteen achievements with a progress bar. Locked ones are greyed out; unlocking reveals the secret
message Daddy attached.

### Care & everyday

**21 · Cycle & Care** — `cycle` *(sensitive)*
Five tabs:
- **Calendar** — start/end the period; a six-week grid shows actual, predicted and ovulation days.
- **Symptoms** — eight 0–5 scales (mood, energy, headache, backache, cramps, nausea, sleep, appetite)
  plus a note. Severe days quietly ask Daddy to send her something kind.
- **Medications** — today's doses with **Took it / Remind me later / Can't take it**; each choice is
  a distinct Soroush event.
- **Reports** — 30-day adherence percentage and a bar chart of cycle lengths, with out-of-range bars
  in red.
- **Self care** — gentle toggles (drink water, stretch, rest) from the admin.

All statistics are computed **only** from her own history. If the cycle length leaves the 21–35 day
range the app says so, and Daddy is nudged to remind her to see a doctor. Every screen carries:
*"This app is not a substitute for medical advice."* On the admin side the whole section requires a
**second confirmation password** and every view is written to `HealthAccessLog`. Daddy has full
visibility — there is no private mode.

**22 · Our Library** — `library`
A shelf of books. Reading is page-by-page with a 3D page turn, paper texture, adjustable text size,
optional page images and audio, bookmarks, and margin notes (double-tap a paragraph). She can write
her own chapters — save as **draft**, then **publish**, which notifies Daddy. Paragraphs are
colour-coded by author, and she can only edit her own.

**23 · Gentle Reminders** *(no desktop icon)*
Lives only in the Notification Center, under its own tab. Reminders come from Daddy's manual entries
and from automatic rules in `sweep`: weather-based ("take an umbrella", "keep warm", "drink more
water", "have a warm tea"), cycle-aware, anniversaries, birthdays and occasional random warmth. Hard
rules: **no daily nagging** and **at most 5 active reminders at a time**. She can mute any of them,
and Daddy is told when she has seen one.

### System

**24 · Tutorial** — `tutorial`
Friendly lessons written by Daddy — what an OS is, what apps are, the desktop and dock, what a
terminal is, how the library works, and so on. The **Help** button in an app's title bar opens the
exact lesson for that app. It contains **no mention of easter eggs**.

**25 · Settings** — `settings`
Language (fa/en), theme (auto/day/night), sound, vibration, font size (85–140%), notification
permission, install-as-app prompt, About and log out. Settings are saved server-side so they follow
her to any device.

**26 · Notification Center** *(dock)*
All system notifications — new letter, memory unlocked, achievement, hug, chat, medication — plus the
Gentle Reminders tab. Unread badge on the dock bell, "mark all read", and tapping a notification opens
the relevant app. Polls every 45 seconds.

**27 · About LoveOS** *(start menu)*
Logo, version, a text from Daddy, both names and the number of days together.

---

## 5. The Daddy Panel

### Getting in

```
https://your-domain.com/<ADMIN_PATH>/        e.g. /daddy-panel-9x7k/
```

Two layers:
1. **The gate** (`AdminGateMiddleware`) — a small pink page asking for `ADMIN_GATE_PASSCODE`. It runs
   before CSRF so the plain form works, and stores a flag in the session.
2. **Django login** — the superuser created with `createsuperuser`.

Every response carries `X-Robots-Tag: noindex, nofollow, noarchive`.

### What he controls

| Section | Models | What it drives |
|---|---|---|
| **Config** | `UserConfig` | Names, nickname, cities and coordinates, timezones, anniversary, birthday, next meeting, boot greeting, wrong-password message, help message, security question/answer, today's message, about text, logo, all four wallpapers, language, theme, sound, font scale, passcodes, `allow_daughter_music_upload`. |
| **Content** | `Voice`, `Song`, `Memory`, `Letter`, `Countdown`, `Flower`, `FlowerMessage`, `Constellation`, `CinemaItem`, `QuizQuestion`, `QuizReward`, `FuturePlan`, `MoodMessage`, `VaultItem`, `TutorialChapter`, `TerminalCommand` | Every word and file she sees. |
| **Social** | `ChatMessage`, `Hug`, `HugSettings`, `Reminder`, `ReminderLog` | Chat history, sending hugs, the vibration pattern and warm colour, gentle reminders. |
| **Health** | `CycleEntry`, `SymptomLog`, `Medication`, `MedicationLog`, `CareReminder`, `HealthAccessLog` | Behind the second password; access is logged. |
| **Library** | `Book`, `Chapter`, `Page`, `Paragraph`, `MarginNote`, `Bookmark` | Writing books with her; `allow_daughter_edit` per book. |
| **Games** | `Puzzle`, `PuzzleRecord` | Puzzle images, difficulty, hints, end message and voice. |
| **Core** | `OSNotification`, `SoroushOutbox`, `ActivityLog`, `Achievement`, `AchievementUnlock`, `Counter`, `EasterEgg`, `EasterEggLog` | Notifications, the Soroush queue, her activity, badges and the easter-egg texts. |

### Everyday recipes

**Send her a hug right now** — Social → Hugs → Add, direction `daddy_to_daughter`, write the text,
save. It appears in her Hug app and vibrates when she opens it.

**Record a voice for a mood** — Content → Voices → upload the file, then Content → Mood messages →
pick the mood → attach that voice. Next time she taps that mood, she hears him.

**Write a letter for her birthday** — Content → Letters → Add, set `open_at`. It stays sealed until
that moment, then `sweep` opens it and notifies her.

**Change an easter-egg message** — Core → Easter eggs → pick the trigger → edit title/message/
attachment. The trigger logic is in code; every word is his.

**Turn her music uploads off** — Config → uncheck `allow_daughter_music_upload`.

---

## 6. Soroush bot integration

### Setup

1. Talk to `@botfather` on Soroush Plus and create a bot; copy the token.
2. Put `SOROUSH_TOKEN`, `SOROUSH_DADDY_CHAT_ID` and `SOROUSH_WEBHOOK_SECRET` in `.env` and set
   `NOTIFY_PROVIDER=soroush`.
3. Register the webhook (ports 443, 80, 88 and 8443 only):

```bash
curl "https://api.splus.ir/bot<TOKEN>/setWebhook?url=https://your-domain.com/api/soroush/webhook/<SECRET>/"
curl "https://api.splus.ir/bot<TOKEN>/getWebhookInfo"
```

The API is Telegram-compatible: `https://api.splus.ir/bot<token>/METHOD`, every response is
`{ok, result | description}`.

### The ~20 events he receives

| Event | Fires when |
|---|---|
| `login` | She unlocks LoveOS. |
| `lock_help` | She presses "Ask Daddy for help" after 5 wrong passcodes. |
| `forgot_ok` | She gets in via the security question. |
| `voice_played` | She listens to one of his voice notes. |
| `letter_opened` | She opens a letter. |
| `memory_unlocked` | A future memory unlocks for her. |
| `song_uploaded` | She uploads a song. |
| `mood` | She sets her mood. |
| `chat` | She sends a chat message. |
| `hug` | She hugs him. |
| `hug_seen` | She opens a hug he sent. |
| `hug_miss` | Three hugs in a row — she really misses him. |
| `quiz_perfect` | She scores full marks. |
| `puzzle` | She finishes a puzzle (with her time). |
| `plan_add` / `plan_done` | She adds or ticks a wish. |
| `cinema_add` | She adds a film or series. |
| `book_new` / `book_chapter` / `book_comment` | She creates a book, publishes a chapter, or leaves a margin note. |
| `period_start` / `period_end` | She logs the start or end of her period. |
| `cycle_anomaly` | Her cycle length leaves the normal range. |
| `symptoms` | She logs a hard day (severity ≥ 4). |
| `med_taken` / `med_skipped` / `med_added` | Medication actions. |
| `reminder_sent` / `reminder_viewed` | A gentle reminder was sent / she saw it. |
| `achievement` | She unlocks a badge. |
| `easter_egg` | She discovers a secret. |

### Delivery guarantees

`notify_daddy()` writes the message to `SoroushOutbox` and tries to send immediately. If the network
or token is unavailable it stays queued; `manage.py sweep` calls `flush_outbox()` every minute and
retries. With `NOTIFY_PROVIDER=console` nothing leaves the machine — it just logs, which is what the
development environment uses.

### Chat back

When Daddy replies to the bot, Soroush POSTs an `Update` to
`/api/soroush/webhook/<secret>/`. The handler checks the secret, filters by `SOROUSH_DADDY_CHAT_ID`,
stores the text as a `ChatMessage` with `via="soroush"` and raises a notification. Inline-button
callbacks are always acknowledged with `answerCallbackQuery`, as the API requires.

---

## 7. API reference

Base: `/api`. Everything except `/boot`, `/auth/unlock`, `/auth/forgot` and `/auth/help` needs
`Authorization: Token <token>`.

### Shell & auth

| Method | Path | Purpose |
|---|---|---|
| GET | `/boot` | Public config that drives Boot and Lock. |
| POST | `/auth/unlock` | `{passcode}` → `{ok, token}` or a playful failure message. |
| POST | `/auth/forgot` | `{answer}` → token if the security answer matches. |
| POST | `/auth/help` | Ping Daddy over Soroush. |
| POST | `/auth/logout` | End the session. |
| GET | `/me` | Full config for the unlocked session. |
| PATCH | `/settings` | Language, theme, sound, font scale. |
| POST | `/vault/unlock` | `{passcode}` → opens the vault for 20 minutes. |

`GET /boot` returns:

```json
{
  "config": {
    "daughter_name": "مریم", "daughter_nickname": "دخترم", "daddy_name": "بابا",
    "days_together": 365,
    "next_meeting": "2026-10-29T07:31:46Z",
    "next_meeting_delta": { "days": 44, "hours": 23 },
    "boot_greeting": "سلام دخترم...",
    "wrong_pass_message": "...", "lock_help_message": "...", "security_question": "...",
    "language": "fa", "theme": "auto", "sound_enabled": true, "font_scale": 1.0,
    "logo": null, "boot_background": null, "lock_background": null,
    "desktop_background_day": null, "desktop_background_night": null,
    "is_birthday": false, "is_anniversary": false, "has_passcode": true
  },
  "unlocked": false
}
```

### Content

```
GET    /voices                     GET    /voices/random
POST   /voices/<id>/played
GET    /songs                      POST   /songs/upload      (multipart)
DELETE /songs/<id>                 POST   /songs/<id>/played
GET    /memories
GET    /letters                    GET    /letters/random
POST   /letters/<id>/open
GET    /countdowns
GET    /garden                     POST   /garden/<id>/water
GET    /starmap
GET    /cinema                     POST   /cinema
PATCH  /cinema/<id>                DELETE /cinema/<id>
GET    /quiz                       POST   /quiz/submit
GET    /plans                      POST   /plans
PATCH  /plans/<id>                 DELETE /plans/<id>
GET    /moods                      POST   /moods/set
GET    /vault
GET    /tutorial[?key=...]
```

### Social

```
GET    /chat[?since=<id>]          POST   /chat
GET    /hug                        POST   /hug/send          POST /hug/<id>/open
GET    /notifications              POST   /notifications/read-all
POST   /notifications/<id>/read
GET    /reminders                  POST   /reminders/<id>/mute
POST   /terminal                   POST   /terminal/sudo
POST   /egg                        GET    /achievements
GET    /weather                    GET    /map
```

### Health

```
GET    /cycle                      POST   /cycle/start       POST /cycle/end
GET    /cycle/symptoms             POST   /cycle/symptoms
GET    /meds                       POST   /meds
GET    /meds/today                 POST   /meds/act
GET    /meds/report
GET    /care                       POST   /care/<id>/toggle
```

### Library & games

```
GET    /books                      POST   /books
GET    /books/<id>                 POST   /books/<id>/chapters
POST   /chapters/<id>/publish
POST   /pages/<id>/paragraphs      POST   /pages/<id>/bookmark
PATCH  /paragraphs/<id>            DELETE /paragraphs/<id>
POST   /paragraphs/<id>/notes
GET    /puzzles                    POST   /puzzles/<id>/start
POST   /puzzles/<id>/complete
```

### Outside `/api`

```
POST   /api/soroush/webhook/<secret>/     Soroush updates
GET    /robots.txt                        Disallow: /
GET    /healthz                           "ok"
ANY    /<ADMIN_PATH>/                     Daddy Panel
```

---

## 8. Easter eggs

> **This section is for Daddy only.** The tutorial, the About page and every other surface contain
> **zero hints** that easter eggs exist. She should only ever stumble on them.

The *trigger logic* is in code; the *title, message and attachment* of every egg live in
Core → Easter eggs, so he can rewrite them whenever he wants. Discovering one rains hearts across the
screen, vibrates gently and notifies Daddy.

| # | Key | How she finds it |
|---|---|---|
| 1 | `click_logo_5` | Tap the logo five times on the boot screen. |
| 2 | `type_love` | Type "دوستت دارم" (or "i love you") anywhere in the OS. |
| 3 | `konami` | ↑ ↑ ↓ ↓ ← → ← → B A on a keyboard. |
| 4 | `terminal_rm` | `sudo rm -rf /loneliness` in the terminal. |
| 5 | `terminal_sandwich` | `sudo make me a sandwich`. |
| 6 | `midnight` | Open LoveOS between 00:00 and 05:00 — the sky fills with hearts and stars. |
| 7 | `birthday` | On her birthday a cake icon appears on the desktop. |
| 8 | `anniversary` | On their anniversary a beating heart icon appears. |
| 9 | `map_zoom` | Zoom all the way into Daddy's city on the map. |
| 10 | `star_double_click` | Double-tap a single star in the star sky. |
| 11 | `garden_5_water` | Water the same flower five times. |
| 12 | `hug_3` | Send three hugs in a row (Daddy also gets "she really misses you"). |
| 13 | `chat_love` | Write "دوستت دارم" in the chat. |
| 14 | `music_3_play` | Play the main song three times. |
| 15 | `lock_5_wrong` | Get the passcode wrong five times. |

Discoveries are recorded in `EasterEggLog`, feed the `eggs_found` counter and unlock the
`secret_finder` / `secret_master` badges.

### Badges (16)

`first_login`, `first_voice`, `days_100`, `quiz_perfect`, `all_letters`, `puzzle_player`,
`puzzle_master`, `hug_bunny`, `kind_daughter`, `med_regular`, `self_care`, `writer`, `storyteller`,
`secret_finder`, `secret_master`, `know_it_all`.

---

## 9. Deployment

### One command

```bash
sudo APP_DIR=/srv/loveos DOMAIN=loveos.example.com ./scripts/deploy.sh
```

It pulls, installs, builds the frontend, migrates, collects static, writes the systemd unit and the
Nginx site, installs the cron job and reloads everything.

### Production checklist

- [ ] `DEBUG=False` and a long random `DJANGO_SECRET_KEY`
- [ ] `ALLOWED_HOSTS` set to the real domain
- [ ] `ADMIN_PATH` changed from the default
- [ ] `ADMIN_GATE_PASSCODE` set
- [ ] `DB_ENGINE=mysql` with `utf8mb4` and `mysqlclient` installed
- [ ] HTTPS certificate (`certbot --nginx -d your-domain.com`)
- [ ] Soroush webhook registered; `getWebhookInfo` clean
- [ ] Cron installed: `* * * * * cd /srv/loveos/backend && .venv/bin/python manage.py sweep`
- [ ] `media/` backed up (it holds his voice)
- [ ] QR code printed from `scripts/qr.py`

### MySQL

```sql
CREATE DATABASE loveos CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'loveos'@'localhost' IDENTIFIED BY 'strong-password';
GRANT ALL PRIVILEGES ON loveos.* TO 'loveos'@'localhost';
FLUSH PRIVILEGES;
```

### Optional Celery

If Redis is available, replace the cron job with:

```bash
celery -A config worker -l info
celery -A config beat -l info
```

The cron path is the default because it needs no extra services.

---

## 10. Maintenance & troubleshooting

### Routine

| Task | Command |
|---|---|
| Database backup | `mysqldump loveos > backup-$(date +%F).sql` |
| Media backup | `tar czf media-$(date +%F).tar.gz backend/media` |
| Check the queue | Admin → Core → Soroush outbox (`sent=False` = still pending) |
| Run the scheduler by hand | `.venv/bin/python manage.py sweep` |
| Deploy checks | `.venv/bin/python manage.py check --deploy` |
| Health probe | `curl https://your-domain.com/healthz` → `ok` |

### Common problems

**She can't get in.** Reset the passcode:

```bash
.venv/bin/python manage.py shell -c "
from accounts.models import UserConfig
c = UserConfig.get_solo(); c.set_passcode('1234'); c.save()"
```

**Soroush messages never arrive.** Check `NOTIFY_PROVIDER=soroush`, then
`curl https://api.splus.ir/bot<TOKEN>/getMe`, then look at `SoroushOutbox` for the stored error.
Remember `console` mode only logs.

**His replies don't show up in chat.** Run `getWebhookInfo` and read `last_error_message`. The URL
must be HTTPS on port 443/80/88/8443, the secret must match `SOROUSH_WEBHOOK_SECRET`, and
`SOROUSH_DADDY_CHAT_ID` must be his real chat id (a mismatch silently ignores the message).

**Scheduled things never happen.** The cron job is missing — `crontab -l | grep sweep`. Run
`manage.py sweep` manually and read the summary line it prints.

**The service worker serves a stale build.** `registerType` is `autoUpdate`, so a reload normally
fixes it; otherwise clear the site data. Nginx is configured never to cache `/sw.js`.

**Weather shows "—".** Open-Meteo was unreachable; the app degrades gracefully and retries every
15 minutes. Check outbound HTTPS from the server.

**Vibration does nothing.** `navigator.vibrate` is unsupported on iOS Safari — this is a platform
limitation. Everything else (warm glow, heartbeat sound, message) still works.

### Useful queries

```bash
# What has she been doing?
.venv/bin/python manage.py shell -c "
from core.models import ActivityLog
[print(a.created_at, a.title, a.detail) for a in ActivityLog.objects.all()[:20]]"

# Which secrets has she found?
.venv/bin/python manage.py shell -c "
from core.models import EasterEggLog
[print(l.created_at, l.egg.trigger) for l in EasterEggLog.objects.all()]"

# Force the Soroush queue
.venv/bin/python manage.py shell -c "
from core.soroush import flush_outbox; print(flush_outbox())"
```

---

<div align="center">

**LoveOS v1.0**

*Made by Daddy, for his daughter.*
*Distance is just a number. Our heart is one.* ❤

</div>
