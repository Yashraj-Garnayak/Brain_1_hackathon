'use strict';

/* Short-lived, signed proof of identity for the Cloudflare realtime worker.
 *
 * The site is served from Vercel and the match socket from a workers.dev
 * hostname, so the `tr_session` cookie cannot travel with it. Instead the
 * logged-in client asks Vercel for a ticket and hands that to the Worker.
 *
 * Format: base64url(JSON payload) + '.' + base64url(HMAC-SHA256(payload))
 * The Worker verifies the same HMAC with MATCH_SECRET.
 */

const crypto = require('crypto');

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MATCH_URL = 'https://tile-rush.text-udaykumar.workers.dev';

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function secret() {
  return String(process.env.MATCH_SECRET || '');
}

function matchUrl() {
  return String(process.env.MATCH_URL || DEFAULT_MATCH_URL).replace(/\/$/, '');
}

function sign(payload, key) {
  return crypto.createHmac('sha256', key).update(payload).digest('base64url');
}

function mint(user, ttlMs) {
  const key = secret();
  if (!key) return null;
  const exp = Date.now() + (Number(ttlMs) || DEFAULT_TTL_MS);
  const body = base64url(JSON.stringify({
    v: 1,
    uid: user.id,
    name: user.username,
    exp
  }));
  return { ticket: body + '.' + sign(body, key), exp };
}

function endpoints() {
  const base = matchUrl();
  return {
    queue: base + '/api/match/queue',
    socket: base.replace(/^http/, 'ws') + '/api/match'
  };
}

module.exports = { mint, endpoints, matchUrl, DEFAULT_TTL_MS };
