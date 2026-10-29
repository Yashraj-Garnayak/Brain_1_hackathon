'use strict';

const { pool } = require('./db');
const { nextRating } = require('./elo');
const { titleFor } = require('../shared/bpi');

const PUBLIC_COLUMNS = `id, username, rating, best_score, best_tier, games, best_bpi,
  title, avatar, country, region, created_at, last_seen`;

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    rating: Number(row.rating),
    bestScore: Number(row.best_score),
    bestTier: Number(row.best_tier),
    games: Number(row.games),
    bestBpi: Number(row.best_bpi || 0),
    title: row.title || 'DRIFTER',
    avatar: row.avatar || null,
    country: row.country || null,
    region: row.region || null,
    createdAt: row.created_at,
    lastSeen: row.last_seen
  };
}

async function findByUsername(usernameLower) {
  const { rows } = await pool.query(`select * from users where username_lower = $1`, [usernameLower]);
  return rows[0] || null;
}

async function findById(id) {
  const { rows } = await pool.query(`select * from users where id = $1`, [id]);
  return rows[0] || null;
}

async function createUser({ username, usernameLower, passwordHash }) {
  const { rows } = await pool.query(
    `insert into users (username, username_lower, password_hash)
     values ($1, $2, $3)
     on conflict (username_lower) do nothing
     returning ${PUBLIC_COLUMNS}`,
    [username, usernameLower, passwordHash]
  );
  return rows[0] || null;
}

async function seasonRank(client, { gameId, seasonKey, userId }) {
  const { rows } = await client.query(
    `with agg as (
       select r.user_id, max(r.bpi) as best_bpi
         from runs r
        where r.game_id = $1 and r.season_key = $2
        group by r.user_id
     ), ranked as (
       select user_id, row_number() over (order by best_bpi desc, user_id asc) as rank
         from agg
     )
     select rank from ranked where user_id = $3`,
    [gameId, seasonKey, userId]
  );
  return rows[0] ? Number(rows[0].rank) : null;
}

