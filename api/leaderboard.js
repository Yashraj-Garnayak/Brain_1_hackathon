'use strict';

const { allow, json, fail } = require('../lib/http');
const { currentUser } = require('../lib/auth');
const { leaderboard } = require('../lib/users');
const { geoFromRequest } = require('../lib/geo');
const { keysFor, seasonLabel, weekLabel } = require('../lib/season');

const BY = new Set(['score', 'bpi', 'rating']);
const SCOPE = new Set(['global', 'country', 'region']);
const PERIOD = new Set(['week', 'season', 'all']);

module.exports = async function handler(req, res) {
  if (!allow(req, res, ['GET'])) return;
  try {
    const url = new URL(req.url, 'http://localhost');
    const by = BY.has(url.searchParams.get('by')) ? url.searchParams.get('by') : 'score';
    const scope = SCOPE.has(url.searchParams.get('scope')) ? url.searchParams.get('scope') : 'global';
    const period = PERIOD.has(url.searchParams.get('period')) ? url.searchParams.get('period') : 'all';
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit')) || 50));

    const user = await currentUser(req);
    const geo = geoFromRequest(req);
    const country = (user && user.country) || geo.country || null;
    const region = (user && user.region) || geo.region || null;

    const data = await leaderboard({
      by,
      scope,
      period,
      gameId: 'tile-rush',
      userId: user ? user.id : null,
      country,
      region,
      limit
    });

    const keys = keysFor(new Date());
    const scopeLabel = scope === 'global'
      ? 'WORLDWIDE'
      : scope === 'country'
        ? (country || 'COUNTRY')
        : (region && country ? `${region} · ${country}` : 'REGION');

    return json(res, 200, {
      ...data,
      scopeLabel,
      country,
      region,
      seasonKey: keys.seasonKey,
      weekKey: keys.weekKey,
      seasonLabel: seasonLabel(keys.seasonKey),
      weekLabel: weekLabel(keys.weekKey)
    });
  } catch (err) {
    return fail(res, err);
  }
};
