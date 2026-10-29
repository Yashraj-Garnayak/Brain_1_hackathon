/* TILE RUSH — 1v1 match Durable Object.
 *
 * One DO instance per match id. Holds up to two WebSocket players, keeps the
 * shared round state, relays emotes and decides the result. Sockets use the
 * hibernation API, so an idle match costs nothing while both players sit in a
 * break.
 *
 * Identity is never trusted from the socket payload: the Worker verifies the
 * Vercel-signed match ticket and passes `x-tr-uid` / `x-tr-name` headers.
 *
 * Protocol (client -> server):
 *   ready    { ready: true }
 *   progress { round, correct, score, bpi? }   // live opponent meter
 *   finish   { score, bpi }
 *   emote    { id }                            // client sends these in breaks
 *   rematch  {}
 *   ping     {}
 *   join     {}                                // legacy no-op, identity is fixed
 *
 * Server -> client:
 *   state    { match, you }
 *   peer     { player }
 *   countdown{ startsAt, round, seed }
 *   progress { from, round, correct, score }
 *   emote    { from, id }
 *   result   { winner, players }
 *   peer_left{ player }
 *   pong     { now }
 *   error    { code }
 */

const MAX_PLAYERS = 2;
const MAX_MESSAGE = 4096;
const MAX_SCORE = 10_000_000;
const EMOTES = new Set(['gg', 'wave', 'nice', 'oops', 'focus', 'rematch']);
const ROUNDS = 3;

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function score(value) {
  return Math.max(0, Math.min(MAX_SCORE, Number(value) || 0));
}

function newSeed() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

