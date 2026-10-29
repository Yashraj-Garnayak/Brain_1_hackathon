'use strict';

/* "Best self" ghost helpers.
 *
 * A run records `timeline`: the cumulative score sampled once per second from
 * the moment the countdown starts, so a ghost can replay that run second by
 * second. Legacy runs have no timeline, so one is synthesised from their
 * per-round scores.
 */

const COUNTDOWN = 3;
const BREAK = 5;
const MAX_POINTS = 120;

function clampScore(value) {
  const n = Math.round(Number(value) || 0);
  return Math.max(0, Math.min(1_000_000, n));
}

function cleanTimeline(input) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, MAX_POINTS).map(clampScore);
}

function roundScore(round) {
  return clampScore(round && round.score);
}

function buildTimeline({ timeline, rounds, score }) {
  const clean = cleanTimeline(timeline);
  if (clean.length >= 2) return clean;

  const track = [];
  for (let i = 0; i < COUNTDOWN; i++) track.push(0);

  const list = Array.isArray(rounds)
    ? rounds.filter((r) => r && Number(r.duration) > 0).slice(0, 4)
    : [];

  if (!list.length) {
    /* No round detail: spread the final score evenly across the whole run. */
    const total = clampScore(score);
    const seconds = COUNTDOWN + 25 + BREAK + 15 + BREAK + 10;
    for (let s = COUNTDOWN; s < seconds; s++) {
      track.push(Math.round((total * (s - COUNTDOWN)) / (seconds - COUNTDOWN)));
    }
    track.push(total);
    return track.slice(0, MAX_POINTS);
  }

  let cumulative = 0;
  const total = clampScore(score);
  const sum = list.reduce((acc, round) => acc + roundScore(round), 0);
  const scale = total > 0 && sum > 0 ? total / sum : 1;

  list.forEach((round, index) => {
    const duration = Math.max(1, Math.min(60, Number(round.duration) || 0));
    const points = roundScore(round) * scale;
    for (let s = 0; s < duration; s++) {
      cumulative += points / duration;
      track.push(Math.round(cumulative));
    }
    if (index < list.length - 1) {
      for (let b = 0; b < BREAK; b++) track.push(Math.round(cumulative));
    }
  });

  track.push(total);
  return track.slice(0, MAX_POINTS);
}

module.exports = { buildTimeline, cleanTimeline, MAX_POINTS };
