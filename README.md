# LoveOS

> A tiny operating system in the browser. I built it for my daughter, so the distance between us
> feels a little shorter every day.

![backend](https://img.shields.io/badge/backend-Django%205.2%20%2B%20DRF-0C4B33)
![frontend](https://img.shields.io/badge/frontend-React%2019%20%2B%20Vite%208-61DAFB)
![tests](https://img.shields.io/badge/tests-83%20backend%20%2B%207%20UI%20suites-ec4899)

LoveOS boots, asks for a passcode, shows a desktop with widgets and a dock, and opens **30 small
apps** — voice notes, letters, memories, a shared map, a garden, a star sky, chat, hugs, quizzes,
call planning, a gift book, reading together, a dream home, a language bridge and more. Everything
she sees is written by me in an admin panel; nothing is hard-coded. Everything she does reaches me
through a Soroush bot.

## Documentation

| File | |
|---|---|
| [`DOCUMENTATION.md`](./DOCUMENTATION.md) | **Complete documentation (English)** — architecture, apps, panel, API, deployment on VPS / cPanel / Docker / Plesk / PaaS, scripts, tests, maintenance |
| [`DOCUMENTATION_FA.md`](./DOCUMENTATION_FA.md) | مستندات کامل به فارسی |
| [`docs/soroush-api-reference.md`](./docs/soroush-api-reference.md) | Soroush Plus bot API reference |

## Run it on your machine

```bash
git clone https://github.com/EmmettSS/LoveOS.git
cd LoveOS
./scripts/dev.sh
```

| | |
|---|---|
| Her app | http://localhost:5173 |
| Daddy Panel | http://localhost:8000/daddy-panel-9x7k/ |
| Passcode / vault | `1234` / `0000` |

Requirements: Python 3.10+, Node.js 20+. No database server needed locally.

## Deploy it

```bash
./scripts/deploy.sh vps       # Ubuntu/Debian: Nginx + Gunicorn + systemd + cron + certbot
./scripts/deploy.sh cpanel    # cPanel / Passenger (also DirectAdmin, Plesk)
./scripts/deploy.sh docker    # docker compose: web + MySQL + Caddy (auto-HTTPS)
./scripts/deploy.sh package   # tarball for hosts without git/node
./scripts/deploy.sh verify    # smoke test a live deployment
```

Every step for every host type is in [DOCUMENTATION.md § 10](./DOCUMENTATION.md#10-deployment).

## Tests

```bash
./scripts/dev.sh test         # 83 backend tests + type check + lint + build + 7 UI suites
```

## Layout

```
backend/    Django 5 + DRF — 12 apps, admin panel, scheduler (manage.py sweep)
frontend/   React 19 + Vite 8 + TypeScript — the OS shell and 30 apps, PWA
deploy/     Nginx / systemd templates, Dockerfile + compose + Caddy
scripts/    dev.sh · deploy.sh · qr.py
```

---

*Distance is just a number. Our hearts are always one.* ❤
