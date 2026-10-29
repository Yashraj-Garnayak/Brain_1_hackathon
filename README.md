# TILE RUSH

A browser reflex trainer built around **target updating**: find the one tile that matches a shape-and-colour target while the board keeps moving. Three rounds, a non-stopping clock, procedural pressure music, an Elo-style duel rating, accounts, a **0–1000 Brain Performance Index (BPI)**, titles, seasonal stats, and layered global/regional leaderboards. Everything — solo, 1v1, ghost races and private spectator rooms — lives on one URL and one single-page client.

The client is plain HTML/CSS/JS with no build step. Accounts, runs, profiles and leaderboards are Neon Postgres behind Vercel serverless functions in `api/`. Realtime 1v1 runs on a Cloudflare Worker with Durable Objects in `worker/` — see [1v1 duels](#1v1-duels).

## Run it

```bash
npm install
npm run migrate      # applies db/schema.sql to DATABASE_URL_UNPOOLED
npm run dev          # vercel dev with .env.local loaded; serves the site and /api on http://localhost:3000
npm run seed -- <username>          # sync 30 days of Ultrahuman data + seed demo runs from it
npm run seed -- <username> --clear  # remove the seeded demo runs
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

| Round | Grid | Clock | Deck timer | Cycle |
| --- | --- | --- | --- | --- |
| 1 | 3×3 | 25 s | 2.5 s | 10 correct |
| 2 | 4×4 | 15 s | 2.0 s | 8 correct |
| 3 | 5×5 | 10 s | 1.5 s | 6 correct |

- 3-second masked countdown before round 1: target and tiles are blurred until GO, so nobody can pre-scan.
- **5-second breaks** between rounds show the round summary and a breathing prompt. This is also where 1v1 and room emotes live.
- Tile size adapts to the viewport so 4×4 and 5×5 fit without scrolling on phones.
- Total play time is 60 s (25 + 5 + 15 + 5 + 10); the countdown is extra.
- One wrong tap costs 1 second, 30 points and your streak in solo. In a duel it costs 30 points and locks you out of that deal until the timer expires or the opponent resolves it. An unanswered deck timer is a miss and churns to a new target; the answer is never revealed.

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
| `GET` | `/api/users/:username?game=tile-rush` | Public profile (`self` is `null` for other players); every season carries averaged BPI axes, only the owner also gets run history |
| `POST` | `/api/profile` | Update your avatar |
| `GET` | `/api/ghost` | Your best run as a replayable 1 Hz score timeline |
| `GET` | `/api/health?kind=insights&from=…&to=…&today=…&last=1` | One week or month of runs with Ultrahuman ring metrics, period summary, what hurt, best hours; `last=1` adds the last played day |
| `GET` | `/api/health?kind=ultrahuman&start_epoch=…&end_epoch=…` | Ultrahuman daily metrics proxy (max 7 days) |
| `POST` | `/api/match/ticket` | Short-lived signed ticket + Worker URLs for 1v1 (body `{spectator:true}` mints a read-only ticket; guests need no account) |

## Data model

`users` (identity, avatar, rating, bests, region), `sessions` (hashed tokens), `runs` (trial-level run record with season/week keys and BPI), `games` (catalogue), `user_game_stats` (per-game bests), `season_stats` (per-season totals and best rank), `run_details` (every reaction time, time of play and a ring snapshot per run; `seeded` marks demo runs), `health_days` (daily Ultrahuman summary). All player-owned tables cascade on user delete.

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
js/duel.js           1v1 queue, sockets, ghost race, rooms + spectator view
js/profile.js        profile, BPI radar, expandable season history
health.html          ring metrics page (js/health.js)
insights.html        runs vs. ring insights page (js/insights.js)
js/assistant.js      built-in insights helper (rule-based, no AI or network)
css/health.css       styles for the ring and insights pages
api/auth/*.js        register / login / logout / me
api/runs.js          ranked run submission (authoritative BPI + Elo)
api/ghost.js         best-run ghost endpoint
api/health.js        combined insights + Ultrahuman metrics endpoint
api/leaderboard.js   layered weekly/seasonal boards
api/users/[username].js  public profile
api/profile.js       avatar update
api/match/ticket.js  signed 1v1/spectator ticket for the Cloudflare Worker
lib/match-ticket.js  HMAC ticket mint + Worker endpoints
lib/ghost.js         timeline cleaning + legacy ghost synthesis
shared/bpi.js        canonical BPI axes, titles, archetypes, feedback
lib/auth.js          scrypt, cookies, sessions, geo
lib/db.js            pooled Neon connection
lib/elo.js           server-side Elo
lib/geo.js           region/country from request headers
lib/http.js          JSON/body/error helpers
lib/insights.js      run detail capture + insight queries
lib/ultrahuman.js    Ultrahuman fetch and day/moment summaries
lib/season.js        UTC week + season keys
lib/users.js         accounts, runs, leaderboards, season breakdown
db/schema.sql        users / sessions / runs / games / stats / run_details / health_days
scripts/migrate.mjs  migration runner
scripts/seed-insights.mjs  30-day ring sync + demo runs (npm run seed -- <user>)
scripts/dev.mjs      vercel dev with .env.local loaded
worker/              Cloudflare Worker + Durable Objects scaffold
```

## 1v1 duels

**PLAY 1V1** on the menu queues you for a live head-to-head. Both players get the same three rounds, the same 5-second breaks, and the same ordered board sequence: when a duel deals its *n*-th board of a round, both clients generate that board from `HMAC-free hash(seed, round, n)`, so a player who is ahead sees the same layouts as a player who is behind. The first correct read or the first expired deck timer on a deal moves both boards; the slower player's late claim is rejected, so a board can never be scored twice. The server owns the countdown, the authoritative score, and the winner.

1. The client asks Vercel for a ticket: `POST /api/match/ticket` returns a signed, 10-minute HMAC token (`MATCH_SECRET`) plus the Worker URLs.
2. It polls `POST /api/match/queue` with that ticket. `QueueRoom` keys entries by account id, so two tabs of one account never pair together.
3. Both sockets open `/api/match/:id/ws?ticket=…`. The Worker verifies the ticket on every connection and passes the identity to `MatchRoom`; client-supplied names are ignored.
4. Ready → shared 3-second countdown → three rounds. Scores stream to the opponent, emotes unlock during breaks, and both runs are submitted to `/api/runs` so they count for BPI, Elo, seasons and leaderboards.
5. Rematch resets the match with a fresh seed; leaving closes the socket.

### Ghost races

**RACE YOUR BEST** (menu or duel lobby) loads `GET /api/ghost`, which returns your highest-scoring run and its `timeline` — the cumulative score sampled once per second from the countdown to the finish. The client runs the normal three rounds beside a local ticker that replays that curve, so there is no second player and no waiting. Submitting a run closes its timeline on the final score; the server drops a trace that disagrees with the score by more than `max(200, score × 0.2)` and synthesises one from per-round scores for older runs. The result overlay is local (`NEW BEST` / `TIED YOUR BEST` / `DEFEAT`) with **RACE AGAIN**.

### Private rooms + spectators

**CREATE ROOM** makes a 6-character code (no `0/O/1/I/L`) and opens the room socket directly, with no queue. The invite link is always the same site: `https://tile-rush.uday.live/?room=CODE` (or type the code, or a match id, into the lobby). The first two players to connect take the player slots; everyone after that is seated read-only as a spectator, up to 20 per room. Spectators get live state, progress, break emotes and the final result, but cannot ready up, send progress, finish or rematch. Guests can watch without an account via a spectator-only signed ticket.

Spectator sockets use `GET /api/match/:id/ws?ticket=…&role=spectator&mode=room`. The Worker verifies the ticket, adds `x-tr-role` / `x-tr-kind` / `x-tr-room`, and `MatchRoom` enforces the role — the query string alone can never promote a spectator ticket into a player slot. Room matches also count toward BPI, Elo and seasons because both players still submit through `/api/runs`.

Profiles render each season's averaged radar and, for the owner only, the runs behind it; clicking a season expands the full dashboard (stats, fingerprint, run list) inline.

The realtime layer runs on a Cloudflare Worker with Durable Objects; the REST API stays on Vercel/Neon. **No paid plan is needed:** Workers Free includes SQLite-backed Durable Objects (our config uses `new_sqlite_classes`), with 100k DO requests/day, 13k GB-s/day and 1 GB storage per object. Static assets are not counted against the Worker quota.

```bash
npm run worker:assets   # copy index.html, css/, js/, shared/ into worker/public
npm run worker:dev      # local Worker on :8787 (static assets + realtime API)
npm run worker:deploy   # requires `npx wrangler login` (free account)
```

Required configuration:

| Where | Name | Value |
| --- | --- | --- |
| Vercel env + `worker/.dev.vars` | `MATCH_SECRET` | long random string, identical on both sides |
| Vercel env + `.env.local` | `MATCH_URL` | Worker origin, e.g. `https://tile-rush.<subdomain>.workers.dev` |
| Worker secret (production) | `MATCH_SECRET` | `wrangler secret put MATCH_SECRET` |

`worker/src/index.js` serves `/api/health`, `/api/match/queue` and `/api/match/:id/ws`, then falls back to static assets. `MatchRoom` is a hibernating WebSocket Durable Object (ready, seed, countdown, progress, emote, result, rematch); `QueueRoom` pairs two players and creates a match id.

`uday.live` is on Vercel DNS, so 1v1 uses the free `<worker>.<subdomain>.workers.dev` hostname rather than a `uday.live` subdomain. Cookies do not cross hostnames, which is why joins use the signed ticket instead of `tr_session`.

Remaining work: port `api/*` to Worker routes (Neon HTTP driver or Hyperdrive) and move BPI/Elo computation to the edge. The Vercel deployment remains the source of truth for accounts and ranked runs.
