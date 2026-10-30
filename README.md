# TILE RUSH

TILE RUSH is a three-round reflex trainer with a 0–1000 **Brain Performance Index (BPI)**, titles, archetypes, leaderboards, health insights, custom multiplayer emotes, 1v1 duels, private rooms and live spectators.

It ships as:

- a **web app** served from Vercel,
- an **Android app** with the same game and data,
- a **Cloudflare Worker + Durable Objects** realtime layer for 1v1,
- a **Neon Postgres** database for accounts, runs, seasons, profiles and health days.

Live site: **https://tile-rush.uday.live**  
Realtime Worker: **https://tile-rush.text-udaykumar.workers.dev**

---

## 1. What is in the repo

```
index.html                 web game shell (home, run, result, profile, duel, tutorial)
insights.html              INSIGHTS / HEALTH METRICS tabs
health.html                legacy health view, linked from the tabs
css/                       web styles (CRED warm-charcoal theme)
js/                        web client
  game.js                  solo run, scoring, BPI, profile/settings, themes
  duel.js                  1v1, rooms, spectators, emotes, room settings
  emotes.js                8 per-account emote presets
  shapes.js                KIDS shapes + 40-item SPORTS theme
  badges.js                title/fingerprint explainer
  assistant.js             “Ask about your data” helper
  insights.js              insights calendar/charts
  health.js                daily ring metrics
  profile.js               public profile + radar
  account.js               session/account API client
shared/bpi.js              BPI maths shared by browser + server
api/                       Vercel serverless REST API (Hobby: max 12 functions)
  auth/                    register, login, logout, me
  match/ticket.js          mints short-lived 1v1 tickets
  health.js                combined insights + Ultrahuman endpoint
  runs.js                  submit a run
  leaderboard.js           global/regional boards
  profile.js               avatar/update
  rank.js                  weekly rank
  users/[username].js      public profile
  ghost.js                 ghost replay
lib/                       server helpers (DB, auth, BPI, insights, Ultrahuman, Elo)
db/schema.sql              Postgres schema
scripts/                   migrate, seed, dev, worker asset copy
worker/                    Cloudflare Worker
  src/index.js             router + API proxy + static assets
  src/match-room.js        room/match Durable Object
  src/queue-room.js        matchmaking queue
  src/ticket.js            verifies Vercel-signed tickets
  wrangler.toml            Worker config
android/                   Android app (Kotlin + Jetpack Compose)
  app/src/main/java/live/uday/tilerush/
    MainActivity.kt
    data/                  Api, DuelManager, models
    game/                  Board, Engine, BPI, SymbolTheme
    ui/                    all screens + components
docs/                      QA test plan
PROGRESS.md                running implementation notes
.env.example               safe template for local setup
```

---

## 2. Features

### Solo run

- Fixed 3-round format: 3×3 / 25 s, 4×4 / 15 s, 5×5 / 10 s.
- 2.5 s → 2.0 s → 1.5 s deck timers, 5-second breaks.
- Target requires **both** the symbol and the colour to match.
- Wrong tap: −30 points, −1 second in solo, streak reset.
- Missed deck timer: miss, board churns, answer is never revealed.
- Cycle clears, tier multipliers and speed-based scoring.
- Deterministic seeded boards for 1v1 and spectator mirrors.

### Symbol themes

- **KIDS** — the original geometric shapes.
- **SPORTS** — a curated 40-item sports set (balls, bats, rackets, protective
  gear, footwear, training gear, flags, timing equipment).
- The choice is made on the **pre-run screen**:
  - Web: `SYMBOLS` control above `START RUN`.
  - Android: `SYMBOLS KIDS / SPORTS` on the home play screen.
- The theme is locked once the countdown starts.
- Sports icons are a seed-derived slice of 16 from the 40, so every run differs
  and 1v1 clients/spectators stay in sync.
- Colour is shown as a coloured ring/background around the icon.

### BPI, titles and fingerprints

