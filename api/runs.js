'use strict';

const { allow, readJson, json, fail } = require('../lib/http');
const { currentUser } = require('../lib/auth');
const { recordRun, publicUser } = require('../lib/users');
const { geoFromRequest } = require('../lib/geo');
const { keysFor } = require('../lib/season');
const { cleanTimeline } = require('../lib/ghost');
const bpi = require('../shared/bpi');
const { captureRunDetails } = require('../lib/insights');

function cleanRounds(input) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 4).map((round, index) => ({
    round: Number(round && round.round) || index + 1,
    size: Math.max(3, Math.min(6, Number(round && round.size) || 3)),
    duration: Math.max(1, Math.min(60, Number(round && round.duration) || 0)),
    score: Math.max(0, Math.round(Number(round && round.score) || 0)),
    correct: Math.max(0, Math.round(Number(round && round.correct) || 0)),
    wrong: Math.max(0, Math.round(Number(round && round.wrong) || 0)),
    misses: Math.max(0, Math.round(Number(round && round.misses) || 0)),
    maxTier: Math.max(0, Math.round(Number(round && round.maxTier) || 0))
  }));
}

function count(value) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 0 && n <= 100000 ? n : 0;
}

// Per-run detail for insights. Reaction times and right/wrong taps come from
// the same trials BPI reads; anything malformed falls back to an empty value.
function parseDetails(body, trials) {
  const taps = trials.filter((t) => t && Number.isFinite(Number(t.rt)));
  const rts = taps
    .filter((t) => t.correct)
    .map((t) => Math.round(Number(t.rt)))
    .filter((v) => v > 0 && v <= 60000);
  const tz = Math.round(Number(body.tzOffset));
  return {
    correct: rts.length,
    wrong: taps.filter((t) => !t.correct).length,
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
    const submittedAccuracy = Number(body.accuracy);
    const submittedRt = Math.round(Number(body.avgRt));
    const misses = Math.round(Number(body.misses) || 0);
    const cycles = Math.round(Number(body.cycles) || 0);
    const gameId = body.gameId === 'tile-rush' ? 'tile-rush' : 'tile-rush';

    if (!Number.isFinite(score) || score < 0 || score > 1000000) {
      return json(res, 400, { error: 'Invalid score.' });
    }
    if (!Number.isFinite(tier) || tier < 0 || tier > 100) {
      return json(res, 400, { error: 'Invalid tier.' });
    }
    if (!Number.isFinite(submittedAccuracy) || submittedAccuracy < 0 || submittedAccuracy > 1) {
      return json(res, 400, { error: 'Invalid accuracy.' });
    }
    if (!Number.isFinite(submittedRt) || submittedRt < 0 || submittedRt > 60000) {
      return json(res, 400, { error: 'Invalid reaction time.' });
    }
    if (misses < 0 || misses > 400) return json(res, 400, { error: 'Invalid miss count.' });
    if (cycles < 0 || cycles > 100) return json(res, 400, { error: 'Invalid cycle count.' });

    const trials = Array.isArray(body.trials) ? body.trials.slice(0, 400) : [];
    const rounds = cleanRounds(body.rounds);

    /* A ghost is only useful if the trace agrees with the final score; drop
       anything that does not, and never trust more than two minutes of it. */
    let timeline = cleanTimeline(body.timeline);
    if (timeline.length < 2) timeline = null;
    else if (Math.abs(timeline[timeline.length - 1] - score) > Math.max(200, score * 0.2)) {
      timeline = null;
    }

    const metrics = bpi.compute({
      trials, misses, cycles, maxTier: tier, score
    });

    const accuracy = trials.length
      ? Math.max(0, Math.min(1, metrics.stats.accuracy))
      : Math.max(0, Math.min(1, submittedAccuracy));
    const avgRt = trials.length && metrics.stats.medianRt
      ? metrics.stats.medianRt
      : submittedRt;

    const geo = geoFromRequest(req);
    const keys = keysFor(new Date());

    const result = await recordRun({
      userId: user.id,
      score,
      tier,
      accuracy,
      avgRt,
      bpi: metrics.bpi,
      metrics,
      rounds,
      gameId,
      seasonKey: keys.seasonKey,
      weekKey: keys.weekKey,
      timeline,
      country: geo.country || user.country || null,
      region: geo.region || user.region || null,
      stats: {
        correct: metrics.stats.correct,
        attempts: metrics.stats.attempts,
        rtSum: metrics.stats.rtSum,
        rtCount: metrics.stats.rtCount
      }
    });

    // The run is already committed; losing its detail row must not fail the request.
    let detail = null;
    try {
      detail = await captureRunDetails({ user, runId: result.runId, details: parseDetails(body, trials) });
    } catch (err) {
      console.error('run detail capture failed', err);
    }

    return json(res, 200, {
      user: publicUser(result.user),
      run: {
        id: Number(result.runId),
        before: result.before,
        after: result.after,
        delta: result.delta,
        bpi: metrics.bpi,
        title: metrics.title,
        archetype: metrics.archetype,
        confidence: metrics.confidence,
        metrics,
        rank: result.rank
      },
      detail
    });
  } catch (err) {
    return fail(res, err);
  }
};
