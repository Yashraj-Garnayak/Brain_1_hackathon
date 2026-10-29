'use strict';

/* Stores per-run detail with an Ultrahuman ring snapshot, and reads it back as
   day-by-day performance alongside the ring metrics for that day. */

const { pool } = require('./db');
const { fetchDailyMetrics, summarizeDay, snapshotAt } = require('./ultrahuman');

const HEALTH_COLUMNS = [
  'recovery_index', 'movement_index', 'sleep_score', 'total_sleep_min', 'time_in_bed_min',
  'sleep_efficiency', 'deep_sleep_min', 'rem_sleep_min', 'light_sleep_min', 'restorative_sleep_pct',
  'sleep_cycles', 'tosses_and_turns', 'bedtime_start', 'bedtime_end', 'morning_alertness_min',
  'hrv_avg', 'sleep_hrv', 'night_rhr', 'temp_deviation', 'steps', 'active_minutes', 'inactive_min', 'vo2_max'
];

// Day-level factors that reaction time is correlated against.
const FACTORS = [
  'recovery_index', 'sleep_score', 'total_sleep_min', 'deep_sleep_min', 'rem_sleep_min',
  'sleep_efficiency', 'hrv_avg', 'sleep_hrv', 'night_rhr', 'morning_alertness_min', 'temp_deviation', 'steps'
];

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[i];
}

function rtStats(rts) {
  if (!rts.length) return { rt_best: null, rt_median: null, rt_p90: null, rt_sd: null };
  const sorted = rts.slice().sort((a, b) => a - b);
  const mean = rts.reduce((a, b) => a + b, 0) / rts.length;
  const variance = rts.reduce((a, b) => a + (b - mean) * (b - mean), 0) / rts.length;
  return {
    rt_best: sorted[0],
    rt_median: percentile(sorted, 0.5),
    rt_p90: percentile(sorted, 0.9),
    rt_sd: Math.round(Math.sqrt(variance))
  };
}

// Local calendar date and minute-of-day for a UTC instant and a JS getTimezoneOffset() value.
function localClock(at, tzOffsetMin) {
  const local = new Date(at.getTime() - tzOffsetMin * 60000);
  return {
    localDate: local.toISOString().slice(0, 10),
    localMinute: local.getUTCHours() * 60 + local.getUTCMinutes()
  };
}

// Only the ring owner's runs get ring data when ULTRAHUMAN_USERNAME is set.
function ringBelongsTo(user) {
  const owner = String(process.env.ULTRAHUMAN_USERNAME || '').trim().toLowerCase();
  return !owner || owner === user.username_lower;
}

async function upsertHealthDay(userId, row) {
  const values = HEALTH_COLUMNS.map((c) => row[c]);
  const cols = HEALTH_COLUMNS.join(', ');
  const params = HEALTH_COLUMNS.map((_, i) => `$${i + 3}`).join(', ');
  const updates = HEALTH_COLUMNS.map((c) => `${c} = excluded.${c}`).join(', ');
  await pool.query(
    `insert into health_days (user_id, day, ${cols}, synced_at)
     values ($1, $2, ${params}, now())
     on conflict (user_id, day) do update set ${updates}, synced_at = now()`,
    [userId, row.day, ...values]
  );
}

// Pulls the last ~day and a half of ring data, stores each day, and returns the
// readings at `at` from the day the run belongs to.
// Stores every day Ultrahuman returns for [start, end] and hands back the raw metrics.
async function syncRingRange(userId, start, end, options) {
  const data = await fetchDailyMetrics(start, end, options);
  const metrics = data.metrics || {};
  for (const day of Object.keys(metrics).sort()) await upsertHealthDay(userId, summarizeDay(day, metrics[day]));
  return data;
}

async function syncRing(user, at, localDate) {
  const end = Math.floor(at.getTime() / 1000);
  const { metrics = {} } = await syncRingRange(user.id, end - 36 * 3600, end, { timeoutMs: 4000 });
  const days = Object.keys(metrics).sort();
  const today = metrics[localDate] ? localDate : days[days.length - 1];
  return today ? snapshotAt(metrics[today], end) : null;
}

