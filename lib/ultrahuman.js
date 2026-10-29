'use strict';

/* Ultrahuman partner API: fetching daily metrics and reducing them to the
   per-day and point-in-time numbers we store against runs. */

const { httpError } = require('./http');

const UPSTREAM = 'https://partner.ultrahuman.com/api/v1/partner/daily_metrics';
// Readings further than this from the moment of play are treated as missing.
const NEAREST_WINDOW = 30 * 60;

async function fetchDailyMetrics(start, end, { timeoutMs = 8000 } = {}) {
  const token = process.env.ULTRAHUMAN_TOKEN;
  if (!token) throw httpError(503, 'ULTRAHUMAN_TOKEN is not set.');

  const upstream = await fetch(`${UPSTREAM}?start_epoch=${start}&end_epoch=${end}`, {
    headers: { Authorization: token, Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs)
  });
  const body = await upstream.json().catch(() => null);
  if (!upstream.ok || !body || !body.data) {
    const message = (body && body.error) || `Ultrahuman returned ${upstream.status}.`;
    throw httpError(502, message);
  }
  return body.data;
}

function byType(list) {
  const out = {};
  for (const m of list || []) out[m.type] = m.object || {};
  return out;
}

function int(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function num(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function epochToDate(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : null;
}

// One day's metric list -> a health_days row (minus user_id).
function summarizeDay(day, list) {
  const m = byType(list);
  // Until the night is processed the sleep block is a placeholder (index_valid: false).
  const sleep = m.sleep && m.sleep.index_valid !== false ? m.sleep : {};
  const pick = (obj, key) => (obj && obj[key] != null ? obj[key] : null);
  return {
    day,
    recovery_index: int(pick(m.recovery_index, 'value')),
    movement_index: int(pick(m.movement_index, 'value')),
    sleep_score: int(pick(sleep.sleep_score, 'score')),
    total_sleep_min: int(pick(sleep.total_sleep, 'minutes')),
    time_in_bed_min: int(pick(sleep.time_in_bed, 'minutes')),
    sleep_efficiency: int(pick(sleep.sleep_efficiency, 'percentage')),
    deep_sleep_min: int(pick(sleep.deep_sleep, 'minutes')),
    rem_sleep_min: int(pick(sleep.rem_sleep, 'minutes')),
    light_sleep_min: int(pick(sleep.light_sleep, 'minutes')),
    restorative_sleep_pct: int(pick(sleep.restorative_sleep, 'percentage')),
    sleep_cycles: int(pick(sleep.full_sleep_cycles, 'cycles')),
    tosses_and_turns: int(pick(sleep.tosses_and_turns, 'count')),
    bedtime_start: epochToDate(sleep.bedtime_start),
    bedtime_end: epochToDate(sleep.bedtime_end),
    morning_alertness_min: int(pick(m.morning_alertness, 'value')),
    hrv_avg: int(pick(m.hrv, 'avg')),
    sleep_hrv: int(pick(m.avg_sleep_hrv, 'value')),
    night_rhr: int(pick(m.night_rhr, 'avg')),
    temp_deviation: num(pick(sleep.temperature_deviation, 'celsius')),
    steps: int(pick(m.steps, 'total')),
    active_minutes: int(pick(m.active_minutes, 'value')),
    inactive_min: int(pick(m.inactive_time, 'value')),
    vo2_max: int(pick(m.vo2_max, 'value'))
  };
}

// Latest sample at or before `at`, if it is recent enough to describe that moment.
function readingAt(series, at) {
  let best = null;
  for (const v of (series && series.values) || []) {
    if (v.timestamp <= at && (!best || v.timestamp > best.timestamp)) best = v;
  }
  return best && at - best.timestamp <= NEAREST_WINDOW ? int(best.value) : null;
}

// Steps are per-interval buckets that add up to the daily total.
function stepsBefore(series, at) {
  const values = (series && series.values) || [];
  if (!values.length) return null;
  return values.reduce((sum, v) => (v.timestamp <= at ? sum + Number(v.value || 0) : sum), 0);
}

function snapshotAt(list, at) {
  const m = byType(list);
  return {
    hr_at_play: readingAt(m.hr, at),
    hrv_at_play: readingAt(m.hrv, at),
    steps_before_play: stepsBefore(m.steps, at)
  };
}

module.exports = { fetchDailyMetrics, summarizeDay, snapshotAt };
