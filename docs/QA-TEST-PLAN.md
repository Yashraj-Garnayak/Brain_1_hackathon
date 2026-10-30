# TILE RUSH — QA Test Plan

| Field | Value |
| --- | --- |
| Product | TILE RUSH — adaptive three-round reflex trainer |
| Web production | https://tile-rush.uday.live |
| Android package | `live.uday.tilerush` (versionName `1.0`, versionCode `1`, minSdk 26, targetSdk 34, portrait-locked) |
| Plan version | 2.0 |
| Date | 2026-10-30 |
| Owner | QA Lead |
| Applies to | Web (desktop/tablet/phone/large display), Android APK, Cloudflare Worker realtime layer |
| Source of truth | `index.html`, `js/*.js`, `shared/bpi.js`, `worker/src/match-room.js`, `android/app/src/main/java/live/uday/tilerush/**` |

**Purpose.** This plan lets a tester who has never seen TILE RUSH verify the complete web and Android product without reading the source. Every case has an ID, a repeatable procedure, and an expected result with the visible labels and values the current build uses. Record the observed result in **Actual** and mark **P/F/B/N/A** in the last column.

**Status key:** `P` = pass, `F` = fail, `B` = blocked, `N/A` = not applicable. Attach a screenshot, screen recording, console log, network log, or API response to every `F` and `B`.

**Do not put credentials or secrets in this document.** Test-account passwords belong in the team password manager. Environment-variable *names* are listed; their values are never written here.

---

## 0. Smoke test (run first, 20–30 minutes)

Run this on production web at desktop width and on one Android device before any deeper testing. If any smoke case fails, stop and raise a blocker.

| ID | Area | Steps | Expected | Actual | P/F |
| --- | --- | --- | --- | --- | --- |
| SMK-01 | Web load | Open https://tile-rush.uday.live in a fresh private window at 1440×900. | Page loads with `TILE RUSH` branding, `ADAPTIVE REFLEX TRAINER`, title `TILE RUSH`, lede `One target. Three boards. Sixty seconds that never stop.`, and `START RUN`. No console errors. |  |  |
| SMK-02 | Guest tutorial | As a guest, click `START RUN`, then `play without an account`. | Auth closes and the forced tutorial opens at `HOW TO PLAY · 1 / 4`, `ROUND ONE`. Close (`×`) is hidden and `BACK` is disabled. |  |  |
| SMK-03 | Guest tutorial completion | Page through all 4 pages and press `GOT IT`. | Tutorial closes; a guest run starts (or the home screen is usable). `localStorage["tile-rush.tutorial.v1"]` is `"1"`. |  |  |
| SMK-04 | Guest run | Complete one full guest run (3 rounds). | Countdown `GET READY 3`, three rounds `3×3 25s`, `4×4 15s`, `5×5 10s`, two `ROUND n CLEAR` breaks, then result. No `/api/runs` POST. |  |  |
| SMK-05 | Register | Create a brand-new account with a unique username and a 6+ character password. | Account chip shows `@username`; forced tutorial opens for the new account; after `GOT IT`, play is available. |  |  |
| SMK-06 | Signed-in solo | Complete one signed-in run. | Result shows `FINAL SCORE`, a numeric `BPI`, a title, an archetype, feedback text, `RATING before → after`, and a rank pill. One `POST /api/runs` returns 200. |  |  |
| SMK-07 | Themes | On the pre-run screen switch `SYMBOLS` from `KIDS` to `SPORTS`, start a run. | Target copy changes to `Same icon. Same colour.`; tiles show sports emoji with coloured rings; the theme cannot change once countdown starts. |  |  |
| SMK-08 | Quick 1v1 | With two signed-in browsers/devices, press `PLAY 1V1` on both and queue. | Both reach `READY UP`; both press `READY`; a shared 3-second countdown starts; both see the same boards; a result shows `VICTORY`, `DEFEAT`, or `DRAW`. |  |  |
| SMK-09 | Private room + spectator | Player A creates a room; Player B joins with the code; Spectator C opens the invite link and watches. | Room code is 6 characters; B takes the second player slot; C sees `SPECTATING · ROOM CODE`, `LIVE`, P1/P2 boards, and live metrics. C has no READY/REMATCH controls. |  |  |
| SMK-10 | Insights | Sign in as an account with runs and open `INSIGHTS`. | `Insights` page loads, `Week`/`Month` tabs work, calendar and day detail render, and the `Ask about your data` helper opens. |  |  |
| SMK-11 | Title explainer | On the home screen click the title pill (e.g. `DRIFTER` or `SHARPSHOOTER`). | Modal opens with `TITLES & FINGERPRINTS`, `TITLES`, all 9 titles with BPI ranges, `YOU` marker, and a `FINGERPRINTS` tab with 6 archetypes. |  |  |
| SMK-12 | Leaderboard | Open `RANKS` / `LEADERBOARD`. | Board renders rows, metric buttons `BPI`/`SCORE`/`RATING`, period `WEEK`/`SEASON`/`ALL TIME`, scope `GLOBAL`/`COUNTRY`/`REGION`, and `YOUR RANK` or an explanatory empty state. |  |  |
| SMK-13 | Android launch | Install the debug APK and launch on a real device or emulator. | `TILE RUSH` home renders; bottom nav shows `PLAY`, `INSIGHTS`, `RANKS`, `PROFILE`; no crash; portrait only. |  |  |
| SMK-14 | Android parity | On Android: complete the forced tutorial, play one solo run, open `INSIGHTS`/`HEALTH`, open a badge dialog, and send one emote in a room. | All screens render, back behaviour matches section 12, no ANR/crash, and the same labels/values as web where specified. |  |  |

---

## 1. Setup and environments

### 1.1 Environment matrix

| Env ID | Environment | URL / artifact | How to reach | Use for |
| --- | --- | --- | --- | --- |
| ENV-01 | Production web | https://tile-rush.uday.live | Public internet | Final acceptance, smoke, large-screen, real network |
| ENV-02 | Production API | Same origin `/api/*` | Browser network tab | Session, runs, boards, insights |
| ENV-03 | Production Worker | `MATCH_URL` origin (Worker hostname in repo docs) | Automatic from `/api/match/ticket` | 1v1, rooms, spectators |
| ENV-04 | Local web + API | `http://localhost:3000` | `npm install`, `npm run migrate`, `npm run dev` | Functional testing without polluting production |
| ENV-05 | Local Worker | `http://127.0.0.1:8787` | `npm run worker:dev` (after `npm run worker:assets`) | Realtime/room protocol testing |
| ENV-06 | Static-only preview | `python3 -m http.server 3000` | Serve repo root | Game loop only; no accounts/API/boards |
| ENV-07 | Android APK | `~/Downloads/tile-rush-debug.apk` or `android/app/build/outputs/apk/debug/app-debug.apk` | `adb install -r <apk>` | Android parity |
| ENV-08 | Android emulator | `emulator-5554` (or current AVD) | Android Studio / `adb` | Fast UI passes, screenshots |
| ENV-09 | Android physical device | e.g. POCO F7 (`db43e3cc`) | `adb -s <serial> install -r <apk>` | Real touch latency, network, notch/safe areas |

### 1.2 Test accounts and personas

Create these on the target environment before testing. Use a unique run suffix (for example `qa_a_1030`) so duplicate-username tests never collide with real players. Passwords are stored in the team password manager, **not here**.

| Account ID | Username pattern | State to prepare | Used for |
| --- | --- | --- | --- |
| ACCT-GUEST | none | Fresh browser profile / cleared app data; no session | Guest tutorial, guest run, local-only results |
| ACCT-NEW | `qa_new_<run>` | Registered minutes ago, 0 banked runs, tutorial not completed | Forced tutorial on first signed-in visit, empty profile |
| ACCT-A | `qa_a_<run>` | 10+ ranked runs, established rating/BPI, tutorial done | Quick 1v1, room host, leaderboard row |
| ACCT-B | `qa_b_<run>` | 10+ ranked runs, rating close to A, tutorial done | Opponent, room guest, spectator |
| ACCT-C | `qa_c_<run>` | 0–2 runs, tutorial done | Spectator-only account |
| ACCT-RING | `qa_ring_<run>` (or the seeded demo account if available) | Ring data seeded for at least 7 days, several runs across days/hours | Insights, health, helper, best/worst windows |
| ACCT-EMPTY | `qa_empty_<run>` | 0 runs, no ring data, devices not linked | Empty states |
| ACCT-REGION | `qa_region_<run>` | Accessed from a network with country/region headers (VPN or local geo) | Country/region boards |
| ACCT-OLD | existing production account (optional) | Has historical seasons and a weekly rank | Season history, rank delta, public profile |

**Rules for accounts:** do not use a personal account for destructive tests. Do not seed production leaderboards with junk runs unless the product owner approves. Prefer ENV-04 for negative/security tests that create many accounts or rooms. Never share a password in a ticket, screenshot, or this plan.

### 1.3 Browsers, devices, and display targets

| Target ID | Device / viewport | Browser / OS | Notes |
| --- | --- | --- | --- |
| DEV-01 | Desktop 1440×900 | Chrome latest | Primary functional pass |
| DEV-02 | Desktop 1920×1080 | Chrome latest | Large-monitor readability |
| DEV-03 | Desktop 2560×1440 | Chrome latest | Mirror/TV simulation; zoom 100% and 150% |
| DEV-04 | Laptop 1126×700 | Chrome/Safari latest | The width called out in the home title-pill bug |
| DEV-05 | Tablet 768×1024 | Safari iPad or Chrome device mode | Two-column layouts, touch |
| DEV-06 | Phone 360×800 | Chrome device mode / real Android Chrome | Smallest supported width; no horizontal scroll |
| DEV-07 | Phone 390×844 | iPhone Safari | Safe areas, notches, 100dvh |
| DEV-08 | Android phone | APK on Android 14+ | Touch, back gesture, portrait lock |
| DEV-09 | Android tablet / landscape | APK, if sideloaded on tablet | Watch boards side-by-side at ≥560 dp; app is portrait-locked, so record actual behaviour |

### 1.4 Local setup checklist

