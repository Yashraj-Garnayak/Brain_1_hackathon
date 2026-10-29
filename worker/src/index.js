/* TILE RUSH — Cloudflare Worker entry.
 *
 * Routes:
 *   GET  /api/health            liveness + edge location
 *   POST /api/match/queue?name= matchmaking ticket (poll until matchId arrives)
 *   GET  /api/match/:id/ws      WebSocket upgrade into that match's Durable Object
 *   *    /api/*                 proxied to API_ORIGIN (Vercel) until the REST
 *                               API is ported to the Worker
 *   *                           static client from the ASSETS binding
 */
import { MatchRoom } from './match-room.js';
import { QueueRoom } from './queue-room.js';

export { MatchRoom, QueueRoom };

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

/** Ask the single global QueueRoom for a match id. */
async function matchmaking(request, env) {
  const url = new URL(request.url);
  const name = String(url.searchParams.get('name') || '').trim().slice(0, 32);
  if (!name) return json({ error: 'name_required' }, 400);

  const id = env.QUEUE.idFromName('global');
  const stub = env.QUEUE.get(id);
  const res = await stub.fetch('https://queue/join', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name })
  });
  return new Response(res.body, { status: res.status, headers: JSON_HEADERS });
}

/** Forward the socket upgrade to the match Durable Object. */
async function matchSocket(request, env, matchId) {
  if (request.headers.get('Upgrade') !== 'websocket') {
    return json({ error: 'upgrade_required' }, 426);
  }
  const id = env.MATCH.idFromName(matchId);
  return env.MATCH.get(id).fetch(request);
}

/** Keep the REST API on Vercel during the migration, but preserve client IP geo. */
async function legacyApi(request, env) {
  const origin = env.API_ORIGIN || 'https://tile-rush.uday.live';
  const target = new URL(request.url);
  const upstream = new URL(target.pathname + target.search, origin);

  const headers = new Headers(request.headers);
  headers.delete('host');
  const cf = request.cf || {};
  if (cf.country) headers.set('cf-ipcountry', cf.country);
  if (cf.region) headers.set('cf-region', cf.region);
  if (cf.city) headers.set('cf-city', cf.city);

  const init = {
    method: request.method,
    headers,
    redirect: 'manual'
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  const res = await fetch(upstream, init);
  const out = new Headers(res.headers);
  out.set('cache-control', 'no-store');
  return new Response(res.body, { status: res.status, headers: out });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/health') {
      return json({
        ok: true,
        service: 'tile-rush',
        colo: (request.cf && request.cf.colo) || null,
        now: Date.now()
      });
    }

    if (path === '/api/match/queue') return matchmaking(request, env);

    const socket = /^\/api\/match\/([A-Za-z0-9_-]{4,40})\/ws$/.exec(path);
    if (socket) return matchSocket(request, env, socket[1]);

    if (path.startsWith('/api/')) return legacyApi(request, env);

    return env.ASSETS.fetch(request);
  }
};
