'use strict';

const { allow, json, fail } = require('../../lib/http');
const { currentUser } = require('../../lib/auth');
const { publicUser } = require('../../lib/users');

module.exports = async function handler(req, res) {
  if (!allow(req, res, ['GET'])) return;
  try {
    const user = await currentUser(req);
    return json(res, 200, { user: publicUser(user) });
  } catch (err) {
    return fail(res, err);
  }
};
