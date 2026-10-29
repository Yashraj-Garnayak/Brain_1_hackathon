'use strict';

const crypto = require('crypto');
const { promisify } = require('util');
const { pool } = require('./db');
const { geoFromRequest, touchGeo } = require('./geo');

const scryptAsync = promisify(crypto.scrypt);

const COOKIE = 'tr_session';
const SESSION_DAYS = 120;
const SESSION_SECONDS = SESSION_DAYS * 24 * 60 * 60;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function derive(password, salt, params, keylen) {
  return scryptAsync(password, salt, keylen, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: 128 * params.N * params.r * 2
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await derive(password, salt, SCRYPT, SCRYPT.keylen);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('hex'), key.toString('hex')].join('$');
}

async function verifyPassword(password, stored) {
  try {
    const parts = String(stored || '').split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const params = { N: Number(parts[1]), r: Number(parts[2]), p: Number(parts[3]) };
    if (!Number.isFinite(params.N) || !Number.isFinite(params.r) || !Number.isFinite(params.p)) return false;
    const salt = Buffer.from(parts[4], 'hex');
    const expected = Buffer.from(parts[5], 'hex');
    const key = await derive(password, salt, params, expected.length);
    return key.length === expected.length && crypto.timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    if (!key || key in out) continue;
    out[key] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return out;
}

function sessionCookie(token, secure) {
  const bits = [
    `${COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_SECONDS}`
  ];
  if (secure) bits.push('Secure');
  return bits.join('; ');
}

function expiredCookie(secure) {
  const bits = [`${COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) bits.push('Secure');
  return bits.join('; ');
}

function tokenFrom(req) {
  return parseCookies(req.headers.cookie)[COOKIE] || '';
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await pool.query(
    `insert into sessions (token_hash, user_id, expires_at)
     values ($1, $2, now() + ($3 || ' days')::interval)`,
    [hashToken(token), userId, String(SESSION_DAYS)]
  );
  return token;
}

async function currentUser(req) {
  const token = tokenFrom(req);
  if (!token) return null;
  const { rows } = await pool.query(
    `select u.* from sessions s
     join users u on u.id = s.user_id
     where s.token_hash = $1 and s.expires_at > now()`,
    [hashToken(token)]
  );
  if (!rows.length) return null;

  const geo = geoFromRequest(req);
  await pool.query('update users set last_seen = now() where id = $1', [rows[0].id]);
  if (geo.country) {
    await touchGeo(rows[0].id, geo);
    rows[0].country = geo.country;
    rows[0].region = geo.region;
    rows[0].city = geo.city;
  }
  return rows[0];
}

async function destroySession(req) {
  const token = tokenFrom(req);
  if (!token) return;
  await pool.query('delete from sessions where token_hash = $1', [hashToken(token)]);
}

module.exports = {
  hashPassword,
  verifyPassword,
  createSession,
  currentUser,
  destroySession,
  sessionCookie,
  expiredCookie,
  isSecure: (req) => String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https'
};
