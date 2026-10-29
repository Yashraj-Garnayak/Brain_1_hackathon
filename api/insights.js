'use strict';

/* Signed-in player's runs for one period (a week or a month), joined with Ultrahuman ring metrics.
   GET /api/insights?from=yyyy-mm-dd&to=yyyy-mm-dd[&today=yyyy-mm-dd&last=1] */

const { allow, json, fail, httpError } = require('../lib/http');
const { currentUser } = require('../lib/auth');
const { insights } = require('../lib/insights');

const MAX_SPAN_DAYS = 62;

function dateParam(url, name, fallback) {
  const raw = url.searchParams.get(name);
  if (!raw) return fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw))) {
    throw httpError(400, `${name} must be a date like 2026-10-29.`);
  }
  return raw;
}

module.exports = async function handler(req, res) {
  if (!allow(req, res, ['GET'])) return;
  try {
    const user = await currentUser(req);
    if (!user) return json(res, 401, { error: 'Sign in to see your insights.' });

    const url = new URL(req.url, 'http://localhost');
    const today = dateParam(url, 'today', new Date().toISOString().slice(0, 10));
    const to = dateParam(url, 'to', today);
    const from = dateParam(url, 'from', to);
    if (from > to) throw httpError(400, 'from must be on or before to.');
    if ((Date.parse(to) - Date.parse(from)) / 86400000 >= MAX_SPAN_DAYS) {
      throw httpError(400, `A period can cover at most ${MAX_SPAN_DAYS} days.`);
    }

    const data = await insights(user.id, { from, to, today, withLast: url.searchParams.get('last') === '1' });
    return json(res, 200, data);
  } catch (err) {
    return fail(res, err);
  }
};
