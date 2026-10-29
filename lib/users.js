'use strict';

const { pool } = require('./db');
const { nextRating } = require('./elo');

const PUBLIC_COLUMNS = 'id, username, rating, best_score, best_tier, games, created_at, last_seen';

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    rating: Number(row.rating),
    bestScore: Number(row.best_score),
    bestTier: Number(row.best_tier),
    games: Number(row.games),
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

async function recordRun({ userId, score, tier, accuracy, avgRt }) {
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

    const updated = await client.query(
      `update users
          set rating = $2,
              best_score = greatest(best_score, $3),
              best_tier = greatest(best_tier, $4),
              games = games + 1,
              last_seen = now()
        where id = $1
        returning ${PUBLIC_COLUMNS}`,
      [userId, after, score, tier]
    );

    const inserted = await client.query(
      `insert into runs (user_id, score, tier, accuracy, avg_rt, rating_before, rating_after)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id`,
      [userId, score, tier, accuracy, avgRt, user.rating, after]
    );

    await client.query('commit');
    return { user: updated.rows[0], runId: inserted.rows[0].id, before: Number(user.rating), after, delta };
  } catch (err) {
    try { await client.query('rollback'); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

async function leaderboard({ by = 'score', limit = 50, userId = null }) {
  const order = by === 'rating'
    ? 'rating desc, best_score desc, username asc'
    : 'best_score desc, rating desc, username asc';

  const { rows } = await pool.query(
    `with ranked as (
       select id, username, rating, best_score, best_tier, games,
              row_number() over (order by ${order}) as rank
         from users
        where games > 0
     )
     select * from ranked order by rank limit $1`,
    [limit]
  );

  let me = null;
  if (userId) {
    const { rows: mine } = await pool.query(
      `with ranked as (
         select id, username, rating, best_score, best_tier, games,
                row_number() over (order by ${order}) as rank
           from users
          where games > 0
       )
       select * from ranked where id = $1`,
      [userId]
    );
    me = mine[0] || null;
  }

  const { rows: totals } = await pool.query(
    `select
       (select count(*) from users where games > 0)::int as players,
       (select count(*) from users where last_seen > now() - interval '5 minutes')::int as online`
  );

  return {
    by,
    entries: rows.map((row) => ({
      rank: Number(row.rank),
      id: row.id,
      username: row.username,
      rating: Number(row.rating),
      bestScore: Number(row.best_score),
      bestTier: Number(row.best_tier),
      games: Number(row.games)
    })),
    me: me ? {
      rank: Number(me.rank),
      id: me.id,
      username: me.username,
      rating: Number(me.rating),
      bestScore: Number(me.best_score),
      bestTier: Number(me.best_tier),
      games: Number(me.games)
    } : null,
    players: totals[0].players,
    online: totals[0].online
  };
}

module.exports = { publicUser, findByUsername, findById, createUser, recordRun, leaderboard, PUBLIC_COLUMNS };
