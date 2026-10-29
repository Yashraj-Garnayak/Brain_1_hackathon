'use strict';

const { allow, json, fail } = require('../../lib/http');
const { currentUser } = require('../../lib/auth');
const { getProfile } = require('../../lib/users');

module.exports = async function handler(req, res) {
  if (!allow(req, res, ['GET'])) return;
  try {
    const username = String((req.query && req.query.username) || '').trim().toLowerCase();
    if (!/^[a-z0-9_]{3,16}$/.test(username)) {
      return json(res, 404, { error: 'Player not found.' });
    }

    const viewer = await currentUser(req);
    const game = String((req.query && req.query.game) || 'tile-rush');
    const gameId = /^[a-z0-9-]{1,32}$/.test(game) ? game : 'tile-rush';
    const profile = await getProfile({
      usernameLower: username,
      gameId,
      viewerId: viewer ? viewer.id : null
    });

    if (!profile) return json(res, 404, { error: 'Player not found.' });
    return json(res, 200, {
      profile,
      isSelf: !!(viewer && String(viewer.id) === String(profile.user.id))
    });
  } catch (err) {
    return fail(res, err);
  }
};