- BPI is 0–1000, computed from seven axes: speed, search, precision,
  consistency, updating, resilience, capacity.
- Titles: DRIFTER → SPARK → SCOUT → HUNTER → TRACKER → SHARPSHOOTER →
  TACTICIAN → MAESTRO → NOVA.
- Fingerprints: SCANNER, SNIPER, METRONOME, GRINDER, SWITCHBACK, ALL-ROUNDER.
- Click any title or archetype badge (home, result, profile, leaderboard) to open
  the explainer:
  - all 9 titles with BPI ranges,
  - all 6 archetypes with rules,
  - `YOU` marker,
  - your latest seven axis values when available.

### Accounts and profile

- Username + password only; scrypt hashes; 120-day HTTP-only session cookie.
- Profile: best BPI, best score, runs, season rank, radar, seasons, recent runs.
- Settings: weekly rank on home, How to Play, connected devices, session.
- Private emote editor: 8 emoji + text presets per account.

### Emotes

- 8 defaults, editable in Profile → Settings.
- Web stores in `localStorage` per username; Android in `SharedPreferences`.
- Available in the duel lobby and during round breaks.
- Server sanitises emoji/text and rate-limits to one per 900 ms.
- Spectators can see player emotes and locally mute them.
- Room creators can disable spectator emote visibility for the room.

### 1v1 and rooms

- Quick match by rating.
- Private room with 6-character code, two players and up to 20 spectators.
- Lockstep boards: the first correct read or expired timer advances both boards.
- Server-authoritative scores; late claims rejected.
- Room creator controls (before the match starts):
  - symbol theme for the room (`KIDS` / `SPORTS`),
  - spectator emotes `ON` / `OFF`.
- Everyone in the room sees the chosen theme; spectators see the same sports
  icons as the players.
- Spectators see **player input** (last tapped tile, green/red) instead of the
  correct answer being highlighted.
- Spectator boards also show score, round, deal, accuracy, streak, hits/misses.

### Insights and health

- Two tabs: `INSIGHTS` and `HEALTH METRICS`.
- Week/month navigation, calendar, day detail, best/worst windows.
- Ring averages: recovery, sleep, HRV, resting HR.
- Daily ring cards: sleep score, time in bed, efficiency, deep/REM/light,
  HRV, resting HR, temperature deviation, steps, bedtime.
- Trend charts: recovery, sleep score, HRV, resting HR.
- Sleep-stage bars.
- **Ask about your data** — offline, rule-based helper. It explains terms and
  answers questions about the loaded period. No AI or network calls.

### Leaderboards

- Global and regional.
- BPI, score or rating.
- Weekly and season boards.
- Click a player to open their profile; click a title to open the explainer.

### Forced How to Play

- Guests see the tutorial on first visit and must finish it (close hidden,
  back disabled on page 1).
- New accounts see it on their first signed-in visit, even if they already
  watched as a guest.
- Android blocks system back while the forced tutorial is open.

---

## 3. Local setup

Requirements: **Node 20+**, npm, a Neon/Postgres database, and (for Android)
JDK 21 + Android SDK.

```bash
npm install
cp .env.example .env          # fill values
npm run migrate               # applies db/schema.sql
npm run dev                   # site + API + worker
```

`npm run dev` starts:

- Vercel dev / API on `http://localhost:3000`
- Wrangler worker on `http://127.0.0.1:8787`

For API only:

```bash
npm run dev -- --api
```

For a static-only preview without accounts:

```bash
python3 -m http.server 3000
```

Then open `http://localhost:3000`. Use `?api=http://localhost:3000` if the
static files are served from a different port.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | pooled Neon/Postgres connection for the API |
| `DATABASE_URL_UNPOOLED` | yes for migrate/seed | direct connection for schema + seed scripts |
| `MATCH_SECRET` | yes for 1v1 | HMAC secret for short-lived match tickets |
| `MATCH_URL` | yes for 1v1 | public Worker URL |
| `ULTRAHUMAN_TOKEN` | for ring data | Ultrahuman Partner API token |
| `ULTRAHUMAN_USERNAME` | for ring data | Tile Rush username whose ring is the source |
| `VERCEL_OIDC_TOKEN` | optional | written by `vercel env pull`; do not hand-edit |

