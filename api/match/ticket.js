'use strict';

const { allow, json, fail } = require('../../lib/http');
const { currentUser } = require('../../lib/auth');
const { mint, endpoints } = require('../../lib/match-ticket');

module.exports = async function handler(req, res) {
  if (!allow(req, res, ['POST'])) return;
  try {
    const user = await currentUser(req);
    if (!user) return json(res, 401, { error: 'Sign in to play 1v1.' });

    const signed = mint(user, 10 * 60 * 1000);
    if (!signed) return json(res, 503, { error: '1v1 is not configured.' });

    const urls = endpoints();
    return json(res, 200, {
      ticket: signed.ticket,
      expiresAt: signed.exp,
      queueUrl: urls.queue,
      socketBase: urls.socket
    });
  } catch (err) {
    return fail(res, err);
  }
};
