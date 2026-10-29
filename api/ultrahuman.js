'use strict';

/* Proxies Ultrahuman partner daily metrics so the token never reaches the browser.
   GET /api/ultrahuman?start_epoch=<unix s>&end_epoch=<unix s> */

const { allow, json, fail, httpError } = require('../lib/http');
const { fetchDailyMetrics } = require('../lib/ultrahuman');

const DEFAULT_START = 1793055600;
const DEFAULT_END = 1793142000;
const MAX_RANGE = 7 * 86400; // Ultrahuman rejects longer ranges

function epochParam(url, name, fallback) {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw httpError(400, `${name} must be a unix timestamp in seconds.`);
  return value;
}

module.exports = async function handler(req, res) {
  if (!allow(req, res, ['GET'])) return;
  try {
    const url = new URL(req.url, 'http://localhost');
    const start = epochParam(url, 'start_epoch', DEFAULT_START);
    const end = epochParam(url, 'end_epoch', DEFAULT_END);
    if (end < start) throw httpError(400, 'end_epoch must be after start_epoch.');
    if (end - start > MAX_RANGE) throw httpError(400, 'Range is limited to 7 days.');

    const data = await fetchDailyMetrics(start, end);
    return json(res, 200, { start, end, ...data });
  } catch (err) {
    return fail(res, err);
  }
};
