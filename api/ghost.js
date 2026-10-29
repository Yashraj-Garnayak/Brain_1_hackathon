'use strict';

const { allow, json, fail } = require('../lib/http');
const { currentUser } = require('../lib/auth');
const { pool } = require('../lib/db');
const { buildTimeline } = require('../lib/ghost');

/* GET /api/ghost — the signed-in player's best run, replayed as a solo rival.
 * Scoped to the caller: a ghost never exposes anyone else's run. */
module.exports = async function handler(req, res) {
  if (!allow(req, res, ['GET'])) return;
  try {
    const user = await currentUser(req);
    if (!user) return json(res, 401, { error: 'Sign in to race your best.' });

    const { rows } = await pool.query(
      `select score, bpi, tier, metrics, rounds, timeline, created_at
         from runs
        where user_id = $1 and game_id = 'tile-rush' and score > 0
        order by score desc, created_at asc
        limit 1`,
      [user.id]
    );

    const best = rows[0];
    if (!best) return json(res, 200, { ghost: null });

    const score = Number(best.score) || 0;
    return json(res, 200, {
      ghost: {
        name: user.username,
        score,
        bpi: Number(best.bpi) || 0,
        tier: Number(best.tier) || 0,
        at: best.created_at,
        rounds: Array.isArray(best.rounds) ? best.rounds : [],
        timeline: buildTimeline({
          timeline: best.timeline,
          rounds: best.rounds,
          score
        })
      }
    });
  } catch (err) {
    return fail(res, err);
  }
};
