'use strict';

const { allow, readJson, json, fail, isSecure } = require('../../lib/http');
const { verifyPassword, createSession, sessionCookie } = require('../../lib/auth');
const { findByUsername, publicUser } = require('../../lib/users');

module.exports = async function handler(req, res) {
  if (!allow(req, res, ['POST'])) return;
  try {
    const body = await readJson(req);
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!username || !password) {
      return json(res, 400, { error: 'Enter your username and password.' });
    }

    const row = await findByUsername(username);
    if (!row || !(await verifyPassword(password, row.password_hash))) {
      return json(res, 401, { error: 'Wrong username or password.' });
    }

    const token = await createSession(row.id);
    res.setHeader('Set-Cookie', sessionCookie(token, isSecure(req)));
    return json(res, 200, { user: publicUser(row) });
  } catch (err) {
    return fail(res, err);
  }
};
