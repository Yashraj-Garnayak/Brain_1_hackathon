'use strict';

/* Server-side Elo, mirroring the client model but with the server as the
   single source of truth. A run is scored against a synthetic opponent whose
   strength grows with the tier the player reached. */

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function nextRating({ rating, games, accuracy, avgRt, tier }) {
  const speedN = clamp((1800 - avgRt) / 1500, 0, 1);
  const tierN = clamp(tier / 8, 0, 1);
  const actual = clamp(accuracy * 0.55 + speedN * 0.3 + tierN * 0.15, 0, 1);
  const opponent = 820 + tier * 130;
  const expected = 1 / (1 + Math.pow(10, (opponent - rating) / 400));
  const k = games < 10 ? 44 : 28;
  const after = Math.max(100, Math.round(rating + clamp(Math.round(k * (actual - expected)), -60, 60)));
  return { after, delta: after - rating, expected, actual };
}

module.exports = { nextRating, clamp };
