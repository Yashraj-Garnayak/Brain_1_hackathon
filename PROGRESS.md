# TILE RUSH — progress checkpoint

Completed: 2026-10-30
Repo: `/Users/uday/POS/tile-rush`

This batch adds custom multiplayer emotes, Android health graphs, and
performance work. It is deployed, committed, and the APK is rebuilt.

---

## 1. Custom multiplayer emotes

### Web

- `js/emotes.js`
  - 8 defaults: 😄 GG, 🔥 Nice, 🎯 Focus, 😅 Oops, 👋 Hey, 💪 Close,
    🔁 Rematch, 🙏 Thanks.
  - Stored per account in `localStorage` under
    `tile-rush.emotes.v1.<username>`.
  - Sanitises emoji (max 8 chars) and text (max 24 chars).
- `index.html`
  - Loads `js/emotes.js`.
  - Break bar `#duelEmotes` and lobby bar `#duelEmotesLobby` are rendered
    from the account's presets.
  - Profile → Settings has the private 8-row editor (`#emoteEditor`,
    `#emoteSaveBtn`).
  - All local CSS/JS now carry `?v=20261030d` so deploys bypass stale caches.
- `js/duel.js`
  - Sends `{ type: 'emote', emoji, text }` and shows a local bubble.
  - Receives `{ from, emoji, text }` as `NAME · 😄 Message`.
  - Lobby bar is visible while matched, before the run starts.
  - Break bar is visible during round breaks.
  - Works in both quick-match (`duel`) and private-room (`room`) modes.
  - `Duel.refreshEmotes()` repaints both bars after saving presets.
- `js/game.js`
  - Renders the 8-row editor when Settings opens.
  - Saves, repaints the duel bars, and shows a toast.
- `css/styles.css`
  - Emote buttons show emoji + truncated uppercase text.
  - Added lobby bar and profile editor styles.

### Server

`worker/src/match-room.js`:

- Accepts sanitised `emoji` (≤ 8 chars) and `text` (≤ 24 chars).
- Strips control characters and `<>`; ignores empty pairs.
- Rate limit: one emote per player per **900 ms**.
- Legacy `{ id }` messages still work.
- Does not broadcast after the match is finished.

### Android

- `data/Models.kt`: `EmotePreset(emoji, text)`.
- `ui/AppViewModel.kt`
  - Same 8 defaults.
  - Per-account `SharedPreferences` key `emotes_<username>`.
  - Reloads on session restore, login, register, logout.
  - `saveEmotes(...)` sanitises and shows a toast.
- `data/DuelManager.kt`
  - `Emote` carries `from`, `emoji`, `text`, `at`.
  - `sendEmote(emoji, text)` sends the new payload and adds a local feed item.
  - Incoming emotes fall back to legacy `id` if text is missing.
- `ui/Components.kt`: shared `EmoteBar` (two rows of four).
- `ui/DuelScreen.kt`
  - Full emote bar before the run.
  - Feed shows `FROM · emoji text`.
- `ui/GameScreen.kt`
  - Round-break overlay includes the emote bar for duel runs.
  - `OverlayCard` accepts an optional trailing composable.
- `ui/ProfileScreen.kt`
  - 8-row emote editor in Settings with **SAVE EMOTES**.

---

## 2. Android health metrics consistency

`ui/InsightsScreen.kt` has the `INSIGHTS / HEALTH` tabs. This batch adds:

- **Trend charts** for the selected period:
  - Recovery
  - Sleep score
  - HRV (ms)
  - Resting HR (bpm)
- Line + dots, min–max labels, first/last day labels.
- **Sleep-stage bar** in every daily ring card:
  - Deep (violet), REM (cyan), light (dim), with minute labels.
- Daily cards still show sleep score, slept, time in bed, efficiency, HRV,
  resting HR, temperature deviation, steps, and bedtime.

### Ask about your data (Android parity)

The web already had a built-in "Ask about your data" helper. Android now has
the same feature:

- `? ASK ABOUT YOUR DATA` button on both Insights and Health tabs.
- Dialog with a chat log, suggestion chips, and free-text input.
- Same offline, rule-based answers as the web:
  - Ring terms: REM, deep/light sleep, HRV, resting HR, recovery, sleep score,
    total sleep, efficiency, temperature, reaction time, accuracy.
  - What to change, best time to play, warm-up trend, period summary.
  - Day explanations for "yesterday", "today", weekday names, or the last run.
- No AI and no network calls; uses the week/month already loaded.
- Web helper was re-tested in production and still answers correctly.

### Title + fingerprint explainer

Clicking a title or archetype badge now opens an explainer instead of being a
black box.

- Web: new `js/badges.js` + modal; `shared/bpi.js` now carries title
  descriptions and archetype rules.
- Android: `BadgeInfoDialog` with the same content.
- Tabs: **TITLES** and **FINGERPRINTS**.
- Titles show the BPI range, short note, description, and a `YOU` marker.
- Fingerprints show the exact rule, description, and — when available — the
  seven current axis values with `YOU` on the active archetype.