`MATCH_SECRET` must be the **same** in Vercel and Cloudflare:

```bash
openssl rand -base64 32
# put in .env / Vercel
printf '%s\n' "$MATCH_SECRET" | npx wrangler secret put MATCH_SECRET --config worker/wrangler.toml
```

### Ultrahuman bearer token

TILE RUSH uses the **Ultrahuman Partner API**:

```
GET https://partner.ultrahuman.com/api/v1/partner/daily_metrics
    ?start_epoch=<unix seconds>&end_epoch=<unix seconds>
Authorization: <your partner token>
```

The token is sent **raw** (not `Bearer ...`) by `lib/ultrahuman.js`.

How to get it:

1. Get access to the Ultrahuman Partner API / partner dashboard for the ring
   owner (Ultrahuman issues partner tokens to approved partners).
2. Generate an API token for that account/team.
3. Put it in `ULTRAHUMAN_TOKEN`.
4. Set `ULTRAHUMAN_USERNAME` to the TILE RUSH username whose runs should carry
   ring data (for the demo, `ishowspeed`).
5. Test it:

```bash
curl -H "Authorization: $ULTRAHUMAN_TOKEN" \
  "https://partner.ultrahuman.com/api/v1/partner/daily_metrics?start_epoch=1793055600&end_epoch=1793142000"
```

6. Sync/seed:

```bash
npm run seed -- ishowspeed
```

If the token is missing, the health pages still work but show no ring data.

### Vercel environment

Set the same variables in Vercel → Project → Settings → Environment Variables
for Production and Preview. `VERCEL_OIDC_TOKEN` is generated by Vercel; use
`vercel env pull .env.local` to refresh it locally.

---

## 4. Web architecture

- Static HTML/CSS/JS, no bundler.
- `shared/bpi.js` is loaded by the browser and required by the API so the
  displayed BPI and the authoritative BPI use identical rules.
- `api/health.js` combines insights and the Ultrahuman proxy to stay within the
  Vercel Hobby 12-function limit:
  - `/api/health?kind=insights&from=…&to=…&today=…&sync=1&tzOffset=…`
  - `/api/health?kind=ultrahuman&start_epoch=…&end_epoch=…`
- Static assets are cache-busted with `?v=YYYYMMDDx` in the HTML and served with
  long-lived cache headers from `vercel.json`.
- `syncRingPeriod` skips the Ultrahuman round-trip when `health_days` already
  covers the requested period (today’s row refreshes after 15 minutes).

### Key API routes

| Route | Purpose |
| --- | --- |
| `POST /api/auth/register` | create account |
| `POST /api/auth/login` | sign in |
| `POST /api/auth/logout` | sign out |
| `GET /api/auth/me` | current session |
| `POST /api/runs` | submit a run, returns BPI + feedback |
| `GET /api/leaderboard` | boards |
| `GET /api/users/:username` | profile |
| `GET /api/rank` | weekly rank |
| `GET /api/ghost` | best-run ghost |
| `POST /api/match/ticket` | short-lived 1v1 ticket |
| `GET /api/health` | insights / Ultrahuman |

---

## 5. 1v1 Worker

The Worker is a router plus two Durable Objects:

- `QueueRoom` — matchmaking queue.
- `MatchRoom` — one queue match or private room.

The browser gets a signed ticket from Vercel and opens a WebSocket to the
Worker. Cookies cannot cross to `workers.dev`, so the ticket carries identity.

Room protocol highlights:

- `settings { theme, spectatorEmotes }` — creator only, before the match starts.
- `input { round, deal, index, correct }` — player tap, broadcast to spectators.
- `emote { emoji, text }` — rate-limited; spectators receive it only when the
  room’s `spectatorEmotes` flag is on.
