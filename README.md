# TILE RUSH

A browser prototype of a 3×3 reflex game with an adaptive difficulty director, a non-stopping clock, procedural pressure music, and an Elo-style rating.

No build step, no dependencies, no backend. Plain HTML/CSS/JS.

## Run it

From this folder:

```bash
python3 -m http.server 8787
```

Open <http://localhost:8787>. You can also open `index.html` directly — everything is local except the optional Google Fonts. The folder is fully static, so it works as-is on GitHub Pages (serve the folder that contains `index.html`).

## The loop

1. A target glyph (shape **and** colour) appears at the top.
2. Nine tiles hold decoys. Exactly one matches the target.
3. The board reshuffles every **3 seconds**. It tightens toward ~1.1s as pressure rises.
4. Ten correct taps clear a **cycle**. The clock is 30s and never pauses; a fast cycle banks bonus seconds and the next tier starts immediately.
5. A wrong tap costs **1 second**, 30 points and your streak. An unanswered reshuffle is a miss.
6. The run ends when the clock reaches zero.

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

Elo-style, starting at 1000. After a run:

```
actual   = 0.55 × accuracy + 0.30 × reactionSpeed + 0.15 × tierReached
opponent = 820 + tier × 130
expected = 1 / (1 + 10^((opponent − rating) / 400))
delta    = clamp(K × (actual − expected), −60, +60)
```

`K` is 44 for the first 10 runs, then 28. Ranks: Iron → Bronze → Silver → Gold → Platinum → Diamond → Nova. Best score, recent runs, rating and adaptive history persist locally.

## Controls

- Click / tap a tile.
- `1`–`9` select tiles by position.
- `Enter` / `Space` start or restart.
- `M` mute.

## Dev flags

- `?autostart=1` — skip the menu.
- `?instant=1` — skip the READY warm-up.
- `?still=1` — disable transitions/animations (useful for screenshots).

## Tuning

All balance numbers live in `CONFIG` at the top of `js/game.js` and the Elo formula in `endRun()`. The shape set and palette are in `js/shapes.js`; music in `js/audio.js`; background in `js/background.js`.

## Files

```
index.html
css/styles.css
js/shapes.js       geometric glyph set + palette
js/audio.js        WebAudio sequencer + SFX
js/background.js   canvas backdrop
js/game.js         state machine, adaptive director, scoring, Elo, UI
```
