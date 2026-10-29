'use strict';

const { allow, json, fail } = require('../lib/http');
const { currentUser } = require('../lib/auth');
const { rankSummary } = require('../lib/users');

module.exports = async function handler(req, res) {
  if (!allow(req, res, ['GET'])) return;
  try {
    const user = await currentUser(req);
    if (!user) return json(res, 200, { signedIn: false, rank: null, trend: [] });
    const data = await rankSummary({ userId: user.id });
    return json(res, 200, data);
  } catch (err) {
    return fail(res, err);
  }
};
