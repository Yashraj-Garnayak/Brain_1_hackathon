'use strict';

/* Combined health endpoint. Vercel Hobby allows at most 12 serverless
   functions, so the insights and Ultrahuman proxy share one file.

   GET /api/insights?from=yyyy-mm-dd&to=yyyy-mm-dd[&today=…&last=1]
   GET /api/ultrahuman?start_epoch=<unix s>&end_epoch=<unix s>
   Both routes are rewritten here in vercel.json. */

const { allow, json, fail, httpError } = require('../lib/http');
const { currentUser } = require('../lib/auth');
const { insights } = require('../lib/insights');
const { fetchDailyMetrics } = require('../lib/ultrahuman');

const MAX_SPAN_DAYS = 62;
const DEFAULT_START = 1793055600;
const DEFAULT_END = 1793142000;
const MAX_RANGE = 7 * 86400; // Ultrahuman rejects longer ranges

function dateParam(url, name, fallback) {
  const raw = url.searchParams.get(name);
  if (!raw) return fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw))) {
    throw httpError(400, `${name} must be a date like 2026-10-29.`);
  }
  return raw;
}

function epochParam(url, name, fallback) {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw httpError(400, `${name} must be a unix timestamp in seconds.`);
  return value;
}

async function insightsHandler(req, res, url) {
  const user = await currentUser(req);
  if (!user) return json(res, 401, { error: 'Sign in to see your insights.' });

  const today = dateParam(url, 'today', new Date().toISOString().slice(0, 10));
  const to = dateParam(url, 'to', today);
  const from = dateParam(url, 'from', to);
  if (from > to) throw httpError(400, 'from must be on or before to.');
  if ((Date.parse(to) - Date.parse(from)) / 86400000 >= MAX_SPAN_DAYS) {
    throw httpError(400, `A period can cover at most ${MAX_SPAN_DAYS} days.`);
  }

  const data = await insights(user.id, { from, to, today, withLast: url.searchParams.get('last') === '1' });
  return json(res, 200, data);
}

async function ultrahumanHandler(req, res, url) {
  const start = epochParam(url, 'start_epoch', DEFAULT_START);
  const end = epochParam(url, 'end_epoch', DEFAULT_END);
  if (end < start) throw httpError(400, 'end_epoch must be after start_epoch.');
  if (end - start > MAX_RANGE) throw httpError(400, 'Range is limited to 7 days.');

  const data = await fetchDailyMetrics(start, end);
  return json(res, 200, { start, end, ...data });
}

module.exports = async function handler(req, res) {
  if (!allow(req, res, ['GET'])) return;
  try {
    const url = new URL(req.url, 'http://localhost');
    const kind = (req.query && req.query.kind) || url.searchParams.get('kind') ||
      (url.pathname.endsWith('/ultrahuman') ? 'ultrahuman' : 'insights');
    if (kind === 'ultrahuman') return await ultrahumanHandler(req, res, url);
    return await insightsHandler(req, res, url);
  } catch (err) {
    return fail(res, err);
  }
};
