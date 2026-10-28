'use strict';

const { allow, json, fail, isSecure } = require('../../lib/http');
const { destroySession, expiredCookie } = require('../../lib/auth');

module.exports = async function handler(req, res) {
  if (!allow(req, res, ['POST'])) return;
  try {
    await destroySession(req);
    res.setHeader('Set-Cookie', expiredCookie(isSecure(req)));
    return json(res, 200, { ok: true });
  } catch (err) {
    return fail(res, err);
  }
};