async function captureRunDetails({ user, runId, details }) {
  const at = new Date();
  const { localDate, localMinute } = localClock(at, details.tzOffsetMin);
  const stats = rtStats(details.rts);

  let ring = null;
  if (ringBelongsTo(user) && process.env.ULTRAHUMAN_TOKEN) {
    try {
      ring = await syncRing(user, at, localDate);
    } catch (err) {
      console.error('ultrahuman sync failed', err.message);
    }
  }
  ring = ring || {};

  await pool.query(
    `insert into run_details (
       run_id, user_id, played_at, local_date, local_minute, tz_offset_min,
       correct, wrong, misses, best_streak, cycles, rts,
       rt_best, rt_median, rt_p90, rt_sd, hr_at_play, hrv_at_play, steps_before_play)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
     on conflict (run_id) do nothing`,
    [
      runId, user.id, at, localDate, localMinute, details.tzOffsetMin,
      details.correct, details.wrong, details.misses, details.bestStreak, details.cycles, details.rts,
      stats.rt_best, stats.rt_median, stats.rt_p90, stats.rt_sd,
      ring.hr_at_play ?? null, ring.hrv_at_play ?? null, ring.steps_before_play ?? null
    ]
  );
  return { localDate, ring: Object.keys(ring).length > 0 };
}

/* ---------- what helped or hurt a day ---------- */

function median(values) {
  const s = values.filter((v) => v != null).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
}

