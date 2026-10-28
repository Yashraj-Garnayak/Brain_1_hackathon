'use strict';

const MAX_BODY = 16 * 1024;

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function json(res, status, body, headers) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (headers) {
    for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  }
  res.end(JSON.stringify(body));
}

function allow(req, res, methods) {
  if (methods.includes(req.method)) return true;
  res.setHeader('Allow', methods.join(', '));
  json(res, 405, { error: 'Method not allowed.' });
  return false;
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return req.body ? JSON.parse(req.body) : {};
    } catch {
      throw httpError(400, 'Invalid JSON.');
    }
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(httpError(413, 'Payload too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(httpError(400, 'Invalid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function isSecure(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  return proto === 'https';
}

function fail(res, err) {
  const status = err && err.status ? err.status : 500;
  if (status >= 500) console.error(err);
  json(res, status, { error: status >= 500 ? 'Something went wrong. Try again.' : err.message });
}

module.exports = { json, allow, readJson, isSecure, fail, httpError };
