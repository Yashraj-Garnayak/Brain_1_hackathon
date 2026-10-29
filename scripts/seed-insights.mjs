#!/usr/bin/env node
/* Pulls the last 30 days of Ultrahuman ring data into health_days for one player,
   then seeds demo runs on some of those days whose reaction times follow that
   day's sleep, recovery, HRV and time of play. Seeded runs are flagged in
   run_details and never touch the player's leaderboard stats.

   Usage: npm run seed -- <username>          sync ring + seed runs
          npm run seed -- <username> --clear  delete seeded runs only */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { pool } = require('../lib/db');
const { syncRingRange, rtStats } = require('../lib/insights');
const { snapshotAt } = require('../lib/ultrahuman');

const DAYS = 30;
// Its own game id keeps demo runs out of leaderboards, profiles and ghosts,
// which all read game_id = 'tile-rush'. Insights reads run_details, so it still sees them.
const DEMO_GAME_ID = 'tile-rush-demo';
const PLAY_SHARE = 0.65; // fraction of days with at least one session

// Deterministic so re-seeding gives the same history.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = rng(20261029);
const between = (a, b) => a + (b - a) * random();
const gauss = () => {
  const u = 1 - random();
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const median = (xs) => {
  const s = xs.filter((x) => x != null).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

// Minutes east of UTC for `zone` at `date`, as getTimezoneOffset() reports it (negated).
function tzOffsetMin(zone, date) {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' })
    .formatToParts(date)
    .find((p) => p.type === 'timeZoneName').value;
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(part);
  if (!m) return 0;
  const east = (Number(m[2]) * 60 + Number(m[3] || 0)) * (m[1] === '-' ? -1 : 1);
  return -east;
}

// Reaction-time penalty (ms) for a day's ring numbers relative to the player's own medians.
function dayPenalty(h, base) {
  let ms = 0;
  if (h.recovery_index != null && base.recovery_index != null) ms += (base.recovery_index - h.recovery_index) * 2.2;
  if (h.total_sleep_min != null && base.total_sleep_min != null) ms += (base.total_sleep_min - h.total_sleep_min) * 0.35;
  if (h.deep_sleep_min != null && base.deep_sleep_min != null) ms += (base.deep_sleep_min - h.deep_sleep_min) * 0.6;
  if (h.hrv_avg != null && base.hrv_avg != null) ms += (base.hrv_avg - h.hrv_avg) * 1.4;
  if (h.night_rhr != null && base.night_rhr != null) ms += (h.night_rhr - base.night_rhr) * 6;
  if (h.temp_deviation != null) ms += Math.max(0, Math.abs(h.temp_deviation) - 0.3) * 90;
  return ms;
}

// Time-of-day effect: sleep inertia after waking, a post-lunch dip, late-night fatigue.
function clockPenalty(minute, wakeMinute, alertness) {
  let ms = 0;
  const sinceWake = minute - wakeMinute;
  if (sinceWake >= 0 && sinceWake < (alertness || 45)) ms += 90 * (1 - sinceWake / (alertness || 45));
  if (minute >= 13 * 60 + 30 && minute <= 15 * 60 + 30) ms += 35;
  if (minute >= 23 * 60 || minute < 4 * 60) ms += 70;
  if ((minute >= 10 * 60 && minute <= 12 * 60) || (minute >= 17 * 60 && minute <= 20 * 60)) ms -= 30;
  return ms;
}

function playRun(rt, accuracyBase) {
  const accuracy = clamp(accuracyBase + gauss() * 0.04, 0.5, 0.98);
  // Roughly how many hits fit into a 30s clock plus the cycle bonuses they earn.
  const correct = Math.max(4, Math.round((30000 / (rt + 380)) * (1 + Math.max(0, 1300 - rt) / 2600)));
  const failures = Math.round(correct * (1 - accuracy) / accuracy);
  const wrong = Math.round(failures * between(0.5, 0.8));
  const misses = failures - wrong;
  const rts = Array.from({ length: correct }, () => Math.round(clamp(rt * Math.exp(gauss() * 0.2), 280, 3800)));
  const avgRt = Math.round(rts.reduce((a, b) => a + b, 0) / rts.length);
  const cycles = Math.floor(correct / 10);
  const speed = clamp((1600 - avgRt) / 1300, 0, 1);
  const bestStreak = Math.min(correct, Math.round(correct * clamp(accuracy - 0.2 + gauss() * 0.08, 0.2, 1)));
  const score = Math.max(0, Math.round(correct * 100 * (1 + speed * 0.9) * (1 + Math.min(bestStreak, 20) * 0.04) * (1 + cycles * 0.12)) - wrong * 30);
  return { score, tier: cycles, accuracy: correct / (correct + wrong + misses), avgRt, correct, wrong, misses, bestStreak, cycles, rts };
}

async function clearSeeded(userId) {
  const { rowCount } = await pool.query(
    `delete from runs where id in (select run_id from run_details where user_id = $1 and seeded)`,
    [userId]
  );
  return rowCount;
}

async function main() {
  const [username, flag] = process.argv.slice(2);
  if (!username) throw new Error('Usage: npm run seed -- <username> [--clear]');
  const { rows } = await pool.query('select * from users where username_lower = $1', [username.toLowerCase()]);
  const user = rows[0];
  if (!user) throw new Error(`No user named ${username}.`);

  const removed = await clearSeeded(user.id);
  console.log(`Removed ${removed} previously seeded runs.`);
  if (flag === '--clear') return;

  // Ultrahuman serves at most 7 days per request.
  const now = Math.floor(Date.now() / 1000);
  const metrics = {};
  let zone = 'UTC';
  for (let end = now; end > now - DAYS * 86400; end -= 7 * 86400) {
    const start = Math.max(now - DAYS * 86400, end - 6 * 86400);
    const data = await syncRingRange(user.id, start, end, { timeoutMs: 30000 });
    Object.assign(metrics, data.metrics || {});
    zone = data.latest_time_zone || zone;
  }
  const dayKeys = Object.keys(metrics).sort();
  console.log(`Synced ${dayKeys.length} ring days (${dayKeys[0]} → ${dayKeys[dayKeys.length - 1]}) in ${zone}.`);

  const { rows: health } = await pool.query(
    `select *, day::text as day_key from health_days where user_id = $1 and day >= $2::date`,
    [user.id, dayKeys[0]]
  );
  const byDay = new Map(health.map((h) => [h.day_key, h]));
  const base = {};
  for (const k of ['recovery_index', 'total_sleep_min', 'deep_sleep_min', 'hrv_avg', 'night_rhr']) {
    base[k] = median(health.map((h) => h[k]));
  }

  // The player's real pace sets the baseline the ring factors move around.
  const { rows: real } = await pool.query(
    `select avg(r.avg_rt)::int as rt, avg(r.accuracy)::float as acc
       from runs r left join run_details d on d.run_id = r.id
      where r.user_id = $1 and coalesce(d.seeded, false) = false`,
    [user.id]
  );
  const baseRt = real[0].rt || 1150;
  const baseAcc = real[0].acc || 0.85;

  const { rows: playedRows } = await pool.query(
    `select distinct local_date::text as day from run_details where user_id = $1 and not seeded`,
    [user.id]
  );
  const realDays = new Set(playedRows.map((r) => r.day));

  let inserted = 0;
  let rating = Number(user.rating);
  // Today is still in progress, so only completed days get demo runs.
  for (const day of dayKeys.slice(0, -1)) {
    if (realDays.has(day) || random() > PLAY_SHARE) continue;
    const h = byDay.get(day) || {};
    const penalty = dayPenalty(h, base);
    const dayStart = metrics[day][0].object.day_start_timestamp;
    const wakeEpoch = h.bedtime_end ? Math.floor(new Date(h.bedtime_end).getTime() / 1000) : dayStart + 8 * 3600;
    const wakeMinute = Math.max(0, Math.round((wakeEpoch - dayStart) / 60));

    // 1–3 sessions between waking and midnight, each 1–4 back-to-back runs.
    const sessions = Math.ceil(between(0, 3));
    const starts = Array.from({ length: sessions }, () => Math.round(between(wakeMinute + 10, 23.6 * 60))).sort((a, b) => a - b);
    for (const startMinute of starts) {
      const count = Math.ceil(between(0, 4));
      for (let i = 0; i < count; i++) {
        const minute = Math.min(1439, startMinute + i * 3);
        const at = dayStart + minute * 60 + Math.round(between(0, 50));
        // First run of a session is a warm-up; then practice helps a little.
        const practice = i === 0 ? 45 : -12 * Math.min(i, 3);
        const rt = clamp(baseRt + penalty + clockPenalty(minute, wakeMinute, h.morning_alertness_min) + practice + gauss() * 45, 520, 2200);
        const acc = baseAcc - penalty / 2500 - (minute >= 23 * 60 ? 0.03 : 0);
        const run = playRun(rt, acc);
        const ring = snapshotAt(metrics[day], at);
        const playedAt = new Date(at * 1000);
        const tz = tzOffsetMin(zone, playedAt);
        const after = Math.max(100, rating + Math.round((run.accuracy - 0.8) * 40 + (1200 - run.avgRt) / 40));
        const stats = rtStats(run.rts);

        const client = await pool.connect();
        try {
          await client.query('begin');
          const { rows: ins } = await client.query(
            `insert into runs (user_id, score, tier, accuracy, avg_rt, rating_before, rating_after, created_at, game_id)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
            [user.id, run.score, run.tier, run.accuracy, run.avgRt, rating, after, playedAt, DEMO_GAME_ID]
          );
          await client.query(
            `insert into run_details (
               run_id, user_id, played_at, local_date, local_minute, tz_offset_min,
               correct, wrong, misses, best_streak, cycles, rts,
               rt_best, rt_median, rt_p90, rt_sd, hr_at_play, hrv_at_play, steps_before_play, seeded)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, true)`,
            [
              ins[0].id, user.id, playedAt, day, minute, tz,
              run.correct, run.wrong, run.misses, run.bestStreak, run.cycles, run.rts,
              stats.rt_best, stats.rt_median, stats.rt_p90, stats.rt_sd,
              ring.hr_at_play, ring.hrv_at_play, ring.steps_before_play
            ]
          );
          await client.query('commit');
        } catch (err) {
          await client.query('rollback');
          throw err;
        } finally {
          client.release();
        }
        rating = after;
        inserted++;
      }
    }
  }
  console.log(`Seeded ${inserted} runs for ${user.username}.`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
