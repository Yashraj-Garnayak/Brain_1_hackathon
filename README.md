# TILE RUSH

A browser 3×3 reflex game with an adaptive difficulty director, a non-stopping clock, procedural pressure music, an Elo-style rating, accounts, and a global leaderboard.

The game itself is plain HTML/CSS/JS with no build step. Accounts, sessions and the leaderboard are Neon Postgres behind Vercel serverless functions in `api/`.

## Run it

```bash
npm install
npm run migrate      # applies db/schema.sql to DATABASE_URL_UNPOOLED
npm run dev          # vercel dev with .env.local loaded; serves the site and /api on http://localhost:3000
npm run seed -- <username>          # sync 30 days of Ultrahuman data + seed demo runs from it
npm run seed -- <username> --clear  # remove the seeded demo runs
```

`npm run migrate` reads `DATABASE_URL_UNPOOLED` (falling back to `DATABASE_URL`). Locally those come from `.env.local`, which is created by `vercel env pull` after the Neon integration is connected.

A plain static server (`python3 -m http.server`) still works for the game loop, but without `/api` there are no accounts or leaderboard. Use the `?api=http://localhost:3000` flag if you serve the files from a different port.

## Accounts and leaderboard

- Username + password only. No email, OAuth or social login.
- Usernames are unique case-insensitively: `^[A-Za-z0-9_]{3,16}$`, displayed in the casing you chose.
- Passwords are hashed with scrypt. Sessions are random 256-bit tokens stored hashed in Postgres and sent as an HTTP-only `tr_session` cookie valid for 120 days, so a refresh keeps you signed in.
- Start requires an account. There is also a **play without an account** escape hatch; those runs are never ranked.
- The server owns the rating: it computes the Elo delta from the submitted score, tier, accuracy and average reaction time, then updates the player's best score and rating atomically.
- `HIGH SCORE` and `RATING` boards exclude players with zero ranked runs. The board footer shows your own rank and an "online now" count based on `last_seen`.
- Clicking your callsign in the HUD opens the leaderboard; the panel's **GLOBAL** card shows the current top three.
- The old **reset data** control is hidden for regular players. It only appears with `?dev=1` and only clears local guest data, never your account.

## The loop

1. Start deals the board once and runs a **3-second countdown** with both the target and the tiles blurred out, so nobody can pre-scan. At GO the same board is revealed — it is **not** re-dealt — and the clock and shuffle timer start.
2. A target glyph (shape **and** colour) appears at the top.
3. Nine tiles hold decoys. Exactly one matches the target.
4. The board reshuffles every **3 seconds**. It tightens toward ~1.1s as pressure rises.
5. Ten correct taps clear a **cycle**. The clock is 30s and never pauses; a fast cycle banks bonus seconds and the next tier starts immediately.
6. A wrong tap costs **1 second**, 30 points and your streak. An unanswered reshuffle is a miss.
7. The run ends when the clock reaches zero.

Scoring per hit:

```
points = 100 × (1 + speed × 0.9) × (1 + min(streak, 20) × 0.08) × (1 + tier × 0.12)
```

Cycle clear:

```
bonusSeconds = clamp(1.1 + (8.6 − cycleSeconds) × 1.2, 0.4, 9)
cyclePoints  = 400 + bonusSeconds × 60 + tier × 100
```

So a fast cycle is worth more than a slow one, and speed is the only way to extend the run. The clock is capped at 45s so a great run cannot bank forever.

## The adaptive director

Inspired by keybr.com's weak-key drilling:

- Every shape keeps persistent per-shape `correct / wrong / miss / reaction-time` stats in `localStorage`.
- `skill = 0.62 × accuracy + 0.38 × speed`. The goal picker weights weak (and barely-seen) shapes much higher, so mistakes literally come back to find you.
- **Pressure** rises with fast hits and cycle clears, falls with misses. It controls:
  - reshuffle interval (3000ms → ~1100ms),
  - share of near-miss decoys (same shape family or same colour),
  - background speed/warmth,
  - music tempo and layer density.
- Decoys are always unique shape+colour pairs, and the target is always present.

## Music and motion

- All audio is synthesized with WebAudio. There are no audio files.
- A 16-step sequencer plays a four-bar loop; tempo ramps from ~92 to ~166 BPM with pressure and time urgency. Kick/snare/hat/bass/arp layers come in as intensity rises.
- The canvas backdrop is a perspective floor plus radial speed lines; speed, colour temperature and bloom follow the same signals.
- Sound and motion can be toggled in the side panel (settings persist). OS reduced-motion is respected on first load.

## Rating

Elo-style, starting at 1000, computed on the server. After a run:

```
actual   = 0.55 × accuracy + 0.30 × reactionSpeed + 0.15 × tierReached
opponent = 820 + tier × 130
expected = 1 / (1 + 10^((opponent − rating) / 400))
delta    = clamp(K × (actual − expected), −60, +60)
```

`K` is 44 for the first 10 runs, then 28. Ranks: Iron → Bronze → Silver → Gold → Platinum → Diamond → Nova. Best score, rating and games are stored in Postgres; settings and adaptation stats stay in `localStorage` per device.

## Controls

- Click / tap a tile.
- `1`–`9` select tiles by position.
- `Enter` / `Space` start or restart.
- `M` mute.

## Dev flags

- `?autostart=1` — skip the menu and the sign-in gate.
- `?instant=1` — skip the 3-second countdown (starts on the dealt board).
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
| `POST` | `/api/runs` | Submit a ranked run; returns the authoritative rating |
| `GET` | `/api/leaderboard?by=score\|rating&limit=50` | Ranked players, your rank, players and online totals |
| `GET` | `/api/insights?from=…&to=…&today=…&last=1` | One week or month of runs with Ultrahuman ring metrics, period summary, what hurt, best hours; `last=1` adds the last played day |

## Tuning

All balance numbers live in `CONFIG` at the top of `js/game.js` and the Elo formula in `endRun()`. The shape set and palette are in `js/shapes.js`; music in `js/audio.js`; background in `js/background.js`.

## Files

```
index.html
css/styles.css
js/shapes.js       geometric glyph set + palette
js/audio.js        WebAudio sequencer + SFX
js/background.js   canvas backdrop
js/account.js      session + leaderboard client
js/game.js         state machine, adaptive director, scoring, Elo, UI
health.html        ring metrics page (js/health.js)
insights.html      runs vs. ring insights page (js/insights.js)
js/assistant.js    built-in insights helper (rule-based, no AI or network)
css/health.css     styles for both pages
api/auth/*.js      register / login / logout / me
api/runs.js        ranked run submission
api/leaderboard.js score + rating boards
api/insights.js    per-day performance vs. ring metrics
lib/insights.js    run detail capture + insight queries
lib/ultrahuman.js  Ultrahuman fetch and day/moment summaries
lib/auth.js        scrypt, cookies, sessions
lib/db.js          pooled Neon connection
lib/elo.js         server-side Elo
lib/http.js        JSON/body/error helpers
lib/users.js       account + leaderboard queries
db/schema.sql      users / sessions / runs / run_details / health_days
scripts/migrate.mjs migration runner
```