export class MatchRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.match = null;
  }

  async load() {
    if (this.match) return this.match;
    this.match = (await this.state.storage.get('match')) || {
      status: 'open',
      round: 0,
      startsAt: 0,
      seed: newSeed(),
      winner: null,
      players: [],
      updatedAt: Date.now()
    };
    if (!this.match.seed) this.match.seed = newSeed();

    /* Hibernation drops no sockets, but it does drop in-memory flags. Derive
       connectivity from the live sockets instead of resetting everyone. */
    const live = new Set();
    for (const ws of this.sockets()) {
      const attachment = ws.deserializeAttachment();
      if (attachment && attachment.uid) live.add(attachment.uid);
    }
    for (const player of this.match.players) player.connected = live.has(player.uid);
    return this.match;
  }

  async save() {
    this.match.updatedAt = Date.now();
    await this.state.storage.put('match', this.match);
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return json({ error: 'upgrade_required' }, 426);
    }

    const uid = request.headers.get('x-tr-uid');
    let name = request.headers.get('x-tr-name') || '';
    try { name = decodeURIComponent(name); } catch { /* keep raw */ }
    name = String(name).trim().slice(0, 32);
    if (!uid || !name) return json({ error: 'ticket_required' }, 401);

    const match = await this.load();

    const existing = match.players.find((p) => p.uid === uid);
    if (existing) {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.state.acceptWebSocket(server);
      server.serializeAttachment({ uid });
      existing.connected = true;
      existing.name = name;
      await this.save();
      this.send(server, { type: 'state', you: this.publicPlayer(existing), match: this.snapshot() });
      this.broadcast({ type: 'state', match: this.snapshot() }, server);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (this.sockets().length >= MAX_PLAYERS) return json({ error: 'match_full' }, 409);

    const open = match.status === 'open' || match.status === 'countdown';
    if (match.players.length >= MAX_PLAYERS && !open) {
      return json({ error: 'match_full' }, 409);
    }
    if (match.players.length >= MAX_PLAYERS) {
      match.players = match.players.filter((p) => p.connected);
    }
    if (match.players.length >= MAX_PLAYERS) {
      return json({ error: 'match_full' }, 409);
    }

    const player = {
      uid,
      name,
      ready: false,
      score: 0,
      bpi: 0,
      done: false,
      connected: true
    };
    match.players.push(player);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ uid });

    await this.save();
    this.send(server, { type: 'state', you: this.publicPlayer(player), match: this.snapshot() });
    this.broadcast({ type: 'peer', player: this.publicPlayer(player) }, server);
    await this.maybeStart();
    return new Response(null, { status: 101, webSocket: client });
  }

  publicPlayer(player) {
    return {
      name: player.name,
      ready: player.ready,
      score: player.score,
      bpi: player.bpi,
      done: player.done,
      connected: player.connected
    };
  }

  sockets() {
    return this.state.getWebSockets();
  }

  send(ws, payload) {
    try { ws.send(JSON.stringify(payload)); } catch { /* socket is closing */ }
  }

  broadcast(payload, except) {
    for (const ws of this.sockets()) {
      if (ws !== except) this.send(ws, payload);
    }
  }

  playerFor(ws) {
    const attachment = ws.deserializeAttachment();
    if (!attachment) return null;
    return this.match.players.find((p) => p.uid === attachment.uid) || null;
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== 'string' || message.length > MAX_MESSAGE) return;
    let msg;
    try { msg = JSON.parse(message); } catch { return; }
    if (!msg || typeof msg.type !== 'string') return;

    await this.load();

    const me = this.playerFor(ws);
    if (!me) return this.send(ws, { type: 'error', code: 'ticket_required' });

    if (msg.type === 'join' || msg.type === 'hello') {
      return this.send(ws, { type: 'state', you: this.publicPlayer(me), match: this.snapshot() });
    }

    if (msg.type === 'ready') {
      if (this.match.status !== 'open' && this.match.status !== 'countdown') return;
      me.ready = !!msg.ready;
      await this.save();
      this.broadcast({ type: 'state', match: this.snapshot() }, ws);
      await this.maybeStart();
      return;
    }

    if (msg.type === 'emote') {
      const id = String(msg.id || '');
      if (EMOTES.has(id)) this.broadcast({ type: 'emote', from: me.name, id });
      return;
    }

    if (msg.type === 'progress') {
      if (me.done) return;
      if (this.match.status === 'countdown') this.match.status = 'playing';
      me.score = score(msg.score);
      me.bpi = Math.max(0, Math.min(1000, Number(msg.bpi) || me.bpi));
      this.broadcast({
        type: 'progress',
        from: me.name,
        round: Math.max(1, Math.min(ROUNDS, Number(msg.round) || 1)),
        correct: Math.max(0, Math.min(500, Number(msg.correct) || 0)),
        score: me.score
      }, ws);
      return;
    }

    if (msg.type === 'finish') {
      if (me.done) return;
      me.score = score(msg.score);
      me.bpi = Math.max(0, Math.min(1000, Number(msg.bpi) || me.bpi));
      me.done = true;
      if (this.match.players.length === MAX_PLAYERS && this.match.players.every((p) => p.done)) {
        await this.finish();
      }
      await this.save();
      return;
    }

    if (msg.type === 'rematch') {
      me.rematch = true;
      if (this.match.players.length === MAX_PLAYERS && this.match.players.every((p) => p.rematch)) {
        for (const p of this.match.players) {
          p.rematch = false;
          p.ready = false;
          p.score = 0;
          p.bpi = 0;
          p.done = false;
        }
        this.match.status = 'open';
        this.match.round = 0;
        this.match.startsAt = 0;
        this.match.seed = newSeed();
        this.match.winner = null;
        await this.save();
        this.broadcast({ type: 'state', match: this.snapshot() });
      }
      return;
    }

    if (msg.type === 'ping') this.send(ws, { type: 'pong', now: Date.now() });
  }

  async maybeStart() {
    if (this.match.status !== 'open') return;
    if (this.match.players.length !== MAX_PLAYERS) return;
    if (!this.match.players.every((p) => p.ready && p.connected)) return;

    this.match.status = 'countdown';
    this.match.round = 1;
    this.match.startsAt = Date.now() + 3000;
    await this.save();
    this.broadcast({
      type: 'countdown',
      round: 1,
      startsAt: this.match.startsAt,
      seed: this.match.seed,
      players: this.match.players.map((p) => ({ name: p.name, score: p.score }))
    });
  }

  async finish() {
    const [a, b] = this.match.players;
    this.match.status = 'result';
    this.match.winner = a.score === b.score ? null : a.score > b.score ? a.name : b.name;
    const players = this.match.players.map((p) => ({ name: p.name, score: p.score, bpi: p.bpi }));
    this.broadcast({ type: 'result', winner: this.match.winner, players });
    await this.state.storage.put('lastResult', { winner: this.match.winner, players, at: Date.now() });
  }

  snapshot() {
    return {
      status: this.match.status,
      round: this.match.round,
      startsAt: this.match.startsAt,
      seed: this.match.seed,
      winner: this.match.winner,
      players: this.match.players.map((p) => this.publicPlayer(p))
    };
  }

  async webSocketClose(ws, code, reason) {
    const attachment = ws.deserializeAttachment();
    if (!attachment) return;
    await this.load();
    const player = this.match.players.find((p) => p.uid === attachment.uid);
    if (!player) return;

    player.connected = false;

    if (this.match.status === 'countdown') {
      this.match.status = 'open';
      this.match.round = 0;
      this.match.startsAt = 0;
      for (const p of this.match.players) p.ready = false;
    } else if (this.match.status === 'open') {
      this.match.players = this.match.players.filter((p) => p.uid !== player.uid);
    }

    await this.save();
    this.broadcast({ type: 'peer_left', player: player.name });
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws, 1011, 'socket_error');
  }
}
