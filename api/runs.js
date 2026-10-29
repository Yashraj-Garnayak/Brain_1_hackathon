'use strict';

const { allow, readJson, json, fail } = require('../lib/http');
const { currentUser } = require('../lib/auth');
const { recordRun, publicUser } = require('../lib/users');
const { clamp } = require('../lib/elo');
const { captureRunDetails } = require('../lib/insights');

const MAX_RTS = 500;

function count(value) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 0 && n <= 100000 ? n : 0;
}

// Optional per-run detail; anything malformed falls back to an empty value.
function parseDetails(body) {
  const rts = Array.isArray(body.rts)
    ? body.rts.map(Number).filter((v) => Number.isFinite(v) && v > 0 && v <= 60000).map(Math.round).slice(0, MAX_RTS)
    : [];
  const tz = Math.round(Number(body.tzOffset));
  return {
    correct: count(body.correct),
    wrong: count(body.wrong),
    misses: count(body.misses),
    bestStreak: count(body.bestStreak),
    cycles: count(body.cycles),
    rts,
    tzOffsetMin: Number.isFinite(tz) && Math.abs(tz) <= 840 ? tz : 0
  };
}

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

    // The run is already committed; losing its detail row must not fail the request.
    let detail = null;
    try {
      detail = await captureRunDetails({ user, runId: result.runId, details: parseDetails(body) });
    } catch (err) {
      console.error('run detail capture failed', err);
    }

    return json(res, 200, {
      user: publicUser(result.user),
      run: { id: Number(result.runId), before: result.before, after: result.after, delta: result.delta },
      detail
    });
  } catch (err) {
    return fail(res, err);
  }
};
