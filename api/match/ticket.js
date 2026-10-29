'use strict';

const { allow, readJson, json, fail } = require('../../lib/http');
const { currentUser } = require('../../lib/auth');
const { mint, guestSpectator, endpoints } = require('../../lib/match-ticket');

module.exports = async function handler(req, res) {
  if (!allow(req, res, ['POST'])) return;
  try {
    let body = {};
    try { body = await readJson(req); } catch { body = {}; }
    const wantsSpectator = !!(body && body.spectator);

    const user = await currentUser(req);
    if (!user && !wantsSpectator) {
      return json(res, 401, { error: 'Sign in to play 1v1.' });
    }

    const who = user || guestSpectator();
    const role = wantsSpectator ? 'spectator' : 'player';
    const signed = mint(who, 10 * 60 * 1000, role);
    if (!signed) return json(res, 503, { error: '1v1 is not configured.' });

    const urls = endpoints();
    return json(res, 200, {
      ticket: signed.ticket,
      expiresAt: signed.exp,
      role,
      name: who.username,
      queueUrl: urls.queue,
      socketBase: urls.socket
    });
  } catch (err) {
    return fail(res, err);
  }
};