- Clickable badges: home title, result title/archetype, profile title/archetype,
  and leaderboard titles.

### Spectator emotes

- Player emotes are broadcast to spectators as well as the two players.
- Web spectators get a `PLAYER EMOTES ON/OFF` toggle above the boards.
  - Default is ON.
  - Preference is stored in `localStorage`.
  - Turning it OFF clears the current bubbles and suppresses new ones.
- Android spectators get the same `PLAYER EMOTES ON/OFF` chip, stored in
  `SharedPreferences`.
- The server already broadcast to every socket, so no Worker protocol change
  was needed.

### 1v1 room controls and spectator input

- The first player in a room is the creator. Creator controls are available
  while the room is still open:
  - room symbol theme `KIDS` / `SPORTS`,
  - spectator emotes `ON` / `OFF`.
- The server stores `creatorUid` and room `settings`, rejects settings from
  non-creators, and locks settings once the match starts.
- If the creator leaves, control passes to the other connected player.
- Everyone sees the room theme; spectators see the same sports icons as the
  players.
- Spectators now see the player's **last tapped tile** (green/red) instead of
  the correct answer being highlighted.
- Players send a small `input` event; the server broadcasts it to spectators
  only. Late spectators get the last input from the player snapshot.
- When the room creator turns spectator emotes off, the server does not send
  emotes to spectators and the spectator UI shows `OFF BY HOST`.

### Large screens and buttons

- Added a `min-width: 1500px` pass that raises the smallest labels and
  spectator metrics for mirror/TV use.
- All text-only `.linkish` controls now have a bordered pill surface instead of
  floating underlined text.

### README / QA / environment

- Rewrote `README.md` for the full web + Android + Worker + database stack.
- Added `.env.example` with Neon, `MATCH_SECRET`, `MATCH_URL`, Ultrahuman and
  OIDC guidance.
- Created a local `.env` from `.env.local` and `worker/.dev.vars` for local
  testing (both gitignored).
- Documented the Ultrahuman Partner API token: raw `Authorization` header,
  `ULTRAHUMAN_USERNAME`, and a curl test.
- Added `docs/QA-TEST-PLAN.md` and `docs/TILE-RUSH-QA-TEST-PLAN.docx`, covering
  smoke, guest/account, solo, themes, BPI, leaderboards, insights, emotes,
  1v1/rooms, spectator, Android parity, responsive, negative and accessibility.
- Added `scripts/make-docx.py` to regenerate the Word file from Markdown.

### Sports symbol theme

Two symbol themes now exist:

- **KIDS** — the original geometric shapes.
- **SPORTS** — a curated 40-item sports set: balls, bats, rackets, clubs,
  protective gear, footwear, training gear, flags and timing equipment.
  Ambiguous emoji (hand-soap bottle, stock-market chart, chair, backpack,
  face, watch, car) were removed.

How it works:

- The 16 shape slots are mapped to 16 consecutive items from a seed-derived
  offset, so each run gets a different random slice of the 40.
- 1v1 clients and spectators use the match seed, so both players and watchers
  see the same sports icons.
- Colour is preserved as a coloured ring/background around the icon; the target
  card shows the icon plus its colour.
- The choice is made on the pre-run screen, not in settings or mid-run.
- Web: `SYMBOLS` segmented control above `START RUN`.
- Android: `SYMBOLS KIDS / SPORTS` chips on the home play screen.
- The choice is locked once countdown/play starts; Profile no longer carries a
  theme switch.
- Copy switches between "shape" and "icon" wording.

### Title pill on large screens

The home `SHARPSHOOTER` pill was stretching across the full grid row because it
was a grid item with the default `align-self: stretch`. It is now
`justify-self: start; width: fit-content`, so it stays a compact pill at every
width.

### Forced how-to-play

- **Guests** see the tutorial on first visit and cannot close it. They must
  page through and press `GOT IT`.
- **New accounts** see it on their first signed-in visit, even if they already
  watched as a guest. The account flag is keyed by username and also applies on
  another device while the account still has 0 banked runs.
- Web: close button hidden, back disabled on the first page, completion stored
  in `localStorage`.
- Android: same flow with `SharedPreferences`, plus the system back button is
  blocked while the forced tutorial is open.

---

## 3. Performance work

### Ring sync skip

`lib/insights.js` → `syncRingPeriod(...)`:

- Queries `health_days` before calling Ultrahuman.
- Skips all network syncs when every day is already stored.
- A day is stale only if it is today or later and `synced_at` is older than
  **15 minutes**.
- Historical weeks/months now load straight from Postgres.

Measured on production with a stored historical week:

```
run1 0.565s (cold / possible sync)
run2 0.266s
run3 0.255s
```

### Static cache headers

`vercel.json`:

- HTML: `max-age=0, s-maxage=60, stale-while-revalidate=300`
- `/js/*`, `/css/*`, `/shared/*`:
  `max-age=300, s-maxage=86400, stale-while-revalidate=604800`
