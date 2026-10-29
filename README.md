# TILE RUSH

A browser reflex trainer built around **target updating**: find the one tile that matches a shape-and-colour target while the board keeps moving. Three rounds, a non-stopping clock, procedural pressure music, an Elo-style duel rating, accounts, a **0–1000 Brain Performance Index (BPI)**, titles, seasonal stats, and layered global/regional leaderboards.

The client is plain HTML/CSS/JS with no build step. Accounts, runs, profiles and leaderboards are Neon Postgres behind Vercel serverless functions in `api/`. A Cloudflare Worker + Durable Objects scaffold lives in `worker/` for the realtime 1v1 phase — see [Cloudflare / 1v1](#cloudflare--1v1).

## Run it

```bash
npm install
npm run migrate      # applies db/schema.sql to DATABASE_URL_UNPOOLED
npx vercel dev       # serves the site and /api on http://localhost:3000
```

`npm run migrate` reads `DATABASE_URL_UNPOOLED` (falling back to `DATABASE_URL`). Locally those come from `.env.local`, which is created by `vercel env pull` after the Neon integration is connected.

A plain static server (`python3 -m http.server`) still works for the game loop, but without `/api` there are no accounts, BPI or leaderboards. Use the `?api=http://localhost:3000` flag if you serve the files from a different port.

## Accounts

- Username + password only. No email, OAuth or social login.
- Usernames are unique case-insensitively, `^[A-Za-z0-9_]{3,16}$`, and displayed in the casing you chose.
- Passwords are hashed with scrypt. Sessions are random 256-bit tokens stored hashed in Postgres and sent as an HTTP-only `tr_session` cookie valid for 120 days (`SameSite=Lax`, `Secure` on HTTPS), so a refresh keeps you signed in.
- Start requires an account. The **play without an account** escape hatch still exists; those runs are never ranked.
- The old **reset data** control is hidden for regular players. It only appears with `?dev=1` and only clears local guest data, never your account.

## The run: three rounds

Every run is the same fixed format, so BPI is comparable between players and across seasons:

| Round | Grid | Clock | Churn | Cycle |
| --- | --- | --- | --- | --- |
| 1 | 3×3 | 25 s | every 2.5 s | 10 correct |
| 2 | 4×4 | 15 s | every 2.0 s | 8 correct |
| 3 | 5×5 | 10 s | every 1.5 s | 6 correct |

- 3-second masked countdown before round 1: target and tiles are blurred until GO, so nobody can pre-scan.
- **5-second breaks** between rounds show the round summary and a breathing prompt. This is also where 1v1 emotes will live.
- Tile size adapts to the viewport so 4×4 and 5×5 fit without scrolling on phones.
- Total play time is 60 s (25 + 5 + 15 + 5 + 10); the countdown is extra.
- One wrong tap costs 1 second, 30 points and your streak. An unanswered churn is a miss.

Scoring per hit:

```
points = 100 × (1 + speed × 0.9) × (1 + min(streak, 20) × 0.08) × (1 + tier × 0.12) × (1 + (size − 3) × 0.12)
```

Cycle clear:

```
cyclePoints = 400 + round(max(0, 4.5 − cycleSeconds) × 35) + tier × 100 + (size − 3) × 80
```

Speed is the only way to extend a round; later rounds and bigger grids are worth more per hit.

## Brain Performance Index (BPI)

BPI is a **0–1000 performance fingerprint**, not an IQ score and not a clinical measure. It is computed from the trial log of a run (reaction time, correctness, decoy proximity, target colour changes, post-error attempts, tier and cycles) and is recomputed authoritatively on the server.

| Axis | Weight | What it reads |
| --- | --- | --- |
| `precision` | 0.20 | how often the first read is right (Wilson lower bound) |
| `speed` | 0.16 | how fast you commit to a target (median RT) |
| `search` | 0.16 | how well you scan past close decoys (RT vs decoy proximity slope) |
| `consistency` | 0.14 | how steady your timing stays (MAD / median, miss rate) |
| `updating` | 0.12 | how cheaply you re-bind a changed target (colour-change cost) |
| `capacity` | 0.12 | how deep into the difficulty curve you get (tier + cycles) |
| `resilience` | 0.10 | how quickly you recover from a miss (post-error accuracy + RT) |

`BPI = round(10 × Σ axis × weight)`. Axis values are `0–100`; the weighted sum is scaled to `0–1000`.

**Titles** (best BPI): DRIFTER → SPARK → SCOUT → HUNTER → TRACKER → SHARPSHOOTER → TACTICIAN → MAESTRO → NOVA.

**Archetypes** (axis shape): SCANNER, SNIPER, METRONOME, GRINDER, SWITCHBACK, ALL-ROUNDER.

Every run returns actionable feedback: the weakest axis, a one-line diagnosis, the numbers behind it, and a concrete drill for the next run. Confidence is `provisional` (<25 attempts), `developing` (25–59) or `stable` (60+).

**Trend data is self-only.** Public profiles show BPI values, axes, title, archetype, per-game and per-season stats, and aggregate engagement. Season-over-season deltas, the trend sparkline, the improvement panel and run history are only returned to the profile owner.

## Seasons and leaderboards

- A **season** is a calendar month in UTC (`YYYY-MM`); a **week** is an ISO week (`YYYY-Www`). `lib/season.js` owns both.
- **Layered boards:** `global`, `country`, `region` (state/province). Region comes from request geo (`lib/geo.js`); city is stored but never shown publicly.
- Each layer has **weekly** and **seasonal** periods, and three metrics: **BPI**, **score**, **rating**.
- Players with no ranked run are excluded. The board footer shows your own rank and an "online now" count from `last_seen`.
- Clicking a callsign in the HUD opens your profile; clicking a row on a board opens that player's public profile.

## Profiles

Public: avatar, name, title, archetype, best BPI, best score per game, current-season games / won / lost / accuracy / best BPI / best score / rank now / best rank, BPI radar, per-season table and engagement (`active days`, `sign-ins`, `runs / active day`).

Self-only: improvement deltas per axis, the season sparkline and insight line, and run history. The season switcher (`BPI / ACC / RUNS / RANK`) works on your own profile; rank is inverted so a better rank plots higher.

## Rating

Elo-style, starting at 1000, computed on the server **in addition to** BPI (BPI is the skill fingerprint, rating is the duel ladder). After a run:

```
actual   = 0.55 × accuracy + 0.30 × reactionSpeed + 0.15 × tierReached
opponent = 820 + tier × 130
expected = 1 / (1 + 10^((opponent − rating) / 400))
delta    = clamp(K × (actual − expected), −60, +60)
```

`K` is 44 for the first 10 runs, then 28. Ranks: Iron → Bronze → Silver → Gold → Platinum → Diamond → Nova. Best score, rating, BPI and games are stored in Postgres; settings and per-shape adaptation stats stay in `localStorage` per device.

## Adaptive director

- Every shape keeps persistent per-shape `correct / wrong / miss / reaction-time` stats in `localStorage`.
- `skill = 0.62 × accuracy + 0.38 × speed`. The goal picker weights weak (and barely-seen) shapes much higher, so mistakes literally come back to find you.
- **Pressure** rises with fast hits and cycle clears and falls with misses. Churn is fixed per round; pressure controls the share of near-miss decoys (same shape family / same colour), background speed and warmth, and music tempo and density.
- Decoys are always unique shape+colour pairs, and the target is always present.

## Music and motion

- All audio is synthesized with WebAudio. There are no audio files.
- A 16-step sequencer plays a four-bar loop; tempo ramps from ~92 to ~166 BPM with pressure and urgency.
- The canvas backdrop is a perspective floor plus radial speed lines; speed, colour temperature and bloom follow the same signals.
- Sound and motion can be toggled in the side panel (persisted). OS reduced-motion is respected on first load.

## Controls

- Click / tap a tile.
- `1`–`9` select tiles by position.
- `Enter` / `Space` start or restart.
- `M` mute.
- `Esc` closes the profile / auth / leaderboard overlay first, then does nothing else.

## Dev flags

- `?autostart=1` — skip the menu and the sign-in gate.
- `?instant=1` — skip the 3-second countdown.
- `?still=1` — disable transitions/animations (useful for screenshots).
- `?dev=1` — reveal the local-only reset control.
- `?api=https://…` — point the client at another API origin.

## API

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Create an account and open a session |
| `POST` | `/api/auth/login` | Verify credentials and open a session |
| `POST` | `/api/auth/logout` | Destroy the session and clear the cookie |
| `GET` | `/api/auth/me` | Current account (or `null`) and touch `last_seen` |
| `POST` | `/api/runs` | Submit a ranked run; returns BPI, title, server rating |
| `GET` | `/api/leaderboard?by=bpi\|score\|rating&scope=global\|country\|region&period=week\|season&game=tile-rush` | Ranked players, your rank, totals |
| `GET` | `/api/users/:username?game=tile-rush` | Public profile (`self` is `null` for other players) |
| `POST` | `/api/profile` | Update your avatar |

## Data model

`users` (identity, avatar, rating, bests, region), `sessions` (hashed tokens), `runs` (trial-level run record with season/week keys and BPI), `games` (catalogue), `user_game_stats` (per-game bests), `season_stats` (per-season totals and best rank). All player-owned tables cascade on user delete.

## Tuning

Balance numbers live in `CONFIG` at the top of `js/game.js`; BPI weights, titles, archetypes and feedback copy in `shared/bpi.js`; Elo in `lib/elo.js`; seasons in `lib/season.js`. Shapes and palette are in `js/shapes.js`; music in `js/audio.js`; background in `js/background.js`.

## Files

```
index.html
css/styles.css
js/shapes.js         geometric glyph set + palette
js/audio.js          WebAudio sequencer + SFX
js/background.js     canvas backdrop
js/account.js        auth/session + profile + leaderboard client
js/game.js           state machine, three rounds, scoring, UI
js/profile.js        profile, BPI radar, season switcher + sparkline
api/auth/*.js        register / login / logout / me
api/runs.js          ranked run submission (authoritative BPI + Elo)
api/leaderboard.js   layered weekly/seasonal boards
api/users/[username].js  public profile
api/profile.js       avatar update
shared/bpi.js        canonical BPI axes, titles, archetypes, feedback
lib/auth.js          scrypt, cookies, sessions, geo
lib/db.js            pooled Neon connection
lib/elo.js           server-side Elo
lib/geo.js           region/country from request headers
lib/http.js          JSON/body/error helpers
lib/season.js        UTC week + season keys
lib/users.js         accounts, runs, leaderboards, season breakdown
db/schema.sql        users / sessions / runs / games / stats
scripts/migrate.mjs  migration runner
worker/              Cloudflare Worker + Durable Objects scaffold
```

## Cloudflare / 1v1

The realtime phase runs on a Cloudflare Worker with Durable Objects; the REST API stays on Vercel/Neon until the Worker data layer is ported.

```bash
cd worker
npx wrangler dev        # local Worker on :8787 (static assets + realtime API)
npx wrangler deploy     # requires `npx wrangler login` and a Cloudflare account
```

`worker/src/index.js` serves `/api/health`, `/api/match/queue` and `/api/match/:id/ws`, then falls back to static assets. `MatchRoom` is a hibernating WebSocket Durable Object for a 1v1 match (join, ready, emote, round progress, result); `QueueRoom` pairs two players and creates a match id.

Next steps for the full cutover:

1. `wrangler login`, create the account/namespace, set `API_ORIGIN` to the current Vercel deployment.
2. Port `api/*` to Worker routes (Neon HTTP driver or Hyperdrive) and point the client at the Worker.
3. Move `/api/runs` scoring into the Worker so BPI and Elo are computed at the edge.
4. Design 1v1 mechanics on top of `MatchRoom`: shared seed, same board order, five 12-second rounds, emotes during breaks, rating delta on match result.

Until then the Vercel deployment remains the source of truth, and 1v1 is not exposed in the UI.
