'use strict';

const { allow, readJson, json, fail } = require('../lib/http');
const { currentUser } = require('../lib/auth');
const { recordRun, publicUser } = require('../lib/users');
const { clamp } = require('../lib/elo');

module.exports = async function handler(req, res) {
  if (!allow(req, res, ['POST'])) return;
  try {
    const user = await currentUser(req);
    if (!user) return json(res, 401, { error: 'Sign in to save your run.' });

    const body = await readJson(req);
    const score = Math.round(Number(body.score));
    const tier = Math.round(Number(body.tier));
    const accuracy = Number(body.accuracy);
    const avgRt = Math.round(Number(body.avgRt));

    if (!Number.isFinite(score) || score < 0 || score > 1000000) {
      return json(res, 400, { error: 'Invalid score.' });
    }
    if (!Number.isFinite(tier) || tier < 0 || tier > 100) {
      return json(res, 400, { error: 'Invalid tier.' });
    }
    if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 1) {
      return json(res, 400, { error: 'Invalid accuracy.' });
    }
    if (!Number.isFinite(avgRt) || avgRt < 0 || avgRt > 60000) {
      return json(res, 400, { error: 'Invalid reaction time.' });
    }

    const result = await recordRun({
      userId: user.id,
      score,
      tier,
      accuracy: clamp(accuracy, 0, 1),
      avgRt
    });

    return json(res, 200, {
      user: publicUser(result.user),
      run: { before: result.before, after: result.after, delta: result.delta }
    });
  } catch (err) {
    return fail(res, err);
  }
};