| Step | Command / action | Pass condition |
| --- | --- | --- |
| 1 | `node --version` | Node 20 or newer. |
| 2 | `npm install` | Completes with no vulnerable/blocking error. |
| 3 | Copy env template; fill DB and match values outside the repo | `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `MATCH_SECRET`, `MATCH_URL` present locally; no secret committed. |
| 4 | `npm run migrate` | Schema applies; no destructive prompt on an existing DB. |
| 5 | `npm run dev` | Site on `http://localhost:3000`; `/api/auth/me` returns JSON; Worker on `http://127.0.0.1:8787`. |
| 6 | `npm run worker:assets` | `worker/public/` contains `index.html`, `css/`, `js/`, `shared/`. |
| 7 | `npm run worker:dev` | Worker starts; room socket accepts a ticket. |
| 8 | Static-only fallback: `python3 -m http.server 3000` | Game loop runs; account/boards show unavailable states, not a crash. |
| 9 | Optional seed: `npm run seed -- <username>` | 30 days of ring data and demo runs appear for that user only. |
| 10 | Android build: `cd android` then `gradle :app:assembleDebug --no-daemon` (use the repo's JDK 21 / Android SDK paths) | APK builds; record SHA-256 and install path. |
| 11 | `adb install -r app/build/outputs/apk/debug/app-debug.apk` | App launches with package `live.uday.tilerush`. |

### 1.5 Evidence, severity, and exit criteria

| Severity | Definition | Example |
| --- | --- | --- |
| P0 / Blocker | Product cannot be used; data loss or security exposure | Cannot sign in; run never saves; room protocol awards both players; session cookie exposed |
| P1 / Critical | Major feature broken or wrong result | Wrong BPI/winner; spectator can send actions; forced tutorial bypassable; Android crash |
| P2 / Major | Feature partially broken, workaround exists | Emote bar missing in one mode; chart order reversed; title badge opens two overlays |
| P3 / Minor | Cosmetic, copy, or low-impact | Label truncation at 360 px; inconsistent `HEALTH` vs `HEALTH METRICS` label |

**Exit criteria:** all smoke cases pass; no open P0/P1; all P2s either fixed or accepted with owner/date; regression checklist complete; sign-off table filled; evidence attached for every fail.

---

## 2. Guest flow

Preconditions: fresh private browser profile or cleared site data; no `tr_session` cookie; no `tile-rush.*` local keys.

| ID | Area | Steps | Expected | Actual | P/F |
| --- | --- | --- | --- | --- | --- |
| GST-01 | First visit | Open production web in a fresh profile. Wait for the intro screen. | Intro shows `ADAPTIVE REFLEX TRAINER`, `TILE RUSH`, `DRIFTER`, and `START RUN`. Account chip reads `SIGN IN`. No tutorial opens until the guest tries to play. |  |  |
| GST-02 | Forced tutorial trigger | Click `START RUN`. | Auth modal opens (`YOUR CALLSIGN`, `Sign in to rank`, `LOG IN` / `CREATE ACCOUNT`, `play without an account`). |  |  |
| GST-03 | Guest escape hatch | Click `play without an account`. | Auth closes; forced tutorial opens at `HOW TO PLAY · 1 / 4`, `ROUND ONE`, with `GET READY`-style board illustration and four stat tiles `BOARD 3 × 3`, `CLOCK 25s`, `CHURN 2.5s`, `CYCLE 10 reads`. |  |  |
| GST-04 | Tutorial cannot be skipped | On page 1, try `×`, `BACK`, `Esc`, and clicking outside the card. | `×` is hidden; `BACK` is disabled; `Esc`/outside do not close. The web build has no in-app history/back handler, so browser Back may leave the page; record that separately as browser navigation, not as a tutorial bypass. |  |  |
| GST-05 | Tutorial pages | Press `NEXT` three times. | Count progresses `2 / 4`, `3 / 4`, `4 / 4`; titles are `ROUND ONE`, `ROUND TWO`, `ROUND THREE`, `HOW YOU ARE JUDGED`; final button becomes `GOT IT`. |  |  |
| GST-06 | Tutorial completion | Press `GOT IT`. | Tutorial closes and the pending guest run starts. `localStorage["tile-rush.tutorial.v1"] === "1"`. A toast/overlay does not block play. |  |  |
| GST-07 | Second visit | Reload the page and click `START RUN`. | Auth opens again because guest mode is per-page-load. Click `play without an account`; the tutorial does not reopen and the run starts directly. |  |  |
| GST-08 | Guest solo run | Complete one guest run. | HUD shows `ROUND 1/3`, `CYCLE 0/10`, `TIER 0`, `TIME 25.0`, `SHUFFLE 2.5`; breaks show `ROUND 1 CLEAR`, `3×3 · 25s · <hits> hits`, `NEXT 4×4 · 15s`; final result shows score, BPI, title, archetype, feedback. |  |  |
| GST-09 | Local-only result | During/after the guest run, inspect Network. | No `POST /api/runs`; no leaderboard/rank request that depends on the guest. Result is local. `localStorage["tile-rush.save.v1"]` holds `elo`, `best`, `games`, `bestBpi`, `runs`. |  |  |
| GST-10 | Guest result messaging | Look at auth/profile/leaderboard surfaces while still a guest. | Account chip `SIGN IN`; leaderboard footer `Not signed in — runs are unranked`; auth footer `Unranked runs are not saved.`; no `MY PROFILE` button. |  |  |
| GST-11 | Guest then register | From the guest home, register a new account. | New account forces the tutorial again even though the guest tutorial was completed. Account chip becomes `@username`. Guest local best/rating are replaced by the account's server values. |  |  |
| GST-12 | Guest data isolation | Sign out after registering; start a guest run; then sign back in. | Guest run does not appear in the account's profile/run history or leaderboards. Local save is resynced from the account on sign-in. |  |  |

---

## 3. Account flow

Preconditions: ENV-01 or ENV-04; a unique username per registration test.

| ID | Area | Steps | Expected | Actual | P/F |
| --- | --- | --- | --- | --- | --- |
| ACC-01 | Open auth | As a guest click the account chip or `START RUN`. | Modal title `Sign in to rank`; tabs `LOG IN` and `CREATE ACCOUNT`; fields `USERNAME`, `PASSWORD`; submit `LOG IN & PLAY`; link `play without an account`; footer `Unranked runs are not saved.` |  |  |
| ACC-02 | Register UI | Click `CREATE ACCOUNT`. | Title `Claim your callsign`; lede `Pick 3–16 letters, numbers or underscores. Your callsign is unique and permanent.`; `CONFIRM PASSWORD` appears; submit `CREATE & PLAY`. |  |  |
| ACC-03 | Register success | Enter a unique 3–16 char username and matching 6+ char passwords; submit. | Modal closes; account chip `@username`; forced tutorial opens; no console error; network `POST /api/auth/register` 201. |  |  |
| ACC-04 | Username validation | Try `ab`, `a b`, `bad-name!`, `abcdefghijklmnopq` (17 chars), and blank. | Inline error `Username must be 3–16 letters, numbers or underscores.`; no network request for invalid input. |  |  |
| ACC-05 | Password validation | Try a 5-character password, a 129-character password, and mismatched confirm. | 5 chars: `Password must be at least 6 characters.`; >128: API rejects with `Password must be 6–128 characters.`; mismatch: `Passwords do not match.` |  |  |
| ACC-06 | Duplicate username | Register `qa_case_<run>`; log out; try `QA_CASE_<run>` with a different password. | `That username is already taken.` (case-insensitive). Existing account is not modified. |  |  |
| ACC-07 | Login success | Log out; log in with the correct username/password. | `POST /api/auth/login` 200; account chip `@username`; home meta `PERSONAL BEST`, `BPI`, `RATING`, `RUNS` reflect server values. |  |  |
| ACC-08 | Wrong password | Log in with the right username and wrong password. | Inline error `Wrong username or password.`; no session cookie is set; account remains signed out. |  |  |
| ACC-09 | Logout | Profile → Settings → `LOG OUT`; confirm if prompted. | `POST /api/auth/logout` succeeds; cookie `tr_session` cleared; account chip `SIGN IN`; local-only mode resumes; profile modal closes. |  |  |
| ACC-10 | Session persistence — refresh | Sign in; refresh the page; open a second tab. | Both tabs remain signed in; account chip shows `@username`; no login prompt. Cookie `tr_session` is HttpOnly, Secure on HTTPS, SameSite=Lax, ~120-day expiry. |  |  |
| ACC-11 | Session persistence — browser restart | Close all browser windows, reopen the site. | Still signed in until cookie expiry/logout. |  |  |
| ACC-12 | Session invalidation | In DevTools delete `tr_session`; reload. | Account chip `SIGN IN`; protected pages show sign-in/empty states, not a crash. |  |  |
| ACC-13 | Cross-device account | Sign in to the same account on Android and a second browser. | Same username, rating, BPI, best score, run count, title, profile and leaderboard position; Android restores the session after app restart. |  |  |
| ACC-14 | Profile — self | Open profile from account chip. | Tabs `PROFILE`, `SETTINGS`, `CONNECTED DEVICES`; hero `BEST BPI`, `BEST SCORE`, `RUNS`, `SEASON RANK`; `CURRENT SEASON`, game selector; `FINGERPRINT`; `SEASON HISTORY` with `BPI`/`ACC`/`RUNS`/`RANK`; self-only `YOUR IMPROVEMENT` and run history visible. |  |  |
| ACC-15 | Profile — public | Open another player's profile from a leaderboard row. | No `SETTINGS`/`CONNECTED DEVICES` tabs; no improvement/run history; public data only (avatar, name, title, archetype, best BPI/score, season stats, radar, engagement). |  |  |
| ACC-16 | Avatar upload | Profile → `change photo`; upload a small PNG/JPEG/WebP. | Image is cropped to 96×96, JPEG ~0.8, uploaded via `PUT /api/profile`; avatar updates in HUD/profile/board. Hint `Photo updated.` |  |  |
| ACC-17 | Avatar rejection | Upload a GIF, a >120 KB image, and a corrupt image. | GIF/other: `Use a PNG, JPEG or WebP image.`; too large/detailed: `That photo is too detailed. Try a smaller one.` or API `Photo must be a PNG, JPEG or WebP under 120 KB.`; existing avatar unchanged. |  |  |
| ACC-18 | Settings | Profile → `SETTINGS`. | Rows: `Weekly rank on home` with `ON`/`OFF`, `How to play` with `OPEN`, `Connected devices` with `MANAGE`, `Session` with `LOG OUT`; emote editor heading `Your 8 multiplayer reactions`, button `SAVE EMOTES`. |  |  |
| ACC-19 | Weekly rank toggle | Toggle `Weekly rank on home` OFF, go home, reload; toggle ON. | OFF hides `WEEKLY RANK · GLOBAL` card; ON restores it. Setting persists in `localStorage["tile-rush.homeRank.v1"]` and does not affect server data. |  |  |
| ACC-20 | Connected devices | Profile → `CONNECTED DEVICES`; click `CONNECT` for Oura and Ultrahuman. | State changes `NOT CONNECTED` → `LINKED · SAMPLE FEED`; button becomes `UNLINK`; settings note updates (`Oura and Ultrahuman linked on this device.`); toast `DEVICE Linked · sample feed enabled.` Links are local to the device. |  |  |
| ACC-21 | Devices do not sync | Link Oura in browser A; open profile in browser B with the same account. | Browser B still shows `NOT CONNECTED` (device links are local-only). This is expected; do not log as a cross-device sync bug. |  |  |
| ACC-22 | Session copy | Settings → `Session`. | Copy reads `Sessions last 120 days on this device. Signing out keeps local runs only.` |  |  |

---

## 4. Solo run

Preconditions: signed-in account or guest with tutorial done; production or local; sound on unless testing mute.

| ID | Area | Steps | Expected | Actual | P/F |
| --- | --- | --- | --- | --- | --- |
| SOL-01 | Pre-run | Open home. | `SYMBOLS` segmented control `KIDS`/`SPORTS` sits above `START RUN`; `START RUN` starts; `PLAY 1V1`, `RACE YOUR BEST`, `MY PROFILE` (signed in) visible. |  |  |
| SOL-02 | Countdown | Click `START RUN`. | 3-second countdown `GET READY`, big `3` → `2` → `1`; target and tiles are blurred/locked until `GO`; note `Timer starts at GO`. Clock does not count down yet. |  |  |
| SOL-03 | Round 1 setup | After `GO`. | Grid 3×3; `ROUND 1/3`; `TIME 25.0` decreasing; `SHUFFLE 2.5`; `CYCLE 0/10`; `TIER 0`; `STREAK 0`; `PRESSURE CALM` around `8%`. |  |  |
| SOL-04 | Target card | Inspect the target card. | `FIND THIS`; title `Same shape. Same colour.` in KIDS; note `Tap the tile holding the target.`; `SHUFFLE` countdown; progress track. Target shows shape **and** colour. |  |  |
| SOL-05 | Correct tap | Tap the tile matching both shape and colour. | Tile flashes correct; score increases; `CYCLE` progress increments; `STREAK` increments; float `+points`; target churns to a new one. |  |  |
| SOL-06 | Shape-only / colour-only tap | Tap a tile that matches only the shape, or only the colour. | Counts as wrong: `−30` points, `−1.0s` float, streak resets, tile flashes red; clock does not pause. |  |  |
| SOL-07 | Wrong tap penalty | Note score/time/streak; tap a wrong tile. | Score drops by 30 (floor 0); time drops by 1.0 s; streak becomes 0; HUD updates immediately; no answer reveal. |  |  |
| SOL-08 | Deck timer miss | Do not tap until `SHUFFLE` reaches `0.0`. | Counts as a miss; board churns to a new target; no answer highlight; streak resets; pressure drops; the target is never revealed. |  |  |
| SOL-09 | Cycle clear | Clear 10 correct reads in round 1. | Toast `CYCLE CLEAR` and `+<bonus> · TIER 1`; tier increments; pips reset; `CYCLE 0/10`; cycle bonus is `400 + round(max(0, 4.5 − cycleSeconds) × 35) + tier × 100 + (size − 3) × 80`. |  |  |
| SOL-10 | Round transition | Let round 1 end (clock or completion). | `ROUND 1 CLEAR`; sub `3×3 · 25s · <hits> hits`; `NEXT 4×4 · 15s`; `Breathe. The next board is bigger.`; countdown `5` → `1`; no tiles tappable during break. |  |  |
| SOL-11 | Round 2 | Enter round 2. | Grid 4×4; `ROUND 2/3`; `TIME 15.0`; `SHUFFLE 2.0`; `CYCLE 0/8`; pressure higher than round 1. |  |  |
| SOL-12 | Round 2 break | End round 2. | `ROUND 2 CLEAR`; `4×4 · 15s · <hits> hits`; `NEXT 5×5 · 10s`; 5-second break. |  |  |
| SOL-13 | Round 3 | Enter round 3. | Grid 5×5; `ROUND 3/3`; `TIME 10.0`; `SHUFFLE 1.5`; `CYCLE 0/6`; board fits without scrolling at 360 px. |  |  |
| SOL-14 | End of run | Let round 3 end. | Result overlay `RUN COMPLETE · <PROVISIONAL/DEVELOPING/STABLE>`; `FINAL SCORE`; `BPI`; title; archetype; feedback; `accuracy`, `avg react`, `cycles`, `best streak`; `RATING before → after`; rank pill; `RUN IT BACK`, `LEADERBOARD`, `INSIGHTS`, `MENU`. |  |  |
| SOL-15 | BPI and feedback | Inspect result BPI block. | BPI is 0–1000; radar renders; feedback is a headline + body; drill appears in `over-note`; confidence is `provisional` (<25 attempts), `developing` (25–59), `stable` (60+). |  |  |
| SOL-16 | Titles and archetypes | Compare result title/archetype to `shared/bpi.js`. | Title is the highest BPI band reached; archetype follows the first matching rule: SCANNER, SNIPER, METRONOME, GRINDER, SWITCHBACK, ALL-ROUNDER. |  |  |
| SOL-17 | Scoring formula | With known speed/streak/tier/size, compute one hit. | `points = 100 × (1 + speed × 0.9) × (1 + min(streak,20) × 0.08) × (1 + tier × 0.12) × (1 + (size−3) × 0.12)`; later rounds/bigger grids score more per hit. |  |  |
| SOL-18 | Keyboard controls | On desktop: press `Enter`/`Space` on home, `1`–`9` in round 1, `M`, `Esc`. | Enter/Space starts/restarts; 1–9 selects the first 9 tiles in round 1; `M` toggles mute; `Esc` closes profile/auth/leaderboard overlay first, then does nothing. |  |  |
| SOL-19 | Mute and motion | Toggle `MUSIC` ON/OFF and `MOTION` FULL/LOW; reload. | Music icon becomes `✕`, button `OFF`; motion LOW hides/simplifies backdrop; both persist in `localStorage` and reload correctly. |  |  |
| SOL-20 | Recent runs / PB | Finish two runs; inspect side panel. | `RECENT RUNS` bars update; `PB <best>` and `<n> runs` update; `PERSONAL BEST`, `BPI`, `RATING`, `RUNS` on home match result/profile. |  |  |
| SOL-21 | Pause/leave | During a run, press browser back or `MENU` where available. | The run is not silently banked; if leaving is allowed, confirm; no partial run is submitted as a completed ranked run. |  |  |
| SOL-22 | Replay consistency | Play 3 consecutive runs; compare round lengths. | Every run is 3×3/25s, 4×4/15s, 5×5/10s with 5-second breaks; total play time 60 s, countdown extra; no round starts early/late. |  |  |

---

## 5. Symbol themes (KIDS vs SPORTS)

Preconditions: home screen, not in countdown/play/break.

| ID | Area | Steps | Expected | Actual | P/F |
| --- | --- | --- | --- | --- | --- |
| THM-01 | Default theme | Fresh profile; open home. | `SYMBOLS` shows `KIDS` active (`aria-pressed="true"`); `SPORTS` inactive. Target copy `Same shape. Same colour.` |  |  |
| THM-02 | Switch to SPORTS | Click `SPORTS`. | `SPORTS` becomes active; `KIDS` inactive; target copy becomes `Same icon. Same colour.`; preview tiles/`ADAPTING TO` copy uses `icons`; setting persists in `tile-rush.save.v1.settings.theme`. |  |  |
| THM-03 | Sports run | Start a SPORTS run. | All 16 slots map to sports icons (emoji) with coloured ring/background; target card shows icon + colour; no geometric KIDS glyphs on the board. |  |  |
| THM-04 | 40-item set | Inspect `js/shapes.js` / Android `SymbolTheme.kt` and play several runs. | Exactly 40 sports items: balls, bats, rackets, clubs, protective gear, footwear, training gear, flags, timing equipment. Examples include `Football`, `Basketball`, `American football`, `Rugby ball`, `Tennis racket`, `Cricket bat`, `Helmet`, `Boxing gloves`, `Running shoes`, `Stopwatch`, `Checkered flag`, `Trophy`, `Whistle`, `Training cone`, `Skipping rope`. |  |  |
| THM-05 | No non-sports icons | Play at least 5 SPORTS runs and inspect all 16 slots each run. | No ambiguous non-sports emoji such as hand-soap bottle, stock-market chart, chair, backpack, face, watch, or car. Every displayed icon is sports-related. |  |  |
| THM-06 | Seed-derived slice | Play two SPORTS runs; compare icon sets. | Each run uses a different 16-item consecutive slice of the 40 based on a seed; not always the same 16; target is always present. |  |  |
| THM-07 | Theme locked during run | Start a SPORTS run; while countdown/play/break, try clicking `KIDS` (or call `TileRush`/DevTools equivalent). | Theme does not change; UI does not switch to KIDS; target copy stays `Same icon. Same colour.`; setting is only applied on the pre-run screen. |  |  |
| THM-08 | Theme lock after run | Finish a SPORTS run; return to home. | `SPORTS` remains selected; a new run uses SPORTS; switching is allowed again only on the pre-run screen. |  |  |
| THM-09 | Room theme | Room creator selects `SPORTS` before ready. | Both players and all spectators see sports icons for the room; creator sees `SPORTS` active; non-creator sees read-only `SYMBOLS SPORTS`; spectators see the same sports slice. |  |  |
| THM-10 | Room KIDS | Creator selects `KIDS`. | Both players/spectators see geometric KIDS shapes; target copy uses shape wording; no sports emoji. |  |  |
| THM-11 | Android theme chips | On Android home, tap `SPORTS` then `KIDS`. | `SYMBOLS` row shows `KIDS`/`SPORTS`; selection persists in SharedPreferences `symbol_theme`; solo run uses the selected theme; room theme overrides it during a room match. |  |  |
| THM-12 | Theme copy consistency | Switch themes on web and Android. | Web target copy `Same icon. Same colour.` / `Same shape. Same colour.`; `ADAPTING TO` note `Misses pull these icons/shapes back into rotation.`; Android hero copy switches between “sports icon” and “shape”. |  |  |
| THM-13 | Colour is not the only cue | In SPORTS, find a target whose icon appears with two different colours. | The correct tile must match icon **and** colour; a same-icon/different-colour tile is wrong; colour ring is visible around the icon. |  |  |

---

## 6. 1v1 duels and private rooms

Preconditions: two signed-in accounts (ACCT-A, ACCT-B); two browsers or browser + Android; Worker reachable; for room tests, one creator.

### 6.1 Quick match

| ID | Area | Steps | Expected | Actual | P/F |
| --- | --- | --- | --- | --- | --- |
| DUE-01 | Signed-out gate | As a guest click `PLAY 1V1`. | Duel lobby opens with primary `SIGN IN` and status `Sign in to queue. Accounts keep matches fair and rated.` Clicking it opens auth; no queue ticket is requested. |  |  |
| DUE-02 | Lobby | Signed in; click `PLAY 1V1`. | Kicker `1V1 · LIVE DUEL`; badge `RATED RUN`; title `DUEL`; lede `Same three rounds. Same boards. Two players, one clock.`; buttons `FIND MATCH`, `RACE YOUR BEST`, `BACK`; note `3×3 · 25s → 4×4 · 15s → 5×5 · 10s. Breaks are 5s. Both players see the same boards.` |  |  |
| DUE-03 | Queue | Click `FIND MATCH`. | `SEARCHING`; status `Issuing match ticket…` then `In queue · 0:00`; primary `CANCEL SEARCH`; a ticket is fetched from `POST /api/match/ticket`; queue polls about every 1.2 s. |  |  |
| DUE-04 | Match found | With both accounts queued, wait for pairing. | Both show `MATCH FOUND`, `READY UP`, `YOU` and `OPPONENT` names, `READY`; status `Opponent connected. Tap READY.` |  |  |
| DUE-05 | Ready and countdown | Both press `READY`. | Each button becomes disabled `WAITING FOR OPPONENT`; server starts a shared 3-second countdown; both boards lock until GO; round 1 starts together. |  |  |
| DUE-06 | Same boards | During round 1, compare the two clients. | Same 3×3 layout, same target, same order of deals; both use the match seed; no client-side adaptive difference. |  |  |
| DUE-07 | Lockstep solve | Player A solves a deal first. | A gets the points; B's board advances to the next deal without points; B's late tap on the old deal is rejected (`deal_closed`); both scores remain authoritative. |  |  |
| DUE-08 | Late claim rejection | Throttle B's network; let A solve; B taps the old correct tile after A. | B does not gain points; B's displayed score matches the server; no double-scored board; B receives the next deal. |  |  |
| DUE-09 | Deck timeout in duel | Let a deal timer expire on one client. | Server records a `churn`; both boards advance; no points; answer not revealed; the other player can still solve/advance. |  |  |
| DUE-10 | Wrong tap in duel | Tap a wrong tile in a duel. | `−30` points; float `LOCKED`; no `−1.0s`; player cannot score that deal until the timer expires or the opponent resolves it; opponent sees score update. |  |  |
| DUE-11 | Result | Finish all three rounds on both clients. | Result `VICTORY` / `DEFEAT` / `DRAW`; status `You <score> · <opponent> <score>`; both runs are submitted to `/api/runs`; rating/BPI/season update. |  |  |
| DUE-12 | Rematch | Both press `REMATCH`. | Both show `REMATCH REQUESTED`; when both request, match resets to `READY UP` with `Rematch accepted. Tap READY.` and a fresh seed; scores reset to 0. |  |  |
| DUE-13 | Leave | Press `LEAVE` during/after a match. | Socket closes; lobby closes; opponent sees `<name> left the room.`; no duplicate finish or stuck HUD. |  |  |

### 6.2 Private rooms, creator controls, spectators

| ID | Area | Steps | Expected | Actual | P/F |
| --- | --- | --- | --- | --- | --- |
| DUE-14 | Create room | Click `PLAY 1V1` → `CREATE ROOM`. | Room code appears (6 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, no `0/O/1/I/L`); input shows code; kicker `PRIVATE ROOM`; title `ROOM <CODE>`; status `Room <CODE> · JOIN takes the next player slot. WATCH is read-only.`; `INVITE` link `https://tile-rush.uday.live/?room=<CODE>`; `copy link`. |  |  |
| DUE-15 | Join by code | Player B opens `PLAY 1V1`, types the 6-char code, presses `JOIN`. | B takes the second player slot; both see `READY UP`, each other's names, `READY`; status `Tap READY when you want the countdown to start.`; `2 watching` or spectator count when present. |  |  |
| DUE-16 | Invite link | Open the copied `?room=CODE` link in a third browser. | Duel lobby opens with the code prefilled and status `Room <CODE> · JOIN takes the next player slot, WATCH is read-only.`; URL query is cleaned after leaving. |  |  |
| DUE-17 | Watch by code | Player C enters the code and presses `WATCH`. | C is read-only; `SPECTATING · ROOM <CODE>`; `LIVE`; `PLAYER 1`/`PLAYER 2` names/scores; no `READY`, no `REMATCH`, primary hidden. |  |  |
| DUE-18 | Third player auto-watch | With two players connected, a third signed-in account presses `JOIN` with the code. | Third connection becomes a spectator; status `The room already has two players. You are watching live.`; no player slot stolen; no error. |  |  |
| DUE-19 | Creator controls | As creator, before start, inspect `ROOM SETTINGS`. | `ROOM SETTINGS`, note `you are the host`; `SYMBOLS` `KIDS`/`SPORTS`; `SPECTATOR EMOTES` `ON`/`OFF`; changes broadcast to players and spectators. |  |  |
| DUE-20 | Non-creator controls | As second player, inspect `ROOM SETTINGS`. | `host controls` note; theme and emote state are read-only text, not buttons; no way to change them. |  |  |
| DUE-21 | Settings lock | Start the match; as creator try to change theme/emotes (UI or raw WS `settings`). | UI controls are gone/disabled; server returns `settings_locked`; room state does not change after countdown starts. |  |  |
| DUE-22 | Unauthorized settings | As non-creator, send a raw `settings` WS message before start. | Server returns `creator_only`; theme/emote state unchanged for everyone. |  |  |
| DUE-23 | Room result and rematch | Finish a room match; both press `REMATCH`. | Result shows `VICTORY`/`DEFEAT`/`DRAW`; room stays open; both `REMATCH REQUESTED`; new seed; spectators follow the new match; `Both runs are rated and saved. The room stays open for a rematch.` |  |  |
| DUE-24 | Creator leaves | Creator closes the tab while room is open. | Server marks creator disconnected and transfers creator to the other connected player; remaining player/spectators see `peer_left`; room can continue. |  |  |
| DUE-25 | Invalid room code | Try empty, `!!!`, `ABC` (too short), `ABC1234` (7 chars), and a 40-char string. | Empty: `Type a 6-character room code first.`; malformed: `That room code is not valid.`; no socket opened; no crash. A well-formed but unused 6-char code opens an empty room (current expected behaviour). |  |  |
| DUE-26 | Full queue match | A third account tries to join a queue match id that already has two players. | Server returns `match_full`; client shows `That match is already full.`; existing match is unaffected. |  |  |
| DUE-27 | Spectator limit | Fill a room with 2 players and 20 spectators; connect a 21st spectator. | 21st gets `This room has reached its spectator limit.`; existing 20 remain; spectator count stays 20. |  |  |
| DUE-28 | Expired ticket | Let a match ticket exceed its 10-minute lifetime, then connect. | Server rejects with `ticket_required`; client shows `Your match ticket expired. Sign in again.`; re-queue mints a new ticket and works. |  |  |
| DUE-29 | Spectator ticket in queue | Mint a spectator-only ticket and try to poll/join the player queue. | Server returns `players_only`; client shows `Spectator tickets cannot join the queue.` |  |  |
| DUE-30 | Reconnect | Drop the network for ~5 s during a match, then restore. | Status `Connection dropped. Reconnecting…`; up to 3 reconnects; match resumes if server state is intact; after 3 failures `Connection lost. Rejoin from the menu.` |  |  |

---

## 7. Spectator experience

Preconditions: a live room with two players and at least one spectator; host spectator-emotes setting known.

| ID | Area | Steps | Expected | Actual | P/F |
| --- | --- | --- | --- | --- | --- |
| SPE-01 | Read-only | As spectator, inspect all controls. | No `READY`, `REMATCH`, `JOIN AS PLAYER`, or score-submitting controls; primary hidden; `LEAVE` available; status/lede says read-only. |  |  |
| SPE-02 | Read-only enforcement | From the spectator tab, send `ready`, `progress`, `solved`, `finish`, `emote`, or `rematch` via DevTools WebSocket. | Server returns `read_only`; client status `Spectators cannot send game actions.`; match state/scores unchanged. |  |  |
| SPE-03 | P1/P2 boards | Open a live room on web and Android. | Web shows both boards plus metrics; Android phone shows one large board with `P1`/`P2` switcher, tablet/≥560 dp shows both side by side; tabs show `P1 · <name> · <score>` / `P2 · ...`. |  |  |
| SPE-04 | Live metrics | Watch a round in progress. | Each board shows `SCORE`, `ROUND n / 3`, `DEAL #n`, `ACCURACY`, `STREAK ×n`, `MISSES`, `HITS`; `DONE` appears when a player finishes. |  |  |
| SPE-05 | Input highlight | Player taps a tile. | Spectator sees a highlight on the **tapped tile**: green ring for correct, red ring for wrong; the target/correct answer is **not** highlighted; no other tile is marked correct. |  |  |
| SPE-06 | Highlight lifecycle | Let the deal advance. | Previous input highlight clears; new deal shows no highlight until the player taps; stale `lastInput` from an older round/deal is not shown. |  |  |
| SPE-07 | No answer leak | Compare a spectator board with the target. | Board mirrors the player's deal but never reveals the answer through highlight, animation, or target marker; spectator must solve it visually like a viewer. |  |  |
| SPE-08 | Emote visibility | Host leaves spectator emotes ON; player sends an emote during a break. | Spectator sees a bubble in the form `NAME 😄 GG` (web uppercases via CSS; Android feed uses `FROM · emoji text`); default local toggle is `ON`. |  |  |
| SPE-09 | Local mute | Spectator clicks `PLAYER EMOTES ON` → `OFF`. | Toggle shows `OFF`; existing bubbles clear; new player emotes are suppressed; preference persists in `localStorage["tile-rush.spectatorEmotes.v1"]`; turning ON resumes. |  |  |
| SPE-10 | Host OFF | Host sets `SPECTATOR EMOTES` OFF. | Spectator toggle becomes disabled `OFF BY HOST`; bubbles clear; no player emotes are delivered to spectators; players still see each other's emotes. |  |  |
| SPE-11 | Host ON again | Host sets `SPECTATOR EMOTES` ON. | Spectator toggle becomes enabled `ON` (or `OFF` if local mute); new emotes visible again. |  |  |
| SPE-12 | Spectator count | Join/leave spectators. | `N watching` updates for players and spectators; leaving decrements; duplicate same-account socket does not double-count permanently. |  |  |
| SPE-13 | Room theme | Host selects SPORTS. | Spectator boards use the same sports icons/slice and colour rings as players; `SYMBOLS SPORTS` shown read-only in `ROOM SETTINGS`. |  |  |
| SPE-14 | Final result | Players finish. | Spectator sees `X WINS` or `DRAW`; lede `<P1> <score> · <P2> <score>`; status `<winner> takes it.` or `Dead heat.`; note `Read-only room replay. The players can run it back with a rematch.`; no rematch button. |  |  |
| SPE-15 | Late join | Join a room after the match has started. | Spectator sees current live state/boards; if match already finished, sees result state; no crash and no player slot. |  |  |

---

## 8. Emotes

Preconditions: signed-in account; two players in a duel/room; at least one spectator for visibility tests.

| ID | Area | Steps | Expected | Actual | P/F |
| --- | --- | --- | --- | --- | --- |
| EMO-01 | Defaults | Profile → `SETTINGS` → emote editor. | Exactly 8 rows: `😄 GG`, `🔥 Nice`, `🎯 Focus`, `😅 Oops`, `👋 Hey`, `💪 Close`, `🔁 Rematch`, `🙏 Thanks`; each row has an emoji input and a text input with placeholder `Message`. |  |  |
| EMO-02 | Private editor | As account A, open Settings; as account B, open Settings. | Editor is only in the signed-in account's profile; A's edits do not appear for B; guests cannot open the editor. |  |  |
| EMO-03 | Custom preset | Change row 1 to `🚀` / `GO`; press `SAVE EMOTES`. | Toast `EMOTES Saved for @<username> on this device.`; editor repaints; duel lobby/break bars show `🚀 GO`; stored under `tile-rush.emotes.v1.<username>`. |  |  |
| EMO-04 | Length limits | Enter a 20-character emoji field and a 100-character text; save. | Values are truncated to the documented caps: web emoji loader/save trims to 4, Android/server allow 8; text ≤24; empty emoji becomes `✨`, empty text becomes `Nice`. |  |  |
| EMO-05 | Sanitisation | Enter `<script>alert(1)</script>` and control characters; save; send. | Server strips `<>` and control characters; client displays literal text; no script execution; no HTML injection in bubbles/feed. |  |  |
| EMO-06 | Lobby bar | In a matched room/lobby, inspect the emote bar. | `#duelEmotesLobby` visible with 8 buttons; each shows emoji + uppercase/truncated text; button `aria-label` includes emoji + text. |  |  |
| EMO-07 | Break bar | During a round break, inspect the break overlay. | `#duelEmotes` visible with the same 8 presets; hidden during active play; visible again on the next break. |  |  |
| EMO-08 | Send/receive | Player A taps an emote in the lobby/break. | A sees a local bubble `YOU 😄 GG`; B sees `A 😄 GG` (web uppercases via CSS; Android shows `A · 😄 GG`); spectators (if enabled) see it too; bubble disappears after ~3 s. |  |  |
| EMO-09 | Rate limit | Tap the same emote twice within 900 ms; then wait >900 ms and tap again. | First sends; second is suppressed by the server; third after cooldown sends. Only two bubbles total (one per accepted send). |  |  |
| EMO-10 | Per-player cooldown | A and B each send within the same 900 ms window. | Both accepted; cooldown is per player, not global. |  |  |
| EMO-11 | Finished match | After result, try to send an emote. | Server does not broadcast after `finished`; no new bubbles appear for players/spectators. |  |  |
| EMO-12 | Spectator visibility | With host ON, player sends; spectator local toggle ON/OFF. | ON: bubble visible; OFF: suppressed/cleared; host OFF: `OFF BY HOST` and no delivery. |  |  |
| EMO-13 | Legacy payload | Send `{type:"emote", id:"gg"}` from DevTools. | Server accepts only legacy IDs `gg`, `wave`, `nice`, `oops`, `focus`, `rematch`; displays uppercase text; unknown ID ignored. |  |  |
| EMO-14 | Android editor | Android → Profile → Settings → emote editor. | 8 rows; defaults same; `SAVE EMOTES` button; toast `Emotes saved for @<username>.`; stored in SharedPreferences `emotes_<username>`; duel lobby/break bars use the presets. |  |  |
| EMO-15 | Android room bar | Android room before start and during a break. | `EMOTES · TAP TO SEND` bar shows 8 presets; feed shows `FROM · emoji text`; sending works to web opponent. |  |  |

---

## 9. Insights and health metrics

Preconditions: signed-in ACCT-RING with ring data and runs across several days/hours; ACCT-EMPTY for empty states; desktop and Android.

### 9.1 Web INSIGHTS page

| ID | Area | Steps | Expected | Actual | P/F |
| --- | --- | --- | --- | --- | --- |
| INS-01 | Page load | Open `insights.html` (or `INSIGHTS` from home) while signed in. | Title `Insights`; sub `Your reaction time by day and hour, next to the ring's numbers for that day.`; tabs `INSIGHTS` / `HEALTH METRICS`; `Week`/`Month`; period title; calendar; status clears. |  |  |
| INS-02 | Tabs | Click `HEALTH METRICS`; click `INSIGHTS`. | `HEALTH METRICS` navigates to `health.html` (`Health metrics`, `From`/`To`/`Load`); `INSIGHTS` returns; active tab styling/aria-selected correct. |  |  |
| INS-03 | Week/month | Click `Week` then `Month`. | Week shows Mon–Sun period `This week · <Mon> – <Sun>`; Month shows `<Month> <Year>`; calendar re-renders; selected day is preserved where possible. |  |  |
| INS-04 | Period navigation | Click `‹` and `›` several times. | Period moves one week/month; `‹` is disabled before the first day with data; `›` is disabled after today; aria-labels `Previous week`/`Next week` or `Previous month`/`Next month`. |  |  |
| INS-05 | Period summary | Inspect top tiles. | `RUNS`, `AVG RT` (ms), `BEST RT` (ms), `ACCURACY` (%); notes `<n> days played`, comparison `▲ <n>ms faster than last week/month`, `▼ <n>ms slower...`, `same as ...`, or `no runs last week/month`. |  |  |
| INS-06 | Ring averages | Inspect `RING AVERAGE`. | `Sleep`, `Recovery`, `HRV`, `Resting HR` values with `usual <value>` where available; only non-null metrics shown; no fake values when ring data absent. |  |  |
| INS-07 | Calendar | Inspect the week/month grid. | Weekday headers `Mon`–`Sun`; empty padding cells; each played day shows day number, average RT, heat tint; `▲` got faster, `▼` got slower; today marked; selected day marked; `aria-label` includes date, runs, average ms, improved direction. |  |  |
| INS-08 | Calendar legend | Read under the calendar. | `Slower than usual` / `Faster`; key `▲ got faster during the day · ▼ got slower`. |  |  |
| INS-09 | Day detail | Click a played day. | Day card shows `RUNS`, `AVG RT`, `BEST RT`, `ACCURACY`, time span (`HH:MM–HH:MM`), `FIRST → LAST` ms when >1 run, trend badge `FASTER <n>ms`/`SLOWER <n>ms`/`NO CHANGE`/`1 RUN`, headline, ring line, `WORKING AGAINST YOU`, `ON YOUR SIDE`. |  |  |
| INS-10 | Ring line | Inspect a day with ring data. | Tiles for `RECOVERY`, `SLEEP SCORE`, `SLEPT`, `HRV`, `RESTING HR`, `DEEP SLEEP`, `REM SLEEP`, `STEPS` as available; `usual` values where present; `?` buttons next to terms; no data: `No ring data for this day.` or `Ring has not processed this day yet.` |  |  |
| INS-11 | Best/worst windows | Inspect `Best time of day` and `Worst time of day`. | Each shows window name, `HH:00 – HH:00`, average ms, run count, difference vs other runs, and either `WHY IT WORKED`/`WHAT SLOWED YOU DOWN` reasons or a plain-language no-factor note. |  |  |
| INS-12 | Last played callout | Open page for an account with a recent prior day. | `LAST PLAYED · <WEEKDAY, MONTH DAY>`; headline; `WHAT HELD YOU BACK` and/or `WHAT HELPED`; `Open day →` selects that day/period. |  |  |
| INS-13 | Empty period | Open a week/month with no runs. | Status `No runs this week.` or `No runs this month.` plus `Use ‹ to look back.` / `Play a signed-in run to start.`; calendar may still render; no broken tiles. |  |  |
| INS-14 | Signed out | Open `insights.html` with no session. | Error `Sign in on the game screen to see your insights.`; no data leak; sign-in path available. |  |  |
| INS-15 | No ring data | Use ACCT-EMPTY with runs but no ring. | Insights still shows run tiles/calendar/day detail; ring sections show empty/`No ring data for this day.`; no crash. |  |  |

### 9.2 Web HEALTH METRICS page

| ID | Area | Steps | Expected | Actual | P/F |
| --- | --- | --- | --- | --- | --- |
| INS-16 | Health load | Open `health.html` signed in. | Title `Health metrics`; sub `Ultrahuman ring · loading…` then last-synced text or `Ultrahuman ring`; form `From`, `To`, `Load`; default last 7 days. |  |  |
| INS-17 | Date range | Set From/To to 7 days and load; set To before From. | Valid range loads; invalid range shows `"To" must be on or after "From".`; no request with invalid range. |  |  |
| INS-18 | 7-day limit | Request a range longer than 7 days (URL or form). | API returns `Range is limited to 7 days.`; page shows the error in status; no partial misleading chart. |  |  |
| INS-19 | Daily card | Inspect a day. | Header date + `Bed HH:MM → HH:MM`; scores `SLEEP`, `RECOVERY`, `MOVEMENT`; grid `TOTAL SLEEP`, `HRV`, `RESTING HR`, `STEPS`, `VO2 MAX`, `ALERTNESS`, `ACTIVE`, `TEMP DEV`; efficiency/trend notes where available. |  |  |
| INS-20 | Sleep-stage bar | Inspect the bar under a day. | Stacked bar with `Deep`, `REM`, `Light`, `Awake` segments (violet/cyan/dim as styled), legend with stage time text; proportions match data; zero/missing stages do not break layout. |  |  |
| INS-21 | HR chart | Inspect heart-rate figure. | `HEART RATE`, min–max BPM label, line chart, axis start/end clock times; `aria-label` describes range; fewer than 2 samples shows `No heart-rate samples.` |  |  |
| INS-22 | Empty range | Pick a date range with no ring data. | Status `No data for this range.`; no empty cards with fake numbers. |  |  |

### 9.3 Android INSIGHTS / HEALTH tabs and charts

| ID | Area | Steps | Expected | Actual | P/F |
| --- | --- | --- | --- | --- | --- |
| INS-23 | Android tabs | Open `INSIGHTS` from bottom nav. | Two chips `INSIGHTS` and `HEALTH`; sub `Weekly · runs × ring metrics` or `Monthly · runs × ring metrics`; `? ASK ABOUT YOUR DATA` button. |  |  |
| INS-24 | Android period controls | Tap `WEEK`/`MONTH`, then `‹`/`›`. | Period title updates; data reloads; previous/next bounds behave like web; no crash on empty period. |  |  |
| INS-25 | Android insights content | Inspect INSIGHTS tab. | `RUNS`, `AVG RT`, `BEST RT`, `ACCURACY`; `RING · PERIOD AVERAGE` (`RECOVERY`, `SLEEP`, `HRV`, `RHR`); `TIME OF DAY` (`BEST WINDOW`/`WORST WINDOW`); `DAILY BREAKDOWN` calendar; day card; `WHAT HURT`. |  |  |
| INS-26 | Android health trends | Open `HEALTH` tab with ≥2 ring days. | `TRENDS · <n> DAYS` with four line+dot charts in oldest→newest order: `RECOVERY`, `SLEEP SCORE`, `HRV` (`ms`), `RESTING HR` (`bpm`); min–max and first/last day labels; no reversed time axis. |  |  |
| INS-27 | Android daily health card | Inspect a daily ring card. | Sleep score, slept, time in bed, efficiency, HRV, resting HR, temperature deviation, steps, bedtime; `DEEP / REM / LIGHT` bar with minute labels; values match API. |  |  |
| INS-28 | Android empty health | Account with no ring data. | `No ring data for this period. Connect the Ultrahuman ring or pick another week.`; no crash. |  |  |

### 9.4 “Ask about your data” helper

| ID | Area | Steps | Expected | Actual | P/F |
| --- | --- | --- | --- | --- | --- |
| INS-29 | Open helper | On INSIGHTS, click `Ask about your data` (web FAB) or `? ASK ABOUT YOUR DATA` (Android). | Panel `Insights helper`; subtitle `Built in · explains your numbers in plain words`; chat log, suggestion chips, input `Ask about sleep, HRV, your runs…`, `Ask`/`ASK` button, close `×`/`CLOSE`. |  |  |
| INS-30 | Help greeting | Open for the first time. | Greeting explains it is a simple built-in helper, not AI/medical advice, and suggests `why was I slow on Tuesday?` / `what is HRV?`. |  |  |
| INS-31 | Suggested questions | Click each chip: `Why was my last day slow?`, `What should I change?`, `When do I play best?`, `How was my week?`, `Do I get faster during the day?`, `What is REM sleep?`, `What is HRV?` | Each returns a relevant answer using the loaded period; no blank response; chips remain usable. |  |  |
| INS-32 | Day question | Ask `Why was I slow on Tuesday?` (use a weekday with data) or `Why was my last day slow?`. | Answer names the day, compares RT to usual, lists ring factors that hurt/helped, and gives a practical tip; no invented data. |  |  |
| INS-33 | Term question | Ask `What is HRV?`, `What is REM sleep?`, `What is deep sleep?`, `What is recovery?`, `What is resting heart rate?` | Plain-language explanation with the current value where available; no network request. |  |  |
| INS-34 | Summary question | Ask `How was my week?` / `How was my month?`. | Summary of runs, average RT, best RT, accuracy, ring highlights, top hurt factor if present. |  |  |
| INS-35 | Fallback | Ask gibberish, e.g. `purple elephant?`. | `Sorry, I didn't catch that. I'm a simple helper, so I only understand certain questions. Try one of the suggestions below.` |  |  |
| INS-36 | No network | Open DevTools Network; ask 3 questions; repeat on Android with network inspector. | No AI/network call is made by the helper; answers use already-loaded data; works offline once the page is loaded. |  |  |
| INS-37 | Term `?` buttons | Click `?` next to Recovery, Sleep score, Slept, HRV, Resting HR, Deep sleep, REM sleep. | Helper opens with the corresponding explanation; the term matches the clicked field. |  |  |
| INS-38 | Data accuracy | Compare a day card and helper answer to `/api/health` response. | Displayed runs, avg/best RT, accuracy, ring values, best/worst window values match the API response; no stale period data after switching. |  |  |

---

## 10. Titles and fingerprints explainer

Preconditions: at least one account with a completed run and axes; another with no runs for the default state.

| ID | Area | Steps | Expected | Actual | P/F |
| --- | --- | --- | --- | --- | --- |
| BAD-01 | Home title click | Click the home title pill (`DRIFTER`, `SHARPSHOOTER`, etc.). | Modal `TITLES & FINGERPRINTS`; heading `Titles`; lede explains titles are BPI bands and never drop; tabs `TITLES`/`FINGERPRINTS`; close `×`. |  |  |
| BAD-02 | Nine titles | Inspect the TITLES list. | Exactly 9: `NOVA 930–1000`, `MAESTRO 850–929`, `TACTICIAN 760–849`, `SHARPSHOOTER 660–759`, `TRACKER 560–659`, `HUNTER 440–559`, `SCOUT 320–439`, `SPARK 200–319`, `DRIFTER 0–199`; each has color dot, note, description. |  |  |
| BAD-03 | Current title | Open as an account whose best BPI maps to a known title. | That row has `YOU` and `is-current` highlight; no other row has `YOU`; the range contains the account's best BPI. |  |  |
| BAD-04 | Fingerprints tab | Click `FINGERPRINTS`. | Heading `Fingerprints`; lede explains rules checked top to bottom, first match wins; exactly 6: `SCANNER`, `SNIPER`, `METRONOME`, `GRINDER`, `SWITCHBACK`, `ALL-ROUNDER`; each shows rule and description. |  |  |
| BAD-05 | Archetype rules | Compare rules to `shared/bpi.js`. | `SCANNER: Speed ≥ 60 · Search ≥ 60 · Precision < 52`; `SNIPER: Precision ≥ 62 · Consistency ≥ 58`; `METRONOME: Consistency ≥ 62 · Resilience ≥ 55`; `GRINDER: Capacity ≥ 60 · Resilience ≥ 50`; `SWITCHBACK: Updating ≥ 58 · Consistency < 52`; `ALL-ROUNDER: None of the specialist rules match`. |  |  |
| BAD-06 | Current archetype | Open as an account with a latest run. | Current archetype row has `YOU`; it matches the result/profile archetype; no `YOU` if no axes are available. |  |  |
| BAD-07 | Axes block | On FINGERPRINTS with axes available. | `YOUR LATEST FINGERPRINT`; seven values in order: `SPD`, `SRCH`, `PREC`, `CONS`, `UPD`, `RES`, `CAP`; each 0–100; values match latest result/profile radar. |  |  |
| BAD-08 | No axes | Open as a brand-new account with no runs. | Titles still list all 9; FINGERPRINTS lists all 6; axes block is absent; no `YOU` or a sensible default; no JS error. |  |  |
| BAD-09 | Result badges | Finish a run; click the result title and archetype. | Title click opens TITLES with current title highlighted; archetype click opens FINGERPRINTS with current archetype highlighted; closing returns to result. |  |  |
| BAD-10 | Profile badges | Open own profile; click title and archetype. | Same modal; current highlights match profile; closing returns to profile. |  |  |
| BAD-11 | Leaderboard title | Click a `board-title-badge` on a leaderboard row. | Explainer opens for that player's title. Expected: the profile does **not** also open. If both overlays open or the page navigates, log a P2 defect. |  |  |
| BAD-12 | Close behaviours | Press `×`, click backdrop, press `Esc`; reopen. | All close the modal; focus returns to a sensible control; page scroll is restored; `body.badge-open` removed. |  |  |
| BAD-13 | Android dialog | On Android click home title, result title/archetype, profile title/arch, leaderboard title. | `BadgeInfoDialog` opens with `TITLES`/`FINGERPRINTS` tabs, 9 titles, 6 archetypes, `YOU`, axes when available; system back closes only the dialog. |  |  |
| BAD-14 | Copy consistency | Compare web/Android. | Same title names, ranges, notes, descriptions, archetype rules and `YOU` semantics; no stale or contradictory copy. |  |  |

---

## 11. Leaderboards

Preconditions: signed-in accounts with ranked runs; regional account/VPN for country/region; at least one account with no runs.

| ID | Area | Steps | Expected | Actual | P/F |
| --- | --- | --- | --- | --- | --- |
| LDR-01 | Open board | Click `RANKS` / `LEADERBOARD`. | Modal `LEADERBOARD`; scope label `WORLDWIDE`; period `THIS SEASON`; filters `GLOBAL`/`COUNTRY`/`REGION`, `WEEK`/`SEASON`/`ALL TIME`, `BPI`/`SCORE`/`RATING`; stats `<n> ranked players`, `<n> online now`. |  |  |
| LDR-02 | Metric switch | Switch `BPI` → `SCORE` → `RATING`. | Rows re-sort by the selected metric; value label changes `BPI`/`SCORE`/`RATING`; active button styling/aria-pressed correct; own row remains marked `YOU`. |  |  |
| LDR-03 | Period switch | Switch `WEEK` → `SEASON` → `ALL TIME`. | Header period label changes (`THIS WEEK`, `THIS SEASON`, `ALL TIME` or the week label); values/ranks update; weekly and seasonal boards differ when data supports it. |  |  |
| LDR-04 | Scope switch | Switch `GLOBAL` → `COUNTRY` → `REGION`. | Scope label changes; country/region rows filtered; if geo unavailable, message `We could not resolve your country/region. Play from a network that exposes location or switch to Global.`; no crash. |  |  |
| LDR-05 | Empty board | Use a scope/period with no ranked runs. | `No ranked runs on this board yet. Be the first.`; stats show `0 ranked players`; no broken rows. |  |  |
| LDR-06 | Own rank | As an account with a ranked run, inspect footer. | `YOUR RANK #<rank> · <value> <metric>`; rank matches profile/`/api/rank`; if no run, `Play one ranked run to enter this board.`; if signed out, `Sign in to rank your runs and claim a spot.` |  |  |
| LDR-07 | Row content | Inspect a row. | Rank zero-padded (`01`, `02`), avatar, username, title + run count (`SHARPSHOOTER · 12 runs`), value + metric label, chevron; own row has `YOU`. |  |  |
| LDR-08 | Profile navigation | Click a non-self row. | Public profile opens for that user; no settings/devices tabs; back/close returns to the board, preserving filters. |  |  |
| LDR-09 | HUD profile | Click the account chip / callsign in HUD. | Own profile opens; board remains reachable from `leaderboard` link; closing returns to prior screen. |  |  |
| LDR-10 | Online count | Sign in on two devices; wait for `last_seen` touch. | `online now` count includes recently seen accounts (subject to server window); does not count stale users forever. |  |  |
| LDR-11 | Error state | Block `/api/leaderboard` or use offline. | `The board is unavailable right now. Try again.`; no unhandled rejection; retry works. |  |  |
| LDR-12 | Android parity | Android `RANKS`. | Chips `BPI`/`SCORE`/`RATING`, `SEASON`/`WEEK`/`ALL TIME`, `GLOBAL`/`COUNTRY`/`REGION`; `YOUR POSITION`; rows open profiles; empty/error states present. |  |  |

---

## 12. Android parity

Preconditions: APK installed on ENV-08/09; production API reachable; account signed in; guest data cleared for first-run tests.

### 12.1 Navigation, lifecycle, and back behaviour

| ID | Area | Steps | Expected | Actual | P/F |
| --- | --- | --- | --- | --- | --- |
| AND-01 | First launch | Clear app data; launch. | Forced tutorial opens (`How to play`, `Step 1 of 4`, `STEP 1 / 4`, `ROUND ONE`); no way to skip; system back does nothing while forced. |  |  |
| AND-02 | Tutorial completion | Page to step 4, press `GOT IT`. | Tutorial closes to home; `tutorial_done_guest` or `tutorial_done_<username>` set in SharedPreferences; second launch does not force it. |  |  |
| AND-03 | Home layout | Inspect home. | `TILE RUSH`, `Brain performance index`, `READ FAST. TAP TRUE.`, `SYMBOLS KIDS/SPORTS`, stat tiles `BEST BPI`/`BEST SCORE`/`RATING`, `HOW TO PLAY`, `WEEKLY BOARD`, `INSIGHTS`, play cards `Start a run`, `Race the ghost`, `Quick duel`, `Room + spectators`, `LEADERBOARD`, `MY PROFILE`. |  |  |
| AND-04 | Bottom nav | Tap `PLAY`, `INSIGHTS`, `RANKS`, `PROFILE`. | Each screen opens; active label highlighted; nav visible only on Home/Insights/Leaderboard/Profile; hidden during Game/Duel/Auth/Tutorial. |  |  |
| AND-05 | Back from Game | Start a run; press system back during play. | Toast `Finish the run to bank it.`; run continues; no partial submission. |  |  |
| AND-06 | Back from Game after end | Let a run finish; press back on Game/Result. | Game screen exits; Result back goes to Duel if it was a duel, otherwise Home; no duplicate submission. |  |  |
| AND-07 | Back from Profile | Open Profile; press back on tab 0/1/2. | First back returns to `PROFILE` tab, second back returns Home; does not exit app from a sub-tab. |  |  |
| AND-08 | Back from dialog | Open badge dialog; press back. | Dialog closes; underlying screen remains; a second back follows normal screen rules. |  |  |
| AND-09 | Orientation | Rotate device while on Home, Game, Duel, Insights. | App is portrait-locked (`android:screenOrientation="portrait"`); no rotation crash or lost state; record actual if tablet/landscape differs. |  |  |
| AND-10 | Session restore | Sign in; force-stop app; relaunch. | Still signed in; username/rating/BPI loaded; cookie stored in `tile_rush_cookies`; sign-out clears it. |  |  |
| AND-11 | Guest local run | Sign out; complete a run as guest. | Run scored locally, not banked/ranked; auth copy says playing without an account is local only; no `/api/runs`; no profile entry. |  |  |

### 12.2 Feature parity cases

| ID | Area | Steps | Expected | Actual | P/F |
| --- | --- | --- | --- | --- | --- |
| AND-12 | Solo run | Start `Start a run`. | Same 3×3/25s, 4×4/15s, 5×5/10s; `ROUND n · n×n`; `TAP THIS EXACT TILE`; `CYCLE`; `QUIT`; countdown overlay; breaks `BREAK`, `NEXT ...`; result `FINAL SCORE`, `BEST STREAK`, `CYCLES`, `BRAIN PERFORMANCE INDEX`, `WHAT TO FIX NEXT`, `ROUND SPLIT`, `PLAY AGAIN`. |  |  |
| AND-13 | Result BPI | Finish a run. | BPI, title, archetype chips open `BadgeInfoDialog`; feedback headline/body/drill; rating before→after; `PLAY AGAIN`, `LEADERBOARD`, `HOME`/menu; remote submit status/error. |  |  |
| AND-14 | Theme choice | Home `SPORTS`, start run; return and `KIDS`. | Correct theme in game; target copy switches “sports icon”/“shape”; locked during run; room theme overrides. |  |  |
| AND-15 | Quick duel | Tap `Quick duel` → `ENTER THE QUEUE`. | `QUICK MATCH`, `Find a rival`, `ENTER THE QUEUE`; `CANCEL`; pairing, ready, countdown, lockstep, result `YOU WON`/`<name> WINS`/`DEAD HEAT`, `REMATCH`/`EXIT`. |  |  |
| AND-16 | Room create/join/watch | `Room + spectators` → `CREATE ROOM`; second device joins with code; third taps `WATCH`. | 6-char code; `ROOM CODE`; `SHARE LINK`, `COPY CODE`, `JOIN`, `WATCH`; creator settings; third is read-only spectator; 20-spectator limit. |  |  |
| AND-17 | Room settings | As creator before start. | `ROOM SETTINGS`, `you are the host`, `SYMBOLS` `KIDS`/`SPORTS`, `SPECTATOR EMOTES` `ON`/`OFF`, note `Only the room creator can change these.`; non-creator sees read-only values. |  |  |
| AND-18 | Spectator boards | Watch a live room on phone and tablet. | Phone: P1/P2 chips + one large board; tablet/≥560 dp: both boards; metrics `ACCURACY`, `STREAK`, `HITS`, `MISSES`; `DONE`; input highlight green/red; no target highlight. |  |  |
| AND-19 | Spectator emotes | Watch with host ON; toggle `PLAYER EMOTES`; host OFF. | Toggle `ON`/`OFF` persists in SharedPreferences `spectator_emotes`; OFF clears bubbles; host OFF shows `OFF BY HOST` disabled. |  |  |
| AND-20 | Emote editor | Profile → Settings → emote editor. | 8 rows, defaults, `SAVE EMOTES`, per-account SharedPreferences, toast, duel lobby/break bar uses presets. |  |  |
| AND-21 | Insights/Health | Open `INSIGHTS`; switch `INSIGHTS`/`HEALTH`; `WEEK`/`MONTH`; `‹`/`›`. | Both tabs render; four trend charts on HEALTH; sleep-stage bar; daily ring cards; `? ASK ABOUT YOUR DATA`; answers work offline. |  |  |
| AND-22 | Leaderboard | Open `RANKS`; switch metrics/period/scope; tap row. | Same filters/values as web; `YOUR POSITION`; profile opens; title badge opens dialog; back returns. |  |  |
| AND-23 | Profile/settings/devices | Open `PROFILE`; tabs Profile/Settings/Devices. | Hero/season/radar; `Weekly rank on home` toggle; `How to play` OPEN; `Connected devices` MANAGE; `SIGN OUT`; Oura/Ultrahuman `CONNECT`/`UNLINK`, `LINKED · SAMPLE FEED`; `OPEN INSIGHTS` enabled only when linked. |  |  |
| AND-24 | Auth | Sign out; open Auth. | `SIGN IN`/`CREATE ACCOUNT`, username/password/confirm, errors, `SIGN IN`/`CREATE ACCOUNT` button, local-only copy; register forces tutorial; login restores data. |  |  |
| AND-25 | Notifications/toasts | Trigger save, device link, emote save, back-during-run. | Toast appears at bottom, readable, auto-dismisses ~2.8 s; does not block nav permanently. |  |  |
| AND-26 | Offline/network loss | Turn on airplane mode; open Home/Insights/duel. | Graceful errors/toasts; no crash/ANR; cached home/profile still usable; retry works when online. |  |  |

---

## 13. Responsive and large-screen layout

Test the web at each width in section 1.3. For every width, check `document.documentElement.scrollWidth <= window.innerWidth` (no horizontal scroll) and that all primary actions are reachable without zoom.

| ID | Area | Steps | Expected | Actual | P/F |
| --- | --- | --- | --- | --- | --- |
| RSP-01 | 360 px phone | Set viewport 360×800; open home, tutorial, auth, result, duel, board, profile, insights. | No horizontal scroll; tiles fit 5×5; buttons full-width/stacked; `section-bar` fits `calc(100vw - 20px)`; text not clipped; modal scrolls vertically. |  |  |
| RSP-02 | 390 px iPhone | 390×844 Safari; check safe areas. | Content clears notch/home indicator; bottom nav above safe area; no double scroll; 100dvh modals usable. |  |  |
| RSP-03 | Tablet 768 px | 768×1024. | Two-column side panel/layout where designed; board and side cards readable; no overlap; modal widths sane. |  |  |
| RSP-04 | Laptop 1126 px | 1126×700. | Home title pill is a compact pill (`SHARPSHOOTER` ~112 px wide), not stretched across a grid row; sidebar/board fit; no horizontal scroll. |  |  |
| RSP-05 | 1920 px | 1920×1080. | Layout uses the width (home up to ~1760 px, spectator up to ~1680 px); board not tiny; cards not stretched into unreadable lines; no horizontal scroll. |  |  |
| RSP-06 | 2560 px / mirror | 2560×1440 at 100% and 150% zoom. | Full-screen layout; text labels raised at ≥1500 px (`.micro` 10 px, watch metrics 22 px, names 17 px); readable from several metres; no giant empty gutters that break composition; no scroll. |  |  |
| RSP-07 | Full-screen modals | At ≥1000 px open auth, board, profile, insights, tutorial, result, duel. | Cards expand to their large-screen widths (auth 760, board 1400, profile 1500, insights 1200, tutorial 1100, result 1100, duel 760, all ≤94–96vw); centred; backdrop covers viewport. |  |  |
| RSP-08 | Text-only buttons — intro | At each width inspect `how to play`, `leaderboard`, `health & insights`, `reset data` (dev flag). | Each has pill/button styling (border, padding, background, hover), not bare underlined text; tap target comfortably ≥32 px; does not wrap awkwardly. |  |  |
| RSP-09 | Text-only buttons — overlays | Inspect `copy link`, board footer `leaderboard`, `log out`, `play without an account`, `change photo`. | All `.linkish` controls have surrounding pill styling and visible focus/hover; no invisible hit area; labels remain legible at 360 px. |  |  |
| RSP-10 | Watch/spectator layout | Open a live room at 360, 768, 1126, 1920, 2560. | Phone: one board + P1/P2 tabs; larger: both boards and metrics; no clipped scores/names; `PLAYER EMOTES` toggle reachable; target/goal readable. |  |  |
| RSP-11 | Board fit | In 5×5 round at 360 px and 2560 px. | All 25 tiles visible without scrolling; tile size adapts; gaps and icons readable; no overflow beyond board. |  |  |
| RSP-12 | Long content | Use long username (16 chars), long title, long emote text, long room code. | Truncates/ellipsis where designed; no overlap; no horizontal scroll; tooltips/aria labels still meaningful. |  |  |
| RSP-13 | Zoom 200% | Browser zoom 200% at 1440 px; mobile text size 200%. | Content reflows; no clipped buttons; modal scroll works; no horizontal scroll; core actions still reachable. |  |  |
| RSP-14 | Android large display | Cast/mirror Android or run on tablet. | Board/metrics remain readable; no letterboxing that hides controls; bottom nav does not overlap content; app remains portrait if locked. |  |  |

---

## 14. Performance and accessibility

| ID | Area | Steps | Expected | Actual | P/F |
| --- | --- | --- | --- | --- | --- |
| PERF-01 | Cold load | Fresh cache, Fast 3G/4G throttling, desktop. | First meaningful paint <3 s on broadband; intro usable; no blocking font/layout failure; no console errors. |  |  |
| PERF-02 | Warm load | Reload with cache. | Repeat load noticeably faster; CSS/JS served from cache; `?v=20261030j` assets return 200/304; no stale/mixed versions. |  |  |
| PERF-03 | Cache headers | `curl -I` HTML, `/js/game.js`, `/css/styles.css`, `/api/auth/me`. | HTML `max-age=0, s-maxage=60, stale-while-revalidate=300`; JS/CSS `max-age=300, s-maxage=86400, stale-while-revalidate=604800`; API `private, no-store`; no secret headers. |  |  |
| PERF-04 | API latency | Time `/api/leaderboard`, `/api/users/:username`, `/api/health?kind=insights` warm. | Boards/profile <1 s typical; warm historical insights ~0.25–0.6 s; no repeated Ultrahuman sync when all days are stored; no 5xx. |  |  |
| PERF-05 | Ring sync skip | Open a historical week twice. | Second load skips Ultrahuman network sync and is faster; today’s row refreshes only after 15 minutes; data still correct. |  |  |
| PERF-06 | Long session | Play 5 runs / 5 duels in one tab. | No memory runaway, timer leak, duplicate audio nodes, or growing DOM; FPS stable; socket closes on leave. |  |  |
| PERF-07 | Keyboard basics | Tab through home, auth, tutorial, board, profile, insights. | Visible focus ring; logical order; Enter/Space activate buttons; `Esc` closes overlays; `1`–`9` tiles in round 1; `M` mute. |  |  |
| PERF-08 | ARIA basics | Inspect with browser accessibility tree / screen reader. | Brand/board/goal labeled; tiles `role="button"` with `Tile n`; countdown `aria-live="assertive"`; toast/feed `aria-live="polite"`; toggles `aria-pressed`; dialogs `role="dialog" aria-modal="true"` + label; icon buttons have accessible names. |  |  |
| PERF-09 | Focus management | Open auth/tutorial/badge/board/profile. | Focus moves into the dialog where implemented; `×`/close is focusable; closing returns focus sensibly; no focus trapped behind the modal; background not scrollable (`overflow:hidden`). |  |  |
| PERF-10 | Reduced motion | Set OS `prefers-reduced-motion: reduce`; reload; also toggle `MOTION LOW` and `?still=1`. | Motion defaults low; backdrop hidden/simplified; transitions near-zero; game remains playable; `MOTION` shows `LOW`; `?still=1` disables animations for screenshots. |  |  |
| PERF-11 | Contrast | Check body/muted/dim text, buttons, badges, board values, error text on dark backgrounds. | Body text ≥4.5:1; large text ≥3:1; focus indicators visible; error/rose and success/mint not the only signal (text labels also present). |  |  |
| PERF-12 | Colour-blind check | Simulate deuteranopia/protanopia; play KIDS and SPORTS. | Shape/icon and colour both distinguish target; colour ring plus icon label; no reliance on red/green alone for correct/wrong (correct/wrong also uses position/feedback text). |  |  |
| PERF-13 | Audio | First gesture starts audio; toggle mute; reload. | No autoplay error; music starts only after interaction; mute persists; `M` and `MUSIC` stay in sync; no audio after leaving run. |  |  |
| PERF-14 | Screen reader run | With VoiceOver/TalkBack, start a run and read HUD. | Score/time/round/cycle/tier have understandable names/values; live countdown announced; tile labels announced; no constant noisy announcements that block play. |  |  |
| PERF-15 | Lighthouse/axe | Run Lighthouse (mobile) and axe on home, result, board, profile, insights. | Performance ≥80 target (record actual), accessibility ≥90 target; no critical axe violations; no layout shift from fonts/images. |  |  |
| PERF-16 | Android performance | Cold start, navigate 5 screens, play a run, open Health charts. | Cold start <3 s on mid-range device; no ANR; scrolling smooth; charts render without jank; back stack stable. |  |  |

---

## 15. Negative and security cases

Preconditions: ENV-04 preferred for destructive/abuse tests; ENV-01 only with dedicated accounts. Never test with real user data.

| ID | Area | Steps | Expected | Actual | P/F |
| --- | --- | --- | --- | --- | --- |
| NEG-01 | Invalid room code — empty | Open duel room; leave input blank; press `JOIN` or `WATCH`. | `Type a 6-character room code first.`; no socket/ticket request. |  |  |
| NEG-02 | Invalid room code — malformed | Enter `!!!`, `ABC`, `ABC1234`, 41+ chars. | `That room code is not valid.`; input maxlength 40 prevents longer; no crash; no room created. |  |  |
| NEG-03 | Unused valid code | Enter a well-formed unused 6-char code and `JOIN`. | Current behaviour: an empty room is created/opened (Durable Object is created on connect); record this as expected unless product decides codes must be pre-created. |  |  |
| NEG-04 | Full room — players | Two players already connected; third uses `JOIN`. | Third becomes spectator (not an error); no third player slot; no score/state corruption. |  |  |
| NEG-05 | Full room — spectators | 20 spectators connected; 21st `WATCH`. | `This room has reached its spectator limit.`; count remains 20; existing spectators unaffected. |  |  |
| NEG-06 | Queue match full | Third socket attempts a queue match id with two players. | `match_full` → `That match is already full.`; no third player. |  |  |
| NEG-07 | Expired ticket | Use a ticket older than 10 minutes. | `ticket_required` → `Your match ticket expired. Sign in again.`; re-mint succeeds; no stale identity accepted. |  |  |
| NEG-08 | Spectator ticket escalation | Use a spectator ticket with `role=player` or queue. | Server uses verified `x-tr-role`, not query string; spectator cannot take a player slot; queue returns `players_only`. |  |  |
| NEG-09 | Unauthorized settings | Non-creator sends `settings`; creator sends after countdown. | `creator_only` / `settings_locked`; room settings unchanged; no broadcast of unauthorized values. |  |  |
| NEG-10 | Duplicate emote rate limit | Send two emotes 0–899 ms apart; then one after 900 ms. | Second suppressed; no duplicate bubble; third accepted; cooldown is per player; no server error shown. |  |  |
| NEG-11 | Wrong password | Login with wrong password for an existing user. | `Wrong username or password.` (same for unknown user); no session cookie; no account enumeration via message. |  |  |
| NEG-12 | Duplicate username | Register an existing username with different case. | `That username is already taken.`; original account untouched; no partial user row. |  |  |
| NEG-13 | Malformed username/password | Send API bodies with missing fields, whitespace, 10k-char strings, nulls, arrays. | 400 with validation error; no 500; username regex 3–16; password 6–128; no crash. |  |  |
| NEG-14 | Malformed run | Submit score `-1`, `1000001`, tier `101`, accuracy `1.1`, avgRt `-1`, misses `401`, cycles `101`, 500 trials. | 400 with `Invalid score.`/`Invalid tier.`/`Invalid accuracy.`/`Invalid reaction time.`/`Invalid miss count.`/`Invalid cycle count.`; trials truncated to 400; no partial write. |  |  |
| NEG-15 | Score inflation | Submit a valid run with a forged high score or finish message. | Server recomputes BPI/Elo and clamps scores; finish cannot inflate beyond accepted solves/penalties; leaderboard/BPI do not trust client totals. |  |  |
| NEG-16 | Late solve | Two players tap the same board; second claim after first. | First wins; second gets `deal_closed` and no points; board advances once; authoritative score unchanged. |  |  |
| NEG-17 | Emote XSS/injection | Set emote text to `<img src=x onerror=alert(1)>`, `<script>`, control chars, 24+ chars. | Server strips `<>`/control; client renders as text; no alert/script; length capped; no layout break. |  |  |
| NEG-18 | Profile XSS/path | Request `/api/users/<script>` or a username with `..%2f`; set avatar to a `javascript:`/SVG/data URL. | 404/400; username encoded; avatar regex only `data:image/` with png, jpeg or webp and base64 payload, ≤160000 chars; no script execution. |  |  |
| NEG-19 | Unauthorized profile edit | Call `PUT /api/profile` without a session, or with another user's id/body. | 401 `Sign in to edit your profile.`; only the session user is updated; no mass assignment. |  |  |
| NEG-20 | Leaderboard parameter abuse | `limit=0`, `limit=1000`, `by=drop`, `scope=city`, `period=year`, SQL-ish values. | Limit clamped 1–100; invalid enum falls back to safe defaults; parameterized SQL; no 500/stack trace/DB error. |  |  |
| NEG-21 | Health range abuse | Request 30/365 days or reversed dates. | `Range is limited to 7 days.` or 400; no huge Ultrahuman call; no data leak. |  |  |
| NEG-22 | Unauthorized insights | Call `/api/health?kind=insights` without a session. | 401 `Sign in to see your insights.`; no other user's runs/ring data. |  |  |
| NEG-23 | Session cookie flags | Inspect `tr_session` in DevTools/Android cookie store. | HttpOnly; Secure on HTTPS; SameSite=Lax; Path=/; ~120 days; not readable by JS; logout clears/invalidates. |  |  |
| NEG-24 | Session fixation/replay | Capture a session cookie, log out, replay the cookie. | Server-side session is destroyed; replayed cookie is rejected; login issues a new random token. |  |  |
| NEG-25 | Oversized/abusive payloads | Send >4 KB WebSocket message, invalid JSON, non-string type, unknown `type`. | Server ignores/returns safe error; no crash; no state change; no broadcast. |  |  |
| NEG-26 | Room code injection | Put `<script>`, `?room=<script>`, spaces, emoji into the room input/URL. | Normalizer accepts only 6 alphanumerics or a safe 4–40 char id; invalid shows `That room code is not valid.`; URL is cleaned; no XSS. |  |  |
| NEG-27 | Duplicate account tabs | Queue with the same account in two tabs. | `QueueRoom` keys by account id; tabs never pair with each other; one ticket/identity per account; no self-match. |  |  |
| NEG-28 | Creator disconnect | Creator leaves during countdown/play. | Creator transfers to next connected player or room safely resets; no stuck countdown; no orphaned room; `peer_left` broadcast. |  |  |
| NEG-29 | Abuse/rate-limit gaps | Rapidly create rooms, attempt logins, and send emotes. | Emote cooldown enforced; login/room creation may be unlimited in current build — record as a risk if no server rate limit; no crash/DoS of own session. |  |  |
| NEG-30 | Secret exposure | Search page source/network for tokens, DB URLs, `MATCH_SECRET`, `ULTRAHUMAN_TOKEN`, passwords. | No secrets in client JS/HTML/localStorage/network responses; only public IDs/data; `.env` not served. |  |  |

---

## 16. Regression checklist and sign-off

### 16.1 Regression checklist

Run after every release candidate; reference the section for detail. Mark each row.

| ID | Regression area | Reference | Expected baseline | P/F |
| --- | --- | --- | --- | --- |
| REG-01 | Guest first-visit tutorial cannot be skipped; completes and persists | 2 | `GOT IT` required; key `tile-rush.tutorial.v1`; Android `tutorial_done_guest` |  |
| REG-02 | New-account tutorial forced even after guest tutorial | 2, 3 | Register → tutorial; cross-device new account with 0 runs → tutorial |  |
| REG-03 | Register/login/logout/session persistence | 3 | 120-day cookie; refresh/new tab/restart keep session; logout clears |  |
| REG-04 | Profile self vs public, settings, devices, avatar | 3 | Self tabs only; public hides history/improvement; devices local-only |  |
| REG-05 | Solo 3 rounds, timers, breaks, penalties, cycles, score | 4 | 3×3/25s, 4×4/15s, 5×5/10s; 2.5/2.0/1.5s; 5s breaks; −30/−1s |  |
| REG-06 | BPI, title, archetype, feedback, rating | 4, 10 | 0–1000 BPI; 9 titles; 6 archetypes; confidence; drill |  |
| REG-07 | KIDS/SPORTS themes, lock, 40 sports, room consistency | 5 | Pre-run choice; locked in run; 40 sports; same icons for players/spectators |  |
| REG-08 | Quick 1v1 queue/ready/countdown/lockstep/result/rematch | 6 | Same seed; first solve advances both; server winner; rematch fresh seed |  |
| REG-09 | Private rooms, codes, creator controls, 20 spectators | 6 | 6-char code; 2 players; 20 watchers; creator-only settings |  |
| REG-10 | Spectator read-only, P1/P2, metrics, input highlight | 7 | No actions; input green/red; no answer highlight |  |
| REG-11 | Emotes 8 defaults, editor, custom text, lobby/break, 900ms | 8 | 8 presets; per-account; sanitised; rate-limited; spectators see/mute |  |
| REG-12 | Insights tabs, week/month, calendar, day detail | 9 | Both tabs; calendar; day card; ring averages; empty states |  |
| REG-13 | Health metrics daily cards, sleep stages, HR chart, trends | 9 | Cards; deep/REM/light bar; HR chart; Android 4 trend charts oldest→newest |  |
| REG-14 | Ask about your data answers and no network | 9 | Term/day/summary/best-time/fallback; offline |  |
| REG-15 | Title/fingerprint popup from home/result/profile/board | 10 | 9 titles, 6 archetypes, YOU, axes; closes cleanly |  |
| REG-16 | Leaderboards scopes/metrics/periods/profile navigation | 11 | Global/country/region; BPI/score/rating; week/season/all; rows open profiles |  |
| REG-17 | Android navigation/back/tutorial/rooms/spectator/health/emotes | 12 | All parity cases; no ANR; portrait; session restore |  |
| REG-18 | Responsive 360/768/1126/1920/2560; no horizontal scroll | 13 | Pill styling for text-only buttons; readable labels; full-screen modals |  |
| REG-19 | Performance/cache/accessibility/reduced motion/contrast | 14 | Fast warm load; cache headers; keyboard/ARIA; reduced motion; contrast |  |
| REG-20 | Negative/security cases | 15 | Invalid codes, full rooms, expired tickets, auth errors, malformed payloads, no secrets |  |

### 16.2 Sign-off

| Role | Name | Build / commit | Environment | Result | Date | Notes / blockers |
| --- | --- | --- | --- | --- | --- | --- |
| QA Lead |  | Web: `__________`<br>Worker: `__________`<br>APK SHA-256: `__________` | Production + Android | Pass / Conditional / Fail |  |  |
| Engineering |  | Web: `__________`<br>Worker: `__________`<br>APK SHA-256: `__________` | Production | Pass / Conditional / Fail |  |  |
| Product |  | Web: `__________`<br>Worker: `__________`<br>APK SHA-256: `__________` | Production | Pass / Conditional / Fail |  |  |

**Sign-off conditions:** smoke suite green; no P0/P1 open; every P2 has an owner and target date; all evidence attached; known gaps accepted in writing.

### 16.3 Defect log template

| Field | Value |
| --- | --- |
| Defect ID | `TR-____` |
| Title |  |
| Severity | P0 / P1 / P2 / P3 |
| Test case ID |  |
| Environment / build |  |
| Preconditions |  |
| Steps to reproduce |  |
| Expected |  |
| Actual |  |
| Evidence | screenshot / video / console / network / API response |
| Reproducibility | Always / Intermittent (__%) / Once |
| Owner / status |  |

### 16.4 Known gaps and testing notes

1. **Web vs Android health trend charts.** The web `HEALTH METRICS` page provides daily cards, sleep-stage bars and a per-day heart-rate line chart. The four multi-metric trend charts (`RECOVERY`, `SLEEP SCORE`, `HRV`, `RESTING HR`) are present on the Android `HEALTH` tab. Do not fail web for missing Android-only charts unless product explicitly requires web parity; record as a parity gap.
2. **Android label.** The Android tab is labelled `HEALTH`, while the web tab is `HEALTH METRICS`. Verify the label in the current APK; log a P3 copy inconsistency if the product wants identical wording.
3. **Leaderboard title badge.** The badge is inside a clickable row; verify the explainer opens without also opening the profile. If both open, log a P2 interaction defect.
4. **Device links are local.** Oura/Ultrahuman “links” are sample-feed flags stored on the device, not real OAuth. Cross-device sync is not expected in this build.
5. **Guest runs are local.** They are never ranked or saved to the account. After sign-in, server values overwrite the guest local save.
6. **Unused room codes.** A well-formed 6-character code can create an empty room because the Durable Object is created on first connection. Treat this as current expected behaviour unless the product changes room lifecycle rules.
7. **Rate limiting.** Emotes are limited to one per 900 ms. Login, room creation and other endpoints may not have server-side rate limits; record as a security risk if abuse is in scope.
8. **No secrets in QA artifacts.** Redact cookies, tokens, DB URLs, and passwords from screenshots, HAR files, and tickets.
