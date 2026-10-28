'use strict';

const { allow, json, fail } = require('../lib/http');
const { currentUser } = require('../lib/auth');
const { leaderboard } = require('../lib/users');

module.exports = async function handler(req, res) {
  if (!allow(req, res, ['GET'])) return;
  try {
    const url = new URL(req.url, 'http://localhost');
    const by = url.searchParams.get('by') === 'rating' ? 'rating' : 'score';
    const limit = Math.max(10, Math.min(100, Number(url.searchParams.get('limit')) || 50));
    const user = await currentUser(req);
    const data = await leaderboard({ by, limit, userId: user ? user.id : null });
    return json(res, 200, data);
  } catch (err) {
    return fail(res, err);
  }
};