- `ready`, `progress`, `solved`, `churn`, `penalty`, `finish`, `rematch`.

Deploy:

```bash
npm run worker:assets
npx wrangler deploy --config worker/wrangler.toml
```

Local Worker:

```bash
printf '%s\n' "$MATCH_SECRET" > worker/.dev.vars
npm run worker:dev
```

---

## 6. Android app

Kotlin + Jetpack Compose, package `live.uday.tilerush`.

Screens:

- Home (play, theme choice, rank, quick links)
- Auth
- Tutorial (forced when required)
- Game (board, goal, timer, HUD)
- Result (score, BPI, title/fingerprint explainer)
- Duel (queue, rooms, room settings, spectator boards, emotes)
- Leaderboard
- Profile (profile / settings / devices)
- Insights (`INSIGHTS` / `HEALTH` tabs + Ask about your data)

Build:

```bash
cd android
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
ANDROID_HOME=$HOME/POS/android-sdk \
$HOME/POS/tools/gradle-8.9/bin/gradle :app:assembleDebug --no-daemon
```

Install:

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

The app talks to the same production API and Worker. Account sessions are kept
in `SharedPreferences` (`tile_rush_cookies`); settings and emote presets are
stored locally per account.

---

## 7. Deploy

### Web

Push to the connected GitHub repo (`Uday517/Brain_1_hackathon` or the parent
fork) and Vercel deploys automatically. If the CLI is authenticated, you can
also deploy from a temp directory **without `.git`**:

```bash
npx vercel --prod --yes
```

Bump the `?v=` query in `index.html`, `insights.html`, `health.html` when
shipping CSS/JS changes so browsers fetch the new assets.

### Worker

```bash
npm run worker:assets
npx wrangler deploy --config worker/wrangler.toml
```

### Android

Build the debug APK and copy it to the download location used for testing:

```bash
cp android/app/build/outputs/apk/debug/app-debug.apk ~/Downloads/tile-rush-debug.apk
```

---

## 8. Testing and QA

- QA test plan: `docs/QA-TEST-PLAN.md`
- Word version: `docs/TILE-RUSH-QA-TEST-PLAN.docx`
- Smoke test at the top of the QA plan covers the fastest end-to-end path.

Recommended screens for visual QA:

| Width | What to check |
| --- | --- |
| 360 px | phone: no horizontal scroll, tiles fit, buttons reachable |
| 768 px | tablet: two-column layouts, nav |
| 1126 px | laptop: home/sidebar, board, profile |
| 1920 px | large monitor: no tiny text, full board visible |
| 2560 px | mirror/TV: same layout, readable from distance |

The site uses large-screen widths (home up to 1760 px, spectator up to 1680 px)
and raises the smallest labels above 1500 px.

---

## 9. Troubleshooting

| Symptom | Check |
| --- | --- |
| `/api` 500 | `DATABASE_URL`, `npm run migrate` |
| 1v1 socket fails | `MATCH_SECRET` matches Worker secret, `MATCH_URL` correct |
| No ring data | `ULTRAHUMAN_TOKEN`, `ULTRAHUMAN_USERNAME`, token expiry |
| Android can’t sign in | emulator DNS / phone network; use a real device |
| Stale CSS/JS | bump `?v=` in HTML, hard refresh |
| Room creator controls missing | only the first player in a new room is creator; settings lock after countdown |
| Spectator sees no emotes | room creator set spectator emotes OFF, or local mute is OFF |

---

## 10. Security notes

- Never commit `.env`, `.env.local`, `worker/.dev.vars`, database URLs or the
  Ultrahuman token.
- `.env.example` is the safe template.
- Session cookies are HTTP-only; match identity uses short-lived HMAC tickets.
- Emote text is sanitised and rate-limited; room settings are creator-only and
  locked once the match starts.
- The Worker is stateless for accounts; all account data stays in Neon.
