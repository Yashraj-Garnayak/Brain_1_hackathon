# TILE RUSH

TILE RUSH is a three-round reflex game with accounts, BPI titles, leaderboards, health insights, custom emotes and live 1v1 rooms. It runs as a responsive website and an Android app, backed by the same API and Postgres data.

## Test it now

### Website

1. Open **https://tile-rush.uday.live**
2. As a guest, finish the forced **How to Play** tutorial.
3. Choose **KIDS** or **SPORTS** on the pre-run screen and press **START RUN**.
4. Sign in or create an account to bank runs, see the leaderboard and open the profile.

### Android

1. Install `~/Downloads/tile-rush-debug.apk`:
   ```bash
   adb install -r ~/Downloads/tile-rush-debug.apk
   ```
2. Open **TILE RUSH**.
3. Finish the tutorial if shown, choose **KIDS / SPORTS**, then play.
4. Sign in with the same account used on the website to see the same profile, runs and leaderboard.

### Run locally

```bash
npm install
cp .env.example .env
npm run migrate
npm run dev
```

- Site/API: http://localhost:3000
- Worker: http://127.0.0.1:8787

Android build:

```bash
cd android
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
ANDROID_HOME=$HOME/POS/android-sdk \
$HOME/POS/tools/gradle-8.9/bin/gradle :app:assembleDebug --no-daemon
```

## Links, logins and test data

| Item | Value |
| --- | --- |
| Website | https://tile-rush.uday.live |
| Worker | https://tile-rush.text-udaykumar.workers.dev |
| Android APK | `~/Downloads/tile-rush-debug.apk` |
| Demo ring data | account `ishowspeed` (ask the team for the password) |
| Local test account | create any new username/password on the auth screen |
| Room test | create a room, join with a second account, watch with a third |

There is no shared public password in the repo. For local ring testing, add `ULTRAHUMAN_TOKEN` and `ULTRAHUMAN_USERNAME` to `.env` and run:

```bash
npm run seed -- ishowspeed
```

## What to test

- Guest tutorial and new-account tutorial
- Solo run: 3 rounds, deck timer, wrong-tap penalty, result and BPI
- `KIDS` vs `SPORTS` symbol theme
- Title/fingerprint popup on home, result, profile and leaderboard
- Leaderboards and profile
- Insights / Health tabs and **Ask about your data**
- Emote editor and duel emotes
- 1v1 quick match and private room
- Room creator controls: room theme + spectator emotes
- Spectator view: input highlight, metrics, emote feed and mute
- Android parity for the same flows

The short QA checklist is in `docs/QA-SMOKE-TEST.md` and `docs/TILE-RUSH-QA-TEST-PLAN.docx`.

## Known limitations

- **One ring owner only.** Ultrahuman is configured with a single partner token and `ULTRAHUMAN_USERNAME`. Other accounts can play and see their own runs, but they do not get ring metrics; there is no per-user OAuth/ring-linking flow.
- **Ring sync is request-driven.** Health data refreshes when the Insights/Health page loads and a stored period is missing or stale. There is no background cron, so a very recent day can lag until the next load.
- **Solo BPI trusts submitted trials.** The server recomputes BPI from the trial array sent by the client. 1v1 scores are server-authoritative, but solo BPI integrity depends on the client not fabricating trial data; there is no full replay validation.
- **Accounts have no recovery flow.** Username/password only: no email, password reset, OAuth, 2FA or account merging.
- **Emote presets and the personal symbol theme are device-local.** They are stored in `localStorage`/`SharedPreferences`, not synced across devices. Room theme and room emote flags do sync for that room.
- **Spectator mode is live-only.** Up to 20 spectators, read-only, no spectator chat/emotes, and no post-match replay viewer.
- **The insights helper is rule-based.** It only understands the built-in terms and question patterns; it is not an LLM and is not medical advice.
- **Android is a debug build.** Min SDK 26, portrait-locked, no Play Store signing/auto-update, and no iOS app.
- **No dedicated TV/kiosk mode.** Large-screen layouts are responsive CSS; the browser still supplies chrome, and there is no remote-control navigation or auto-fullscreen.
- **QA is manual.** There is no automated browser/Android E2E suite in the repo; `docs/QA-SMOKE-TEST.md` is the manual checklist.

## Repository map

```
index.html, insights.html, health.html   web pages
css/, js/, shared/                       web client and shared BPI maths
api/, lib/, db/                          Vercel API, Postgres helpers, schema
worker/                                  Cloudflare Worker + Durable Objects
android/                                 Kotlin + Jetpack Compose app
docs/                                    short QA checklist + Word export
.env.example                             local environment template
```

## Environment and Ultrahuman

Copy `.env.example` to `.env` and fill:

- `DATABASE_URL` / `DATABASE_URL_UNPOOLED` — Neon/Postgres
- `MATCH_SECRET` — same value in Vercel and the Worker
- `MATCH_URL` — Worker URL
- `ULTRAHUMAN_TOKEN` — Ultrahuman Partner API token
- `ULTRAHUMAN_USERNAME` — Tile Rush account whose ring is used

Ultrahuman token notes:

1. Get a Partner API token for the ring owner.
2. Put it in `ULTRAHUMAN_TOKEN` exactly as issued — the code sends it as the raw `Authorization` header, not `Bearer`.
3. Set `ULTRAHUMAN_USERNAME` to the matching Tile Rush username.
4. Test:
   ```bash
   curl -H "Authorization: $ULTRAHUMAN_TOKEN" \
     "https://partner.ultrahuman.com/api/v1/partner/daily_metrics?start_epoch=1793055600&end_epoch=1793142000"
   ```

`.env` and `worker/.dev.vars` are gitignored. `.env.example` is safe to commit.

## Deployment

- Web: push to `Uday517/Brain_1_hackathon`; Vercel deploys from Git.
- Worker: `npm run worker:assets && npx wrangler deploy --config worker/wrangler.toml`
- Android: build the debug APK and copy it to `~/Downloads/tile-rush-debug.apk`.