- `/api/*`: `private, no-store`

Assets are not content-hashed, so HTML references use a manual `?v=` tag.

---

## 4. Verification

| Area | Result |
|---|---|
| Web emote editor renders 8 rows | Passed |
| Web save → `localStorage` + bar repaint | Passed |
| Web emote bars render 8 buttons | Passed |
| Lobby bar visible while matched (room mode) | Passed |
| Break bar visible during round break | Passed |
| Custom emote send → opponent bubble | Passed (`UZ_P1 😄 GG`) |
| Server custom emoji/text broadcast | Passed |
| Server 900 ms rate limit | Passed (second send suppressed, later send accepted) |
| Ring sync skip / API latency | Passed (~0.26 s warm) |
| Static cache headers | Passed |
| Android Kotlin compile | Passed |
| Android APK build | Passed |
| Android signed-in Health UI | Passed on POCO F7 (`ishowspeed`) |
| Android health trend order | Fixed: charts now run oldest → newest |
| Android emote editor | Passed: 8 rows, defaults, save button |
| Android room emote bar | Passed: 8 presets before the match |
| Android "Ask about your data" | Passed: opens, answers day and HRV questions |
| Web "Ask about your data" | Passed: panel opens and answers questions |
| Web title/fingerprint modal | Passed: 9 titles, 6 archetypes, current badge + axes |
| Web forced guest tutorial | Passed: close hidden, back disabled, completion stored |
| Android title/fingerprint dialog | Compiled; phone was locked during the final visual pass |
| Android forced tutorial | Compiled; guest flow blocked by the emulator's launcher ANR |
| Web spectator emotes | Passed: ON shows bubbles, OFF clears and mutes, ON resumes |
| Home title pill at 1126px | Passed: 112px wide, no full-row stretch |
| Android spectator emote toggle | Compiled and installed; phone locked during visual pass |
| Web sports theme | Passed: 16 sports glyphs, target label, icon wording |
| Android sports theme | Passed on emulator: helmet/rugby target and emoji grid |
| Room creator theme + spectator emote flag | Passed: host changed both; spectator saw SPORTS / OFF BY HOST |
| Spectator input highlight | Passed: tap at index 4 highlighted, no goal-cell |
| Pre-run theme choice | Passed: web control above START RUN; Android home chips |
| Text-only buttons | Passed: `.linkish` renders as a 1px bordered pill |
| Responsive 437px | Passed: no horizontal overflow, board fits |

Temporary production sessions and test tabs were removed after verification.

---

## 5. Deployed / built

- Web: Git deployment from `Uday517/Brain_1_hackathon` (`3545519`)
  - Production: https://tile-rush.uday.live
  - Assets served as `?v=20261030k`
- Worker: `a80f731e-690a-45ba-8f42-632cbe95fb17`
- APK: `/Users/uday/Downloads/tile-rush-debug.apk`
  - Includes spectator mute, badge explainers, forced tutorial and sports theme
  - Installed on `emulator-5554` and `db43e3cc` (POCO F7)
  - Latest install: 2026-10-30 10:22
- Commits:
  - `Uday517/tile-rush` → `c945be1`
  - `Uday517/Brain_1_hackathon` → `3545519`
  - `Yashraj-Garnayak/Brain_1_hackathon` → `3545519`

---

## 6. Remaining follow-up

1. Unlock the phone and visually check the Android badge dialog and forced
   tutorial (both compiled and installed; the phone was locked during the final
   pass and the emulator hit a launcher ANR).
2. Optional: replace the manual `?v=20261030d` asset tag with a build-time
   hash if the deploy process gets a bundling step.
3. Optional: add UI tests for the emote editor and tutorial flows.

---

## 7. Changed files

```
M  android/.../data/Api.kt
M  android/.../data/DuelManager.kt
M  android/.../data/Models.kt
M  android/.../ui/AppViewModel.kt
M  android/.../ui/Components.kt
M  android/.../ui/DuelScreen.kt
M  android/.../ui/GameScreen.kt
M  android/.../ui/HomeScreen.kt
A  android/.../game/SymbolTheme.kt
M  android/.../game/Engine.kt
M  android/.../ui/InsightsScreen.kt
A  android/.../ui/InsightsAssistant.kt
A  android/.../ui/BadgeDialog.kt
M  android/.../ui/LeaderboardScreen.kt
M  android/.../ui/ResultScreen.kt
M  android/.../ui/TutorialScreen.kt
M  android/.../game/Bpi.kt
M  android/.../MainActivity.kt
M  android/.../ui/ProfileScreen.kt
M  css/styles.css
M  health.html
M  index.html
M  insights.html
M  js/duel.js
M  js/game.js
M  js/shapes.js
M  js/profile.js
A  js/badges.js
M  shared/bpi.js
M  lib/insights.js
M  vercel.json
M  worker/src/match-room.js
A  js/emotes.js
A  PROGRESS.md
```