function hm(minutes) {
  const m = Math.round(Math.abs(minutes));
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

// Each check compares a day with the player's own median. `better` is the
// direction that should mean faster reactions; `min` is the smallest gap worth mentioning.
const CHECKS = [
  { key: 'total_sleep_min', better: 1, min: () => 40,
    hurt: (v, b, g) => `Slept ${hm(v)}, ${hm(g)} less than your usual ${hm(b)}.`,
    help: (v, b, g) => `Slept ${hm(v)}, ${hm(g)} more than usual.` },
  { key: 'recovery_index', better: 1, min: () => 8,
    hurt: (v, b, g) => `Recovery was ${v}, ${g} points below your usual ${b}.`,
    help: (v, b, g) => `Recovery was ${v}, ${g} points above your usual.` },
  { key: 'sleep_score', better: 1, min: () => 8,
    hurt: (v, b) => `Sleep score ${v} against your usual ${b}.`,
    help: (v, b) => `Sleep score ${v}, above your usual ${b}.` },
  { key: 'deep_sleep_min', better: 1, min: () => 20,
    hurt: (v, b) => `Only ${hm(v)} of deep sleep (usual ${hm(b)}).`,
    help: (v) => `${hm(v)} of deep sleep, more than usual.` },
  { key: 'rem_sleep_min', better: 1, min: () => 20,
    hurt: (v, b) => `REM sleep was ${hm(v)} (usual ${hm(b)}).`,
    help: (v) => `${hm(v)} of REM sleep, more than usual.` },
  { key: 'sleep_efficiency', better: 1, min: () => 5,
    hurt: (v, b) => `Restless night: ${v}% sleep efficiency (usual ${b}%).`,
    help: (v) => `Solid night: ${v}% sleep efficiency.` },
  { key: 'hrv_avg', better: 1, min: (b) => Math.max(6, b * 0.12),
    hurt: (v, b, g) => `HRV ${v} ms, ${g} ms under your usual ${b}. Your body was under strain.`,
    help: (v, b, g) => `HRV ${v} ms, ${g} ms above usual.` },
  { key: 'night_rhr', better: -1, min: () => 3,
    hurt: (v, b, g) => `Resting heart rate ${v} bpm, ${g} above your usual ${b}.`,
    help: (v, b, g) => `Resting heart rate ${v} bpm, ${g} below usual.` },
  { key: 'morning_alertness_min', better: -1, min: () => 25,
    hurt: (v, b) => `Took ${v} min to feel alert after waking (usual ${b}).`,
    help: (v) => `Felt alert ${v} min after waking, quicker than usual.` }
];

// Local minute-of-day the player woke, from the night's bedtime_end.
function wakeMinute(bedtimeEnd, tzOffsetMin) {
  if (!bedtimeEnd) return null;
  const local = new Date(new Date(bedtimeEnd).getTime() - (tzOffsetMin || 0) * 60000);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
}

function explainDay(day, ring, raw, baseline, usualRt) {
  const hurt = [];
  const helped = [];
  if (ring) {
    for (const c of CHECKS) {
      const v = ring[c.key];
      const b = baseline[c.key];
      if (v == null || b == null) continue;
      const gap = Math.round((v - b) * c.better);
      const min = c.min(b);
      if (Math.abs(gap) < min) continue;
      const entry = { key: c.key, weight: Math.abs(gap) / min };
      if (gap < 0) hurt.push({ ...entry, text: c.hurt(v, b, -gap) });
      else helped.push({ ...entry, text: c.help(v, b, gap) });
    }
    if (ring.temp_deviation != null && Math.abs(ring.temp_deviation) >= 0.4) {
      const t = ring.temp_deviation;
      hurt.push({
        key: 'temp_deviation',
        weight: Math.abs(t) / 0.4,
        text: `Skin temperature ran ${t > 0 ? '+' : ''}${t.toFixed(1)}°C off your baseline, often a sign of strain, a late meal or alcohol, or getting ill.`
      });
    }
  }

  const minutes = day.minutes || [];
  const late = minutes.filter((m) => m >= 23 * 60 || m < 4 * 60).length;
  if (late) hurt.push({ key: 'late', weight: 1 + late / minutes.length, text: `${late} of ${minutes.length} runs ${late === 1 ? 'was' : 'were'} played after 11 pm.` });
  const wake = wakeMinute(raw && raw.bedtime_end, day.tz_offset_min);
  const alert = (ring && ring.morning_alertness_min) || 45;
  if (wake != null) {
    const groggy = minutes.filter((m) => m >= wake && m - wake < alert).length;
    if (groggy) hurt.push({ key: 'groggy', weight: 1 + groggy / minutes.length, text: `${groggy} ${groggy === 1 ? 'run was' : 'runs were'} within ${alert} min of waking, before you were fully alert.` });
  }

  hurt.sort((a, b) => b.weight - a.weight);
  helped.sort((a, b) => b.weight - a.weight);

  const diff = usualRt == null ? 0 : day.avg_rt - usualRt;
  let headline;
  if (diff > 25) headline = `${diff} ms slower than your usual ${usualRt} ms.`;
  else if (diff < -25) headline = `${-diff} ms faster than your usual ${usualRt} ms.`;
  else headline = `Right around your usual ${usualRt} ms.`;
  if (diff > 25 && !hurt.length) headline += ' No ring factor stood out, so focus or distraction is the likelier cause.';

  const strip = ({ key, text }) => ({ key, text });
  return { rt_vs_usual: diff, usual_rt: usualRt, headline, hurt: hurt.slice(0, 4).map(strip), helped: helped.slice(0, 3).map(strip) };
}

const nums = (row, keys) => {
  for (const k of keys) if (row[k] != null) row[k] = Number(row[k]);
  return row;
};

// yyyy-mm-dd arithmetic without timezone drift.
function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function daySpan(from, to) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
}

// How far back "your usual" looks when judging a day.
const BASELINE_DAYS = 60;

const FACTOR_LABELS = {
  total_sleep_min: 'Short sleep',
  recovery_index: 'Low recovery',
  sleep_score: 'Low sleep score',
  deep_sleep_min: 'Little deep sleep',
  rem_sleep_min: 'Little REM sleep',
  sleep_efficiency: 'Restless nights',
  hrv_avg: 'Low HRV',
  night_rhr: 'High resting heart rate',
  morning_alertness_min: 'Slow to feel alert',
  temp_deviation: 'Temperature off baseline',
  late: 'Playing after 11 pm',
  groggy: 'Playing right after waking'
};