async function recordRun({
  userId, score, tier, accuracy, avgRt, bpi, metrics, rounds,
  gameId = 'tile-rush', seasonKey, weekKey, result = null,
  country = null, region = null, stats = {}
}) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const locked = await client.query('select * from users where id = $1 for update', [userId]);
    const user = locked.rows[0];
    if (!user) throw Object.assign(new Error('Account not found.'), { status: 401 });

    const { after, delta } = nextRating({
      rating: Number(user.rating),
      games: Number(user.games),
      accuracy,
      avgRt,
      tier
    });

    const bestBpi = Math.max(Number(user.best_bpi || 0), Number(bpi) || 0);
    const title = titleFor(bestBpi).name;
    const won = result === 'win' ? 1 : 0;
    const lost = result === 'loss' ? 1 : 0;
    const correct = Math.max(0, Number(stats.correct) || 0);
    const attempts = Math.max(0, Number(stats.attempts) || 0);
    const rtSum = Math.max(0, Number(stats.rtSum) || 0);
    const rtCount = Math.max(0, Number(stats.rtCount) || 0);

    const updated = await client.query(
      `update users
          set rating = $2,
              best_score = greatest(best_score, $3),
              best_tier = greatest(best_tier, $4),
              games = games + 1,
              best_bpi = greatest(best_bpi, $5),
              title = $6,
              last_seen = now()
        where id = $1
        returning ${PUBLIC_COLUMNS}`,
      [userId, after, score, tier, bpi, title]
    );

    await client.query(
      `insert into user_game_stats
         (user_id, game_id, games, wins, losses, best_score, best_bpi, best_tier,
          correct, attempts, rt_sum, rt_count)
       values ($1, $2, 1, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       on conflict (user_id, game_id) do update set
         games = user_game_stats.games + 1,
         wins = user_game_stats.wins + excluded.wins,
         losses = user_game_stats.losses + excluded.losses,
         best_score = greatest(user_game_stats.best_score, excluded.best_score),
         best_bpi = greatest(user_game_stats.best_bpi, excluded.best_bpi),
         best_tier = greatest(user_game_stats.best_tier, excluded.best_tier),
         correct = user_game_stats.correct + excluded.correct,
         attempts = user_game_stats.attempts + excluded.attempts,
         rt_sum = user_game_stats.rt_sum + excluded.rt_sum,
         rt_count = user_game_stats.rt_count + excluded.rt_count,
         updated_at = now()`,
      [userId, gameId, won, lost, score, bpi, tier, correct, attempts, rtSum, rtCount]
    );

    await client.query(
      `insert into season_stats
         (user_id, game_id, season_key, games, wins, losses, correct, attempts,
          best_score, best_bpi)
       values ($1, $2, $3, 1, $4, $5, $6, $7, $8, $9)
       on conflict (user_id, game_id, season_key) do update set
         games = season_stats.games + 1,
         wins = season_stats.wins + excluded.wins,
         losses = season_stats.losses + excluded.losses,
         correct = season_stats.correct + excluded.correct,
         attempts = season_stats.attempts + excluded.attempts,
         best_score = greatest(season_stats.best_score, excluded.best_score),
         best_bpi = greatest(season_stats.best_bpi, excluded.best_bpi),
         updated_at = now()`,
      [userId, gameId, seasonKey, won, lost, correct, attempts, score, bpi]
    );

    const inserted = await client.query(
      `insert into runs
         (user_id, score, tier, accuracy, avg_rt, rating_before, rating_after,
          game_id, season_key, week_key, bpi, metrics, rounds, country, region, result)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14, $15, $16)
       returning id, created_at`,
      [
        userId, score, tier, accuracy, avgRt, user.rating, after,
        gameId, seasonKey, weekKey, bpi,
        JSON.stringify(metrics || {}), JSON.stringify(rounds || []),
        country, region, result
      ]
    );

    const rank = await seasonRank(client, { gameId, seasonKey, userId });
    if (rank) {
      await client.query(
        `update season_stats
            set best_rank = least(coalesce(best_rank, $4), $4)
          where user_id = $1 and game_id = $2 and season_key = $3`,
        [userId, gameId, seasonKey, rank]
      );
    }

    await client.query('commit');
    return {
      user: updated.rows[0],
      before: Number(user.rating),
      after,
      delta,
      runId: inserted.rows[0].id,
      rank
    };
  } catch (err) {
    try { await client.query('rollback'); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

const ORDER = {
  score: 'a.best_score desc, a.best_bpi desc, a.rating desc, a.username asc',
  bpi: 'a.best_bpi desc, a.best_score desc, a.rating desc, a.username asc',
  rating: 'a.rating desc, a.best_bpi desc, a.best_score desc, a.username asc'
};

function scopeClause(scope, country, region, startIndex) {
  if (scope === 'country' && country) {
    return { sql: ` and u.country = $${startIndex}`, params: [country] };
  }
  if (scope === 'region' && country && region) {
    return { sql: ` and u.country = $${startIndex} and u.region = $${startIndex + 1}`, params: [country, region] };
  }
  return { sql: '', params: [] };
}

function mapEntry(row) {
  return {
    rank: Number(row.rank),
    id: row.id || row.user_id,
    username: row.username,
    title: row.title || 'DRIFTER',
    avatar: row.avatar || null,
    country: row.country || null,
    region: row.region || null,
    rating: Number(row.rating || 0),
    bestScore: Number(row.best_score || 0),
    bestBpi: Number(row.best_bpi || 0),
    bestTier: Number(row.best_tier || 0),
    games: Number(row.games || 0)
  };
}

async function leaderboard({
  by = 'score', scope = 'global', period = 'all', gameId = 'tile-rush',
  userId = null, country = null, region = null, limit = 50
}) {
  const order = ORDER[by] || ORDER.score;
  const cleanLimit = Math.max(1, Math.min(100, Number(limit) || 50));
  const scopeStart = period === 'all' ? 2 : 3;
  const scoped = scopeClause(scope, country, region, scopeStart);

  if ((scope === 'country' && !country) || (scope === 'region' && (!country || !region))) {
    return {
      by, scope, period, gameId, entries: [], me: null,
      players: 0, online: 0, scopeAvailable: false,
      country, region
    };
  }

  const periodKey = period === 'week' ? 'week_key' : 'season_key';
  const keys = require('./season').keysFor(new Date());
  const bucket = period === 'week' ? keys.weekKey : keys.seasonKey;

  let entriesQuery, entriesParams, meQuery, meParams, playersQuery, playersParams;

  if (period === 'all') {
    const base = `
      select u.id, u.username, u.title, u.avatar, u.country, u.region,
             u.rating, s.best_score, s.best_bpi, s.best_tier, s.games
        from user_game_stats s
        join users u on u.id = s.user_id
       where s.game_id = $1 and s.games > 0 ${scoped.sql}`;

    entriesParams = [gameId, ...scoped.params, cleanLimit];
    entriesQuery = `
      with agg as (${base}), ranked as (
        select a.*, row_number() over (order by ${order}) as rank from agg a
      )
      select * from ranked order by rank limit $${entriesParams.length}`;

    meParams = [gameId, ...scoped.params, userId];
    meQuery = `
      with agg as (${base}), ranked as (
        select a.*, row_number() over (order by ${order}) as rank from agg a
      )
      select * from ranked where id = $${meParams.length}`;

    playersParams = [gameId, ...scoped.params];
    playersQuery = `
      select count(*)::int as players
        from user_game_stats s
        join users u on u.id = s.user_id
       where s.game_id = $1 and s.games > 0 ${scoped.sql}`;
  } else {
    const base = `
      select r.user_id, u.username, u.title, u.avatar, u.country, u.region,
             max(r.score) as best_score, max(r.bpi) as best_bpi,
             max(r.rating_after) as rating, max(r.tier) as best_tier,
             count(*)::int as games
        from runs r
        join users u on u.id = r.user_id
       where r.game_id = $1 and r.${periodKey} = $2 ${scoped.sql}
       group by r.user_id, u.username, u.title, u.avatar, u.country, u.region`;

    entriesParams = [gameId, bucket, ...scoped.params, cleanLimit];
    entriesQuery = `
      with agg as (${base}), ranked as (
        select a.*, row_number() over (order by ${order}) as rank
          from agg a
      )
      select * from ranked order by rank limit $${entriesParams.length}`;

    meParams = [gameId, bucket, ...scoped.params, userId];
    meQuery = `
      with agg as (${base}), ranked as (
        select a.*, row_number() over (order by ${order}) as rank
          from agg a
      )
      select * from ranked where user_id = $${meParams.length}`;

    playersParams = [gameId, bucket, ...scoped.params];
    playersQuery = `
      select count(distinct r.user_id)::int as players
        from runs r
        join users u on u.id = r.user_id
       where r.game_id = $1 and r.${periodKey} = $2 ${scoped.sql}`;
  }

  const onlineScope = scopeClause(scope, country, region, 1);
  const [entries, mine, totals, online] = await Promise.all([
    pool.query(entriesQuery, entriesParams),
    userId ? pool.query(meQuery, meParams) : Promise.resolve({ rows: [] }),
    pool.query(playersQuery, playersParams),
    pool.query(
      `select count(*)::int as online from users u
        where u.last_seen > now() - interval '5 minutes' ${onlineScope.sql}`,
      onlineScope.params
    )
  ]);

  return {
    by, scope, period, gameId,
    entries: entries.rows.map(mapEntry),
    me: mine.rows[0] ? mapEntry(mine.rows[0]) : null,
    players: totals.rows[0] ? Number(totals.rows[0].players) : 0,
    online: online.rows[0] ? Number(online.rows[0].online) : 0,
    scopeAvailable: true,
    country, region
  };
}

/* One actionable sentence connecting activity to the season's result.
   Kept server-side so the player and visitors see the same framing. */
function buildSeasonInsight(breakdown) {
  const cur = breakdown[0];
  if (!cur) return 'No seasons tracked yet. Play a ranked run to start one.';
  const prev = breakdown[1] || null;
  const days = (n) => `${n} active ${n === 1 ? 'day' : 'days'}`;
  const signed = (n) => (n > 0 ? `+${n}` : String(n));

  if (!prev) {
    return `Baseline set: ${cur.games} ${cur.games === 1 ? 'run' : 'runs'} across ${days(cur.activeDays)}. Next month's deltas measure against this.`;
  }
  if (cur.games === 0) {
    return `No ranked runs this month. You logged ${prev.games} runs last season — one session resets the baseline.`;
  }

  const bpiDelta = cur.bestBpi - prev.bestBpi;
  const dayDelta = cur.activeDays - prev.activeDays;
  const accDelta = Math.round(cur.accuracy * 100) - Math.round(prev.accuracy * 100);
  const loginDelta = cur.logins - prev.logins;
  const visits = cur.logins > 0 ? ` · ${cur.logins} sign-in${cur.logins === 1 ? '' : 's'}` : '';

  if (bpiDelta > 0 && dayDelta > 0) {
    return `Up ${bpiDelta} BPI across ${days(cur.activeDays)} (${signed(dayDelta)})${visits}. Frequency is turning into rank.`;
  }
  if (bpiDelta > 0) {
    const pace = dayDelta === 0
      ? 'same volume as last season'
      : `${Math.abs(dayDelta)} fewer than last season`;
    return `Up ${bpiDelta} BPI in ${days(cur.activeDays)}, ${pace}${visits}. Sharper reads, not just more reps.`;
  }
  if (bpiDelta === 0 && accDelta >= 0) {
    return `BPI held at ${cur.bestBpi} with accuracy ${signed(accDelta)}pp${visits}. Raise the ceiling by pushing the clock, not the count.`;
  }
  if (bpiDelta < 0 && dayDelta < 0) {
    return `BPI ${signed(bpiDelta)} as active days fell to ${cur.activeDays}. Short, regular sessions rebuild the read fastest.`;
  }
  if (bpiDelta < 0 && loginDelta < 0) {
    return `BPI ${signed(bpiDelta)} while sign-ins dropped ${signed(loginDelta)}. Re-anchor with two short sessions a week.`;
  }
  if (bpiDelta < 0) {
    return `BPI ${signed(bpiDelta)} despite ${days(cur.activeDays)}. More volume is not the fix — tighten precision first.`;
  }
  return `BPI ${signed(bpiDelta)} · accuracy ${signed(accDelta)}pp · ${days(cur.activeDays)}${visits}.`;
}

async function getProfile({ usernameLower, gameId = 'tile-rush', viewerId = null }) {
  const user = await findByUsername(usernameLower);
  if (!user) return null;

  const [games, stats, seasons, latestRun, runSeasons, loginSeasons] = await Promise.all([
    pool.query(`select id, name, short_name, sort from games where active order by sort, name`),
    pool.query(
      `select s.*, g.name as game_name, g.short_name
         from user_game_stats s
         join games g on g.id = s.game_id
        where s.user_id = $1
        order by g.sort, g.name`,
      [user.id]
    ),
    pool.query(
      `select * from season_stats
        where user_id = $1 and game_id = $2
        order by season_key desc limit 12`,
      [user.id, gameId]
    ),
    pool.query(
      `select metrics from runs
        where user_id = $1 and game_id = $2 and metrics is not null
        order by created_at desc limit 1`,
      [user.id, gameId]
    ),
    pool.query(
      `select season_key,
              count(*)::int as runs,
              count(distinct (created_at at time zone 'UTC')::date)::int as active_days,
              coalesce(round(avg(bpi)), 0)::int as avg_bpi,
              coalesce(round(avg(accuracy) * 100), 0)::int as avg_acc,
              coalesce(round(avg(avg_rt)), 0)::int as avg_rt,
              min(created_at) as first_run,
              max(created_at) as last_run
         from runs
        where user_id = $1 and game_id = $2 and season_key is not null
        group by season_key
        order by season_key desc
        limit 12`,
      [user.id, gameId]
    ),
    pool.query(
      `select to_char(created_at at time zone 'UTC', 'YYYY-MM') as season_key,
              count(*)::int as logins,
              count(distinct (created_at at time zone 'UTC')::date)::int as login_days
         from sessions
        where user_id = $1
        group by 1`,
      [user.id]
    )
  ]);

  const latestMetrics = latestRun.rows[0] && latestRun.rows[0].metrics ? latestRun.rows[0].metrics : null;
  const publicAxes = latestMetrics && latestMetrics.axes ? latestMetrics.axes : null;
  const bpiModel = require('../shared/bpi');

  const currentKey = require('./season').keysFor(new Date()).seasonKey;
  const currentSeason = seasons.rows.find((row) => row.season_key === currentKey) || null;

  let rank = null;
  if (currentSeason && Number(currentSeason.games) > 0) {
    const board = await leaderboard({
      by: 'bpi', scope: 'global', period: 'season', gameId,
      userId: user.id, limit: 1
    });
    rank = board.me ? board.me.rank : null;
  }

  const isSelf = viewerId && String(viewerId) === String(user.id);
  let self = null;

  /* Season history with engagement. "Active days" counts days with a run,
     "logins" counts sessions created in that month; together they show whether
     a change in rank came from more practice or from sharper play. */
  const statMap = new Map(seasons.rows.map((row) => [row.season_key, row]));
  const runMap = new Map(runSeasons.rows.map((row) => [row.season_key, row]));
  const loginMap = new Map(loginSeasons.rows.map((row) => [row.season_key, row]));
  const seasonKeys = Array.from(new Set([...statMap.keys(), ...runMap.keys()]))
    .sort()
    .reverse();

  const breakdown = seasonKeys.map((key) => {
    const stat = statMap.get(key) || {};
    const runs = runMap.get(key) || {};
    const visits = loginMap.get(key) || {};
    const attempts = Number(stat.attempts || 0);
    const correct = Number(stat.correct || 0);
    return {
      key,
      games: Number(stat.games || runs.runs || 0),
      wins: Number(stat.wins || 0),
      losses: Number(stat.losses || 0),
      accuracy: attempts ? correct / attempts : Number(runs.avg_acc || 0) / 100,
      bestScore: Number(stat.best_score || 0),
      bestBpi: Number(stat.best_bpi || runs.avg_bpi || 0),
      avgBpi: Number(runs.avg_bpi || stat.best_bpi || 0),
      avgRt: Number(runs.avg_rt || 0),
      bestRank: stat.best_rank == null ? null : Number(stat.best_rank),
      rank: null,
      activeDays: Number(runs.active_days || 0),
      logins: Number(visits.logins || 0),
      loginDays: Number(visits.login_days || 0),
      firstRunAt: runs.first_run || null,
      lastRunAt: runs.last_run || null
    };
  });

  const currentEntry = breakdown.find((row) => row.key === currentKey);
  if (currentEntry) currentEntry.rank = rank;

  for (let i = 0; i < breakdown.length; i++) {
    const cur = breakdown[i];
    const prev = breakdown[i + 1] || null;
    cur.delta = prev ? {
      bpi: cur.bestBpi - prev.bestBpi,
      accuracy: Math.round(cur.accuracy * 100) - Math.round(prev.accuracy * 100),
      games: cur.games - prev.games,
      activeDays: cur.activeDays - prev.activeDays,
      logins: cur.logins - prev.logins,
      rank: cur.bestRank != null && prev.bestRank != null ? prev.bestRank - cur.bestRank : null
    } : null;
  }

  const seasonInsight = buildSeasonInsight(breakdown);

  if (isSelf) {
    const recent = await pool.query(
      `select id, score, tier, bpi, accuracy, avg_rt, metrics, rounds, created_at
         from runs
        where user_id = $1 and game_id = $2
        order by created_at desc
        limit 12`,
      [user.id, gameId]
    );
    const rows = recent.rows.slice().reverse();
    const axesRows = rows.map((row) => row.metrics && row.metrics.axes ? row.metrics.axes : null).filter(Boolean);
    const latest = axesRows.length ? axesRows[axesRows.length - 1] : null;
    const lastFive = axesRows.slice(-5);
    const previous = axesRows.slice(-10, -5);

    function average(list) {
      if (!list.length) return null;
      const keys = ['speed', 'search', 'precision', 'consistency', 'updating', 'resilience', 'capacity'];
      const out = {};
      keys.forEach((key) => {
        out[key] = Math.round(list.reduce((sum, item) => sum + (Number(item[key]) || 0), 0) / list.length);
      });
      return out;
    }

    self = {
      axes: latest,
      improvement: lastFive.length && previous.length
        ? bpiModel.improvement(average(previous), average(lastFive))
        : null,
      trend: rows.map((row) => ({
        score: Number(row.score),
        bpi: Number(row.bpi),
        accuracy: Number(row.accuracy),
        avgRt: Number(row.avg_rt),
        at: row.created_at
      })),
      recent: rows.slice(-6).map((row) => ({
        score: Number(row.score),
        bpi: Number(row.bpi),
        accuracy: Number(row.accuracy),
        avgRt: Number(row.avg_rt),
        at: row.created_at
      }))
    };
  }

  return {
    user: {
      id: user.id,
      username: user.username,
      avatar: user.avatar || null,
      title: user.title || 'DRIFTER',
      bestBpi: Number(user.best_bpi || 0),
      rating: Number(user.rating || 1000),
      bestScore: Number(user.best_score || 0),
      games: Number(user.games || 0),
      country: user.country || null,
      region: user.region || null,
      createdAt: user.created_at,
      lastSeen: user.last_seen,
      online: user.last_seen && (Date.now() - new Date(user.last_seen).getTime()) < 5 * 60 * 1000
    },
    axes: publicAxes,
    archetype: publicAxes ? bpiModel.archetypeFor(publicAxes) : null,
    games: games.rows.map((row) => {
      const stat = stats.rows.find((item) => item.game_id === row.id);
      return {
        id: row.id,
        name: row.name,
        shortName: row.short_name,
        bestScore: stat ? Number(stat.best_score) : 0,
        bestBpi: stat ? Number(stat.best_bpi) : 0,
        games: stat ? Number(stat.games) : 0,
        wins: stat ? Number(stat.wins) : 0,
        losses: stat ? Number(stat.losses) : 0,
        accuracy: stat && Number(stat.attempts) ? Number(stat.correct) / Number(stat.attempts) : 0
      };
    }),
    season: {
      key: currentKey,
      games: currentSeason ? Number(currentSeason.games) : 0,
      wins: currentSeason ? Number(currentSeason.wins) : 0,
      losses: currentSeason ? Number(currentSeason.losses) : 0,
      accuracy: currentSeason && Number(currentSeason.attempts)
        ? Number(currentSeason.correct) / Number(currentSeason.attempts) : 0,
      bestScore: currentSeason ? Number(currentSeason.best_score) : 0,
      bestBpi: currentSeason ? Number(currentSeason.best_bpi) : 0,
      rank,
      bestRank: currentSeason && currentSeason.best_rank != null ? Number(currentSeason.best_rank) : null,
      activeDays: currentEntry ? currentEntry.activeDays : 0,
      logins: currentEntry ? currentEntry.logins : 0
    },
    seasons: breakdown,
    insight: seasonInsight,
    self
  };
}

async function updateAvatar({ userId, avatar }) {
  const { rows } = await pool.query(
    `update users set avatar = $2 where id = $1 returning ${PUBLIC_COLUMNS}`,
    [userId, avatar]
  );
  return rows[0] || null;
}

module.exports = {
  publicUser,
  findByUsername,
  findById,
  createUser,
  recordRun,
  leaderboard,
  getProfile,
  updateAvatar,
  PUBLIC_COLUMNS
};
