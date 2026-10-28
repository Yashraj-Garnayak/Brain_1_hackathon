'use strict';

const { allow, readJson, json, fail, isSecure } = require('../../lib/http');
const { hashPassword, createSession, sessionCookie } = require('../../lib/auth');
const { createUser, publicUser } = require('../../lib/users');

const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;

module.exports = async function handler(req, res) {
  if (!allow(req, res, ['POST'])) return;
  try {
    const body = await readJson(req);
    const username = String(body.username || '').trim();
    const password = String(body.password || '');

    if (!USERNAME_RE.test(username)) {
      return json(res, 400, { error: 'Username must be 3–16 letters, numbers or underscores.' });
    }
    if (password.length < 6 || password.length > 128) {
      return json(res, 400, { error: 'Password must be 6–128 characters.' });
    }

    const passwordHash = await hashPassword(password);
    const row = await createUser({
      username,
      usernameLower: username.toLowerCase(),
      passwordHash
    });

    if (!row) {
      return json(res, 409, { error: 'That username is already taken.' });
    }

    const token = await createSession(row.id);
    res.setHeader('Set-Cookie', sessionCookie(token, isSecure(req)));
    return json(res, 201, { user: publicUser(row) });
  } catch (err) {
    return fail(res, err);
  }
};