// Per day: volume, reaction-time summary, and the within-day trend.
// rt_slope_per_hour < 0 means reactions got faster as the day went on.
async function dayStats(userId, from, to) {
  const { rows } = await pool.query(
    `with r as (
       select d.local_date, d.local_minute, d.played_at, d.rt_median, d.rt_best,
              d.tz_offset_min, r.avg_rt, r.accuracy, r.score, r.tier,
              row_number() over (partition by d.user_id, d.local_date order by d.played_at) as n_first,
              row_number() over (partition by d.user_id, d.local_date order by d.played_at desc) as n_last
         from run_details d
         join runs r on r.id = d.run_id
        where d.user_id = $1 and d.local_date between $2::date and $3::date
     )
     select local_date::text as day,
            count(*)::int as runs,
            round(avg(avg_rt))::int as avg_rt,
            min(rt_best)::int as best_rt,
            round(avg(accuracy)::numeric, 3)::float as avg_accuracy,
            round(avg(score))::int as avg_score,
            max(score)::int as best_score,
            max(tier)::int as best_tier,
            min(local_minute)::int as first_minute,
            max(local_minute)::int as last_minute,
            max(avg_rt) filter (where n_first = 1)::int as first_rt,
            max(avg_rt) filter (where n_last = 1)::int as last_rt,
            -- A per-hour rate only means something once runs span at least an hour.
            case when max(local_minute) - min(local_minute) >= 60
                 then round(regr_slope(avg_rt, local_minute / 60.0)::numeric, 1)::float end as rt_slope_per_hour,
            array_agg(local_minute order by played_at) as minutes,
            max(tz_offset_min)::int as tz_offset_min
       from r
      group by local_date
      order by local_date desc`,
    [userId, from, to]
  );
  return rows;
}

// Days in [from, to] with their ring data and what helped or hurt, judged
// against the player's own last BASELINE_DAYS up to `to`.
async function explainedDays(userId, from, to) {
  const baseFrom = addDays(to, -BASELINE_DAYS);
  const lookFrom = from < baseFrom ? from : baseFrom;
  const dayRows = await dayStats(userId, lookFrom, to);
  const { rows: healthRows } = await pool.query(
    `select day::text as day, ${HEALTH_COLUMNS.join(', ')}, synced_at
       from health_days
      where user_id = $1 and day between $2::date and $3::date`,
    [userId, lookFrom, to]
  );
  const health = new Map(healthRows.map((h) => [h.day, h]));

  const inBase = (d) => d.day >= baseFrom;
  const baseline = {};
  for (const c of CHECKS) {
    baseline[c.key] = median(healthRows.filter(inBase).map((h) => (h[c.key] == null ? null : Number(h[c.key]))));
  }
  const baseDays = dayRows.filter(inBase);
  const baseRuns = baseDays.reduce((a, d) => a + d.runs, 0);
  const usualRt = baseRuns ? Math.round(baseDays.reduce((a, d) => a + d.avg_rt * d.runs, 0) / baseRuns) : null;

  const days = dayRows.filter((d) => d.day >= from).map((d) => {
    const h = health.get(d.day) || null;
    const ring = h ? nums({ ...h, day: undefined }, HEALTH_COLUMNS.filter((c) => !c.startsWith('bedtime'))) : null;
    return {
      ...d,
      minutes: undefined,
      tz_offset_min: undefined,
      // First vs last run of the day, the same ms change the page shows.
      improved: d.runs < 2 ? null : d.last_rt < d.first_rt,
      ring,
      analysis: explainDay(d, ring, h, baseline, usualRt)
    };
  });
  const periodHealth = healthRows.filter((h) => h.day >= from);
  return { days, baseline, usualRt, periodHealth };
}

function mean(values) {
  const xs = values.filter((v) => v != null).map(Number);
  return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
}

