# TILE RUSH — QA Test Plan

Version: 1.1  
Applies to: web (https://tile-rush.uday.live), Android debug APK, Cloudflare Worker  
Last updated: 2026-10-30

Use this plan for a full regression pass before a demo or release. Run the smoke test first; if it fails, stop and report the blocking issue.

---

## 1. Environments and test data

| Item | Value |
| --- | --- |
| Production web | https://tile-rush.uday.live |
| Worker | https://tile-rush.text-udaykumar.workers.dev |
| Android APK | `~/Downloads/tile-rush-debug.apk` |
| Local web/API | `npm run dev` → http://localhost:3000 |
| Local Worker | http://127.0.0.1:8787 |
| Ring data account | `ishowspeed` (if seeded) |
| Guest | No account / signed out |

Test at these widths: **360 px, 768 px, 1126 px, 1920 px, 2560 px**. For the large-screen pass, use a mirror/extended display and stand back from the screen.

---

## 2. Smoke test (10 minutes)

| ID | Steps | Expected |
| --- | --- | --- |
| SM-01 | Open production site in a clean browser profile. | Home loads; no console errors. |
| SM-02 | First visit as guest. | Forced How to Play opens; close is hidden. |
| SM-03 | Page through all tutorial pages and press GOT IT. | Tutorial closes; home is usable. |
| SM-04 | Choose KIDS, start a solo run. | 3×3 board, 3-second countdown, 25-second clock. |
| SM-05 | Finish the run. | Result shows score, BPI, title, fingerprint, feedback. |
| SM-06 | Register a new account. | Forced tutorial appears on first signed-in visit. |
| SM-07 | Create a private room with a second player and a spectator. | Room code, creator controls, two boards, spectator view. |
| SM-08 | Creator selects SPORTS and spectator emotes OFF. | Spectator sees SPORTS and OFF BY HOST. |
| SM-09 | Player taps a tile. | Spectator sees the tap highlighted, not the correct answer. |
| SM-10 | Open Insights → HEALTH. | Ring averages, trend charts and sleep-stage bars render. |
| SM-11 | Install and launch the Android APK. | Home loads with PLAY / INSIGHTS / RANKS / PROFILE. |

---

## 3. Guest and account flows

| ID | Steps | Expected |
| --- | --- | --- |
| AC-01 | Fresh guest opens the site. | Forced tutorial; `×` hidden; BACK disabled on page 1. |
| AC-02 | Guest reloads mid-tutorial. | Tutorial opens again; completion flag not set. |
| AC-03 | Guest completes tutorial, plays a solo run. | Run is local-only; no rank submitted. |
| AC-04 | Guest clicks “play without an account” before finishing. | Forced tutorial is shown first. |
| AC-05 | Register a new account. | Account created; forced tutorial appears before play. |
| AC-06 | Log out and log in as the same account. | No forced tutorial after it was completed. |
| AC-07 | Register a second new account. | Forced tutorial appears for that account too. |
| AC-08 | Refresh after login. | Session persists; no tutorial unless pending. |
| AC-09 | Wrong password. | Error shown; no session created. |
| AC-10 | Duplicate username. | Clear error; account not created. |
| AC-11 | Logout. | Home returns to guest; local settings remain. |

---

## 4. Solo gameplay

| ID | Steps | Expected |
| --- | --- | --- |
| SG-01 | Start solo with KIDS. | Target shows shape + colour. |
| SG-02 | Tap the exact target. | Points awarded; next deal after a short lock. |
| SG-03 | Tap a shape-only or colour-only decoy. | Wrong: −30 points, −1 second, streak reset, red flash. |
| SG-04 | Let the deck timer expire. | Miss counted; board churns; correct answer not revealed. |
| SG-05 | Clear a cycle. | Bonus awarded; cycle counter resets. |
| SG-06 | Finish round 1. | 5-second break; round 2 starts at 4×4 / 15 s. |
| SG-07 | Finish round 2. | Break; round 3 starts at 5×5 / 10 s. |
| SG-08 | Finish round 3. | Result screen with final score, BPI, title, archetype, feedback. |
| SG-09 | Check result axes. | Seven axes with bars/radar; no overflow. |
| SG-10 | Press MENU / back. | Home; previous result remains in recent runs. |
| SG-11 | Check recent runs and PB. | Run is listed; PB updates if higher. |

---

## 5. Symbol themes

| ID | Steps | Expected |
| --- | --- | --- |
| TH-01 | On home, select KIDS and start. | Geometric shapes; copy says “Same shape. Same colour.” |
| TH-02 | Return home, select SPORTS and start. | Sports icons; copy says “Same icon. Same colour.” |
| TH-03 | Inspect sports tiles. | Icons are sports equipment only (no hand-soap bottle, chart, chair, backpack, face, watch or car). |
| TH-04 | Play several sports runs. | Different random slice of the 40 items per run. |
| TH-05 | Try changing theme during countdown/play. | No theme control on the live screen; theme locked. |
| TH-06 | Check Android home. | `SYMBOLS` row with KIDS / SPORTS; chosen theme applies to the run. |
| TH-07 | Check Profile settings on Android. | No theme switch (choice lives on the home play screen). |

---

## 6. Titles, fingerprints and profile

| ID | Steps | Expected |
| --- | --- | --- |
| BP-01 | Click the home title pill. | Titles popup; current title marked YOU. |
| BP-02 | Switch to FINGERPRINTS. | Six archetypes, rules, descriptions. |
| BP-03 | Click profile archetype. | Popup opens on FINGERPRINTS; current archetype marked YOU. |
| BP-04 | Check axes in the popup. | Seven values shown when a fingerprint exists. |
| BP-05 | Click a leaderboard title. | Titles popup opens; correct title highlighted. |
| BP-06 | Check result title/archetype. | Both open the popup; no layout shift. |
| BP-07 | Open a public profile. | Title, archetype, radar, season stats render. |
| BP-08 | Check private data on someone else’s profile. | Improvement/runs not shown to non-owner. |

---

## 7. Leaderboards and ranking

| ID | Steps | Expected |
| --- | --- | --- |
| LB-01 | Open RANKS. | Global board loads. |
| LB-02 | Switch BPI / SCORE / RATING. | Order and values change correctly. |
| LB-03 | Switch WEEK / SEASON. | Period label and rows update. |
| LB-04 | Switch GLOBAL / REGION. | Region rows update; empty state if no data. |
| LB-05 | Click a player row. | Public profile opens. |
| LB-06 | Check own row. | Own rank/highlight is visible. |
| LB-07 | Check on mobile. | No horizontal scroll; rows fit. |

---

## 8. Insights and health

| ID | Steps | Expected |
| --- | --- | --- |
| IN-01 | Open Insights. | `INSIGHTS` and `HEALTH METRICS` tabs visible. |
| IN-02 | Switch to HEALTH METRICS. | Ring averages and daily ring cards. |
| IN-03 | Switch WEEK / MONTH and use arrows. | Period label and data update. |
| IN-04 | Click a calendar day. | Day detail with runs, accuracy, RT, ring values. |
| IN-05 | Check trend charts. | Recovery, sleep score, HRV, resting HR; oldest → newest. |
| IN-06 | Check sleep-stage bar. | Deep/REM/light segments and minute labels. |
| IN-07 | Open Ask about your data. | Intro message, suggestion chips, input. |
| IN-08 | Ask “What is HRV?” | Explanation; current value when available. |
| IN-09 | Ask “Why was my last day slow?” | Day-specific answer with numbers. |
| IN-10 | Ask “What should I change?” | Bullets based on top hurt factors. |
| IN-11 | Check signed-out state. | Sign-in prompt; no private data. |
| IN-12 | Check Android Insights/Health. | Same tabs, charts, calendar and helper. |

---

## 9. Emotes

| ID | Steps | Expected |
| --- | --- | --- |
| EM-01 | Profile → Settings → Emotes. | 8 rows with emoji + text, private to the account. |
| EM-02 | Change and save presets. | Toast; duel bars repaint with new presets. |
| EM-03 | Join a room; check lobby bar. | 8 presets visible before READY. |
| EM-04 | During a round break, tap a preset. | Bubble appears for sender; opponent receives it. |
| EM-05 | Send rapidly. | Second send inside 900 ms is ignored. |
| EM-06 | Check spectator emotes ON. | Spectator sees player bubbles and can mute locally. |
| EM-07 | Creator sets spectator emotes OFF. | Spectator sees OFF BY HOST; no player emotes arrive. |
| EM-08 | Check Android editor and bars. | Same presets and behaviour. |

---

## 10. 1v1 and private rooms

| ID | Steps | Expected |
| --- | --- | --- |
| DU-01 | Quick match with two accounts. | Match found; both ready; shared countdown. |
| DU-02 | Both players ready. | Same seed and boards; scores stream. |
| DU-03 | One player solves a deal first. | Both boards advance; late claim does not score. |
| DU-04 | Wrong tap in a duel. | −30 points; locked out of that deal. |
| DU-05 | Deck timer expires. | Both boards churn; no answer reveal. |
| DU-06 | Finish all rounds. | Server result; winner/draw; rematch available. |
| DU-07 | Create room. | 6-character code and share link. |
| DU-08 | Second player joins; third watches. | Two players, spectator count increments. |
| DU-09 | Creator changes theme. | All players and spectators see the new theme. |
| DU-10 | Creator turns spectator emotes OFF. | Spectator shows OFF BY HOST; emotes suppressed. |
| DU-11 | Non-creator tries settings. | No controls; server rejects creator-only changes. |
| DU-12 | Start match, then try settings. | Settings locked; controls hidden. |
| DU-13 | Creator leaves. | Remaining player becomes creator (if room still open). |
| DU-14 | Join with invalid code. | Clear error; no crash. |
| DU-15 | Fill room with 20 spectators. | 21st spectator sees spectator-full error. |

---

## 11. Spectator mode

| ID | Steps | Expected |
| --- | --- | --- |
| SP-01 | Join a room as spectator. | Read-only layout; P1/P2 boards and metrics. |
| SP-02 | Check theme. | Same KIDS/SPORTS theme as the room creator. |
| SP-03 | Check target. | Target is shown; correct answer cell is not highlighted. |
| SP-04 | Watch a player tap. | Last tap highlighted green (correct) or red (wrong). |
| SP-05 | Check metrics. | Score, round, deal, accuracy, streak, hits/misses update. |
| SP-06 | Toggle local emotes OFF. | Bubbles clear; no new bubbles. |
| SP-07 | Toggle local emotes ON. | New player emotes appear. |
| SP-08 | Host disables spectator emotes. | Toggle shows OFF BY HOST and is disabled. |
| SP-09 | Try to send an emote as spectator. | No send control; server rejects. |
| SP-10 | Check large screen. | Boards fill the width; text readable from distance. |

---

## 12. Android parity

| ID | Steps | Expected |
| --- | --- | --- |
| AN-01 | Launch app signed out. | Guest home; forced tutorial if not done. |
| AN-02 | Complete tutorial; start solo. | Same rounds, timing and scoring as web. |
| AN-03 | Select KIDS / SPORTS. | Same theme behaviour and icon set as web. |
| AN-04 | Sign in; check profile. | Title, archetype, best BPI, rank, seasons. |
| AN-05 | Open Insights → HEALTH. | Ring averages, charts, sleep stages. |
| AN-06 | Open Ask about your data. | Same helper answers. |
| AN-07 | Create/join a room. | Room code, players, spectator boards. |
| AN-08 | Creator controls. | Theme + spectator emotes; non-creator read-only. |
| AN-09 | Spectator input. | Last tap highlighted; no answer highlight. |
| AN-10 | Emote editor. | 8 presets saved per account. |
| AN-11 | Back button during forced tutorial. | Does not skip the tutorial. |
| AN-12 | Rotate/resize. | Layout remains usable; no clipped controls. |

---

## 13. Responsive and large-screen checks

| ID | Steps | Expected |
| --- | --- | --- |
| RS-01 | 360 px phone. | No horizontal scroll; tiles and buttons fit. |
| RS-02 | 768 px tablet. | Two-column layouts where intended; nav visible. |
| RS-03 | 1126 px laptop. | Home card, board and sidebar use space well. |
| RS-04 | 1920 px monitor. | Text is not tiny; board and metrics are readable. |
| RS-05 | 2560 px mirror/TV. | Same layout; spectator text and metrics readable from distance. |
| RS-06 | Home text links. | Text-only controls have a visible bordered pill. |
| RS-07 | Overlays. | Page behind an open screen does not scroll. |
| RS-08 | Long text / long username. | No overflow; ellipsis or wrapping. |

---

## 14. Negative and security cases

| ID | Steps | Expected |
| --- | --- | --- |
| NG-01 | Invalid room code. | Error; no crash. |
| NG-02 | Expired ticket. | Reconnect/sign-in message; no unauthorized play. |
| NG-03 | Spectator tries ready/progress/emote. | Server returns read_only; state unchanged. |
| NG-04 | Non-creator sends settings. | Server rejects; state unchanged. |
| NG-05 | Emote with control characters/HTML. | Sanitised; no markup execution. |
| NG-06 | Emote over length limits. | Truncated to 8/24 chars. |
| NG-07 | Rapid emotes. | 900 ms cooldown enforced. |
| NG-08 | Duplicate late solve. | No double scoring. |
| NG-09 | Malformed API payload. | 400/4xx; no stack trace to client. |
| NG-10 | Private profile data. | Not exposed to other users. |

---

## 15. Accessibility and performance

| ID | Steps | Expected |
| --- | --- | --- |
| AP-01 | Keyboard tab through home. | Focus visible; buttons reachable. |
| AP-02 | Screen reader labels. | Title/archetype/target/tile labels meaningful. |
| AP-03 | Reduced motion. | `prefers-reduced-motion` disables non-essential animation. |
| AP-04 | Contrast. | Text readable on charcoal surfaces. |
| AP-05 | Cold load. | Home interactive quickly; assets cached. |
| AP-06 | Insights warm load. | Stored period loads without Ultrahuman sync delay. |
| AP-07 | No console errors. | Clean console on home, run, profile, insights. |

---

## 16. Sign-off

| Area | Tester | Date | Result | Notes |
| --- | --- | --- | --- | --- |
| Smoke |  |  |  |  |
| Guest/account |  |  |  |  |
| Solo |  |  |  |  |
| Themes |  |  |  |  |
| BPI/profile |  |  |  |  |
| Leaderboards |  |  |  |  |
| Insights/health |  |  |  |  |
| Emotes |  |  |  |  |
| 1v1/rooms |  |  |  |  |
| Spectator |  |  |  |  |
| Android |  |  |  |  |
| Responsive |  |  |  |  |
| Negative/security |  |  |  |  |

**Release decision:** PASS / PASS WITH KNOWN ISSUES / FAIL
