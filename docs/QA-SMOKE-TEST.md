# TILE RUSH — QA Smoke Test

A short pass for a demo. Run it on the website and one Android device.

## Before you start

- Web: https://tile-rush.uday.live
- APK: `~/Downloads/tile-rush-debug.apk`
- Test account: create one on the auth screen, or ask the team for the demo account.
- Ring demo data: `ishowspeed` (ask the team for the password).
- Try widths: 360 px, 1126 px, 1920 px.

## Smoke test

| ID | Steps | Expected |
| --- | --- | --- |
| S1 | Open the site in a fresh window. | Home loads; no console errors. |
| S2 | As a guest, open How to Play. | Forced tutorial; close is hidden. |
| S3 | Complete all tutorial pages. | Tutorial closes; home is usable. |
| S4 | Choose KIDS and start a run. | 3×3 board, countdown, 25-second clock. |
| S5 | Tap the correct tile and one wrong tile. | Correct scores; wrong costs 30 points and 1 second. |
| S6 | Finish all three rounds. | Result shows score, BPI, title and feedback. |
| S7 | Create an account. | Forced tutorial appears on first signed-in visit. |
| S8 | Open Profile → Settings → Emotes. | 8 editable presets; save works. |
| S9 | Create a private room with a second account and a spectator. | Room code, two players, spectator view. |
| S10 | As creator, set SPORTS and spectator emotes OFF. | Spectator sees SPORTS and OFF BY HOST. |
| S11 | Player taps a tile. | Spectator sees the tap highlighted, not the answer. |
| S12 | Send a player emote with spectator emotes ON. | Spectator sees it in the emote feed. |
| S13 | Open Insights → Health. | Ring averages, trends and sleep stages render. |
| S14 | Install and open the APK. | Home, theme choice and bottom nav load. |

## Feature checklist

| Area | Check | Pass |
| --- | --- | --- |
| Guest | Forced tutorial; guest run is local-only. |  |
| Account | Register, login, logout, refresh keeps session. |  |
| Solo | Deck timer, wrong tap, breaks, result, recent run. |  |
| Themes | KIDS vs SPORTS; locked during run; sports icons only. |  |
| Titles | Popup opens from home, result, profile, leaderboard. |  |
| Leaderboard | BPI/score/rating; week/season; profile opens. |  |
| Insights | Week/month, calendar, day detail, charts. |  |
| Ask helper | “What is HRV?” and “What should I change?” answer. |  |
| Emotes | Editor saves; lobby/break bars; rate limit. |  |
| 1v1 | Ready, lockstep boards, result, rematch. |  |
| Room | Creator theme + spectator emote flag; non-creator read-only. |  |
| Spectator | Input highlight, metrics, emote feed, local mute. |  |
| Android | Same flows; forced tutorial blocks back. |  |
| Responsive | No horizontal scroll; text readable at 1920 px. |  |
| Errors | Invalid room code, wrong password, expired ticket. |  |

## Known limitations

- Android room-control and spectator screens still need a final visual pass on a real device.
- Large-screen layout should be checked on the actual mirror/TV.
- Live ring data requires `ULTRAHUMAN_TOKEN`; without it ring values are empty.
- APK is a debug build.

## Sign-off

Tester: ____________________  Date: ____________  Result: PASS / FAIL