function summarize(days, periodHealth, baseline, usualRt, prev) {
  const runs = days.reduce((a, d) => a + d.runs, 0);
  const weighted = (k) => days.reduce((a, d) => a + d[k] * d.runs, 0) / runs;

  const counts = {};
  for (const d of days) for (const f of d.analysis.hurt) counts[f.key] = (counts[f.key] || 0) + 1;
  const topHurt = Object.keys(counts)
    .map((key) => ({ key, label: FACTOR_LABELS[key] || key, days: counts[key] }))
    .sort((a, b) => b.days - a.days)
    .slice(0, 4);

  const ringMean = (k) => mean(periodHealth.map((h) => h[k]));
  return {
    runs,
    days_played: days.length,
    avg_rt: runs ? Math.round(weighted('avg_rt')) : null,
    best_rt: runs ? Math.min(...days.map((d) => d.best_rt).filter((v) => v != null)) : null,
    avg_accuracy: runs ? Math.round(weighted('avg_accuracy') * 1000) / 1000 : null,
    best_score: runs ? Math.max(...days.map((d) => d.best_score)) : null,
    usual_rt: usualRt,
    prev_avg_rt: prev.avg_rt,
    prev_runs: prev.runs,
    ring: {
      total_sleep_min: ringMean('total_sleep_min'),
      recovery_index: ringMean('recovery_index'),
      sleep_score: ringMean('sleep_score'),
      hrv_avg: ringMean('hrv_avg'),
      night_rhr: ringMean('night_rhr')
    },
    usual_ring: {
      total_sleep_min: baseline.total_sleep_min,
      recovery_index: baseline.recovery_index,
      sleep_score: baseline.sleep_score,
      hrv_avg: baseline.hrv_avg,
      night_rhr: baseline.night_rhr
    },
    top_hurt: topHurt
  };
}

async function lastPlayedDay(userId, today) {
  const { rows } = await pool.query(
    `select max(local_date)::text as day from run_details where user_id = $1 and local_date < $2::date`,
    [userId, today]
  );
  if (!rows[0].day) return null;
  return (await explainedDays(userId, rows[0].day, rows[0].day)).days[0] || null;
}

// One period (a week or a month) of insights. `today` is the viewer's local
// date; with `withLast` the most recent played day before it is explained too.
async function insights(userId, { from, to, today, withLast = false }) {
  const len = daySpan(from, to);
  const factorCorr = FACTORS.map((f) => `round(corr(h.${f}, r.avg_rt)::numeric, 2)::float as ${f}`).join(', ');
  const [explained, { rows: prevRows }, { rows: hours }, { rows: corr }, { rows: range }, lastPlayed] = await Promise.all([
    explainedDays(userId, from, to),
    pool.query(
    `select count(*)::int as runs, round(avg(r.avg_rt))::int as avg_rt
       from run_details d join runs r on r.id = d.run_id
      where d.user_id = $1 and d.local_date between $2::date and $3::date`,
    [userId, addDays(from, -len), addDays(from, -1)]
    ),
    pool.query(
    `select (d.local_minute / 60)::int as hour,
            count(*)::int as runs,
            round(avg(r.avg_rt))::int as avg_rt,
            round(avg(r.accuracy)::numeric, 3)::float as avg_accuracy
       from run_details d
       join runs r on r.id = d.run_id
      where d.user_id = $1 and d.local_date between $2::date and $3::date
      group by 1
      order by 1`,
    [userId, from, to]
    ),
    // Pearson r between each ring factor and that run's reaction time.
    // Negative r: a higher factor goes with faster reactions.
    pool.query(
    `select count(*)::int as runs, count(distinct d.local_date)::int as days, ${factorCorr},
            round(corr(d.hr_at_play, r.avg_rt)::numeric, 2)::float as hr_at_play,
            round(corr(d.steps_before_play, r.avg_rt)::numeric, 2)::float as steps_before_play,
            round(corr(d.local_minute, r.avg_rt)::numeric, 2)::float as time_of_day
       from run_details d
       join runs r on r.id = d.run_id
       left join health_days h on h.user_id = d.user_id and h.day = d.local_date
      where d.user_id = $1 and d.local_date between $2::date and $3::date`,
    [userId, from, to]
    ),
    pool.query(
      `select min(local_date)::text as first_day, max(local_date)::text as last_day
         from run_details where user_id = $1`,
      [userId]
    ),
    withLast ? lastPlayedDay(userId, today) : null
  ]);
  const { days, baseline, usualRt, periodHealth } = explained;

  return {
    from,
    to,
    range: range[0],
    summary: summarize(days, periodHealth, baseline, usualRt, prevRows[0]),
    days,
    hours,
    correlations: corr[0],
    last_played: lastPlayed,
    note: 'Correlations are Pearson r against average reaction time (ms); negative means the factor goes with faster reactions. Treat them as noise until there are 10+ days.'
  };
}

module.exports = { captureRunDetails, insights, syncRingRange, rtStats, localClock };
