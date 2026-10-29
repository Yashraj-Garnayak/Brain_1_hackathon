/* TILE RUSH — matchmaking Durable Object.
 *
 * A single instance (`idFromName('global')`) owns the queue. A player POSTs
 * `{ name }` and either gets `{ waiting: true }` or, once a second player
 * arrives, `{ matchId }`. The first player polls the same endpoint until their
 * ticket is paired, then both connect to `/api/match/:id/ws`.
 *
 * Tickets expire after two minutes so an abandoned poll cannot block a slot.
 */

const TICKET_TTL = 120_000;

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function cleanName(value) {
  return String(value || '').trim().slice(0, 32);
}

export class QueueRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
    const name = cleanName(body && body.name);
    if (!name) return json({ error: 'name_required' }, 400);

    const now = Date.now();
    let queue = (await this.state.storage.get('queue')) || [];
    let assigned = (await this.state.storage.get('assigned')) || {};

    queue = queue.filter((ticket) => now - ticket.at < TICKET_TTL && ticket.name !== name);
    for (const key of Object.keys(assigned)) {
      if (now - assigned[key].at >= TICKET_TTL) delete assigned[key];
    }

    const ticket = assigned[name];
    if (ticket) {
      const matchId = ticket.matchId;
      delete assigned[name];
      await this.state.storage.put({ queue, assigned });
      return json({ matchId, waiting: false });
    }

    if (queue.length) {
      const peer = queue.shift();
      const matchId = crypto.randomUUID();
      assigned[name] = { matchId, at: now };
      assigned[peer.name] = { matchId, at: now };
      await this.state.storage.put({ queue, assigned });
      return json({ matchId, waiting: false, peer: peer.name });
    }

    queue.push({ name, at: now });
    await this.state.storage.put({ queue, assigned });
    return json({ waiting: true, position: queue.length });
  }
}
